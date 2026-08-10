import type { Goal, PlannedSession } from "./api";

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

export function goalTimeline(
  goal: Pick<Goal, "created_at" | "weeks">,
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
  const end = new Date(start.getTime() + totalWeeks * WEEK_MS);
  const elapsed = now.getTime() - start.getTime();
  const ratio = clamp01(elapsed / (totalWeeks * WEEK_MS));
  const currentWeek = Math.min(totalWeeks, Math.max(1, Math.floor(elapsed / WEEK_MS) + 1));
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

export function formatCountdown(daysLeft: number | null): string {
  if (daysLeft == null) return "—";
  if (daysLeft === 0) return "Terminé";
  if (daysLeft === 1) return "J-1";
  return `J-${daysLeft}`;
}
