/**
 * Paramètres et utilitaires pour le suivi course en navigateur (Safari / iOS notamment).
 * Les applications natives voient un flux GNSS plus régulier ; ici nous plafonnons les
 * segments pour rester proches des métriques type Strava malgré les trous d’échantillonnage.
 */

/** `watchPosition` — léger `maximumAge` pour qu’iOS puisse livrer des fixes un peu plus souvent. */
export const WEB_GPS_WATCH: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 2500,
  timeout: 20000,
};

export const WEB_GPS_SEED: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30000,
};

/** Vitesse plafond (km/h) pour créditer de la distance sur Δt — évite les « sauts » lors des pauses du navigateur. */
export const WEB_GPS_MAX_SEGMENT_CREDIT_KMH = 32;

/**
 * Saut brut (m) : si dépassé avec un Δt court, on considère une erreur / téléport et on n’ajoute pas de distance
 * (mais on met quand même à jour la position pour ne pas bloquer les segments suivants).
 */
export const WEB_GPS_HARD_REJECT_JUMP_M = 520;

/**
 * Entre deux ticks du minuteur, borne le temps « en mouvement » ajouté (évite une rafale artificielle
 * tout en ne perdant plus les longues périodes où le JS est suspendu alors que la course continue).
 */
export const WEB_GPS_MOVING_TICK_CAP_SEC = 120;

/**
 * @returns distance à cumuler (m), `0` = quasi-stationnaire (traiter comme avant : lissage vitesse nulle),
 *          `null` = segment rejeté (saut incohérent).
 */
export function webGpsCreditDistanceM(
  rawM: number,
  dtSec: number,
): number | null {
  if (!Number.isFinite(rawM) || !Number.isFinite(dtSec) || dtSec <= 0) {
    return null;
  }
  if (rawM < 0.5) {
    return 0;
  }
  const capM = (WEB_GPS_MAX_SEGMENT_CREDIT_KMH / 3.6) * dtSec;
  if (rawM > WEB_GPS_HARD_REJECT_JUMP_M && dtSec < 4) {
    return null;
  }
  return Math.min(rawM, capM);
}

export function webGpsMovingSecondsDelta(
  dtWallSec: number,
  paused: boolean,
): number {
  if (paused || dtWallSec <= 0) {
    return 0;
  }
  return Math.min(dtWallSec, WEB_GPS_MOVING_TICK_CAP_SEC);
}
