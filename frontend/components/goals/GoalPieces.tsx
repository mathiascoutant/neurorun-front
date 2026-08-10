'use client'

import type { Goal } from '@/lib/api'
import { distanceAccent, formatCountdown, goalTimeline, plannedVolumeKm } from '@/lib/goalStats'

/*
 * Blocs de la page Objectifs — repris de `GoalsScreen` de l’app mobile :
 * CTA de création, bandeau de synthèse, état vide, carte d’objectif à anneau
 * de progression, et fil d’étapes de l’assistant.
 */

/* ---------------------------------------------------------- anneau de progrès */

function ProgressRing({
  ratio,
  color,
  size = 54,
  thickness = 5,
}: {
  ratio: number
  color: string
  size?: number
  thickness?: number
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, ratio))
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="absolute inset-0 flex items-baseline justify-center gap-px">
        <span className="self-center font-display text-sm font-semibold text-white">
          {Math.round(pct * 100)}
        </span>
        <span className="self-center text-[9px] text-white/38">%</span>
      </span>
    </span>
  )
}

/* ------------------------------------------------------------ CTA de création */

export function CreateGoalCta({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[76px] w-full items-center gap-3 rounded-[20px] p-4 text-left transition hover:brightness-110"
      style={{
        backgroundImage: 'linear-gradient(135deg, #fc4c02 0%, #c73d00 100%)',
        boxShadow: '0 8px 24px rgba(252, 76, 2, 0.28)',
      }}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.18]">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-lg font-semibold leading-tight tracking-[-0.2px] text-white">
          Nouvel objectif
        </span>
        <span className="mt-0.5 block text-xs text-white/80">
          Plan d’entraînement généré sur mesure
        </span>
      </span>
      <span className="shrink-0 text-white/75">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
        </svg>
      </span>
    </button>
  )
}

/* --------------------------------------------------------- bandeau de synthèse */

export function GoalSummaryStrip({
  active,
  done,
  nextDays,
}: {
  active: number
  done: number
  nextDays: number | null
}) {
  const cells = [
    { value: String(active), label: 'En cours' },
    { value: nextDays == null ? '—' : formatCountdown(nextDays), label: 'Prochaine échéance' },
    { value: String(done), label: 'Terminés' },
  ]
  return (
    <div className="flex items-center rounded-2xl border border-white/[0.08] bg-[#0d0f16] py-3">
      {cells.map((c, i) => (
        <div key={c.label} className="flex flex-1 items-center">
          {i > 0 ? <span className="h-7 w-px shrink-0 bg-white/[0.08]" /> : null}
          <div className="flex flex-1 flex-col items-center gap-0.5 px-2 text-center">
            <span className="font-display text-[19px] font-semibold leading-6 tracking-[-0.3px] text-white/92">
              {c.value}
            </span>
            <span className="text-[11px] leading-[14px] text-white/38">{c.label}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ----------------------------------------------------------------- état vide */

const EMPTY_BENEFITS = [
  'Plan hebdomadaire adapté à ton niveau',
  'Calendrier de séances et suivi d’assiduité',
  'Coach disponible pour ajuster en route',
]

export function GoalsEmptyState() {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0d0f16] px-5 py-8 text-center">
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-[130px]"
        style={{ backgroundImage: 'linear-gradient(rgba(252,76,2,0.10), transparent)' }}
        aria-hidden
      />
      <span className="relative mx-auto mb-2 flex h-[68px] w-[68px] items-center justify-center rounded-full border border-brand-orange/28 bg-brand-orange/[0.12]">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="#fc4c02" strokeWidth={1.8} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 21V4m0 0l10 3.5L4 11" />
        </svg>
      </span>
      <h3 className="relative font-display text-xl font-semibold text-white/92">
        Aucun objectif pour l’instant
      </h3>
      <p className="relative mx-auto mt-2 max-w-md text-[15px] leading-[22px] text-white/60">
        Définis une course et une fenêtre d’entraînement : le coach construit le plan, séance par séance.
      </p>
      <div className="relative mx-auto mt-4 max-w-md space-y-2 border-t border-white/[0.08] pt-4 text-left">
        {EMPTY_BENEFITS.map((line) => (
          <div key={line} className="flex items-center gap-3">
            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-brand-orange/[0.12]">
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="#fc4c02" strokeWidth={3} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <span className="flex-1 text-[13px] leading-[19px] text-white/60">{line}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------- carte d’un objectif */

export function GoalCard({
  goal,
  selected,
  onOpen,
}: {
  goal: Goal
  selected: boolean
  onOpen: () => void
}) {
  const timeline = goalTimeline(goal)
  const accent = distanceAccent(goal.distance_km)
  const percent = Math.round(timeline.ratio * 100)
  const volume = plannedVolumeKm(goal.planned_sessions ?? [])
  const targetTime = goal.target_time?.trim() ?? ''

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={`relative w-full overflow-hidden rounded-[20px] border p-4 pl-5 text-left transition ${
        selected
          ? 'border-white/25 bg-[#171b26]'
          : 'border-white/[0.08] bg-[#13161f] hover:border-white/[0.18] hover:bg-[#171b26]'
      }`}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: accent }}
        aria-hidden
      />

      <span className="flex items-center gap-3">
        <ProgressRing ratio={timeline.ratio} color={accent} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-display text-[17px] font-semibold text-white/95">
            {goal.distance_label}
          </span>
          <span className="mt-0.5 block truncate text-xs text-white/38">
            {goal.weeks} sem · {goal.sessions_per_week} séances/sem
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <span
            className="rounded-full border px-2.5 py-1 text-[11px] font-semibold"
            style={
              timeline.finished
                ? {
                    borderColor: 'rgba(255,255,255,0.12)',
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    color: 'rgba(255,255,255,0.6)',
                  }
                : { borderColor: `${accent}47`, backgroundColor: `${accent}1f`, color: accent }
            }
          >
            {formatCountdown(timeline.daysLeft)}
          </span>
          <span className="text-white/20">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          </span>
        </span>
      </span>

      <span className="mt-3 block h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
        <span
          className="block h-full rounded-full"
          style={{
            width: `${Math.max(2, percent)}%`,
            backgroundImage: `linear-gradient(90deg, ${accent}66, ${accent})`,
          }}
        />
      </span>

      <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] text-white/38">
          Semaine {timeline.currentWeek} sur {timeline.totalWeeks}
        </span>
        <span className="flex items-center gap-2">
          {volume > 0 ? (
            <span className="text-[11px] text-white/38">{Math.round(volume)} km au plan</span>
          ) : null}
          {volume > 0 && targetTime ? (
            <span className="h-0.5 w-0.5 rounded-full bg-white/20" aria-hidden />
          ) : null}
          {targetTime ? <span className="text-[11px] text-brand-ice/90">{targetTime}</span> : null}
        </span>
      </span>
    </button>
  )
}

/* ---------------------------------------------------------- étapes assistant */

export const WIZARD_LABELS = ['Distance', 'Réglages', 'Validation'] as const

export function WizardSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex items-start justify-center">
      {WIZARD_LABELS.map((label, i) => {
        const index = (i + 1) as 1 | 2 | 3
        const done = index < current
        const on = index === current
        return (
          <div key={label} className="flex items-start">
            {i > 0 ? (
              <span
                className={`mt-[13px] h-0.5 w-10 rounded-full sm:w-16 ${
                  index <= current ? 'bg-brand-orange' : 'bg-white/[0.08]'
                }`}
                aria-hidden
              />
            ) : null}
            <div className="flex w-[84px] flex-col items-center gap-1.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                  done
                    ? 'border-brand-orange bg-brand-orange text-white'
                    : on
                      ? 'border-brand-orange bg-brand-orange/[0.12] text-brand-orange'
                      : 'border-white/[0.08] bg-white/[0.06] text-white/38'
                }`}
              >
                {done ? (
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  index
                )}
              </span>
              <span className={`text-[11px] ${on ? 'font-semibold text-white/92' : 'text-white/38'}`}>
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
