'use client'

/**
 * Anneau d'avancement. Il ne s'anime pas tout seul : il affiche exactement la
 * fraction qu'on lui donne, et celle-ci vient de faits mesurés côté API (sections
 * du plan réellement rédigées, semaines écrites, séances extraites, enregistrement).
 * Rien n'est déduit du temps qui passe.
 */
export function ProgressRing({
  done,
  total,
  size = 46,
  stroke = 4,
  color = '#34d399',
  trackColor = 'rgba(255,255,255,0.14)',
  label,
}: {
  /** Unités franchies. */
  done: number
  /** Unités attendues au total. */
  total: number
  size?: number
  stroke?: number
  color?: string
  trackColor?: string
  /** Texte lu par les lecteurs d’écran à la place du pourcentage. */
  label?: string
}) {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 1
  const safeDone = Number.isFinite(done) ? Math.min(safeTotal, Math.max(0, done)) : 0
  const ratio = safeDone / safeTotal
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const shown = Math.round(ratio * 100)

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={safeTotal}
      aria-valuenow={safeDone}
      aria-label={label ?? 'Avancement'}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={trackColor} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          // Départ en haut : c'est là qu'on lit un cadran.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 260ms ease-out' }}
        />
      </svg>
      <span
        className="absolute font-display font-semibold tabular-nums text-white"
        style={{ fontSize: Math.max(9, Math.round(size * 0.26)) }}
        aria-hidden
      >
        {shown}%
      </span>
    </span>
  )
}
