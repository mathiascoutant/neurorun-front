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
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Date et heure séparées : la ligne de titre reste courte sur mobile. */
function splitWhen(iso: string): { day: string; time: string } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { day: iso, time: "" };
  return {
    day: d.toLocaleDateString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }),
    time: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

const ICONS = {
  time: "M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0120 0z",
  pace: "M13 2L4.09 12.91a1 1 0 00.77 1.64H11l-1 7.45 8.91-10.91a1 1 0 00-.77-1.64H12l1-7.45z",
  heart:
    "M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z",
  elevation: "M3.75 19.5h16.5L14.25 7.5l-3.375 6-2.25-3-4.875 9z",
} as const;

/**
 * Mesure d'une sortie : une icône, une valeur.
 *
 * Les intitulés « TEMPS / ALLURE / FC MOY. / D+ » se répétaient sur chaque
 * ligne — soit quatre fois par sortie, quarante fois par écran — et donnaient à
 * la page l'allure d'un tableur. L'icône porte le sens une bonne fois, et
 * l'infobulle reste disponible pour lever un doute.
 */
function Stat({
  icon,
  value,
  unit,
  label,
}: {
  icon: keyof typeof ICONS;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={label}>
      <svg
        className="h-3.5 w-3.5 shrink-0 text-white/28"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
      </svg>
      <span className="tabular-nums text-white/72">
        {value}
        {unit ? <span className="ml-0.5 text-white/38">{unit}</span> : null}
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

type MonthGroup = {
  key: string;
  label: string;
  km: number;
  /** Sortie la plus longue du mois — référence des barres de distance. */
  maxKm: number;
  sec: number;
  items: RunHistoryFeedItem[];
};

/**
 * Regroupement par mois.
 *
 * Une liste plate de sorties identiques se lit comme un empilement : rien n'y
 * marque le temps qui passe. Les en-têtes mensuels donnent des points de repère
 * et leur total situe chaque période d'un coup d'œil.
 */
function groupByMonth(runs: RunHistoryFeedItem[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  const index = new Map<string, MonthGroup>();

  for (const r of runs) {
    const d = new Date(itemDate(r));
    const valid = !Number.isNaN(d.getTime());
    const key = valid ? `${d.getFullYear()}-${d.getMonth()}` : "inconnu";
    let g = index.get(key);
    if (!g) {
      g = {
        key,
        label: valid
          ? d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          : "Date inconnue",
        km: 0,
        maxKm: 0,
        sec: 0,
        items: [],
      };
      index.set(key, g);
      groups.push(g);
    }
    const km = r.distance_m / 1000;
    g.items.push(r);
    g.km += km;
    g.sec += r.moving_sec;
    if (km > g.maxKm) g.maxKm = km;
  }
  return groups;
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
        e instanceof ApiError ? e.message : "Impossible de charger l’historique.";
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
      setDetailError(e instanceof ApiError ? e.message : "Détail indisponible.");
    } finally {
      setDetailLoading(null);
    }
  };

  if (apiUnreachableAtLoad) {
    return (
      <div className="app-empty">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-white/38">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75h.008v.008H12v-.008zM8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" />
          </svg>
        </span>
        <p className="text-[15px] font-semibold text-white/90">Hors ligne</p>
        <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-[19px] text-white/40">
          Reconnecte-toi au réseau pour retrouver tes sorties enregistrées sur ton compte.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-white">
            Tes sorties
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-white/42">
            {stravaIncluded
              ? "Courses NeuroRun et sorties Strava, les plus récentes d’abord."
              : "Courses NeuroRun enregistrées sur ton compte."}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadList()}
          disabled={loading}
          className="chart-chip cursor-pointer disabled:opacity-40"
        >
          <svg
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M3.03 14.652h4.992v4.992M4.03 9.349a8.25 8.25 0 0113.803-3.03l3.182 3.03m-16.985 5.303l3.182 3.03a8.25 8.25 0 0013.803-3.03" />
          </svg>
          Rafraîchir
        </button>
      </div>

      {listError ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-100"
        >
          {listError}
        </p>
      ) : null}

      {loading ? (
        <div className="space-y-2.5" aria-busy="true" aria-label="Chargement de l’historique">
          <div className="app-skeleton h-[104px]" />
          <div className="app-skeleton h-[104px]" />
          <div className="app-skeleton h-[104px]" />
        </div>
      ) : runs.length === 0 ? (
        <div className="app-empty">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-white/38">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 15H3.75V13.5z" />
            </svg>
          </span>
          <p className="text-[15px] font-semibold text-white/90">Aucune sortie pour l’instant</p>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-[19px] text-white/40">
            Relie Strava ou enregistre une course : elles apparaîtront toutes ici.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupByMonth(runs).map((group) => (
            <div key={group.key}>
              <div className="mb-1.5 flex items-center justify-between gap-3 px-1">
                <h3 className="font-display text-[13px] font-semibold tracking-[-0.01em] text-white/75 first-letter:uppercase">
                  {group.label}
                </h3>
                <span className="flex shrink-0 items-center gap-2 text-[11.5px] tabular-nums text-white/40">
                  <span className="font-display font-semibold text-white/70">
                    {group.km.toFixed(1).replace(".", ",")} km
                  </span>
                  <span className="text-white/15">|</span>
                  <span>
                    {group.items.length} sortie{group.items.length > 1 ? "s" : ""}
                  </span>
                  <span className="text-white/15">|</span>
                  <span>{formatClock(group.sec)}</span>
                </span>
              </div>

              <ul className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.012]">
                {group.items.map((r) => {
                  const key = itemKey(r);
                  const expanded = openId === key;
                  const detail = details[key];
                  const dLoading = detailLoading === key;
                  const isStrava = r.source === "strava";
                  const when = splitWhen(itemDate(r));
                  const hasHr = r.avg_heartrate != null && r.avg_heartrate > 0;
                  const hasElev = r.elevation_gain_m != null && r.elevation_gain_m > 0;

                  return (
                    <li
                      key={key}
                      className="border-b border-white/[0.05] last:border-b-0"
                    >
                      <button
                        type="button"
                        onClick={() => void toggleOpen(r)}
                        aria-expanded={expanded}
                        className={`group/run relative flex w-full cursor-pointer items-center gap-3 py-3 pl-4 pr-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange/50 sm:gap-5 sm:pl-5 sm:pr-4 ${
                          expanded ? "bg-white/[0.05]" : "hover:bg-white/[0.03]"
                        }`}
                      >
                        {/* Liseré de source, révélé au survol : couleur sans pastille flottante. */}
                        <span
                          aria-hidden
                          className={`absolute inset-y-1.5 left-0 w-[3px] rounded-r-full transition-opacity duration-200 ${
                            isStrava ? "bg-brand-orange" : "bg-brand-ice"
                          } ${expanded ? "opacity-100" : "opacity-0 group-hover/run:opacity-60"}`}
                        />

                        {/*
                          Ancre de lecture : la distance porte la ligne. La barre
                          sous le chiffre la situe face à la plus longue sortie du
                          mois — on voit d'un coup d'œil les grosses séances.
                        */}
                        <div className="w-[74px] shrink-0 sm:w-[84px]">
                          <p className="font-display text-[21px] font-bold leading-none tracking-[-0.025em] tabular-nums text-white sm:text-[23px]">
                            {(r.distance_m / 1000).toFixed(2).replace(".", ",")}
                            <span className="ml-1 text-[11px] font-semibold text-white/35">km</span>
                          </p>
                          <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-white/[0.07]">
                            <div
                              className="h-full rounded-full transition-[width] duration-500"
                              style={{
                                width: `${Math.max(6, group.maxKm > 0 ? (r.distance_m / 1000 / group.maxKm) * 100 : 0)}%`,
                                backgroundImage: isStrava
                                  ? "linear-gradient(90deg, #c73d00, #fc4c02)"
                                  : "linear-gradient(90deg, #0f9cb8, #67e8f9)",
                              }}
                            />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 text-[14px] font-medium leading-tight text-white/92">
                            <span className="truncate">
                              {isStrava && r.name ? r.name : when.day}
                            </span>
                            {r.is_interval ? (
                              <span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-300/[0.1] px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.06em] text-emerald-200">
                                Fractionné
                              </span>
                            ) : null}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] leading-none">
                            <span className="whitespace-nowrap tabular-nums text-white/35">
                              {isStrava && r.name ? `${when.day} · ` : ""}
                              {when.time}
                            </span>
                            <Stat icon="time" value={formatClock(r.moving_sec)} label="Temps en mouvement" />
                            <Stat
                              icon="pace"
                              value={formatPaceMinPerKm(r.avg_pace_sec_per_km)}
                              unit="/km"
                              label={
                                r.is_interval
                                  ? "Allure moyenne, récupérations comprises — ouvre la sortie pour l’allure des efforts"
                                  : "Allure moyenne"
                              }
                            />
                            {hasHr ? (
                              <Stat
                                icon="heart"
                                value={String(Math.round(r.avg_heartrate!))}
                                unit="bpm"
                                label="Fréquence cardiaque moyenne"
                              />
                            ) : null}
                            {hasElev ? (
                              <Stat
                                icon="elevation"
                                value={`+${Math.round(r.elevation_gain_m!)}`}
                                unit="m"
                                label="Dénivelé positif"
                              />
                            ) : null}
                          </div>
                        </div>

                        <svg
                          className={`h-4 w-4 shrink-0 text-white/20 transition-all duration-200 group-hover/run:text-white/55 ${
                            expanded ? "rotate-90 text-white/55" : ""
                          }`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.9}
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </button>

                      {expanded ? (
                        <div className="border-t border-white/[0.06] bg-[#0b0d13] px-3 py-4 sm:px-5">
                          {dLoading ? (
                            <div className="flex items-center gap-2 py-2 text-[13px] text-white/45">
                              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-orange/30 border-t-brand-orange" />
                              Chargement du détail…
                            </div>
                          ) : detailError && !detail ? (
                            <p className="text-[13px] text-amber-200/90">{detailError}</p>
                          ) : detail ? (
                            <RunDetailPanel run={detail} source={r.source} birthDate={birthDate} />
                          ) : (
                            <p className="text-[13px] text-white/45">—</p>
                          )}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!loading && nextBefore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="btn-quiet w-full cursor-pointer px-4 text-[13px]"
        >
          {loadingMore ? "Chargement…" : "Charger plus de sorties"}
        </button>
      ) : null}
    </section>
  );
}
