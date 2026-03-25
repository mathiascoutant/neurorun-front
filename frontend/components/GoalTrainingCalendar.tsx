'use client'

import { useEffect, useMemo, useState } from 'react'
import type { GoalCalendarItem } from '@/lib/api'
import { getGoalCalendar } from '@/lib/api'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

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
      return { sym: '○', label: 'Prévu', className: 'text-white/40' }
  }
}

/** Interprète YYYY-MM-DD comme jour civil local (aligné sur le fuseau du plan). */
function dateKeyFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function parseDateKey(key: string): { y: number; m: number; d: number } | null {
  const p = key.split('-').map(Number)
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null
  return { y: p[0], m: p[1], d: p[2] }
}

function todayKeyLocal(): string {
  const n = new Date()
  return dateKeyFromParts(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

type MonthGrid = {
  year: number
  month: number /** 1–12 */
  label: string
  weeks: ({ day: number; dateKey: string } | null)[][]
}

function buildMonthGrid(year: number, month: number): MonthGrid {
  const first = new Date(year, month - 1, 1)
  const last = new Date(year, month, 0)
  const daysInMonth = last.getDate()
  const startPad = (first.getDay() + 6) % 7

  const flat: ({ day: number; dateKey: string } | null)[] = []
  for (let i = 0; i < startPad; i++) flat.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    flat.push({ day: d, dateKey: dateKeyFromParts(year, month, d) })
  }
  while (flat.length % 7 !== 0) flat.push(null)

  const weeks: MonthGrid['weeks'] = []
  for (let i = 0; i < flat.length; i += 7) {
    weeks.push(flat.slice(i, i + 7))
  }

  const label = new Date(year, month - 1, 15).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })

  return { year, month, label, weeks }
}

function monthRangeFromItems(items: GoalCalendarItem[]): { start: { y: number; m: number }; end: { y: number; m: number } } | null {
  let min: string | null = null
  let max: string | null = null
  for (const it of items) {
    if (!it.date) continue
    if (min == null || it.date < min) min = it.date
    if (max == null || it.date > max) max = it.date
  }
  if (min == null || max == null) return null
  const a = parseDateKey(min)
  const b = parseDateKey(max)
  if (!a || !b) return null
  return { start: { y: a.y, m: a.m }, end: { y: b.y, m: b.m } }
}

function eachMonthInRange(
  start: { y: number; m: number },
  end: { y: number; m: number },
): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = []
  let y = start.y
  let m = start.m
  for (;;) {
    out.push({ y, m })
    if (y === end.y && m === end.m) break
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

function sessionTooltip(it: GoalCalendarItem): string {
  const st = statusSymbol(it.status)
  const parts = [
    `S${it.session} · ~${it.planned_km} km`,
    st.label,
    it.summary || '',
  ]
  if (it.target_pace_sec_per_km != null && it.target_pace_sec_per_km > 0) {
    parts.push(`Cible ${formatPaceSecPerKm(it.target_pace_sec_per_km)}`)
  }
  if (it.actual_km != null) {
    parts.push(`Strava · ${it.actual_km.toFixed(1)} km`)
  }
  if (it.actual_pace_sec_per_km != null) {
    parts.push(formatPaceSecPerKm(it.actual_pace_sec_per_km))
  }
  return parts.filter(Boolean).join('\n')
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

  const itemsByDate = useMemo(() => {
    const m = new Map<string, GoalCalendarItem[]>()
    for (const it of items) {
      if (!it.date) continue
      if (!m.has(it.date)) m.set(it.date, [])
      m.get(it.date)!.push(it)
    }
    m.forEach((list) => {
      list.sort((a: GoalCalendarItem, b: GoalCalendarItem) => a.session - b.session)
    })
    return m
  }, [items])

  const months = useMemo(() => {
    const range = monthRangeFromItems(items)
    if (!range) return []
    return eachMonthInRange(range.start, range.end).map(({ y, m }) => buildMonthGrid(y, m))
  }, [items])

  const todayK = todayKeyLocal()

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
        couvrir plus) ; si une allure cible est indiquée, ±5 s/km sur la moyenne → validé. Fuseau affiché côté serveur :{' '}
        {tz || '—'} (les dates du plan sont des jours civils).
      </p>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/45">
        <span>
          <span className="text-emerald-300">✓</span> validé
        </span>
        <span>
          <span className="text-amber-200">◐</span> partiel
        </span>
        <span>
          <span className="text-white/40">○</span> à venir
        </span>
        <span>
          <span className="text-red-300/90">✗</span> manqué
        </span>
      </div>

      <div className="mt-4 max-h-[min(70vh,36rem)] space-y-6 overflow-y-auto pr-1">
        {months.map((mo) => (
          <div key={`${mo.year}-${mo.month}`}>
            <h5 className="mb-2 capitalize font-medium text-white/70">{mo.label}</h5>
            <div className="grid grid-cols-7 gap-px rounded-lg border border-white/[0.08] bg-white/[0.08] text-center text-[10px] text-white/50 sm:text-xs">
              {WEEKDAYS.map((wd) => (
                <div key={wd} className="bg-surface-2/90 py-1.5 font-medium text-white/45">
                  {wd}
                </div>
              ))}
              {mo.weeks.flatMap((week, wi) =>
                week.map((cell, ci) => {
                  const k = `${mo.year}-${mo.month}-${wi}-${ci}`
                  if (cell == null) {
                    return <div key={k} className="min-h-[4.25rem] bg-surface-2/50 sm:min-h-[5rem]" />
                  }
                  const dayItems = itemsByDate.get(cell.dateKey) ?? []
                  const isToday = cell.dateKey === todayK
                  const hasSession = dayItems.length > 0
                  return (
                    <div
                      key={k}
                      className={`flex min-h-[4.25rem] flex-col items-stretch bg-surface-2/90 p-1 sm:min-h-[5rem] sm:p-1.5 ${
                        isToday ? 'ring-1 ring-inset ring-brand-orange/35' : ''
                      } ${hasSession ? 'bg-white/[0.07]' : ''}`}
                    >
                      <span
                        className={`text-left font-mono text-[11px] font-semibold sm:text-xs ${
                          isToday ? 'text-brand-orange/95' : 'text-white/65'
                        }`}
                      >
                        {cell.day}
                      </span>
                      {dayItems.length > 0 ? (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {dayItems.map((it) => (
                            <div
                              key={`${it.week}-${it.session}-${it.date}`}
                              className="flex items-center gap-1 rounded-md bg-black/25 px-1 py-0.5 text-left"
                              title={sessionTooltip(it)}
                            >
                              <span className={`shrink-0 text-sm leading-none ${statusSymbol(it.status).className}`}>
                                {statusSymbol(it.status).sym}
                              </span>
                              <span className="min-w-0 truncate text-[10px] leading-tight text-white/70 sm:text-[11px]">
                                S{it.session} · {it.planned_km} km
                              </span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  )
                }),
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
