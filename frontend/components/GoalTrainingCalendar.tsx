'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { GoalSessionDetail } from '@/components/goals/GoalSessionDetail'
import { GoalSessionsDone } from '@/components/goals/GoalSessionsDone'
import type { GoalCalendarItem, GoalUnavailability } from '@/lib/api'
import { getGoalCalendar } from '@/lib/api'
import {
  SESSION_TYPES,
  dateKeyFromParts,
  formatPaceSecPerKm,
  parseDateKey,
  planSessionBody,
  planSessionTypes,
  sessionKey,
  sessionStatusMeta as statusSymbol,
  sessionTypeMeta,
  todayKeyLocal,
  type SessionTypeMeta,
} from '@/lib/goalSessions'

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const

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

/** Jours couverts par une indisponibilité, motif associé pour l'infobulle. */
function blockedDayReasons(list: GoalUnavailability[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const u of list) {
    const from = parseDateKey(u.from)
    const to = parseDateKey(u.to) ?? from
    if (!from || !to) continue
    const cur = new Date(from.y, from.m - 1, from.d)
    const end = new Date(to.y, to.m - 1, to.d)
    // Garde-fou : une plage aberrante ne doit pas figer le rendu.
    for (let i = 0; cur <= end && i < 400; i++) {
      out.set(dateKeyFromParts(cur.getFullYear(), cur.getMonth() + 1, cur.getDate()), u.reason || '')
      cur.setDate(cur.getDate() + 1)
    }
  }
  return out
}

/** Ligne d'infobulle expliquant un report ou une annulation, vide sinon. */
function scheduleChangeNote(it: GoalCalendarItem): string {
  const reason = it.reason ? ` · ${it.reason}` : ''
  if (it.rescheduled && it.planned_date) {
    return `Reportée depuis le ${it.planned_date}${reason}`
  }
  if (it.status === 'skipped' && it.reason) {
    return `Motif : ${it.reason}`
  }
  return ''
}

function sessionTooltip(it: GoalCalendarItem, type: SessionTypeMeta | null): string {
  const st = statusSymbol(it.status)
  const parts = [
    `S${it.session} · ~${it.planned_km} km${type ? ` · ${type.label}` : ''}`,
    st.label,
    it.summary || '',
    scheduleChangeNote(it),
  ]
  if (it.target_pace_sec_per_km != null && it.target_pace_sec_per_km > 0) {
    parts.push(`Cible ${formatPaceSecPerKm(it.target_pace_sec_per_km)}`)
  }
  if (it.actual_km != null) {
    parts.push(`Strava · ${it.actual_km.toFixed(1)} km`)
  }
  if (it.actual_pace_sec_per_km != null) {
    // Sur un fractionné, la séance est jugée sur l'allure des efforts : afficher
    // la moyenne seule laisserait croire à une séance trop lente.
    parts.push(
      it.is_interval
        ? `${formatPaceSecPerKm(it.actual_pace_sec_per_km)} de moyenne (récup comprise)`
        : formatPaceSecPerKm(it.actual_pace_sec_per_km),
    )
  }
  if (it.is_interval) {
    parts.push(
      it.effort_pace_sec_per_km != null && it.effort_pace_sec_per_km > 0
        ? `Fractionné · efforts à ${formatPaceSecPerKm(it.effort_pace_sec_per_km)}`
        : 'Fractionné · jugé sur les efforts, pas sur la moyenne',
    )
  }
  return parts.filter(Boolean).join('\n')
}

function blockedDayTitle(reason: string): string {
  return reason ? `Indisponible — ${reason}` : 'Indisponible'
}

function dayNumberColor(isToday: boolean, isBlocked: boolean): string {
  if (isToday) return 'text-brand-orange/95'
  if (isBlocked) return 'text-amber-100/60'
  return 'text-white/65'
}

type Props = {
  readonly goalId: string
  readonly token: string
  /** Plan Markdown : sert à afficher le détail rédigé d'une séance ouverte. */
  readonly plan?: string
  /** Change après modification du plan ou du calendrier côté API pour recharger. */
  readonly planStamp?: string
}

export function GoalTrainingCalendar({ goalId, token, plan = '', planStamp = '' }: Props) {
  const [items, setItems] = useState<GoalCalendarItem[]>([])
  const [unavailabilities, setUnavailabilities] = useState<GoalUnavailability[]>([])
  const [tz, setTz] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const detailRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let off = false
    setLoading(true)
    setErr('')
    ;(async () => {
      try {
        const d = await getGoalCalendar(token, goalId)
        if (!off) {
          setItems(d.items)
          setUnavailabilities(d.unavailabilities ?? [])
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
  }, [goalId, token, planStamp])

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

  const blockedDays = useMemo(() => blockedDayReasons(unavailabilities), [unavailabilities])

  /*
   * Nature des séances : lue dans le plan, avec repli sur le résumé de la séance
   * quand le plan ne détaille pas cette semaine-là.
   */
  const planTypes = useMemo(() => planSessionTypes(plan), [plan])
  const typeOf = useMemo(() => {
    const cache = new Map<string, SessionTypeMeta | null>()
    return (it: GoalCalendarItem): SessionTypeMeta | null => {
      const key = sessionKey(it)
      if (!cache.has(key)) {
        cache.set(key, planTypes.get(key) ?? sessionTypeMeta(it.summary))
      }
      return cache.get(key) ?? null
    }
  }, [planTypes])

  /** Natures effectivement présentes, pour n'afficher qu'une légende utile. */
  const legendTypes = useMemo(() => {
    const seen: SessionTypeMeta[] = []
    for (const it of items) {
      const t = typeOf(it)
      if (t && !seen.some((s) => s.type === t.type)) seen.push(t)
    }
    return seen.sort((a, b) => SESSION_TYPES.indexOf(a.type) - SESSION_TYPES.indexOf(b.type))
  }, [items, typeOf])

  const selected = useMemo(
    () => items.find((it) => sessionKey(it) === selectedKey) ?? null,
    [items, selectedKey],
  )

  // La fiche s'ouvre au-dessus de la grille : sans ça, un clic sur un jour de fin
  // de préparation ouvrirait un détail hors de l'écran.
  useEffect(() => {
    if (selected) detailRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selected])

  const todayK = todayKeyLocal()

  if (loading) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-surface-2/40 px-3 py-2 text-xs text-white/40">
        Chargement calendrier…
      </div>
    )
  }

  if (err) {
    return (
      <div className="rounded-xl border border-white/[0.06] bg-surface-2/40 px-3 py-2 text-xs text-red-200/85">
        {err}
      </div>
    )
  }

  if (items.length === 0) {
    return null
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h4 className="font-display text-sm font-semibold text-white">Calendrier des séances</h4>
      <p className="mt-1 text-[11px] leading-relaxed text-white/40">
        Comparaison avec tes sorties Strava : distance prévue <span className="text-white/55">minimum</span> (tu peux
        couvrir plus) ; si une allure cible est indiquée, ±5 s/km sur la moyenne → validé.{' '}
        <span className="text-white/55">Clique une séance</span> pour voir le prévu, le réalisé et l’analyse de la
        sortie. Fuseau côté serveur : {tz || '—'} (les dates du plan sont des jours civils).
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
        <span>
          <span className="text-white/25">–</span> annulée
        </span>
        <span>
          <span className="text-brand-ice/80">↷</span> reportée
        </span>
      </div>

      {legendTypes.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-white/45">
          {legendTypes.map((t) => (
            <span key={t.type} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-[3px] rounded-full"
                style={{ backgroundColor: t.color }}
                aria-hidden
              />
              {t.label}
            </span>
          ))}
        </div>
      ) : null}

      {unavailabilities.length > 0 ? (
        <div className="mt-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[11px] leading-relaxed text-amber-100/85">
          <p className="font-medium text-amber-100">Périodes sans course</p>
          <ul className="mt-1 space-y-0.5">
            {unavailabilities.map((u) => (
              <li key={`${u.from}-${u.to}`}>
                du {u.from} au {u.to}
                {u.reason ? ` — ${u.reason}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-amber-100/60">
            Les séances concernées ont été reportées au premier jour disponible suivant.
          </p>
        </div>
      ) : null}

      <div className="mt-4">
        <GoalSessionsDone items={items} selectedKey={selectedKey} onSelect={setSelectedKey} />
      </div>

      <div ref={detailRef} className={selected ? 'mt-3' : ''}>
        {selected ? (
          <GoalSessionDetail
            item={selected}
            planBody={planSessionBody(plan, selected.week, selected.session)}
            token={token}
            onClose={() => setSelectedKey(null)}
          />
        ) : null}
      </div>

      <div className="mt-4 min-h-0 max-h-[min(62vh,30rem)] flex-1 space-y-6 overflow-y-auto pr-1 lg:max-h-none">
        {months.map((mo) => (
          <MonthCard
            key={`${mo.year}-${mo.month}`}
            month={mo}
            itemsByDate={itemsByDate}
            typeOf={typeOf}
            blockedDays={blockedDays}
            todayKey={todayK}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
          />
        ))}
      </div>
    </div>
  )
}

function MonthCard({
  month,
  itemsByDate,
  typeOf,
  blockedDays,
  todayKey,
  selectedKey,
  onSelect,
}: {
  readonly month: MonthGrid
  readonly itemsByDate: Map<string, GoalCalendarItem[]>
  readonly typeOf: (it: GoalCalendarItem) => SessionTypeMeta | null
  readonly blockedDays: Map<string, string>
  readonly todayKey: string
  readonly selectedKey: string | null
  readonly onSelect: (key: string) => void
}) {
  return (
    <div>
      <h5 className="mb-2 capitalize font-medium text-white/70">{month.label}</h5>
      <div className="grid grid-cols-7 gap-px rounded-lg border border-white/[0.08] bg-white/[0.08] text-center text-[10px] text-white/50 sm:text-xs">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="bg-surface-2/90 py-1.5 font-medium text-white/45">
            {wd}
          </div>
        ))}
        {month.weeks.flatMap((week, wi) =>
          week.map((cell, ci) => (
            <DayCell
              key={`${month.year}-${month.month}-${wi}-${ci}`}
              cell={cell}
              items={cell ? (itemsByDate.get(cell.dateKey) ?? []) : []}
              typeOf={typeOf}
              blockedReason={cell ? blockedDays.get(cell.dateKey) : undefined}
              isToday={cell?.dateKey === todayKey}
              selectedKey={selectedKey}
              onSelect={onSelect}
            />
          )),
        )}
      </div>
    </div>
  )
}

function DayCell({
  cell,
  items,
  typeOf,
  blockedReason,
  isToday,
  selectedKey,
  onSelect,
}: {
  readonly cell: { day: number; dateKey: string } | null
  readonly items: GoalCalendarItem[]
  readonly typeOf: (it: GoalCalendarItem) => SessionTypeMeta | null
  readonly blockedReason: string | undefined
  readonly isToday: boolean
  readonly selectedKey: string | null
  readonly onSelect: (key: string) => void
}) {
  if (cell == null) {
    return <div className="min-h-[4.25rem] bg-surface-2/50 sm:min-h-[5rem]" />
  }
  const isBlocked = blockedReason !== undefined
  return (
    <div
      title={isBlocked ? blockedDayTitle(blockedReason) : undefined}
      className={`flex min-h-[4.25rem] flex-col items-stretch bg-surface-2/90 p-1 sm:min-h-[5rem] sm:p-1.5 ${
        isToday ? 'ring-1 ring-inset ring-brand-orange/35' : ''
      } ${items.length > 0 ? 'bg-white/[0.07]' : ''} ${isBlocked ? 'bg-amber-400/[0.09]' : ''}`}
    >
      <span
        className={`text-left font-mono text-[11px] font-semibold sm:text-xs ${dayNumberColor(isToday, isBlocked)}`}
      >
        {cell.day}
      </span>
      {items.length > 0 ? (
        <div className="mt-1 flex flex-col gap-0.5">
          {items.map((it) => (
            <SessionChip
              key={sessionKey(it)}
              item={it}
              type={typeOf(it)}
              selected={selectedKey === sessionKey(it)}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SessionChip({
  item,
  type,
  selected,
  onSelect,
}: {
  readonly item: GoalCalendarItem
  readonly type: SessionTypeMeta | null
  readonly selected: boolean
  readonly onSelect: (key: string) => void
}) {
  const st = statusSymbol(item.status)
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onSelect(sessionKey(item))}
      title={sessionTooltip(item, type)}
      /* Une case de calendrier ne tient pas une étiquette : la nature de la séance
         y passe par le liseré de gauche, expliqué par la légende. En bordure et
         non en pastille, il ne prend pas sur la largeur déjà juste du libellé. */
      style={type ? { borderLeftColor: type.color } : undefined}
      className={`flex items-center gap-1 rounded-md border-l-[3px] px-1 py-0.5 text-left transition hover:bg-black/45 focus:outline-none focus-visible:ring-1 focus-visible:ring-brand-orange/60 ${
        type ? '' : 'border-l-transparent'
      } ${selected ? 'bg-brand-ice/20 ring-1 ring-brand-ice/40' : 'bg-black/25'} ${
        item.status === 'skipped' ? 'opacity-50 line-through decoration-white/30' : ''
      }`}
    >
      <span className={`shrink-0 text-sm leading-none ${st.className}`}>{st.sym}</span>
      <span className="min-w-0 truncate text-[10px] leading-tight text-white/70 sm:text-[11px]">
        S{item.session} · {item.planned_km} km
      </span>
      {item.rescheduled ? (
        <span className="shrink-0 text-[11px] leading-none text-brand-ice/80" aria-hidden>
          ↷
        </span>
      ) : null}
    </button>
  )
}
