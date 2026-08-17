'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import type { Goal } from '@/lib/api'
import { sessionTypeMeta } from '@/lib/goalSessions'
import { goalTimeline } from '@/lib/goalStats'
import { parsePlanOutline, splitWeekSessions } from '@/lib/planOutline'

/*
 * Programme d'entraînement, semaine par semaine.
 *
 * Le plan complet est un document : pour lire la séance du jour il fallait
 * traverser la faisabilité, les repères d'allure et les conseils de sécurité.
 * Ici, une semaine est à l'écran d'entrée — celle en cours — et les autres sont
 * à un clic, sans défilement. Les conseils restent accessibles, ailleurs.
 */

function WeekPill({
  week,
  state,
  selected,
  onSelect,
}: {
  week: number
  state: 'past' | 'current' | 'future'
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? 'true' : undefined}
      className={`flex min-h-[44px] shrink-0 flex-col items-center justify-center rounded-2xl border px-3.5 transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 ${
        selected
          ? 'border-brand-orange/60 bg-brand-orange/[0.16] text-white'
          : 'border-white/[0.08] bg-white/[0.03] text-white/55 hover:border-white/20 hover:text-white/85'
      }`}
    >
      <span className="text-[10px] font-medium uppercase leading-none tracking-[0.1em] opacity-70">
        Sem.
      </span>
      <span className="mt-1 font-display text-[15px] font-semibold leading-none tabular-nums">
        {week}
      </span>
      <span
        className={`mt-1.5 h-1 w-1 rounded-full ${
          state === 'current'
            ? 'bg-brand-orange'
            : state === 'past'
              ? 'bg-emerald-400/70'
              : 'bg-white/20'
        }`}
        aria-hidden
      />
    </button>
  )
}

export function GoalProgram({ goal }: { goal: Goal }) {
  const outline = useMemo(() => parsePlanOutline(goal.plan), [goal.plan])
  const timeline = goalTimeline(goal)
  const railRef = useRef<HTMLDivElement>(null)

  const currentWeek = Math.min(timeline.currentWeek, outline.weeks.length || 1)
  const [selected, setSelected] = useState(currentWeek)

  // Changer d'objectif remet le curseur sur la semaine en cours.
  useEffect(() => {
    setSelected(currentWeek)
  }, [goal.id, currentWeek])

  // La semaine active doit être visible dans la barre, même au-delà de la 5e.
  useEffect(() => {
    const rail = railRef.current
    const active = rail?.querySelector<HTMLElement>('[aria-current="true"]')
    if (rail && active) {
      rail.scrollTo({
        left: active.offsetLeft - rail.clientWidth / 2 + active.clientWidth / 2,
        behavior: 'smooth',
      })
    }
  }, [selected])

  if (outline.unstructured) {
    // Plan sans calendrier reconnaissable : mieux vaut le texte brut qu'un vide.
    return <SimplePlanBody text={goal.plan} className="max-w-[72ch]" />
  }

  const week = outline.weeks.find((w) => w.index === selected) ?? outline.weeks[0]
  const sessions = week ? splitWeekSessions(week.body) : []

  return (
    <div className="space-y-4">
      <div
        ref={railRef}
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {outline.weeks.map((w) => (
          <WeekPill
            key={w.index}
            week={w.index}
            state={
              w.index < timeline.currentWeek
                ? 'past'
                : w.index === timeline.currentWeek
                  ? 'current'
                  : 'future'
            }
            selected={w.index === selected}
            onSelect={() => setSelected(w.index)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-[17px] font-semibold text-white">{week?.title}</h3>
        {week?.index === timeline.currentWeek ? (
          <span className="rounded-full border border-brand-orange/35 bg-brand-orange/[0.12] px-2 py-0.5 text-[11px] font-semibold text-brand-orange">
            En cours
          </span>
        ) : null}
        <span className="text-[12px] tabular-nums text-white/35">
          {sessions.filter((s) => s.label).length || goal.sessions_per_week} séance
          {(sessions.filter((s) => s.label).length || goal.sessions_per_week) > 1 ? 's' : ''}
        </span>
      </div>

      {/* Les séances tiennent sur deux colonnes dès qu'il y a la place : une semaine
          entière se lit alors sans défilement. */}
      <div className="grid gap-3 xl:grid-cols-2">
        {sessions.map((s, i) => {
          // La nature de la séance est lue dans son texte : c'est ce qu'on cherche
          // d'abord dans une semaine, avant même le détail des allures.
          const type = sessionTypeMeta(s.body)
          return (
            <article
              key={`${week?.index}-${i}`}
              className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
            >
              {s.label ? (
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="flex h-6 min-w-6 items-center justify-center rounded-lg bg-brand-orange/15 px-1.5 text-[11px] font-semibold tabular-nums text-brand-orange">
                    {s.label.replace(/[^\d]/g, '') || '•'}
                  </span>
                  <h4 className="font-display text-[14px] font-semibold text-white/92">
                    {s.label}
                  </h4>
                  {type ? (
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${type.badgeClass}`}
                    >
                      {type.label}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <SimplePlanBody text={s.body} className="max-w-[68ch]" />
            </article>
          )
        })}
        {sessions.length === 0 ? (
          <p className="text-[13px] text-white/40">
            Aucune séance détaillée pour cette semaine dans le plan.
          </p>
        ) : null}
      </div>
    </div>
  )
}
