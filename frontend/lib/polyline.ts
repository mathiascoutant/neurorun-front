export type LatLng = { lat: number; lng: number };

/**
 * Décode le format « polyline » de Google (précision 1e-5) : c’est celui du
 * summary_polyline de Strava, et l’API l’emploie aussi pour les courses
 * NeuroRun. Une chaîne tronquée s’arrête au dernier point complet.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const out: LatLng[] = [];
  let i = 0;
  let lat = 0;
  let lng = 0;
  const next = (): number | null => {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      if (i >= encoded.length) return null;
      b = encoded.charCodeAt(i++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (i < encoded.length) {
    const dLat = next();
    const dLng = next();
    if (dLat == null || dLng == null) break;
    lat += dLat;
    lng += dLng;
    out.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return out;
}
