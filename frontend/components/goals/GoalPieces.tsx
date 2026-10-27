'use client'

import type { ReactNode } from 'react'
import { Sparkline } from '@/components/dashboard/Sparkline'
import { StatTile } from '@/components/dashboard/StatTile'
import { SERIES } from '@/components/dashboard/chartTheme'
import type { Goal } from '@/lib/api'
import { TERRAIN_LABELS, formatCountdown, goalTimeline, plannedVolumeKm } from '@/lib/goalStats'

/*
 * Blocs de la page Objectifs, dans le langage du tableau de bord : surtitre et
 * titre en police d'affichage, tuiles de chiffres-clés, cartes à mini-tracé.
 * Une préparation se lit comme une série de semaines — d'où la courbe du volume
 * prévu sur chaque carte.
 */

/** Échéance lisible : « 3 nov. 2026 ». */
export function formatDeadline(d: Date | null, month: 'short' | 'long' = 'short'): string {
  if (!d) return '—'
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month, year: 'numeric' })
}

/** Chrono visé tel que saisi ; un nombre seul se lit en minutes (« 50 » → « 50 min »). */
export function formatTarget(raw: string | undefined | null): string {
  const s = raw?.trim() ?? ''
  return /^\d{1,3}$/.test(s) ? `${s} min` : s
}

/** Volume prévu de chaque semaine, de la première à la dernière. */
export function weeklyVolume(goal: Goal): number[] {
  const weeks = Array.from({ length: Math.max(1, goal.weeks || 0) }, () => 0)
  for (const s of goal.planned_sessions ?? []) {
    const i = Math.min(weeks.length, Math.max(1, s.week)) - 1
    if (Number.isFinite(s.distance_km)) weeks[i] += s.distance_km
  }
  return weeks
}

/** Surtitre + titre, comme en tête du tableau de bord. */
export function PageHeading({ kicker, title, action }: { kicker: string; title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase leading-none tracking-[0.14em] text-white/38">{kicker}</p>
        <h2 className="mt-2 truncate font-display text-[1.6rem] font-bold leading-8 tracking-[-0.02em] text-white sm:text-[1.75rem]">
          {title}
        </h2>
      </div>
      {action}
    </div>
  )
}

export function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-1">
      <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-white">{children}</h2>
      {hint ? <p className="hidden text-[12px] text-white/38 sm:block">{hint}</p> : null}
    </div>
  )
}

/* ------------------------------------------------------------ CTA de création */

export function CreateGoalCta({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="btn-brand min-h-[44px] cursor-pointer px-4 text-[14px]">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
      </svg>
      Nouvel objectif
    </button>
  )
}

/* ------------------------------------------------------- chiffres-clés liste */

export function GoalsSummary({ active, finished }: { active: Goal[]; finished: number }) {
  const next = active[0] ?? null
  const t = next ? goalTimeline(next) : null
  const volume = active.reduce((sum, g) => sum + plannedVolumeKm(g.planned_sessions ?? []), 0)
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <StatTile
        accent
        label="Prochaine course"
        value={t?.daysLeft != null ? String(t.daysLeft) : '—'}
        unit={t?.daysLeft != null ? (t.daysLeft > 1 ? 'jours' : 'jour') : undefined}
        hint={next && t ? `${next.distance_label} · ${formatDeadline(t.end)}` : 'Aucune course prévue'}
      />
      <StatTile label="En préparation" value={String(active.length)} hint={active.length > 1 ? 'objectifs actifs' : 'objectif actif'} />
      <StatTile label="Volume prévu" value={String(Math.round(volume))} unit="km" hint="sur tes plans en cours" />
      <StatTile label="Terminés" value={String(finished)} hint={finished > 1 ? 'courses passées' : 'course passée'} />
    </div>
  )
}

/* ------------------------------------------------------- carte d’un objectif */

export function GoalCard({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const t = goalTimeline(goal)
  const percent = Math.round(t.ratio * 100)
  const weeks = weeklyVolume(goal)
  const volume = weeks.reduce((a, b) => a + b, 0)
  const thisWeek = weeks[Math.min(weeks.length, t.currentWeek) - 1] ?? 0
  const target = formatTarget(goal.target_time)
  const urgent = !t.finished && t.daysLeft != null && t.daysLeft <= 14

  return (
    <button
      type="button"
      onClick={onOpen}
      className="chart-card group cursor-pointer text-left transition-colors duration-200 hover:border-white/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
    >
      <div className="flex items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="min-w-0">
          <p className="stat-label">
            {TERRAIN_LABELS[goal.terrain]} · {formatDeadline(t.end)}
          </p>
          <h3 className="mt-2 truncate font-display text-[22px] font-bold leading-7 tracking-[-0.02em] text-white">
            {goal.distance_label}
            {target ? <span className="ml-2 text-[15px] font-semibold text-white/42">en {target}</span> : null}
          </h3>
        </div>
        <span
          className={`stat-delta shrink-0 ${urgent ? '!border-brand-orange/35 !bg-brand-orange/[0.12] !text-[#ff8a4c]' : ''}`}
        >
          {t.finished ? 'Terminé' : formatCountdown(t.daysLeft)}
        </span>
      </div>

      {volume > 0 ? (
        <div className="mt-3 px-4 sm:px-5">
          <Sparkline
            values={weeks}
            color={t.finished ? 'rgba(255,255,255,0.4)' : SERIES.brand}
            ariaLabel={`Volume prévu par semaine sur ${weeks.length} semaines`}
          />
        </div>
      ) : null}

      <div className="mt-3 px-4 sm:px-5">
        <div className="flex items-baseline justify-between text-[12px]">
          <span className="text-white/44">
            Semaine {t.currentWeek} sur {t.totalWeeks}
          </span>
          <span className="font-semibold tabular-nums text-white/80">{percent} %</span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${Math.max(2, percent)}%`,
              backgroundImage: t.finished ? undefined : 'linear-gradient(90deg, #c73d00, #fc4c02)',
              backgroundColor: t.finished ? 'rgba(255,255,255,0.35)' : undefined,
            }}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 border-t border-white/[0.06]">
        {[
          { label: 'Cette semaine', value: thisWeek > 0 ? `${Math.round(thisWeek)} km` : '—' },
          { label: 'Séances', value: `${goal.sessions_per_week} / sem` },
          { label: 'Volume', value: volume > 0 ? `${Math.round(volume)} km` : '—' },
        ].map((c, i) => (
          <div key={c.label} className={`min-w-0 px-4 py-3 sm:px-5 ${i > 0 ? 'border-l border-white/[0.06]' : ''}`}>
            <p className="truncate text-[11px] text-white/40">{c.label}</p>
            <p className="mt-0.5 truncate font-display text-[15px] font-semibold tabular-nums text-white">{c.value}</p>
          </div>
        ))}
      </div>
    </button>
  )
}

/* ----------------------------------------------------------------- état vide */

const EMPTY_BENEFITS = [
  'Plan hebdomadaire adapté à ton niveau',
  'Séances détaillées avec allures cibles',
  'Coach disponible pour ajuster en route',
]

export function GoalsEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="app-hero p-6 sm:p-8">
      <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-orange">Objectifs</p>
      <h3 className="mt-2 font-display text-[24px] font-bold tracking-[-0.02em] text-white">Prépare ta prochaine course</h3>
      <p className="mt-2 max-w-lg text-[15px] leading-[23px] text-white/55">
        Choisis une distance et une date : le coach construit ton plan, séance par séance.
      </p>
      <ul className="mt-5 grid gap-2.5 sm:grid-cols-3">
        {EMPTY_BENEFITS.map((line) => (
          <li key={line} className="flex items-start gap-2.5 text-[13px] leading-[19px] text-white/70">
            <svg className="mt-0.5 h-4 w-4 shrink-0 text-brand-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            {line}
          </li>
        ))}
      </ul>
      <div className="mt-6">
        <CreateGoalCta onClick={onCreate} />
      </div>
    </section>
  )
}

/* ---------------------------------------------------------- étapes assistant */

export const WIZARD_LABELS = ['Distance', 'Réglages', 'Validation'] as const

/** Progression de l'assistant : trois segments, les étapes passées restent cliquables. */
export function WizardSteps({
  current,
  onSelect,
}: {
  current: 1 | 2 | 3
  onSelect?: (step: 1 | 2 | 3) => void
}) {
  return (
    <ol className="grid grid-cols-3 gap-3" aria-label="Étapes">
      {WIZARD_LABELS.map((label, i) => {
        const index = (i + 1) as 1 | 2 | 3
        const done = index < current
        const on = index === current
        const clickable = done && onSelect != null
        return (
          <li key={label}>
            <button
              type="button"
              disabled={!clickable}
              onClick={() => (clickable ? onSelect(index) : undefined)}
              aria-current={on ? 'step' : undefined}
              className="group w-full cursor-pointer text-left disabled:cursor-default"
            >
              <span
                className={`block h-1 rounded-full transition-colors ${done || on ? 'bg-brand-orange' : 'bg-white/[0.08]'}`}
                aria-hidden
              />
              <span
                className={`mt-2 flex items-center gap-1.5 text-[12px] ${
                  on ? 'font-semibold text-white' : done ? 'text-white/65 group-hover:text-white' : 'text-white/38'
                }`}
              >
                <span className="tabular-nums text-white/35">{index}</span>
                {label}
                {done ? (
                  <svg className="h-3.5 w-3.5 text-brand-orange" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : null}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
