'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, SERIES, formatNumber } from '@/components/dashboard/chartTheme'
import { SectionTitle } from '@/components/goals/GoalPieces'
import type { Goal } from '@/lib/api'
import { formatPaceSecPerKm, sessionTypeMeta } from '@/lib/goalSessions'
import { goalTimeline } from '@/lib/goalStats'
import { parsePlanOutline, splitWeekSessions } from '@/lib/planOutline'

/*
 * Programme d'entraînement, semaine par semaine.
 *
 * D'abord les séances de la semaine choisie — celle en cours à l'ouverture —
 * en cartes, comme on les prépare : nature, distance, allure, puis le détail.
 * Ensuite le volume prévu par semaine, dans le même graphique que le tableau de
 * bord : cliquer une barre ouvre cette semaine.
 */

const DAY_MS = 86_400_000

/**
 * Le texte d'une séance commence par sa propre étiquette (« **Séance 1 :** … »),
 * déjà affichée sur la carte : on la retire, en gardant ce qui la suit.
 */
function stripSessionLabel(body: string): string {
  const [first, ...rest] = body.split('\n')
  let head = first
    .replace(/^\s*(?:[-*]\s*|\d{1,2}[.)]\s*)?(?:\*\*)?\s*(?:séance|jour)\s*\d{1,2}\b/i, '')
    .replace(/^[\s:*–—-]+/, '')
    .trim()
  // Un gras ouvert avant l'étiquette se referme après : on ne garde pas la moitié.
  if ((head.match(/\*\*/g) ?? []).length % 2 === 1) head = head.replace(/\*\*/, '')
  return [head, ...rest].join('\n').trim()
}

/**
 * Titre d'une séance : sa première ligne quand c'est un intitulé court
 * (« Endurance facile »), sinon la nature déduite du texte. Le reste fait le détail.
 */
function sessionTitle(body: string, fallback: string): { title: string; detail: string } {
  const [first, ...rest] = body.split('\n')
  const head = first.replace(/\*\*/g, '').trim()
  if (head && head.length <= 48 && !/[:.;]/.test(head) && !/^\s*[-*]\s/.test(first)) {
    return { title: head, detail: rest.join('\n').trim() }
  }
  return { title: fallback, detail: body }
}

function weekRange(start: Date | null, week: number): string {
  if (!start) return ''
  const from = new Date(start.getTime() + (week - 1) * 7 * DAY_MS)
  const to = new Date(from.getTime() + 6 * DAY_MS)
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  return `${fmt(from)} – ${fmt(to)}`
}

function NavButton({ dir, disabled, onClick }: { dir: 'prev' | 'next'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'prev' ? 'Semaine précédente' : 'Semaine suivante'}
      className="chart-chip cursor-pointer !px-2.5 disabled:cursor-default disabled:opacity-30"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d={dir === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
      </svg>
    </button>
  )
}

type WeekRow = { index: number; label: string; km: number }

export function GoalProgram({ goal }: { goal: Goal }) {
  const outline = useMemo(() => parsePlanOutline(goal.plan), [goal.plan])
  const timeline = goalTimeline(goal)
  const sessionsRef = useRef<HTMLDivElement>(null)

  const weeks = useMemo(() => {
    const planned = goal.planned_sessions ?? []
    return outline.weeks.map((w) => {
      const own = planned.filter((p) => p.week === w.index).sort((a, b) => a.session - b.session)
      const km = own.reduce((sum, p) => sum + (Number.isFinite(p.distance_km) ? p.distance_km : 0), 0)
      return { ...w, sessions: splitWeekSessions(w.body), planned: own, km }
    })
  }, [outline, goal.planned_sessions])

  const currentWeek = Math.min(timeline.currentWeek, weeks.length || 1)
  const [selected, setSelected] = useState(currentWeek)

  // Changer d'objectif remet le curseur sur la semaine en cours.
  useEffect(() => {
    setSelected(currentWeek)
  }, [goal.id, currentWeek])

  if (outline.unstructured) {
    // Plan sans calendrier reconnaissable : mieux vaut le texte brut qu'un vide.
    return (
      <section className="chart-card p-4 sm:p-5">
        <SimplePlanBody text={goal.plan} className="max-w-[72ch]" />
      </section>
    )
  }

  const pos = Math.max(0, weeks.findIndex((w) => w.index === selected))
  const week = weeks[pos]
  const intro = week?.sessions.find((s) => !s.label)
  const sessions = week?.sessions.filter((s) => s.label) ?? []
  const state = !week
    ? 'future'
    : week.index < timeline.currentWeek
      ? 'past'
      : week.index === timeline.currentWeek
        ? 'current'
        : 'future'
  const rows: WeekRow[] = weeks.map((w) => ({ index: w.index, label: `S${w.index}`, km: Math.round(w.km * 10) / 10 }))
  const hasVolume = rows.some((r) => r.km > 0)

  function openWeek(index: number) {
    setSelected(index)
    sessionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-6">
      <div ref={sessionsRef} className="scroll-mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-white">
              {week?.title ?? `Semaine ${selected}`}
            </h2>
            {state === 'current' ? (
              <span className="stat-delta !border-brand-orange/35 !bg-brand-orange/[0.12] !text-[#ff8a4c]">En cours</span>
            ) : state === 'past' ? (
              <span className="stat-delta">Passée</span>
            ) : null}
            <span className="text-[12px] text-white/38">
              {weekRange(timeline.start, selected)}
              {week && week.km > 0 ? ` · ${formatNumber(week.km)} km` : ''}
            </span>
          </div>
          <div className="flex gap-2">
            <NavButton dir="prev" disabled={pos <= 0} onClick={() => setSelected(weeks[pos - 1].index)} />
            <NavButton dir="next" disabled={pos >= weeks.length - 1} onClick={() => setSelected(weeks[pos + 1].index)} />
          </div>
        </div>

        {intro ? (
          <div className="chart-card px-4 py-3.5 sm:px-5">
            <SimplePlanBody text={intro.body} className="max-w-[72ch]" />
          </div>
        ) : null}

        {sessions.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {sessions.map((s, i) => {
              const type = sessionTypeMeta(s.body)
              const n = Number(s.label.replace(/[^\d]/g, '')) || i + 1
              const plan = week?.planned.find((p) => p.session === n)
              const { title, detail } = sessionTitle(stripSessionLabel(s.body), type?.label ?? s.label)
              return (
                <article key={`${week?.index}-${i}`} className="chart-card p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="stat-label">Séance {n}</p>
                    {type ? (
                      <span className="chart-chip">
                        <span className="chart-chip-dot" style={{ backgroundColor: type.color }} aria-hidden />
                        {type.label}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="mt-2.5 font-display text-[16px] font-semibold leading-snug tracking-[-0.01em] text-white">
                    {title}
                  </h3>
                  {plan && (plan.distance_km > 0 || plan.pace_sec_per_km) ? (
                    <p className="mt-3 flex items-baseline gap-4">
                      {plan.distance_km > 0 ? (
                        <span className="flex items-baseline gap-1">
                          <span className="font-display text-[24px] font-bold tabular-nums tracking-[-0.02em] text-white">
                            {formatNumber(plan.distance_km, plan.distance_km % 1 ? 1 : 0)}
                          </span>
                          <span className="stat-unit">km</span>
                        </span>
                      ) : null}
                      {plan.pace_sec_per_km ? (
                        <span className="text-[13px] tabular-nums text-white/50">
                          {formatPaceSecPerKm(plan.pace_sec_per_km)}
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {detail ? (
                    <div className="mt-3 border-t border-white/[0.06] pt-3">
                      <SimplePlanBody text={detail} className="[&_p]:!text-[13px] [&_p]:!text-white/70" />
                    </div>
                  ) : null}
                </article>
              )
            })}
          </div>
        ) : (
          <div className="app-empty">
            <p className="text-[15px] font-semibold text-white/90">Pas de séance détaillée</p>
            <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-[19px] text-white/40">
              Le plan ne détaille pas cette semaine. Demande au coach de la compléter.
            </p>
          </div>
        )}
      </div>

      {weeks.length > 1 ? (
        <>
          <SectionTitle hint="Clique une semaine pour voir ses séances">Ta préparation</SectionTitle>
          <ChartCard
            title="Volume prévu par semaine"
            subtitle={`${weeks.length} semaines · la semaine en cours est en orange.`}
            table={{
              caption: 'Volume prévu par semaine',
              columns: ['Semaine', 'Volume prévu'],
              rows: rows.map((r) => [`Semaine ${r.index}`, `${formatNumber(r.km, 1)} km`]),
            }}
            empty={hasVolume ? undefined : <p className="text-[13px] text-white/40">Le plan ne précise pas les distances.</p>}
          >
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                  <XAxis
                    dataKey="label"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={{ stroke: AXIS_LINE }}
                    interval="preserveStartEnd"
                    minTickGap={8}
                    height={28}
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    width={34}
                    tickFormatter={(v: number) => formatNumber(v)}
                    allowDecimals={false}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null
                      const r = payload[0].payload as WeekRow
                      return (
                        <div className="chart-tip">
                          <p className="text-[12px] font-semibold text-white">Semaine {r.index}</p>
                          <p className="mt-1 text-[12px] text-white/70">
                            <span className="font-semibold text-white">{formatNumber(r.km, 1)} km</span> prévus
                          </p>
                        </div>
                      )
                    }}
                  />
                  <Bar
                    dataKey="km"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={32}
                    cursor="pointer"
                    onClick={(_, i) => openWeek(rows[i].index)}
                  >
                    {rows.map((r) => (
                      <Cell
                        key={r.index}
                        fill={
                          r.index === timeline.currentWeek
                            ? SERIES.brand
                            : r.index === selected
                              ? 'rgba(255,255,255,0.55)'
                              : r.index < timeline.currentWeek
                                ? 'rgba(252,76,2,0.35)'
                                : 'rgba(255,255,255,0.14)'
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>
        </>
      ) : null}
    </div>
  )
}
