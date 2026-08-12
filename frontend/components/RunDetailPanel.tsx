"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { LiveRunDetail, LiveRunSplit, LiveRunTrackPoint } from "@/lib/api";
import {
  MIN_FULL_SPLIT_KM,
  buildRunMetrics,
  readHrBpm,
  splitLengthsKm,
  type HrZone,
  type RunMetrics,
  type SplitRow,
} from "@/lib/runMetrics";

/* ------------------------------------------------------------------ formats */

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtNum(v: number, decimals = 1): string {
  return v.toFixed(decimals).replace(".", ",");
}

function fmtSignedSec(sec: number): string {
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  const body = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} s`;
  return `${sec < 0 ? "−" : "+"}${body}`;
}

function fmtClockShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const ZONE_COLORS: Record<number, string> = {
  1: "#60a5fa",
  2: "#22c55e",
  3: "#eab308",
  4: "#fb923c",
  5: "#ef4444",
};

/* ----------------------------------------------------------- synthèse texte */

/** Phrases de synthèse : ce que la course raconte, en clair (identique à l’app). */
function buildHighlights(m: RunMetrics): string[] {
  const out: string[] = [];

  // Sur un fractionné, l’écart d’allure et le ralentissement de seconde moitié
  // sont la séance elle-même, pas un défaut : on lit les efforts, pas la moyenne.
  if (m.isInterval) {
    if (m.intervals != null) {
      const i = m.intervals;
      out.push(
        `Séance en fractionné : ${i.effort_count} efforts tenus à ${fmtPace(i.effort_pace_sec_per_km)} /km en moyenne, récupérations à ${fmtPace(i.recovery_pace_sec_per_km)} /km.`,
      );
      out.push(
        `C’est cette allure d’effort qui compte : la moyenne de ${fmtPace(m.avgPaceSecPerKm)} /km additionne les récupérations et ne décrit pas la séance.`,
      );
    } else {
      out.push(
        `Séance en fractionné : l’allure moyenne de ${fmtPace(m.avgPaceSecPerKm)} /km inclut les récupérations — c’est l’allure de tes efforts qui compte, pas elle.`,
      );
      if (m.bestKmPaceSecPerKm != null && m.worstKmPaceSecPerKm != null && m.splits.length >= 2) {
        out.push(
          `Allure entre ${fmtPace(m.bestKmPaceSecPerKm)} et ${fmtPace(m.worstKmPaceSecPerKm)} /km selon les kilomètres : sur ce type de séance, l’écart est voulu.`,
        );
      }
    }
  } else {
    if (m.negativeSplitSec != null && Math.abs(m.negativeSplitSec) >= 4) {
      out.push(
        m.negativeSplitSec < 0
          ? `Tu as accéléré : la seconde moitié est ${fmtSignedSec(m.negativeSplitSec).replace("−", "")} /km plus rapide que la première.`
          : `Tu as ralenti de ${fmtSignedSec(m.negativeSplitSec).replace("+", "")} /km sur la seconde moitié.`,
      );
    }

    if (m.bestKmPaceSecPerKm != null && m.worstKmPaceSecPerKm != null && m.splits.length >= 2) {
      const spread = m.worstKmPaceSecPerKm - m.bestKmPaceSecPerKm;
      if (spread >= 5) {
        out.push(
          `Allure entre ${fmtPace(m.bestKmPaceSecPerKm)} et ${fmtPace(m.worstKmPaceSecPerKm)} /km selon les kilomètres — ${spread < 20 ? "c’est très régulier" : "de la marge sur la régularité"}.`,
        );
      }
    }
  }

  if (m.hrDriftBpm != null && Math.abs(m.hrDriftBpm) >= 5) {
    out.push(
      m.hrDriftBpm > 0
        ? `Ton cœur est monté de ${m.hrDriftBpm} bpm entre le début et la fin : signe classique de fatigue ou de chaleur.`
        : `Ta FC a baissé de ${Math.abs(m.hrDriftBpm)} bpm en seconde moitié : bonne récupération en cours d’effort.`,
    );
  }

  if (m.elevGainM != null && m.elevGainM >= 30 && m.distanceKm > 0) {
    const perKm = m.elevGainM / m.distanceKm;
    out.push(
      `${Math.round(m.elevGainM)} m de dénivelé positif, soit ${Math.round(perKm)} m/km — ${perKm < 10 ? "terrain roulant" : perKm < 25 ? "parcours vallonné" : "parcours exigeant"}.`,
    );
  }

  if (m.stoppedSec >= 30) {
    out.push(
      `${fmtDuration(m.stoppedSec)} d’arrêt total (pauses, feux, attentes) : ton temps à l’horloge est de ${fmtDuration(m.wallSec)}.`,
    );
  }

  return out;
}

/* ------------------------------------------------------------ séries graphes */

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Profil altimétrique : distance le long du tracé (km) → altitude (m).
 * Ignoré si la variation d’altitude est quasi nulle (bruit GPS).
 */
function buildElevationProfile(points: LiveRunTrackPoint[]): { x: string; y: number }[] {
  const withAlt = points.filter(
    (p) => p.alt_m != null && Number.isFinite(p.alt_m) && Math.abs(p.alt_m) <= 9000,
  );
  if (withAlt.length < 3) return [];

  let distM = 0;
  let lastPushM = 0;
  const stepM = 220;
  const data: { x: string; y: number }[] = [];
  let prev = withAlt[0];
  data.push({ x: "0", y: prev.alt_m as number });

  for (let i = 1; i < withAlt.length; i++) {
    const p = withAlt[i];
    distM += haversineM(prev.lat, prev.lng, p.lat, p.lng);
    prev = p;
    if (distM - lastPushM >= stepM || i === withAlt.length - 1) {
      const km = distM / 1000;
      data.push({
        x: (km < 10 ? km.toFixed(1) : Math.round(km).toString()).replace(".", ","),
        y: p.alt_m as number,
      });
      lastPushM = distM;
    }
  }

  if (data.length < 2) return [];
  const alts = data.map((d) => d.y);
  if (Math.max(...alts) - Math.min(...alts) < 6) return [];
  return data;
}

/**
 * Vitesse moyenne sur chaque kilomètre (km/h), dérivée de l’allure du segment.
 * On n’utilise pas la durée du segment : le dernier est presque toujours partiel,
 * la vitesse exploserait sur le dernier point.
 */
function buildSpeedPerKm(sorted: LiveRunSplit[]): { x: string; y: number }[] {
  if (sorted.length < 2) return [];
  const out: { x: string; y: number }[] = [];
  for (const sp of sorted) {
    const pace = sp.pace_sec_per_km;
    if (!Number.isFinite(pace) || pace < 90 || pace > 7200) continue;
    out.push({ x: String(sp.km), y: Math.round((3600 / pace) * 10) / 10 });
  }
  return out.length >= 2 ? out : [];
}

/** FC (bpm) le long du temps si les points portent `hr_bpm`. */
function buildHrSeries(points: LiveRunTrackPoint[]): { x: string; y: number }[] {
  if (points.length < 2) return [];
  const t0 = points[0].t_ms;
  const step = Math.max(1, Math.floor(points.length / 55));
  const raw: { x: string; y: number }[] = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const hr = readHrBpm(p);
    if (hr != null && hr >= 30 && hr <= 235) {
      raw.push({ x: fmtClockShort((p.t_ms - t0) / 1000), y: Math.round(hr) });
    }
  }
  return raw.length >= 2 ? raw : [];
}

/** Vitesse GPS (km/h) au fil du temps — repli quand il n’y a pas de découpage au km. */
function buildSpeedFromTrack(points: LiveRunTrackPoint[]): { x: string; y: number }[] {
  if (points.length < 3) return [];
  const t0 = points[0].t_ms;
  const step = Math.max(1, Math.floor(points.length / 40));
  const raw: { x: string; y: number }[] = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    if (p.speed_mps != null && p.speed_mps > 0.35 && p.speed_mps < 25) {
      raw.push({
        x: fmtClockShort((p.t_ms - t0) / 1000),
        y: Math.round(p.speed_mps * 3.6 * 10) / 10,
      });
    }
  }
  return raw.length >= 2 ? raw : [];
}

/* -------------------------------------------------------------------- blocs */

function MetricTile({
  label,
  value,
  unit,
  hint,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-wider text-white/40">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span
          className="font-display text-lg font-semibold leading-tight tabular-nums"
          style={{ color: color ?? "#f0f0f5" }}
        >
          {value}
        </span>
        {unit ? <span className="text-[11px] text-white/38">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-white/35">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <h4
        className="font-display text-[13px] font-semibold"
        style={{ color: accent ?? "#ffffff" }}
      >
        {title}
      </h4>
      {subtitle ? (
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">{subtitle}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="h-[200px] w-full min-w-0 sm:h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

const axisTick = { fill: "rgba(255,255,255,0.45)", fontSize: 9 };
/**
 * `itemStyle` est indispensable : sans lui, Recharts colore la valeur avec la couleur
 * de la série — donc en orange sombre sur fond sombre, illisible.
 */
const tooltipProps = {
  contentStyle: {
    background: "#12151f",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    fontSize: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
  },
  labelStyle: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 2 },
  itemStyle: { color: "#f0f0f5", fontWeight: 600 },
  cursor: { fill: "rgba(255,255,255,0.06)", stroke: "rgba(255,255,255,0.18)" },
};

function HrZoneBars({
  zones,
  hrMaxRef,
  estimated,
}: {
  zones: HrZone[];
  hrMaxRef: number;
  estimated: boolean;
}) {
  return (
    <div className="space-y-3">
      {zones.map((z) => (
        <div key={z.index}>
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: ZONE_COLORS[z.index] }}
            />
            <span className="flex-1 text-[11px] font-medium text-white/80">
              Z{z.index} · {z.label}
            </span>
            <span className="text-[11px] tabular-nums text-white/60">
              {Math.round(z.share * 100)} %
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(z.share * 100, z.share > 0 ? 2 : 0)}%`,
                backgroundColor: ZONE_COLORS[z.index],
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-white/35">
            {z.lowBpm}–{z.highBpm} bpm · {fmtDuration(z.seconds)} · {z.description}
          </p>
        </div>
      ))}
      <p className="text-[10px] leading-relaxed text-white/35">
        {estimated
          ? `Zones calculées sur une FC max estimée à ${hrMaxRef} bpm d’après ton âge (208 − 0,7 × âge).`
          : `Zones calculées sur ta FC max observée pendant cette course : ${hrMaxRef} bpm.`}
      </p>
    </div>
  );
}

function SplitsTable({
  rows,
  hasHr,
  hasElev,
}: {
  rows: SplitRow[];
  hasHr: boolean;
  hasElev: boolean;
}) {
  let cumulative = 0;
  const withCumulative = rows.map((r) => {
    cumulative += r.lapSec;
    return { row: r, cumulativeSec: cumulative };
  });

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-[320px] text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.08] text-white/45">
              <th className="px-3 py-2 font-medium">Km</th>
              <th className="px-3 py-2 font-medium">Temps</th>
              <th className="px-3 py-2 font-medium">Allure</th>
              {hasHr ? <th className="px-3 py-2 font-medium">FC</th> : null}
              {hasElev ? <th className="px-3 py-2 font-medium">D+</th> : null}
              <th className="px-3 py-2 font-medium">Cumulé</th>
            </tr>
          </thead>
          <tbody>
            {withCumulative.map(({ row: r, cumulativeSec }) => (
              <tr
                key={r.km}
                className="border-b border-white/[0.05] text-white/85 last:border-0"
              >
                <td className="px-3 py-2 font-medium tabular-nums">
                  {r.isPartial ? "fin" : r.km}
                </td>
                <td className="px-3 py-2 tabular-nums">{fmtDuration(r.lapSec)}</td>
                <td
                  className="px-3 py-2 tabular-nums"
                  style={{
                    color: r.isPartial
                      ? "rgba(255,255,255,0.4)"
                      : r.isFastest
                        ? "#22c55e"
                        : r.isSlowest
                          ? "#eab308"
                          : undefined,
                  }}
                >
                  {/* Reliquat de fin : son allure ramenée au km est une extrapolation. */}
                  {r.isPartial ? `${Math.round(r.lengthKm * 1000)} m` : fmtPace(r.paceSecPerKm)}
                </td>
                {hasHr ? (
                  <td className="px-3 py-2 tabular-nums">{r.avgBpm ?? "—"}</td>
                ) : null}
                {hasElev ? (
                  <td className="px-3 py-2 tabular-nums">
                    {r.elevGainM != null && r.elevGainM > 0 ? `+${r.elevGainM}` : "—"}
                  </td>
                ) : null}
                <td className="px-3 py-2 tabular-nums text-white/70">
                  {fmtDuration(cumulativeSec)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-white/35">
        Vert : ton meilleur km. Jaune : le plus lent.
        {rows.some((r) => r.isPartial)
          ? " La ligne « fin » est le reliquat après le dernier kilomètre complet : trop court pour être classé."
          : ""}
      </p>
    </div>
  );
}

function TechDetails({ run, m }: { run: LiveRunDetail; m: RunMetrics }) {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "Temps à l’horloge", value: fmtDuration(m.wallSec) });
  rows.push({ label: "Temps en mouvement", value: fmtDuration(m.movingSec) });
  if (m.stoppedSec > 1) rows.push({ label: "Temps d’arrêt", value: fmtDuration(m.stoppedSec) });
  if (run.target_km > 0) {
    rows.push({ label: "Objectif fixé", value: `${fmtNum(run.target_km, 2)} km` });
  }
  if (run.activity_type) rows.push({ label: "Type d’activité", value: run.activity_type });
  if (m.trackPointCount > 0) {
    rows.push({ label: "Points GPS", value: String(m.trackPointCount) });
  }
  if (m.hrMaxRef != null) {
    rows.push({
      label: "FC max de référence",
      value: `${m.hrMaxRef} bpm${m.hrMaxRefEstimated ? " (estimée)" : " (mesurée)"}`,
    });
  }
  if (run.auto_pause_detected) rows.push({ label: "Pause automatique", value: "détectée" });
  if (run.client_version) rows.push({ label: "Version client", value: run.client_version });
  if (run.navigator_language) rows.push({ label: "Langue", value: run.navigator_language });
  if (run.screen_w && run.screen_h) {
    rows.push({ label: "Écran", value: `${run.screen_w}×${run.screen_h}` });
  }
  rows.push({ label: run.strava_activity_id != null ? "Activité Strava" : "ID", value: run.id });

  return (
    <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-display text-[13px] font-semibold text-white">
        Détails techniques
        <span className="text-white/38 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-white/[0.06] px-4 py-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1.5 last:border-0"
          >
            <span className="text-[11px] text-white/45">{r.label}</span>
            <span className="break-all text-right text-[11px] text-white/85">{r.value}</span>
          </div>
        ))}
        {run.user_agent ? (
          <p className="mt-2 break-all text-[10px] leading-snug text-white/30">
            UA : {run.user_agent}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ panneau */

type Props = {
  run: LiveRunDetail;
  source: "live" | "strava";
  /** Date de naissance du profil : sert à estimer la FC max pour les zones. */
  birthDate?: string;
};

/**
 * Détail complet d’une course, aligné sur `RunDetailScreen` de l’app mobile :
 * synthèse, allure/vitesse, cardio + zones, relief, graphiques, splits, technique.
 */
export function RunDetailPanel({ run, source, birthDate }: Props) {
  const m = useMemo(() => buildRunMetrics(run, { birthDate }), [run, birthDate]);
  const highlights = useMemo(() => buildHighlights(m), [m]);

  /** Le reliquat final fausserait les graphiques : on le retire des séries. */
  const fullSplits = useMemo(() => {
    const all = (run.splits ?? []).slice().sort((a, b) => a.km - b.km);
    const lens = splitLengthsKm(all.length, run.distance_m / 1000);
    return all.filter((_, i) => lens[i] >= MIN_FULL_SPLIT_KM);
  }, [run.splits, run.distance_m]);

  /* Référence stable : sans ça, `?? []` recrée un tableau à chaque rendu et relance les useMemo. */
  const track = useMemo(() => run.track_points ?? [], [run.track_points]);
  const elevSeries = useMemo(() => buildElevationProfile(track), [track]);
  const speedKmSeries = useMemo(() => buildSpeedPerKm(fullSplits), [fullSplits]);
  const hrSeries = useMemo(() => buildHrSeries(track), [track]);
  const speedFallback = useMemo(() => buildSpeedFromTrack(track), [track]);

  const paceBars = useMemo(
    () =>
      fullSplits.map((sp) => ({
        x: String(sp.km),
        y: Math.max(sp.pace_sec_per_km / 60, 0.1),
        fastest: m.bestKmPaceSecPerKm != null && sp.pace_sec_per_km === m.bestKmPaceSecPerKm,
        slowest: m.worstKmPaceSecPerKm != null && sp.pace_sec_per_km === m.worstKmPaceSecPerKm,
      })),
    [fullSplits, m.bestKmPaceSecPerKm, m.worstKmPaceSecPerKm],
  );

  const showSpeedPerKm = speedKmSeries.length >= 2;
  const isStrava = source === "strava";

  return (
    <div className="space-y-3">
      {/* Héro : distance, temps, allure, FC */}
      <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-br from-brand-orange/[0.18] via-brand-ice/[0.05] to-[#0d0f16] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
              isStrava
                ? "border-brand-ice/35 bg-brand-ice/15 text-brand-ice"
                : "border-brand-orange/35 bg-brand-orange/[0.08] text-brand-orange"
            }`}
          >
            {isStrava ? "Strava" : "NeuroRun"}
          </span>
          {m.isInterval ? (
            <span className="rounded-full border border-emerald-300/35 bg-emerald-300/[0.12] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
              Fractionné
            </span>
          ) : null}
          {isStrava && run.activity_name ? (
            <span className="truncate text-[11px] text-white/70">{run.activity_name}</span>
          ) : null}
        </div>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-[2.5rem] font-bold leading-none tracking-tight text-white">
            {fmtNum(m.distanceKm, 2)}
          </span>
          <span className="font-display text-base font-semibold text-brand-orange">km</span>
        </p>
        <div className="mt-4 flex items-center border-t border-white/[0.1] pt-3">
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <span className="font-display text-base font-semibold tabular-nums text-white/95">
              {fmtDuration(m.movingSec)}
            </span>
            <span className="text-[10px] text-white/38">temps en mouvement</span>
          </div>
          <div className="h-7 w-px bg-white/[0.08]" />
          {/* Sur un fractionné, la moyenne mélange efforts et récupérations :
              c’est l’allure des efforts qui dit ce que vaut la séance. */}
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <span className="font-display text-base font-semibold tabular-nums text-white/95">
              {fmtPace(m.intervals ? m.intervals.effort_pace_sec_per_km : m.avgPaceSecPerKm)}
            </span>
            <span className="text-center text-[10px] text-white/38">
              {m.intervals ? "allure des efforts /km" : "allure moyenne /km"}
            </span>
          </div>
          <div className="h-7 w-px bg-white/[0.08]" />
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <span className="font-display text-base font-semibold tabular-nums text-white/95">
              {m.avgBpm ?? "—"}
            </span>
            <span className="text-[10px] text-white/38">FC moyenne bpm</span>
          </div>
        </div>
      </div>

      {highlights.length > 0 ? (
        <SectionCard title="Ce que dit cette sortie" accent="#67e8f9">
          <ul className="space-y-2">
            {highlights.map((h) => (
              <li key={h} className="flex gap-2 text-[12px] leading-relaxed text-white/70">
                <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-ice" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Allure & vitesse"
        subtitle={
          m.isInterval
            ? "Séance en fractionné : lis l’allure des efforts, la moyenne inclut les récupérations."
            : "L’allure se lit en minutes par kilomètre : plus c’est bas, plus tu vas vite."
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {m.intervals ? (
            <MetricTile
              label="Allure des efforts"
              value={fmtPace(m.intervals.effort_pace_sec_per_km)}
              unit="/km"
              hint={`${m.intervals.effort_count} efforts · ${fmtNum(m.intervals.effort_distance_m / 1000, 2)} km`}
              color="#22c55e"
            />
          ) : null}
          <MetricTile
            label="Allure moyenne"
            value={fmtPace(m.avgPaceSecPerKm)}
            unit="/km"
            hint={m.isInterval ? "Récupérations comprises" : undefined}
          />
          {m.intervals ? (
            <MetricTile
              label="Allure de récup"
              value={fmtPace(m.intervals.recovery_pace_sec_per_km)}
              unit="/km"
              hint={`${fmtDuration(m.intervals.recovery_sec)} au total`}
            />
          ) : null}
          <MetricTile label="Vitesse moyenne" value={fmtNum(m.avgSpeedKmh, 1)} unit="km/h" />
          {m.maxSpeedKmh != null ? (
            <MetricTile
              label="Vitesse max"
              value={fmtNum(m.maxSpeedKmh, 1)}
              unit="km/h"
              hint="Pointe GPS"
            />
          ) : null}
          {m.bestKmPaceSecPerKm != null ? (
            <MetricTile
              label="Meilleur km"
              value={fmtPace(m.bestKmPaceSecPerKm)}
              unit="/km"
              color="#22c55e"
            />
          ) : null}
          {m.worstKmPaceSecPerKm != null ? (
            <MetricTile
              label="Km le plus lent"
              value={fmtPace(m.worstKmPaceSecPerKm)}
              unit="/km"
              color="#eab308"
            />
          ) : null}
          {/* Le negative split compare deux moitiés supposées courues pareil :
              sur un fractionné, il ne mesure que l’ordre des répétitions. */}
          {m.negativeSplitSec != null && !m.isInterval ? (
            <MetricTile
              label="2e moitié"
              value={fmtSignedSec(m.negativeSplitSec)}
              unit="/km"
              hint={m.negativeSplitSec < 0 ? "Tu as accéléré" : "Tu as ralenti"}
              color={m.negativeSplitSec < 0 ? "#22c55e" : undefined}
            />
          ) : null}
        </div>
      </SectionCard>

      {m.avgBpm != null || m.hrZones.length > 0 ? (
        <SectionCard
          title="Fréquence cardiaque"
          subtitle="Le temps passé dans chaque zone dit à quoi a servi la séance."
          accent="#fb7185"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {m.avgBpm != null ? (
              <MetricTile label="FC moyenne" value={String(m.avgBpm)} unit="bpm" />
            ) : null}
            {m.maxBpm != null ? (
              <MetricTile label="FC max" value={String(m.maxBpm)} unit="bpm" color="#ef4444" />
            ) : null}
            {m.minBpm != null ? (
              <MetricTile label="FC min" value={String(m.minBpm)} unit="bpm" />
            ) : null}
            {m.hrDriftBpm != null ? (
              <MetricTile
                label="Dérive cardiaque"
                value={`${m.hrDriftBpm > 0 ? "+" : ""}${m.hrDriftBpm}`}
                unit="bpm"
                hint="2e vs 1re moitié"
              />
            ) : null}
          </div>
          {m.hrZones.length > 0 && m.hrMaxRef != null ? (
            <div className="mt-4">
              <HrZoneBars
                zones={m.hrZones}
                hrMaxRef={m.hrMaxRef}
                estimated={m.hrMaxRefEstimated}
              />
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {m.elevGainM != null || m.maxAltitudeM != null ? (
        <SectionCard
          title="Relief"
          subtitle="Le dénivelé explique souvent une allure plus lente qu’attendu."
          accent="#67e8f9"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {m.elevGainM != null ? (
              <MetricTile
                label="Dénivelé positif"
                value={`+${Math.round(m.elevGainM)}`}
                unit="m"
                color="#22c55e"
              />
            ) : null}
            {m.elevLossM != null ? (
              <MetricTile
                label="Dénivelé négatif"
                value={`−${Math.round(m.elevLossM)}`}
                unit="m"
              />
            ) : null}
            {m.elevGainM != null && m.distanceKm > 0 ? (
              <MetricTile
                label="Dénivelé par km"
                value={String(Math.round(m.elevGainM / m.distanceKm))}
                unit="m/km"
                hint="< 10 plat · > 25 exigeant"
              />
            ) : null}
            {m.minAltitudeM != null ? (
              <MetricTile label="Altitude min" value={String(Math.round(m.minAltitudeM))} unit="m" />
            ) : null}
            {m.maxAltitudeM != null ? (
              <MetricTile label="Altitude max" value={String(Math.round(m.maxAltitudeM))} unit="m" />
            ) : null}
            {m.minAltitudeM != null && m.maxAltitudeM != null ? (
              <MetricTile
                label="Amplitude"
                value={String(Math.round(m.maxAltitudeM - m.minAltitudeM))}
                unit="m"
                hint="Du plus bas au plus haut"
              />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {elevSeries.length >= 2 ? (
        <ChartFrame
          title="Profil d’altitude"
          subtitle="Altitude au fil de la distance parcourue (en km)."
        >
          <LineChart data={elevSeries} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${Math.round(Number(v))} m`, "Altitude"]}
              labelFormatter={(l) => `km ${l}`}
            />
            <Line type="monotone" dataKey="y" stroke="#67e8f9" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      ) : null}

      {showSpeedPerKm ? (
        <ChartFrame
          title="Vitesse par kilomètre"
          subtitle="Vitesse moyenne sur chaque kilomètre parcouru."
        >
          <LineChart data={speedKmSeries} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${v} km/h`, "Vitesse"]}
              labelFormatter={(l) => `km ${l}`}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke="#67e8f9"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#67e8f9" }}
            />
          </LineChart>
        </ChartFrame>
      ) : null}

      {paceBars.length > 0 ? (
        <ChartFrame
          title="Allure par kilomètre"
          subtitle="Plus la barre est haute, plus le kilomètre était lent."
        >
          <BarChart data={paceBars} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={44}
              domain={["auto", "auto"]}
              tickFormatter={(v) => fmtPace(Number(v) * 60)}
            />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${fmtPace(Number(v) * 60)} /km`, "Allure"]}
              labelFormatter={(l) => `km ${l}`}
            />
            <Bar dataKey="y" radius={[4, 4, 0, 0]}>
              {paceBars.map((b) => (
                <Cell
                  key={b.x}
                  fill={b.fastest ? "#22c55e" : b.slowest ? "#eab308" : "#fc4c02"}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
      ) : null}

      {hrSeries.length >= 2 ? (
        <ChartFrame
          title="Fréquence cardiaque"
          subtitle="FC au fil du temps écoulé depuis le départ."
        >
          <LineChart data={hrSeries} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${v} bpm`, "FC"]}
            />
            <Line type="monotone" dataKey="y" stroke="#fb7185" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      ) : null}

      {/* La vitesse GPS n’apporte rien de plus quand la vitesse par km est déjà tracée. */}
      {!showSpeedPerKm && speedFallback.length >= 2 ? (
        <ChartFrame
          title="Vitesse GPS estimée"
          subtitle="Vitesse relevée par le GPS au fil du temps (pas de découpage au km sur cette sortie)."
        >
          <LineChart data={speedFallback} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip {...tooltipProps} formatter={(v: number | string) => [`${v} km/h`, "Vitesse"]} />
            <Line type="monotone" dataKey="y" stroke="#fc4c02" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      ) : null}

      {m.splits.length > 0 ? (
        <SectionCard
          title="Kilomètre par kilomètre"
          subtitle="Temps réel de chaque km, avec sa FC moyenne et son dénivelé."
        >
          <SplitsTable
            rows={m.splits}
            hasHr={m.splits.some((r) => r.avgBpm != null)}
            hasElev={m.splits.some((r) => r.elevGainM != null && r.elevGainM > 0)}
          />
        </SectionCard>
      ) : null}

      <TechDetails run={run} m={m} />

      {run.strava_activity_id != null ? (
        <a
          href={`https://www.strava.com/activities/${run.strava_activity_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-quiet w-full px-4 text-xs"
        >
          Ouvrir sur Strava
        </a>
      ) : null}
    </div>
  );
}
