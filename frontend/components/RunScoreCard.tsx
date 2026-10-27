"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  fetchRunScore,
  type RunScore,
  type RunScoreBand,
  type RunScoreComponent,
  type RunScoreKm,
  type RunScoreRep,
  type RunSessionType,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

const BAND_LABEL: Record<RunScoreBand, string> = {
  exceptionnel: "Exceptionnel",
  tres_bon: "Très bon",
  bon: "Bon",
  correct: "Correct",
  a_travailler: "À travailler",
};

const SESSION_LABEL: Record<RunSessionType, string> = {
  endurance: "Endurance fondamentale",
  tempo: "Allure soutenue",
  race: "Course à fond",
  interval: "Fractionné",
};

/** Couleurs du thème de l’app : la note garde les mêmes repères visuels. */
const COLORS = {
  ice: "#67e8f9",
  success: "#22c55e",
  brand: "#fc4c02",
  warning: "#f59e0b",
  error: "#ef4444",
} as const;

function bandColor(band: RunScoreBand): string {
  switch (band) {
    case "exceptionnel":
      return COLORS.ice;
    case "tres_bon":
      return COLORS.success;
    case "bon":
      return COLORS.brand;
    case "correct":
      return COLORS.warning;
    default:
      return COLORS.error;
  }
}

/** D’où vient le type de séance jugé : choisi au départ, ou lu dans l’allure. */
function sessionOrigin(score: RunScore): string {
  if (score.intervals_undetected) {
    return "Fractionné choisi au départ, mais tes répétitions ne se détachent pas de la trace : jugée comme une sortie continue.";
  }
  if (score.session_auto) {
    const pct = score.intensity_pct ? ` (${Math.round(score.intensity_pct)} % de ta VMA)` : "";
    return `Course libre : type déduit de ton allure${pct}.`;
  }
  return "Type choisi au départ.";
}

function fmtPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtDelta(sec: number): string {
  const s = Math.round(sec);
  return `${s >= 0 ? "+" : ""}${s} s`;
}

function fmtTime(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Anneau de la note : le chiffre au centre, pas un pourcentage. */
function ScoreRing({
  total,
  color,
  size = 116,
  thickness = 9,
}: {
  total: number;
  color: string;
  size?: number;
  thickness?: number;
}) {
  const ratio = Math.max(0, Math.min(1, total / 100));
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Note ${total} sur 100`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.10)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 420ms ease-out" }}
        />
      </svg>
      <span className="absolute flex flex-col items-center" aria-hidden>
        <span
          className="font-display text-[34px] font-bold leading-none tabular-nums"
          style={{ color }}
        >
          {total}
        </span>
        <span className="mt-1 text-[10px] font-medium text-white/40">/ 100</span>
      </span>
    </span>
  );
}

/**
 * Composantes de la note. Une note calculée par un serveur antérieur au barème
 * v2 n’en a pas : on retombe sur ses deux composantes d’alors.
 */
function componentsOf(score: RunScore): RunScoreComponent[] {
  if (score.components?.length) return score.components;
  return [
    { key: "regularity", label: "Régularité", score: score.regularity, weight: 70 },
    { key: "chrono", label: "Chrono", score: score.chrono, weight: 30 },
  ];
}

function ComponentRow({ c, color }: { c: RunScoreComponent; color: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-[96px] shrink-0 truncate text-[12px] text-white/60 sm:w-[116px]">
        {c.label}
      </span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
        <span
          className="block h-full rounded-full transition-[width] duration-500"
          style={{
            width: `${Math.max(0, Math.min(100, c.score))}%`,
            backgroundColor: color,
          }}
        />
      </span>
      <span className="w-7 shrink-0 text-right font-display text-[14px] font-semibold tabular-nums text-white/90">
        {c.score}
      </span>
      <span className="w-8 shrink-0 text-right text-[10px] tabular-nums text-white/35">
        {c.weight} %
      </span>
    </div>
  );
}

/** Barre centrée sur 0 : à gauche plus vite que prévu, à droite plus lent. */
function DeltaBar({
  deltaSec,
  maxAbs,
  onTarget,
}: {
  deltaSec: number;
  maxAbs: number;
  onTarget: boolean;
}) {
  const ratio = maxAbs > 0 ? Math.min(1, Math.abs(deltaSec) / maxAbs) : 0;
  const ahead = deltaSec < 0;
  return (
    <span className="relative h-3.5 flex-1">
      <span className="absolute inset-y-0 left-1/2 w-px bg-white/[0.14]" />
      <span
        className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
        style={{
          width: `${ratio * 50}%`,
          left: ahead ? undefined : "50%",
          right: ahead ? "50%" : undefined,
          backgroundColor: onTarget ? COLORS.success : ahead ? COLORS.ice : COLORS.brand,
        }}
      />
    </span>
  );
}

/**
 * Une ligne par kilomètre : l’écart à l’allure visée pour une course à fond,
 * l’écart à la zone pour les autres séances.
 */
function KmRow({
  km,
  maxAbs,
  inZoneMode,
  showHr,
}: {
  km: RunScoreKm;
  maxAbs: number;
  inZoneMode: boolean;
  showHr: boolean;
}) {
  const onTarget = inZoneMode ? km.delta_sec === 0 : Math.abs(km.delta_sec) <= 2;
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <span className="w-10 shrink-0 text-[11px] text-white/55">km {km.km}</span>
      <DeltaBar deltaSec={km.delta_sec} maxAbs={maxAbs} onTarget={onTarget} />
      <span className="w-[46px] shrink-0 text-right text-[11px] tabular-nums text-white/60">
        {fmtPace(km.pace_sec_per_km)}
      </span>
      {showHr ? (
        <span className="w-[50px] shrink-0 text-right text-[10px] tabular-nums text-white/35">
          {km.hr_bpm ? `${Math.round(km.hr_bpm)} bpm` : "—"}
        </span>
      ) : null}
      <span
        className={`w-[46px] shrink-0 text-right text-[11px] tabular-nums ${
          onTarget ? "text-emerald-400" : "text-white/35"
        }`}
      >
        {inZoneMode && onTarget ? "zone" : fmtDelta(km.delta_sec)}
      </span>
    </div>
  );
}

/** Une répétition de fractionné : écart à l’allure médiane, puis la récup qui suit. */
function RepRow({ rep, maxAbs, showHr }: { rep: RunScoreRep; maxAbs: number; showHr: boolean }) {
  const onTarget = Math.abs(rep.delta_sec) <= 2;
  return (
    <div>
      <div className="flex items-center gap-2 py-[3px]">
        <span className="w-10 shrink-0 text-[11px] text-white/55">rép. {rep.rep}</span>
        <DeltaBar deltaSec={rep.delta_sec} maxAbs={maxAbs} onTarget={onTarget} />
        <span className="w-[46px] shrink-0 text-right text-[11px] tabular-nums text-white/60">
          {fmtPace(rep.pace_sec_per_km)}
        </span>
        {showHr ? (
          <span className="w-[50px] shrink-0 text-right text-[10px] tabular-nums text-white/35">
            {rep.hr_bpm ? `${Math.round(rep.hr_bpm)} bpm` : "—"}
          </span>
        ) : null}
        <span
          className={`w-[46px] shrink-0 text-right text-[11px] tabular-nums ${
            onTarget ? "text-emerald-400" : "text-white/35"
          }`}
        >
          {fmtDelta(rep.delta_sec)}
        </span>
      </div>
      <p className="ml-12 text-[10px] text-white/30">
        {Math.round(rep.distance_m)} m en {fmtTime(rep.sec)}
        {rep.recovery_sec ? ` · récup ${fmtTime(rep.recovery_sec)}` : ""}
      </p>
    </div>
  );
}

function Bullets({ title, lines }: { title: string; lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <h4 className="font-display text-[13px] font-semibold text-white/90">{title}</h4>
      {lines.map((line, i) => (
        <div key={`${i}-${line.slice(0, 16)}`} className="flex items-start gap-2">
          <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-brand-orange" />
          <p className="text-[12.5px] leading-[19px] text-white/60">{line}</p>
        </div>
      ))}
    </div>
  );
}

type Props = {
  /** Course NeuroRun : les sorties Strava ne sont pas notées. */
  runId: string;
};

/**
 * Note sur 100 d’une course : le chiffre, ce qui l’explique, et quoi corriger.
 * Portage web de `RunScoreCard` de l’app mobile — la course est jugée sur ce
 * qu’elle cherchait à faire : une course à fond est comparée à l’allure que la
 * VMA rend tenable sur la distance, une endurance ou une allure soutenue au
 * respect de sa zone, à sa régularité et au cardio. Un fractionné se juge sur
 * ses répétitions, affichées une à une.
 */
export function RunScoreCard({ runId }: Props) {
  const [score, setScore] = useState<RunScore | null>(null);
  const [needsTest, setNeedsTest] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setError("");
    setLoading(true);
    try {
      const res = await fetchRunScore(token, runId);
      if (res.scored) {
        setScore(res.score);
        setNeedsTest(false);
      } else {
        setScore(null);
        setNeedsTest(res.needs_vma_test);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Note indisponible");
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4">
        <div className="flex items-center gap-2 text-[13px] text-white/45">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-orange/30 border-t-brand-orange" />
          Analyse de ta course…
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2.5 rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4">
        <p className="app-kicker">Note</p>
        <p className="text-[13px] text-white/60">{error}</p>
        <button type="button" onClick={() => void load()} className="btn-quiet cursor-pointer px-4 text-[13px]">
          Réessayer
        </button>
      </div>
    );
  }

  if (needsTest) {
    return (
      <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4">
        <p className="app-kicker">Note</p>
        <p className="font-display text-[15px] font-semibold text-white/90">Pas encore de note</p>
        <p className="text-[12.5px] leading-[19px] text-white/55">
          Pour noter tes courses, il faut d’abord connaître ta VMA. Le test dure 6 minutes et se
          passe depuis l’application NeuroRun ; tes notes apparaîtront ensuite ici.
        </p>
      </div>
    );
  }

  // Course trop courte ou sans kilomètre complet : rien à afficher.
  if (!score) return null;

  const color = bandColor(score.band);
  const maxAbs = Math.max(10, ...score.kms.map((k) => Math.abs(k.delta_sec)));
  const session = score.session_type;
  const inZoneMode = session === "endurance" || session === "tempo";
  const reps = session === "interval" ? (score.reps ?? []) : [];
  const showHr = score.kms.some((k) => (k.hr_bpm ?? 0) > 0);
  const repsShowHr = reps.some((r) => (r.hr_bpm ?? 0) > 0);
  const repMaxAbs = Math.max(10, ...reps.map((r) => Math.abs(r.delta_sec)));
  const avgPace = score.distance_km > 0 ? score.actual_time_sec / score.distance_km : 0;

  return (
    <div
      className="space-y-4 rounded-2xl border p-4"
      style={{ borderColor: `${color}2e`, backgroundColor: `${color}0d` }}
    >
      <p className="app-kicker">Note de la course</p>

      <div className="flex items-center gap-4">
        <ScoreRing total={score.total} color={color} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-display text-[17px] font-semibold tracking-[-0.01em]" style={{ color }}>
            {BAND_LABEL[score.band]}
          </p>
          {session ? (
            <p className="text-[12.5px] font-semibold text-white/90">{SESSION_LABEL[session]}</p>
          ) : null}
          {session ? (
            <p className="text-[11.5px] leading-[17px] text-white/40">{sessionOrigin(score)}</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        {componentsOf(score).map((c) => (
          <ComponentRow key={c.key} c={c} color={color} />
        ))}
      </div>

      {score.explanation?.summary ? (
        <p className="text-[13.5px] leading-[21px] text-white/85">{score.explanation.summary}</p>
      ) : null}

      {reps.length > 0 ? (
        <div className="space-y-1 rounded-xl bg-white/[0.04] p-3">
          <p className="text-[12px] leading-[19px] text-white/55">
            {reps.length} répétitions · effort minimum (seuil) :{" "}
            <strong className="font-semibold text-white/90">
              {fmtPace(score.zone_slow_pace_sec_per_km ?? 0)}/km
            </strong>
          </p>
          <p className="text-[12px] leading-[19px] text-white/55">
            {score.kms_in_band} sur {reps.length} au moins au seuil · écart moyen{" "}
            {score.mean_abs_dev_sec.toFixed(1)} s/km entre répétitions
          </p>
          <p className="text-[12px] leading-[19px] text-white/55">
            VMA de référence {score.vma_kmh.toFixed(1)} km/h
          </p>
        </div>
      ) : inZoneMode && score.zone_fast_pace_sec_per_km && score.zone_slow_pace_sec_per_km ? (
        <div className="space-y-1 rounded-xl bg-white/[0.04] p-3">
          <p className="text-[12px] leading-[19px] text-white/55">
            Zone de la séance :{" "}
            <strong className="font-semibold text-white/90">
              {`${fmtPace(score.zone_fast_pace_sec_per_km)} – ${fmtPace(score.zone_slow_pace_sec_per_km)}/km`}
            </strong>
            {score.hr_ceiling_bpm ? (
              <>
                {" "}
                · cœur sous{" "}
                <strong className="font-semibold text-white/90">
                  {Math.round(score.hr_ceiling_bpm)} bpm
                </strong>
              </>
            ) : null}
          </p>
          <p className="text-[12px] leading-[19px] text-white/55">
            Réalisé : <strong className="font-semibold text-white/90">{fmtPace(avgPace)}/km</strong>
            {score.hr_avg_bpm ? ` · FC moyenne ${Math.round(score.hr_avg_bpm)} bpm` : ""}
            {score.hr_in_zone_pct != null
              ? ` · ${Math.round(score.hr_in_zone_pct)} % du temps sous le plafond`
              : ""}
          </p>
          {score.decoupling_pct != null ? (
            <p className="text-[12px] leading-[19px] text-white/55">
              Dérive cardiaque :{" "}
              <strong className="font-semibold text-white/90">
                {score.decoupling_pct.toFixed(1)} %
              </strong>{" "}
              entre la 1re et la 2e moitié
            </p>
          ) : null}
          <p className="text-[12px] leading-[19px] text-white/55">
            VMA de référence {score.vma_kmh.toFixed(1)} km/h
            {score.hr_avg_bpm ? "" : " · sans montre, la note ne juge que l’allure"}
          </p>
        </div>
      ) : (
        <div className="space-y-1 rounded-xl bg-white/[0.04] p-3">
          <p className="text-[12px] leading-[19px] text-white/55">
            Objectif sur {score.distance_km.toFixed(2)} km :{" "}
            <strong className="font-semibold text-white/90">
              {fmtPace(score.target_pace_sec_per_km)}/km
            </strong>
            , soit{" "}
            <strong className="font-semibold text-white/90">{fmtTime(score.target_time_sec)}</strong>
          </p>
          <p className="text-[12px] leading-[19px] text-white/55">
            Réalisé :{" "}
            <strong className="font-semibold text-white/90">{fmtTime(score.actual_time_sec)}</strong>{" "}
            ({fmtDelta(score.chrono_delta_sec)}) · VMA de référence {score.vma_kmh.toFixed(1)} km/h
          </p>
        </div>
      )}

      {reps.length > 0 ? (
        <div className="space-y-1">
          <h4 className="font-display text-[13px] font-semibold text-white/90">
            Répétition par répétition
          </h4>
          <p className="mb-1.5 text-[11px] text-white/40">
            Écart de chaque répétition à ton allure médiane, puis la récupération qui suit
          </p>
          {reps.map((r) => (
            <RepRow key={r.rep} rep={r} maxAbs={repMaxAbs} showHr={repsShowHr} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          <h4 className="font-display text-[13px] font-semibold text-white/90">
            Kilomètre par kilomètre
          </h4>
          <p className="mb-1.5 text-[11px] text-white/40">
            {inZoneMode
              ? `${score.kms_in_band} km sur ${score.kms.length} dans la zone · écart moyen à ton allure ${score.mean_abs_dev_sec.toFixed(1)} s/km`
              : `${score.kms_in_band} km sur ${score.kms.length} dans la fourchette · écart moyen ${score.mean_abs_dev_sec.toFixed(1)} s/km`}
          </p>
          {score.kms.map((k) => (
            <KmRow key={k.km} km={k} maxAbs={maxAbs} inZoneMode={inZoneMode} showHr={showHr} />
          ))}
        </div>
      )}

      <Bullets title="Pourquoi cette note" lines={score.explanation?.why ?? []} />
      <Bullets title="Comment progresser" lines={score.explanation?.advice ?? []} />

      {score.stale_vma_hint ? (
        <p className="rounded-xl border border-white/[0.12] p-3 text-[12px] leading-[19px] text-white/55">
          Tu vas nettement plus vite que ce que prévoit ta VMA : refais le test de 6 minutes dans
          l’application pour que tes notes redeviennent justes.
        </p>
      ) : null}
    </div>
  );
}
