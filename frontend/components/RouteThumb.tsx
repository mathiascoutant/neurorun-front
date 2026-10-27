"use client";

import { useMemo } from "react";
import { withAlpha } from "@/lib/color";
import { decodePolyline } from "@/lib/polyline";
import { routeShape } from "@/lib/routeShape";

/** Marge intérieure : le trait et ses repères ne touchent jamais le bord de la vignette. */
const PAD = 14;

/** Fond de la page : le point d’arrivée s’y découpe comme dans l’app. */
const BG = "#05060a";

type Props = {
  /** Tracé au format polyline de Google ; absent pour une sortie sans GPS. */
  polyline?: string;
  color?: string;
  size?: number;
  className?: string;
};

/**
 * Vignette carrée d’un tracé, sans fond de carte : la forme seule, mise à
 * l’échelle (nord en haut), un point de départ plein et un anneau à
 * l’arrivée. Le carré accueille aussi bien une boucle qu’un aller-retour,
 * qui se perdait dans un bandeau pleine largeur. La vignette prend la teinte
 * du tracé, en transparence, pour que la liste ne reste pas grise.
 *
 * Portage à l’identique de `RouteThumb` de l’app mobile.
 */
export function RouteThumb({
  polyline,
  color = "#fc4c02",
  size = 112,
  className = "",
}: Readonly<Props>) {
  const shape = useMemo(
    () => routeShape(polyline ? decodePolyline(polyline) : [], size, size, PAD),
    [polyline, size],
  );

  return (
    <span
      role="img"
      aria-label={shape ? "Tracé de la course" : "Sortie sans tracé GPS"}
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl border ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: withAlpha(color, 0.08),
        borderColor: withAlpha(color, 0.22),
      }}
    >
      {shape ? (
        <svg width={size} height={size} aria-hidden>
          {/* Halo sous le trait : il prend la lumière sans épaissir la forme. */}
          <path
            d={shape.d}
            stroke={color}
            strokeOpacity={0.28}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <path
            d={shape.d}
            stroke={color}
            strokeWidth={2.8}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          {shape.loop ? null : (
            <circle
              cx={shape.end.x}
              cy={shape.end.y}
              r={3.2}
              fill={BG}
              stroke={color}
              strokeWidth={1.8}
            />
          )}
          <circle
            cx={shape.start.x}
            cy={shape.start.y}
            r={3.8}
            fill="#ffffff"
            stroke={BG}
            strokeWidth={1.5}
          />
        </svg>
      ) : (
        <svg
          width={22}
          height={22}
          viewBox="0 0 24 24"
          fill="none"
          stroke={withAlpha(color, 0.45)}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx={6} cy={19} r={2.5} />
          <circle cx={18} cy={5} r={2.5} />
          <path d="M8.5 19h8a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7h8" />
        </svg>
      )}
    </span>
  );
}
