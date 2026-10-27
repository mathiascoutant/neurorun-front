import type { Goal, GoalTerrain, PlannedSession } from "./api";

/*
 * Calculs d’avancement d’un objectif — portés depuis `src/lib/goalStats.ts` de
 * l’app mobile, pour que les deux plateformes affichent la même progression.
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export type GoalTimeline = {
  start: Date | null;
  end: Date | null;
  totalWeeks: number;
  /** Semaine en cours, 1-indexée et bornée à `totalWeeks`. */
  currentWeek: number;
  ratio: number;
  daysLeft: number | null;
  finished: boolean;
};

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

function parseIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Jour civil AAAA-MM-JJ lu à minuit local — une course se compte en jours, pas en heures. */
function parseDay(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function goalTimeline(
  goal: Pick<Goal, "created_at" | "weeks"> & Partial<Pick<Goal, "race_date">>,
  now: Date = new Date(),
): GoalTimeline {
  const totalWeeks = Math.max(1, Math.round(goal.weeks || 0));
  const start = parseIso(goal.created_at);
  if (start == null) {
    return {
      start: null,
      end: null,
      totalWeeks,
      currentWeek: 1,
      ratio: 0,
      daysLeft: null,
      finished: false,
    };
  }
  // Le jour de la course, quand il est connu, prime sur la fenêtre déduite des semaines :
  // celle-ci arrondit au-dessus et tombe jusqu’à six jours après la vraie échéance.
  const race = parseDay(goal.race_date);
  const end = race ?? new Date(start.getTime() + totalWeeks * WEEK_MS);
  const elapsed = now.getTime() - start.getTime();
  const ratio = clamp01(elapsed / Math.max(DAY_MS, end.getTime() - start.getTime()));
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.floor(elapsed / WEEK_MS) + 1));
  if (race != null) {
    // Compte en jours civils : le jour de la course vaut 0, et l’objectif n’est passé
    // que le lendemain — on ne barre pas une course le matin où elle a lieu.
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysLeft = Math.max(0, Math.round((race.getTime() - today.getTime()) / DAY_MS));
    return {
      start,
      end,
      totalWeeks,
      currentWeek,
      ratio,
      daysLeft,
      finished: race.getTime() < today.getTime(),
    };
  }
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
  return { start, end, totalWeeks, currentWeek, ratio, daysLeft, finished: daysLeft === 0 };
}

export function plannedVolumeKm(sessions: readonly PlannedSession[]): number {
  return sessions.reduce(
    (sum, s) => sum + (Number.isFinite(s.distance_km) ? s.distance_km : 0),
    0,
  );
}

/** Couleur d’accent dérivée de la distance : repère visuel constant d’un écran à l’autre. */
export function distanceAccent(km: number): string {
  if (km <= 5) return "#67e8f9";
  if (km <= 10) return "#22c55e";
  if (km <= 21.5) return "#eab308";
  return "#fc4c02";
}

/** Jour civil au format AAAA-MM-JJ, tel que l’attend un `<input type="date">`. */
export function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * Semaines de préparation d’aujourd’hui jusqu’à une date de course. La dernière
 * semaine est presque toujours entamée : on arrondit au-dessus pour que le plan
 * couvre bien le jour de la course. `null` si la date est illisible ou passée.
 */
export function weeksUntil(isoDate: string, now: Date = new Date()): number | null {
  if (!isoDate) return null;
  const target = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / DAY_MS);
  if (days < 1) return null;
  return Math.ceil(days / 7);
}

/** Libellés du terrain : les mêmes dans l’assistant de création et sur l’objectif. */
export const TERRAIN_LABELS: Record<GoalTerrain, string> = {
  road: "Course à pied",
  trail: "Trail",
};

/** Compte à rebours d’un objectif en cours ; un objectif passé s’annonce « Terminé » à part. */
export function formatCountdown(daysLeft: number | null): string {
  if (daysLeft == null) return "—";
  if (daysLeft === 0) return "Jour J";
  return `J-${daysLeft}`;
}
