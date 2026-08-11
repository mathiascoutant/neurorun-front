/**
 * Micro-tracé sans axes, pour donner la forme d’une série à côté de son total.
 *
 * SVG écrit à la main plutôt que Recharts : un conteneur réactif par tuile
 * coûterait cher pour trois pixels de hauteur. `vector-effect` garde le trait à
 * 1,5 px malgré l’étirement horizontal du viewBox.
 */
export function Sparkline({
  values,
  color,
  className = '',
  ariaLabel,
}: {
  values: number[]
  color: string
  className?: string
  ariaLabel: string
}) {
  const pts = values.filter((v) => Number.isFinite(v))
  if (pts.length < 2) return null

  const w = 100
  const h = 28
  const max = Math.max(...pts)
  const min = Math.min(...pts)
  const span = max - min || 1
  const stepX = w / (pts.length - 1)

  const coords = pts.map((v, i) => {
    const x = i * stepX
    // 2 px de marge haut/bas pour que le trait ne soit pas rogné par le viewBox.
    const y = h - 2 - ((v - min) / span) * (h - 4)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })

  const gradientId = `spark-${color.replace('#', '')}`

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className={`h-7 w-full ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.28} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={`0,${h} ${coords.join(' ')} ${w},${h}`} fill={`url(#${gradientId})`} />
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
