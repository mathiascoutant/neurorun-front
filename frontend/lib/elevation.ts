/**
 * Dénivelé cumulé à partir d'une série d'altitudes GPS.
 * Portage à l'identique de `src/lib/elevation.ts` de l'app mobile : les deux
 * plateformes doivent annoncer le même D+ pour une même course.
 *
 * Piège classique : appliquer le seuil de bruit entre deux points CONSÉCUTIFS annule
 * tout dénivelé sur une pente douce (une montée régulière de 40 m échantillonnée à la
 * seconde ne produit jamais deux points écartés de plus de 3 m → cumul nul).
 * On lisse donc la série, puis on accumule par hystérésis autour d'une altitude de
 * référence qui ne se déplace qu'une fois le seuil franchi.
 */

/** Fenêtre de moyenne glissante : absorbe le bruit baro/GPS point à point. */
const SMOOTH_WINDOW = 5;
/** Écart à la référence courante à partir duquel on comptabilise une montée/descente. */
const HYSTERESIS_M = 3;
/** Altitudes hors de cette plage = donnée corrompue. */
const ALT_ABS_MAX_M = 9000;

export type ElevationSummary = {
  gain: number;
  loss: number;
  minAlt: number;
  maxAlt: number;
};

export function isUsableAltitude(alt: number | null | undefined): alt is number {
  return alt != null && Number.isFinite(alt) && Math.abs(alt) <= ALT_ABS_MAX_M;
}

export function smoothAltitudes(alts: number[]): number[] {
  if (alts.length < SMOOTH_WINDOW) return alts.slice();
  const half = Math.floor(SMOOTH_WINDOW / 2);
  const out: number[] = new Array(alts.length);
  for (let i = 0; i < alts.length; i++) {
    const from = Math.max(0, i - half);
    const to = Math.min(alts.length - 1, i + half);
    let sum = 0;
    for (let j = from; j <= to; j++) sum += alts[j];
    out[i] = sum / (to - from + 1);
  }
  return out;
}

/** Dénivelé positif/négatif cumulé et altitudes extrêmes (extrêmes sur la série brute). */
export function elevationSummary(rawAlts: number[]): ElevationSummary {
  const alts = rawAlts.filter(isUsableAltitude);
  if (alts.length === 0) return { gain: 0, loss: 0, minAlt: 0, maxAlt: 0 };
  if (alts.length < 2) {
    return { gain: 0, loss: 0, minAlt: alts[0], maxAlt: alts[0] };
  }

  const smoothed = smoothAltitudes(alts);
  let gain = 0;
  let loss = 0;
  let ref = smoothed[0];

  for (const a of smoothed) {
    const d = a - ref;
    if (d > HYSTERESIS_M) {
      gain += d;
      ref = a;
    } else if (d < -HYSTERESIS_M) {
      loss += -d;
      ref = a;
    }
  }

  return {
    gain,
    loss,
    minAlt: Math.min(...alts),
    maxAlt: Math.max(...alts),
  };
}
