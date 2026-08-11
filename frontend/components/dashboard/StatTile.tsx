import type { ReactNode } from 'react'

export type StatDelta = {
  /** Écart en pourcentage, signe compris */
  percent: number
  /** Ce à quoi on compare, écrit en toutes lettres */
  comparedTo: string
}

/**
 * Tuile de chiffre-clé : libellé, valeur, unité, puis un indice de contexte.
 *
 * L’écart éventuel se lit sur deux canaux — une flèche et le signe — pour rester
 * compréhensible sans distinguer les couleurs. Il est volontairement neutre :
 * courir plus n’est pas « bien » dans l’absolu, la tuile constate, elle ne juge pas.
 */
export function StatTile({
  label,
  value,
  unit,
  hint,
  delta,
  accent = false,
  footer,
}: {
  label: string
  value: string
  unit?: string
  hint?: string
  delta?: StatDelta | null
  accent?: boolean
  footer?: ReactNode
}) {
  const up = delta != null && delta.percent > 0
  const flat = delta != null && delta.percent === 0

  return (
    <div className={`stat-tile ${accent ? 'stat-tile--accent' : ''}`}>
      <p className="stat-label">{label}</p>

      <p className="flex items-baseline gap-1.5">
        <span className="stat-value">{value}</span>
        {unit ? <span className="stat-unit">{unit}</span> : null}
      </p>

      {delta ? (
        <span
          className="stat-delta"
          title={`${up ? 'En hausse' : flat ? 'Stable' : 'En baisse'} par rapport ${delta.comparedTo}`}
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.2}
            aria-hidden
          >
            {flat ? (
              <path strokeLinecap="round" d="M5 12h14" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d={up ? 'M12 19V5m0 0l-6 6m6-6l6 6' : 'M12 5v14m0 0l6-6m-6 6l-6-6'} />
            )}
          </svg>
          {flat ? 'Stable' : `${up ? '+' : ''}${delta.percent} %`}
          <span className="font-normal text-white/40">{delta.comparedTo}</span>
        </span>
      ) : null}

      {hint ? <p className="stat-hint">{hint}</p> : null}

      {footer ? <div className="mt-auto pt-1">{footer}</div> : null}
    </div>
  )
}
