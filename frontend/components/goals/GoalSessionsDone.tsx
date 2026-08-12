'use client'

import { useMemo, useState } from 'react'
import { ProgressRing } from '@/components/ProgressRing'
import type { GoalCalendarItem } from '@/lib/api'
import {
  completedSessions,
  formatLongDate,
  formatPaceSecPerKm,
  sessionCounts,
  sessionKey,
  sessionStatusMeta,
} from '@/lib/goalSessions'

/*
 * Ce qui est déjà fait dans l'objectif.
 *
 * L'état de chaque séance était lisible seulement en survolant une case du mois :
 * impossible de répondre d'un coup d'œil à « où j'en suis ». Ici, l'avancement
 * chiffré, puis la liste des séances courues, la plus récente en tête.
 */

const VISIBLE_BY_DEFAULT = 5

function CountChip({ value, label, className }: { readonly value: number; readonly label: string; readonly className: string }) {
  if (value <= 0) return null
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${className}`}>
      {value} {label}
    </span>
  )
}

type Props = {
  readonly items: GoalCalendarItem[]
  readonly selectedKey: string | null
  readonly onSelect: (key: string) => void
}

export function GoalSessionsDone({ items, selectedKey, onSelect }: Props) {
  const [showAll, setShowAll] = useState(false)
  const counts = useMemo(() => sessionCounts(items), [items])
  const done = useMemo(() => completedSessions(items), [items])

  const shown = showAll ? done : done.slice(0, VISIBLE_BY_DEFAULT)
  const ran = counts.done + counts.partial

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5">
      <div className="flex items-center gap-3">
        <ProgressRing done={ran} total={counts.planned} label="Séances courues" size={44} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-medium text-white/92">
            {ran} séance{ran > 1 ? 's' : ''} courue{ran > 1 ? 's' : ''} sur {counts.planned}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <CountChip
              value={counts.done}
              label="validées"
              className="border-emerald-400/30 bg-emerald-400/[0.1] text-emerald-200"
            />
            <CountChip
              value={counts.partial}
              label="partielles"
              className="border-amber-400/30 bg-amber-400/[0.1] text-amber-100"
            />
            <CountChip
              value={counts.missed}
              label="manquées"
              className="border-red-400/25 bg-red-400/[0.08] text-red-200"
            />
            <CountChip
              value={counts.upcoming}
              label="à venir"
              className="border-white/[0.12] bg-white/[0.04] text-white/55"
            />
            <CountChip
              value={counts.skipped}
              label="annulées"
              className="border-white/[0.1] bg-white/[0.03] text-white/40"
            />
          </div>
        </div>
      </div>

      {done.length === 0 ? (
        <p className="mt-3 border-t border-white/[0.06] pt-3 text-[12px] leading-relaxed text-white/40">
          Aucune séance validée pour l’instant. Une sortie Strava du bon jour, à la distance prévue,
          valide la séance automatiquement.
        </p>
      ) : (
        <ul className="mt-3 space-y-1 border-t border-white/[0.06] pt-3">
          {shown.map((it) => {
            const k = sessionKey(it)
            const st = sessionStatusMeta(it.status)
            const pace = it.is_interval ? it.effort_pace_sec_per_km : it.actual_pace_sec_per_km
            return (
              <li key={k}>
                <button
                  type="button"
                  aria-pressed={selectedKey === k}
                  onClick={() => onSelect(k)}
                  className={`flex w-full min-h-[40px] items-center gap-2.5 rounded-xl border px-2.5 py-1.5 text-left transition ${
                    selectedKey === k
                      ? 'border-brand-ice/40 bg-brand-ice/[0.08]'
                      : 'border-transparent hover:border-white/[0.1] hover:bg-white/[0.04]'
                  }`}
                >
                  <span className={`shrink-0 text-[15px] leading-none ${st.className}`} aria-hidden>
                    {st.sym}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] capitalize text-white/85">
                      {formatLongDate(it.date)}
                    </span>
                    <span className="block truncate text-[11px] text-white/40">
                      Sem. {it.week} · séance {it.session}
                      {it.rescheduled ? ' · reportée' : ''}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-[13px] font-medium tabular-nums text-white/85">
                      {it.actual_km != null ? `${it.actual_km.toFixed(1)} km` : '—'}
                    </span>
                    <span className="block text-[11px] tabular-nums text-white/40">
                      {formatPaceSecPerKm(pace)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {done.length > VISIBLE_BY_DEFAULT ? (
        <button
          type="button"
          className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-ice/90 transition hover:text-white"
          onClick={() => setShowAll((v) => !v)}
        >
          {showAll ? 'Réduire la liste' : `Tout afficher (${done.length})`}
        </button>
      ) : null}
    </div>
  )
}
