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
import { withAlpha } from "@/lib/color";
import { RunDetailPanel } from "@/components/RunDetailPanel";
import { RouteThumb } from "@/components/RouteThumb";
import { RunScoreCard } from "@/components/RunScoreCard";

const PAGE_SIZE = 10;

/** Teintes de provenance, comme dans l’app : glace NeuroRun, orange Strava. */
const TINT_NEURORUN = "#67e8f9";
const TINT_STRAVA = "#fc4c02";

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

/** Jour d’une sortie, relatif tant qu’il reste lisible (« Hier », « il y a 3 j »). */
function formatRelativeDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (days === 0) return "Aujourd’hui";
  if (days === 1) return "Hier";
  if (days < 7) return `il y a ${days} j`;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Heure d’une sortie (« 18:45 »), lue dans le fuseau du navigateur. */
function formatTimeOfDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Nom d’une sortie NeuroRun d’après l’heure de départ, à la manière dont
 * Strava nomme les siennes : la liste web et l’app disent la même chose.
 */
function runNameFromTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Course";
  const h = d.getHours();
  if (h >= 5 && h < 11) return "Course matinale";
  if (h >= 11 && h < 14) return "Course du midi";
  if (h >= 14 && h < 18) return "Course de l’après-midi";
  if (h >= 18 && h < 22) return "Course du soir";
  return "Course de nuit";
}

/** Une mesure sous la distance : son intitulé, sa valeur, son unité. */
function HistoryStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <span className="min-w-0">
      <span className="block text-[10px] leading-none text-white/35">{label}</span>
      <span className="mt-1 block whitespace-nowrap font-display text-[15px] font-semibold tabular-nums text-white/92">
        {value}
        {unit ? <span className="ml-0.5 text-[11px] font-medium text-white/40">{unit}</span> : null}
      </span>
    </span>
  );
}

type MonthGroup = {
  key: string;
  label: string;
  km: number;
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

              <ul className="space-y-2.5">
                {group.items.map((r) => {
                  const key = itemKey(r);
                  const expanded = openId === key;
                  const detail = details[key];
                  const dLoading = detailLoading === key;
                  const isStrava = r.source === "strava";
                  const when = itemDate(r);
                  const hasHr = r.avg_heartrate != null && r.avg_heartrate > 0;
                  const hasElev = r.elevation_gain_m != null && r.elevation_gain_m > 0;
                  const km = r.distance_m / 1000;
                  /* Une sortie NeuroRun prend un nom d’après l’heure, comme
                     Strava nomme les siennes : la provenance passe au surtitre. */
                  const title = r.name?.trim() ? r.name : runNameFromTime(when);
                  /* La couleur de provenance (glace NeuroRun, orange Strava)
                     teinte toute la carte : fond, surtitre, unité, tracé. */
                  const tint = isStrava ? TINT_STRAVA : TINT_NEURORUN;
                  const sub = [
                    formatRelativeDay(when),
                    formatTimeOfDay(when),
                    hasHr ? `${Math.round(r.avg_heartrate!)} bpm` : "",
                    hasElev ? `+${Math.round(r.elevation_gain_m!)} m` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ");

                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => void toggleOpen(r)}
                        aria-expanded={expanded}
                        className="group/run relative flex w-full cursor-pointer items-center gap-4 overflow-hidden rounded-2xl border p-4 text-left transition hover:brightness-[1.12] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
                        style={{
                          borderColor: withAlpha(tint, expanded ? 0.4 : 0.18),
                          backgroundColor: "#0d0f16",
                        }}
                      >
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0"
                          style={{
                            backgroundImage: `linear-gradient(135deg, ${withAlpha(tint, 0.14)} 0%, ${withAlpha(tint, 0.04)} 55%, rgba(13, 15, 22, 0.6) 100%)`,
                          }}
                        />

                        <div className="relative min-w-0 flex-1">
                          <p
                            className="text-[10px] font-semibold uppercase tracking-[0.08em]"
                            style={{ color: tint }}
                          >
                            {isStrava
                              ? "Strava"
                              : r.session_type === "endurance"
                                ? "NeuroRun · Endurance"
                                : "NeuroRun"}
                          </p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="truncate text-[15px] font-medium leading-tight text-white/92">
                              {title}
                            </span>
                            {r.is_interval ? (
                              <span className="shrink-0 rounded-full border border-emerald-300/30 bg-emerald-300/[0.12] px-1.5 py-0.5 text-[9px] font-semibold text-emerald-300">
                                Fractionné
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] tabular-nums text-white/35">
                            {sub}
                          </p>

                          {/* La distance porte la carte ; allure et temps
                              suivent, un cran en dessous. */}
                          <p className="mt-3 flex items-baseline gap-1 font-display text-[30px] font-bold leading-none tracking-[-0.025em] tabular-nums text-white">
                            {km.toFixed(2).replace(".", ",")}
                            <span className="text-[16px] font-semibold" style={{ color: tint }}>
                              km
                            </span>
                          </p>
                          <div className="mt-2.5 flex items-start gap-6">
                            <HistoryStat
                              label="Allure"
                              value={formatPaceMinPerKm(r.avg_pace_sec_per_km)}
                              unit="/km"
                            />
                            <HistoryStat label="Temps" value={formatClock(r.moving_sec)} />
                          </div>
                        </div>

                        {/* Le tracé, sur fond neutre ; sans GPS (tapis, course
                            virtuelle), la vignette garde sa place. */}
                        <RouteThumb
                          polyline={r.route_polyline}
                          color={tint}
                          size={112}
                          className="relative"
                        />

                        <svg
                          className={`relative hidden h-4 w-4 shrink-0 text-white/20 transition-all duration-200 group-hover/run:text-white/55 sm:block ${
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
                        <div className="mt-2 space-y-3 rounded-2xl border border-white/[0.06] bg-[#0b0d13] px-3 py-4 sm:px-5">
                          {/* La note ne vaut que pour une course NeuroRun : Strava
                              n’en fournit ni le type de séance ni les intentions. */}
                          {r.source === "live" && r.id ? <RunScoreCard runId={r.id} /> : null}
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
