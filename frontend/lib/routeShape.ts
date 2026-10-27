import type { LatLng } from "@/lib/polyline";

export type RouteShape = {
  /** Chemin SVG du tracé. */
  d: string;
  /** Longueur du chemin dans le cadre (px) : de quoi le dessiner progressivement. */
  length: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  /** L’arrivée se confond avec le départ (boucle) : un seul repère suffit. */
  loop: boolean;
};

/** Au-delà, des points de plus n’ajoutent rien à l’œil et alourdissent le dessin. */
const MAX_POINTS = 400;
/** En deçà (en part du plus petit côté), départ et arrivée se confondent. */
const SAME_SPOT = 0.08;

/**
 * Projette un tracé GPS dans un cadre `width × height` en gardant ses
 * proportions (nord en haut, une seule échelle) et en le centrant, à `pad`
 * des bords. Null quand il n’y a pas de forme à dessiner.
 */
export function routeShape(
  points: readonly LatLng[],
  width: number,
  height: number,
  pad: number,
): RouteShape | null {
  if (points.length < 2 || width <= pad * 2 || height <= pad * 2) return null;
  const step = Math.ceil(points.length / MAX_POINTS);
  const pts =
    step > 1 ? points.filter((_, i) => i % step === 0 || i === points.length - 1) : points;

  const midLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
  const k = Math.cos((midLat * Math.PI) / 180);
  const xs = pts.map((p) => p.lng * k);
  const ys = pts.map((p) => -p.lat);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  if (spanX <= 0 && spanY <= 0) return null;
  const scale = Math.min(
    spanX > 0 ? (width - pad * 2) / spanX : Infinity,
    spanY > 0 ? (height - pad * 2) / spanY : Infinity,
  );
  const offX = (width - spanX * scale) / 2;
  const offY = (height - spanY * scale) / 2;
  const at = (i: number) => ({
    x: offX + (xs[i] - minX) * scale,
    y: offY + (ys[i] - minY) * scale,
  });

  let d = "";
  let length = 0;
  let prev = at(0);
  for (let i = 0; i < pts.length; i++) {
    const p = at(i);
    d += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  const start = at(0);
  const end = at(pts.length - 1);
  const loop = Math.hypot(end.x - start.x, end.y - start.y) < Math.min(width, height) * SAME_SPOT;
  return { d, length, start, end, loop };
}
