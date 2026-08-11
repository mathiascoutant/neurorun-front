'use client'

import { useId, useState, type ReactNode } from 'react'

export type ChartTable = {
  columns: string[]
  rows: (string | number)[][]
  caption: string
}

/**
 * Conteneur commun des graphiques : en-tête (titre, aide, actions) puis tracé.
 *
 * Chaque carte peut basculer en tableau. Ce n’est pas un gadget : un graphique
 * seul n’est pas lisible au lecteur d’écran, et c’est aussi le moyen le plus
 * simple de relever une valeur exacte sans survoler point par point.
 */
export function ChartCard({
  title,
  subtitle,
  actions,
  table,
  empty,
  children,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  table?: ChartTable
  /** Rendu à la place du graphique quand il n’y a rien à tracer */
  empty?: ReactNode
  children: ReactNode
}) {
  const [showTable, setShowTable] = useState(false)
  const panelId = useId()
  const isEmpty = empty != null

  return (
    <section className="chart-card">
      <div className="chart-card-head">
        <div className="min-w-0 flex-1">
          <h3 className="chart-card-title">{title}</h3>
          {subtitle ? <p className="chart-card-sub">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {table && !isEmpty ? (
            <button
              type="button"
              onClick={() => setShowTable((v) => !v)}
              aria-expanded={showTable}
              aria-controls={panelId}
              className="chart-chip cursor-pointer"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                aria-hidden
              >
                {showTable ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v16.5A1.5 1.5 0 004.5 21H21M7.5 15.75l3.75-4.5 3 3 4.5-6" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5M3.75 18h16.5M9 3.75v16.5" />
                )}
              </svg>
              {showTable ? 'Graphique' : 'Données'}
            </button>
          ) : null}
        </div>
      </div>

      <div id={panelId} className={isEmpty ? 'px-4 pb-4 pt-4 sm:px-5 sm:pb-5' : 'chart-card-body'}>
        {isEmpty ? (
          empty
        ) : showTable && table ? (
          <div className="max-h-[320px] overflow-auto px-1 member-scroll-x">
            <table className="chart-table">
              <caption className="sr-only">{table.caption}</caption>
              <thead>
                <tr>
                  {table.columns.map((c) => (
                    <th key={c} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </div>
    </section>
  )
}
