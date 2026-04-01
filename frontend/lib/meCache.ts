/**
 * Profil minimal persisté après un chargement réussi (ex. Strava lié),
 * pour référence future ou synchro d’autres écrans hors ligne.
 */
const KEY = "neurorun_me_cache_v1";

export function saveMeCache(me: { strava_linked: boolean }): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ strava_linked: me.strava_linked, ts: Date.now() }),
    );
  } catch {
    /* quota / mode privé */
  }
}
