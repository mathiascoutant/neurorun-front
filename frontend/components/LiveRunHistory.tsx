"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type LiveRunDetail,
  type RunHistoryFeedItem,
  fetchRunHistoryFeed,
  getLiveRun,
  getStravaActivityDetail,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { RunDetailPanel } from "@/components/RunDetailPanel";

const PAGE_SIZE = 10;

/** Clé stable d’une entrée du flux (les ids live et Strava vivent dans des espaces distincts). */
function itemKey(r: RunHistoryFeedItem): string {
  return r.source === "live" ? `live:${r.id}` : `strava:${r.strava_activity_id}`;
}

function itemDate(r: RunHistoryFeedItem): string {
  return (r.source === "live" ? r.created_at : r.start_date) ?? "";
}

function formatClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  }
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatPaceMinPerKm(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Props = {
  apiUnreachableAtLoad?: boolean;
  /** Incrémente pour recharger la liste (ex. après une sortie enregistrée). */
  refreshTrigger?: number;
  /** Profil : sert à estimer la FC max (zones cardiaques) quand elle n’est pas mesurée. */
  birthDate?: string;
};

export function LiveRunHistory({
  apiUnreachableAtLoad = false,
  refreshTrigger = 0,
  birthDate,
}: Props) {
  const [runs, setRuns] = useState<RunHistoryFeedItem[]>([]);
  const [stravaIncluded, setStravaIncluded] = useState(false);
  const [nextBefore, setNextBefore] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LiveRunDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailError, setDetailError] = useState("");

  const loadList = useCallback(async () => {
    const token = getToken();
    if (!token || apiUnreachableAtLoad) {
      setLoading(false);
      setRuns([]);
      return;
    }
    setLoading(true);
    setListError("");
    try {
      const feed = await fetchRunHistoryFeed(token, { limit: PAGE_SIZE });
      setRuns(feed.items);
      setStravaIncluded(feed.strava_included);
      setNextBefore(feed.next_before);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "Impossible de charger l’historique.";
      setListError(msg);
      setRuns([]);
      setNextBefore(undefined);
    } finally {
      setLoading(false);
    }
  }, [apiUnreachableAtLoad]);

  const loadMore = useCallback(async () => {
    const token = getToken();
    if (!token || !nextBefore || loadingMore) return;
    setLoadingMore(true);
    setListError("");
    try {
      const feed = await fetchRunHistoryFeed(token, {
        limit: PAGE_SIZE,
        before: nextBefore,
      });
      /* Le curseur est temporel : deux pages peuvent se recouvrir, on dédoublonne par clé. */
      setRuns((prev) => {
        const seen = new Set(prev.map(itemKey));
        return [...prev, ...feed.items.filter((it) => !seen.has(itemKey(it)))];
      });
      setNextBefore(feed.next_before);
    } catch (e) {
      setListError(
        e instanceof ApiError ? e.message : "Chargement de la suite impossible.",
      );
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshTrigger]);

  const toggleOpen = async (run: RunHistoryFeedItem) => {
    const key = itemKey(run);
    if (openId === key) {
      setOpenId(null);
      setDetailError("");
      return;
    }
    setOpenId(key);
    setDetailError("");
    if (details[key]) return;
    const token = getToken();
    if (!token) return;
    setDetailLoading(key);
    try {
      const d =
        run.source === "live"
          ? await getLiveRun(token, run.id!)
          : await getStravaActivityDetail(token, run.strava_activity_id!);
      setDetails((prev) => ({ ...prev, [key]: d }));
    } catch (e) {
      setDetailError(
        e instanceof ApiError ? e.message : "Détail indisponible.",
      );
    } finally {
      setDetailLoading(null);
    }
  };

  if (apiUnreachableAtLoad) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-sm font-semibold text-white">
          Historique
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-white/45">
          Connecte l’API (réseau disponible) pour voir tes sorties enregistrées sur ton compte.
        </p>
      </div>
    );
  }

  return (
    <div className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            Historique des sorties
          </h2>
        <p className="mt-1 text-[11px] text-white/40">
          {stravaIncluded
            ? "Courses NeuroRun + sorties Strava, les plus récentes d’abord."
            : "Courses NeuroRun enregistrées depuis cette page (splits, trace, métadonnées)."}
        </p>
        </div>
        <button
          type="button"
          className="btn-quiet border border-white/12 px-3 py-1.5 text-[11px]"
          onClick={() => void loadList()}
          disabled={loading}
        >
          Rafraîchir
        </button>
      </div>

      {listError ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {listError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-xs text-white/45">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-orange/30 border-t-brand-orange" />
          Chargement…
        </div>
      ) : runs.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-white/40">
          Aucune sortie pour l’instant. Termine une course — ou lie Strava — pour la voir apparaître
          ici.
        </p>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => {
            const key = itemKey(r);
            const expanded = openId === key;
            const detail = details[key];
            const dLoading = detailLoading === key;
            const isStrava = r.source === "strava";
            return (
              <li
                key={key}
                className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]"
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 px-3 py-3 text-left transition hover:bg-white/[0.04] sm:items-center sm:gap-3 sm:px-4"
                  onClick={() => void toggleOpen(r)}
                  aria-expanded={expanded}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
                          isStrava
                            ? "bg-brand-orange/15 text-brand-orange"
                            : "bg-brand-ice/12 text-brand-ice/90"
                        }`}
                      >
                        {isStrava ? "Strava" : "NeuroRun"}
                      </span>
                      <p className="font-display text-[12px] font-medium leading-snug text-white/95 sm:text-[13px]">
                        {formatWhen(itemDate(r))}
                      </p>
                    </div>
                    {isStrava && r.name ? (
                      <p className="mt-1 truncate text-[11px] text-white/70">{r.name}</p>
                    ) : null}
                    <p className="mt-1 text-[10px] leading-relaxed text-white/45 sm:text-[11px]">
                      {(r.distance_m / 1000).toFixed(2)} km · {formatClock(r.moving_sec)} ·{' '}
                      {formatPaceMinPerKm(r.avg_pace_sec_per_km)}
                      {r.avg_heartrate != null && r.avg_heartrate > 0
                        ? ` · ${Math.round(r.avg_heartrate)} bpm`
                        : ''}
                      {r.elevation_gain_m != null && r.elevation_gain_m > 0
                        ? ` · +${Math.round(r.elevation_gain_m)} m D+`
                        : ''}
                      {!isStrava && r.split_count != null ? (
                        <span className="hidden sm:inline">
                          {' '}
                          · {r.split_count} split{r.split_count > 1 ? 's' : ''}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-white/35">
                    {expanded ? "▼" : "▶"}
                  </span>
                </button>

                {expanded ? (
                  <div className="border-t border-white/[0.06] px-3 py-4 sm:px-4">
                    {dLoading ? (
                      <p className="text-xs text-white/45">Chargement du détail…</p>
                    ) : detailError && !detail ? (
                      <p className="text-xs text-amber-200/90">{detailError}</p>
                    ) : detail ? (
                      <RunDetailPanel
                        run={detail}
                        source={r.source}
                        birthDate={birthDate}
                      />
                    ) : (
                      <p className="text-xs text-white/45">—</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {!loading && nextBefore ? (
        <button
          type="button"
          className="btn-quiet w-full px-4 text-xs"
          onClick={() => void loadMore()}
          disabled={loadingMore}
        >
          {loadingMore ? "Chargement…" : "Charger plus"}
        </button>
      ) : null}
    </div>
  );
}
