'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GoalCalendarItem } from '@/lib/api'
import { getGoalCalendar } from '@/lib/api'

function formatPaceSecPerKm(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

function statusSymbol(status: GoalCalendarItem['status']): { sym: string; label: string; className: string } {
  switch (status) {
    case 'done':
      return { sym: '✓', label: 'Validé (Strava)', className: 'text-emerald-300' }
    case 'partial':
      return { sym: '◐', label: 'Partiel — distance OK, allure hors cible (~5 s/km)', className: 'text-amber-200' }
    case 'missed':
      return { sym: '✗', label: 'Manqué ou distance trop courte', className: 'text-red-300/90' }
    default:
      return { sym: '○', label: 'Prévu', className: 'text-white/35' }
  }
}

type Props = {
  goalId: string
  token: string
}

export function GoalTrainingCalendar({ goalId, token }: Props) {
  const [items, setItems] = useState<GoalCalendarItem[]>([])
  const [tz, setTz] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let off = false
    setLoading(true)
    setErr('')
    ;(async () => {
      try {
        const d = await getGoalCalendar(token, goalId)
        if (!off) {
          setItems(d.items)
          setTz(d.timezone)
        }
      } catch (e) {
        if (!off) setErr(e instanceof Error ? e.message : 'Calendrier indisponible')
      } finally {
        if (!off) setLoading(false)
      }
    })()
    return () => {
      off = true
    }
  }, [goalId, token])

  const byWeek = useMemo(() => {
    const m = new Map<number, GoalCalendarItem[]>()
    for (const it of items) {
      const w = it.week
      if (!m.has(w)) m.set(w, [])
      m.get(w)!.push(it)
    }
    return Array.from(m.entries()).sort((a, b) => a[0] - b[0])
  }, [items])

  if (loading) {
    return (
      <div className="mt-5 rounded-xl border border-white/[0.06] bg-surface-2/40 px-3 py-2 text-xs text-white/40">
        Chargement calendrier…
      </div>
    )
  }

  if (err) {
    return (
      <div className="mt-5 rounded-xl border border-white/[0.06] bg-surface-2/40 px-3 py-2 text-xs text-red-200/85">
        {err}
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="mt-5 border-t border-white/[0.06] pt-4">
      <h4 className="font-display text-sm font-semibold text-white">Calendrier des séances</h4>
      <p className="mt-1 text-[11px] leading-relaxed text-white/40">
        Comparaison avec tes sorties Strava : distance prévue <span className="text-white/55">minimum</span> (tu peux
        couvrir plus) ; si une allure cible est indiquée, ±5 s/km sur la moyenne → validé. Fuseau : {tz || '—'}.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/45">
        <span>
          <span className="text-emerald-300">✓</span> validé
        </span>
        <span>
          <span className="text-amber-200">◐</span> partiel
        </span>
        <span>
          <span className="text-white/35">○</span> à venir
        </span>
        <span>
          <span className="text-red-300/90">✗</span> manqué
        </span>
      </div>
      <ul className="mt-3 max-h-56 space-y-4 overflow-y-auto pr-1 text-xs">
        {byWeek.map(([week, rows]) => (
          <li key={week}>
            <p className="mb-1.5 font-medium text-white/55">Semaine {week}</p>
            <ul className="space-y-1.5">
              {rows.map((it) => {
                const st = statusSymbol(it.status)
                const d = it.date
                  ? new Date(it.date + 'T12:00:00').toLocaleDateString('fr-FR', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })
                  : ''
                return (
                  <li
                    key={`${it.week}-${it.session}-${it.date}`}
                    className="flex items-start gap-2 rounded-lg bg-white/[0.03] px-2 py-1.5"
                    title={st.label}
                  >
                    <span className={`shrink-0 font-mono text-sm leading-none ${st.className}`}>{st.sym}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="text-[10px] uppercase tracking-wide text-white/35">{d}</span>
                        <span className="text-white/75">
                          S{it.session} · ~{it.planned_km} km
                          {it.target_pace_sec_per_km != null && it.target_pace_sec_per_km > 0 ? (
                            <span className="text-white/40">
                              {' '}
                              · cible {formatPaceSecPerKm(it.target_pace_sec_per_km)}
                            </span>
                          ) : null}
                        </span>
                      </div>
                      {it.summary ? <p className="mt-0.5 text-[11px] leading-snug text-white/45">{it.summary}</p> : null}
                      {it.strava_activity_id != null && it.status !== 'upcoming' ? (
                        <p className="mt-0.5 text-[10px] text-white/35">
                          Strava
                          {it.actual_km != null ? ` · ${it.actual_km.toFixed(1)} km` : ''}
                          {it.actual_pace_sec_per_km != null
                            ? ` · ${formatPaceSecPerKm(it.actual_pace_sec_per_km)}`
                            : ''}
                        </p>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}
