import type {
  IntervalSummary,
  LiveRunDetail,
  LiveRunSplit,
  LiveRunTrackPoint,
} from "./api";
import { elevationSummary, isUsableAltitude } from "./elevation";

/**
 * Métriques dérivées d'une course (live ou Strava) pour l'écran de détail.
 * Portage à l'identique de `src/lib/runMetrics.ts` de l'app mobile : web et mobile
 * doivent afficher exactement les mêmes chiffres pour une même course.
 *
 * Tout est recalculé depuis la trace quand elle est disponible, avec repli sur les
 * agrégats déjà fournis (client_stats côté app, champs Strava côté API).
 */

const HR_MIN = 30;
const HR_MAX = 235;
/** Vitesses instantanées retenues (m/s) : au-delà, c'est un artefact GPS. */
const SPEED_MIN_MPS = 0.35;
const SPEED_MAX_MPS = 12;

export type HrZone = {
  index: 1 | 2 | 3 | 4 | 5;
  label: string;
  description: string;
  lowBpm: number;
  highBpm: number;
  seconds: number;
  share: number;
};

export type SplitRow = {
  km: number;
  /** Durée réelle de ce kilomètre (s). */
  lapSec: number;
  paceSecPerKm: number;
  /** Distance réellement couverte par ce segment (km) : 1, sauf le reliquat final. */
  lengthKm: number;
  /** Segment trop court pour valoir un kilomètre — exclu de tous les classements. */
  isPartial: boolean;
  avgBpm: number | null;
  elevGainM: number | null;
  elevLossM: number | null;
  /** Position relative de l'allure dans la course : 0 = km le plus rapide, 1 = le plus lent. */
  paceRank: number;
  isFastest: boolean;
  isSlowest: boolean;
};

/**
 * En deçà de cette fraction de kilomètre, un segment n'est pas un « km » :
 * son allure ramenée au kilomètre est une extrapolation (40 m en 9 s → 4:42/km).
 */
export const MIN_FULL_SPLIT_KM = 0.8;

/**
 * Longueur réelle de chaque segment. Les sources découpent au kilomètre entier et
 * terminent par le reliquat : seul le dernier peut être partiel.
 */
export function splitLengthsKm(count: number, totalDistanceKm: number): number[] {
  const lens = new Array<number>(count).fill(1);
  if (count === 0) return lens;
  const rest = totalDistanceKm - (count - 1);
  // rest hors de [0, 1.2] = distance totale incohérente avec le découpage : on ne conclut pas.
  lens[count - 1] = rest > 0 && rest <= 1.2 ? rest : 1;
  return lens;
}

export type RunMetrics = {
  distanceKm: number;
  movingSec: number;
  wallSec: number;
  /** Temps d'arrêt = horloge − mouvement (pauses, feux rouges…). */
  stoppedSec: number;
  avgPaceSecPerKm: number;
  avgSpeedKmh: number;
  maxSpeedKmh: number | null;
  bestKmPaceSecPerKm: number | null;
  worstKmPaceSecPerKm: number | null;
  elevGainM: number | null;
  elevLossM: number | null;
  minAltitudeM: number | null;
  maxAltitudeM: number | null;
  avgBpm: number | null;
  maxBpm: number | null;
  minBpm: number | null;
  /** Dérive cardiaque : écart de FC moyenne entre 2e et 1re moitié (bpm). */
  hrDriftBpm: number | null;
  hrZones: HrZone[];
  /** FC max de référence utilisée pour les zones (mesurée ou estimée sur l'âge). */
  hrMaxRef: number | null;
  hrMaxRefEstimated: boolean;
  splits: SplitRow[];
  /** Écart d'allure entre seconde et première moitié : < 0 = accélération finale. */
  negativeSplitSec: number | null;
  /**
   * Séance à intervalles (fractionné) d'après Strava. L'allure moyenne, la
   * régularité au km et le negative split n'y décrivent pas la séance : les
   * récupérations les tirent vers le bas alors qu'elles sont voulues.
   */
  isInterval: boolean;
  /** Découpage effort / récupération, quand l'API a su l'établir. */
  intervals: IntervalSummary | null;
  trackPointCount: number;
  hasTrack: boolean;
};

/** Le résumé n'est exploitable que s'il porte une allure d'effort mesurée. */
function usableIntervals(s: IntervalSummary | null | undefined): IntervalSummary | null {
  if (s == null) return null;
  if (!Number.isFinite(s.effort_pace_sec_per_km) || s.effort_pace_sec_per_km <= 0) return null;
  if (!Number.isFinite(s.effort_count) || s.effort_count < 2) return null;
  return s;
}

export function readHrBpm(p: LiveRunTrackPoint): number | undefined {
  const h = p.hr_bpm as unknown;
  if (typeof h === "number" && Number.isFinite(h)) return h;
  if (typeof h === "string" && h.trim() !== "") {
    const n = Number(h);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function isPlausibleHr(bpm: number): boolean {
  return bpm >= HR_MIN && bpm <= HR_MAX;
}

function mean(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * NeuroRun (live) : `split_sec` = temps cumulé depuis le départ.
 * Strava : `split_sec` = temps de ce kilomètre seulement.
 */
function isCumulativeSplitTimes(sorted: LiveRunSplit[], movingSec: number): boolean {
  if (sorted.length === 0 || movingSec <= 1) return true;
  const last = sorted[sorted.length - 1].split_sec;
  const tolBelow = Math.max(12, movingSec * 0.05);
  const tolAbove = Math.max(5, movingSec * 0.03);
  if (last < movingSec - tolBelow || last > movingSec + tolAbove) return false;
  return sorted.every((s, i) => i === 0 || s.split_sec + 0.01 >= sorted[i - 1].split_sec);
}

export function lapSecondsPerSplit(sorted: LiveRunSplit[], movingSec: number): number[] {
  if (sorted.length === 0) return [];
  if (isCumulativeSplitTimes(sorted, movingSec)) {
    return sorted.map((sp, i) => {
      const prev = i === 0 ? 0 : sorted[i - 1].split_sec;
      return Math.max(sp.split_sec - prev, 0);
    });
  }
  return sorted.map((sp) => Math.max(sp.split_sec, 0));
}

/** Bornes temporelles [début, fin] de chaque kilomètre, d'après les marqueurs de split. */
function splitWindows(
  sorted: LiveRunSplit[],
  gpsStartMs: number,
): { startMs: number; endMs: number }[] {
  return sorted.map((sp, i) => ({
    startMs: i === 0 ? gpsStartMs : sorted[i - 1].end_timestamp_ms,
    endMs: sp.end_timestamp_ms,
  }));
}

/** Âge en années à la date de la course, pour estimer la FC max (formule de Tanaka). */
export function ageAt(birthDateISO: string | undefined, atISO: string): number | null {
  if (!birthDateISO) return null;
  const b = new Date(birthDateISO);
  const at = new Date(atISO);
  if (Number.isNaN(b.getTime()) || Number.isNaN(at.getTime())) return null;
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age -= 1;
  return age >= 5 && age <= 100 ? age : null;
}

const ZONE_DEFS: {
  index: HrZone["index"];
  label: string;
  description: string;
  from: number;
  to: number;
}[] = [
  { index: 1, label: "Récupération", description: "Très facile, tu peux discuter sans effort", from: 0.5, to: 0.6 },
  { index: 2, label: "Endurance", description: "Le socle : allure footing, respiration confortable", from: 0.6, to: 0.7 },
  { index: 3, label: "Tempo", description: "Soutenu mais tenable, phrases courtes", from: 0.7, to: 0.8 },
  { index: 4, label: "Seuil", description: "Difficile : allure de course sur 10 km", from: 0.8, to: 0.9 },
  { index: 5, label: "VO2 max", description: "Maximal, quelques minutes seulement", from: 0.9, to: 1.04 },
];

/** Répartition du temps passé dans chaque zone cardiaque, en secondes. */
function buildHrZones(points: LiveRunTrackPoint[], hrMax: number): HrZone[] {
  const zones = ZONE_DEFS.map((z) => ({
    index: z.index,
    label: z.label,
    description: z.description,
    lowBpm: Math.round(z.from * hrMax),
    highBpm: Math.round(z.to * hrMax),
    seconds: 0,
    share: 0,
  }));

  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const cur = points[i];
    const hr = readHrBpm(prev);
    if (hr == null || !isPlausibleHr(hr)) continue;
    const dt = (cur.t_ms - prev.t_ms) / 1000;
    // Un trou > 30 s = pause ou perte de signal : ne pas l'imputer à une zone.
    if (!Number.isFinite(dt) || dt <= 0 || dt > 30) continue;
    const ratio = hr / hrMax;
    let zi = ZONE_DEFS.findIndex((z) => ratio >= z.from && ratio < z.to);
    if (zi < 0) zi = ratio >= 1 ? 4 : 0;
    zones[zi].seconds += dt;
    total += dt;
  }

  if (total <= 0) return [];
  for (const z of zones) z.share = z.seconds / total;
  return zones;
}

export function buildRunMetrics(
  run: LiveRunDetail,
  opts?: { birthDate?: string },
): RunMetrics {
  const track = (run.track_points ?? []).slice().sort((a, b) => a.t_ms - b.t_ms);
  const sorted = (run.splits ?? []).slice().sort((a, b) => a.km - b.km);
  const stats = run.client_stats ?? undefined;

  const distanceKm = run.distance_m / 1000;
  const movingSec = run.moving_sec;
  const wallSec = run.wall_sec > 0 ? run.wall_sec : run.moving_sec;

  // --- Cardio -------------------------------------------------------------
  const hrs: number[] = [];
  for (const p of track) {
    const hr = readHrBpm(p);
    if (hr != null && isPlausibleHr(hr)) hrs.push(hr);
  }
  const avgBpm = hrs.length > 0 ? mean(hrs) : (run.avg_heartrate ?? null);
  const maxBpm = hrs.length > 0 ? Math.max(...hrs) : (run.max_heartrate ?? null);
  const minBpm = hrs.length > 0 ? Math.min(...hrs) : null;

  let hrDriftBpm: number | null = null;
  if (hrs.length >= 20) {
    const half = Math.floor(hrs.length / 2);
    const first = mean(hrs.slice(0, half));
    const second = mean(hrs.slice(half));
    if (first != null && second != null) hrDriftBpm = second - first;
  }

  const age = ageAt(opts?.birthDate, run.created_at);
  // Tanaka : 208 − 0.7 × âge, plus fiable que 220 − âge après 40 ans.
  const estimatedMax = age != null ? Math.round(208 - 0.7 * age) : null;
  const observedMax = maxBpm != null && maxBpm > 0 ? maxBpm : null;
  let hrMaxRef: number | null = null;
  let hrMaxRefEstimated = false;
  if (estimatedMax != null && (observedMax == null || observedMax <= estimatedMax)) {
    hrMaxRef = estimatedMax;
    hrMaxRefEstimated = true;
  } else if (observedMax != null) {
    // FC observée au-dessus de l'estimation : c'est elle la référence crédible.
    hrMaxRef = observedMax;
    hrMaxRefEstimated = false;
  }
  const hrZones = hrMaxRef != null && track.length > 1 ? buildHrZones(track, hrMaxRef) : [];

  // --- Altitude -----------------------------------------------------------
  const alts: number[] = [];
  for (const p of track) {
    if (isUsableAltitude(p.alt_m)) alts.push(p.alt_m);
  }
  const fromTrack = alts.length >= 3 ? elevationSummary(alts) : null;
  const elevGainM = fromTrack ? fromTrack.gain : (stats?.elevation_gain_m ?? null);
  const elevLossM = fromTrack ? fromTrack.loss : (stats?.elevation_loss_m ?? null);
  const minAltitudeM = fromTrack ? fromTrack.minAlt : (stats?.min_altitude_m ?? null);
  const maxAltitudeM = fromTrack ? fromTrack.maxAlt : (stats?.max_altitude_m ?? null);

  // --- Vitesse ------------------------------------------------------------
  const speeds: number[] = [];
  for (const p of track) {
    if (p.speed_mps != null && p.speed_mps > SPEED_MIN_MPS && p.speed_mps < SPEED_MAX_MPS) {
      speeds.push(p.speed_mps);
    }
  }
  const avgSpeedKmh = movingSec > 0 ? (distanceKm / movingSec) * 3600 : 0;
  let maxSpeedKmh: number | null = null;
  if (speeds.length > 0) maxSpeedKmh = Math.max(...speeds) * 3.6;
  else if (stats?.max_speed_kmh) maxSpeedKmh = stats.max_speed_kmh;
  else if (run.max_implied_speed_kmh) maxSpeedKmh = run.max_implied_speed_kmh;

  // --- Kilomètres ---------------------------------------------------------
  const laps = lapSecondsPerSplit(sorted, movingSec);
  const windows = splitWindows(sorted, run.gps_start_ts_ms);
  const lengths = splitLengthsKm(sorted.length, distanceKm);
  const partial = lengths.map((len) => len < MIN_FULL_SPLIT_KM);

  // Seuls les kilomètres complets entrent dans les classements : le reliquat final
  // (ex. 40 m à 4:42/km d'allure extrapolée) écraserait le « meilleur km ».
  const paces = sorted
    .filter((sp, i) => !partial[i] && sp.pace_sec_per_km > 0)
    .map((sp) => sp.pace_sec_per_km);
  const fastest = paces.length > 0 ? Math.min(...paces) : null;
  const slowest = paces.length > 0 ? Math.max(...paces) : null;
  const paceSpan = fastest != null && slowest != null ? slowest - fastest : 0;

  const splits: SplitRow[] = sorted.map((sp, i) => {
    const w = windows[i];
    const inWindow = track.filter((p) => p.t_ms > w.startMs && p.t_ms <= w.endMs);
    const kmHrs: number[] = [];
    const kmAlts: number[] = [];
    for (const p of inWindow) {
      const hr = readHrBpm(p);
      if (hr != null && isPlausibleHr(hr)) kmHrs.push(hr);
      if (isUsableAltitude(p.alt_m)) kmAlts.push(p.alt_m);
    }
    const kmElev = kmAlts.length >= 3 ? elevationSummary(kmAlts) : null;
    const avg = mean(kmHrs);
    const isPartial = partial[i];
    return {
      km: sp.km,
      lapSec: laps[i] ?? 0,
      paceSecPerKm: sp.pace_sec_per_km,
      lengthKm: lengths[i],
      isPartial,
      avgBpm: avg != null ? Math.round(avg) : null,
      elevGainM: kmElev ? Math.round(kmElev.gain) : null,
      elevLossM: kmElev ? Math.round(kmElev.loss) : null,
      paceRank:
        !isPartial && paceSpan > 0 && fastest != null
          ? (sp.pace_sec_per_km - fastest) / paceSpan
          : 0,
      isFastest: !isPartial && fastest != null && sp.pace_sec_per_km === fastest,
      isSlowest:
        !isPartial && slowest != null && sp.pace_sec_per_km === slowest && paceSpan > 0,
    };
  });

  // Négatif = seconde moitié plus rapide (negative split). Reliquat final exclu.
  const fullSplits = splits.filter((s) => !s.isPartial);
  let negativeSplitSec: number | null = null;
  if (fullSplits.length >= 4) {
    const half = Math.floor(fullSplits.length / 2);
    const first = mean(fullSplits.slice(0, half).map((s) => s.paceSecPerKm));
    const second = mean(fullSplits.slice(half).map((s) => s.paceSecPerKm));
    if (first != null && second != null) negativeSplitSec = second - first;
  }

  return {
    distanceKm,
    movingSec,
    wallSec,
    stoppedSec: Math.max(0, wallSec - movingSec),
    avgPaceSecPerKm: run.avg_pace_sec_per_km,
    avgSpeedKmh,
    maxSpeedKmh,
    bestKmPaceSecPerKm: fastest,
    worstKmPaceSecPerKm: slowest,
    elevGainM,
    elevLossM,
    minAltitudeM,
    maxAltitudeM,
    avgBpm: avgBpm != null ? Math.round(avgBpm) : null,
    maxBpm: maxBpm != null ? Math.round(maxBpm) : null,
    minBpm: minBpm != null ? Math.round(minBpm) : null,
    hrDriftBpm: hrDriftBpm != null ? Math.round(hrDriftBpm) : null,
    hrZones,
    hrMaxRef,
    hrMaxRefEstimated,
    splits,
    negativeSplitSec: negativeSplitSec != null ? Math.round(negativeSplitSec) : null,
    isInterval: run.is_interval === true,
    intervals: usableIntervals(run.interval_summary),
    trackPointCount: track.length,
    hasTrack: track.length > 0,
  };
}
