'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { Goal } from '@/lib/api'
import { GoalTrainingCalendar } from '@/components/GoalTrainingCalendar'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import {
  CreateGoalCta,
  GoalCard,
  GoalSummaryStrip,
  GoalsEmptyState,
  WizardSteps,
} from '@/components/goals/GoalPieces'
import { createGoal, deleteGoal, fetchMe, getGoal, goalChat, listGoals, previewGoalFeasibility } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { distanceAccent, goalTimeline } from '@/lib/goalStats'

/** Distances proposées, avec la durée de préparation par défaut (identique à l’app). */
const DISTANCES: { km: number; label: string; hint: string; weeks: number }[] = [
  { km: 5, label: '5K', hint: 'Vitesse & régularité', weeks: 8 },
  { km: 10, label: '10K', hint: 'Endurance courte', weeks: 10 },
  { km: 21, label: 'Semi', hint: '21,1 km', weeks: 12 },
  { km: 42, label: 'Marathon', hint: '42,2 km', weeks: 16 },
]

const WEEKS_MIN = 4
const WEEKS_MAX = 52
const SESSIONS_MIN = 1
const SESSIONS_MAX = 7

type Step = 1 | 2 | 3

/** Incrémenteur − / + : plus sûr qu’un champ libre pour une valeur bornée. */
function Stepper({
  label,
  hint,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string
  hint: string
  value: number
  unit: string
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const btn =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-lg text-white/80 transition hover:bg-white/[0.12] disabled:opacity-30'
  return (
    <div>
      <p className="text-[15px] font-medium text-white/92">{label}</p>
      <p className="mt-1 text-[11px] leading-4 text-white/38">{hint}</p>
      <div className="mt-2 flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5">
        <button
          type="button"
          className={btn}
          aria-label={`Diminuer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
        >
          −
        </button>
        <p className="flex-1 text-center">
          <span className="font-display text-2xl font-semibold tabular-nums text-white">{value}</span>
          <span className="ml-1.5 text-[13px] text-white/38">{unit}</span>
        </p>
        <button
          type="button"
          className={btn}
          aria-label={`Augmenter ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
        >
          +
        </button>
      </div>
    </div>
  )
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-[13px] text-white/38">{label}</span>
      <span className="min-w-0 flex-1 text-right text-[15px] font-medium text-white/92">{value}</span>
    </div>
  )
}

export function GoalsPanel() {
  const [goals, setGoals] = useState<Goal[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<Goal | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step, setStep] = useState<Step>(1)
  const [distKm, setDistKm] = useState<number>(10)
  const [weeks, setWeeks] = useState(8)
  const [sessions, setSessions] = useState(3)
  const [targetTime, setTargetTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [feasibilityLoading, setFeasibilityLoading] = useState(false)
  const [feasibilityText, setFeasibilityText] = useState('')
  const [feasibilityErr, setFeasibilityErr] = useState('')
  const [goalChatInput, setGoalChatInput] = useState('')
  const [goalChatBusy, setGoalChatBusy] = useState(false)
  const [goalChatErr, setGoalChatErr] = useState('')
  const [goalDeleteBusy, setGoalDeleteBusy] = useState(false)
  const [goalDeleteErr, setGoalDeleteErr] = useState('')
  const [stravaLinked, setStravaLinked] = useState<boolean | null>(null)
  const authToken = getToken()

  const refresh = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const { goals: g } = await listGoals(token)
      setGoals(Array.isArray(g) ? g : [])
    } catch {
      setGoals([])
    }
  }, [])

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        await refresh()
        const token = getToken()
        if (token) {
          try {
            const me = await fetchMe(token)
            if (!off) setStravaLinked(me.strava_linked)
          } catch {
            if (!off) setStravaLinked(null)
          }
        }
      } finally {
        if (!off) setLoadingList(false)
      }
    })()
    return () => {
      off = true
    }
  }, [refresh])

  useEffect(() => {
    setGoalChatInput('')
    setGoalChatErr('')
    setGoalDeleteErr('')
    const token = getToken()
    if (token) {
      void fetchMe(token)
        .then((me) => setStravaLinked(me.strava_linked))
        .catch(() => {})
    }
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      return
    }
    const token = getToken()
      ;(async () => {
        try {
          const g = await getGoal(token!, selectedId)
          setDetail(g)
        } catch {
          setDetail(null)
        }
      })()
  }, [selectedId])

  async function onDeleteGoal() {
    const token = getToken()
    if (!token || !detail?.id || goalDeleteBusy) return
    if (
      !window.confirm(
        'Supprimer cet objectif ? Le plan et la discussion avec le coach seront effacés définitivement.',
      )
    ) {
      return
    }
    const id = detail.id
    setGoalDeleteBusy(true)
    setGoalDeleteErr('')
    try {
      await deleteGoal(token, id)
      setSelectedId(null)
      setDetail(null)
      await refresh()
    } catch (er) {
      setGoalDeleteErr(er instanceof Error ? er.message : 'Suppression impossible')
    } finally {
      setGoalDeleteBusy(false)
    }
  }

  async function onGoalChatSubmit(e: FormEvent) {
    e.preventDefault()
    const token = getToken()
    if (!token || !detail?.id || !goalChatInput.trim() || goalChatBusy) return
    setGoalChatErr('')
    setGoalChatBusy(true)
    try {
      await goalChat(token, detail.id, goalChatInput.trim())
      setGoalChatInput('')
      const g = await getGoal(token, detail.id)
      setDetail(g)
      await refresh()
    } catch (er) {
      setGoalChatErr(er instanceof Error ? er.message : 'Erreur')
    } finally {
      setGoalChatBusy(false)
    }
  }

  useEffect(() => {
    if (!wizardOpen || step !== 3) return
    const tt = targetTime.trim()
    if (tt.length < 2) return
    const token = getToken()
    if (!token) return

    const ac = new AbortController()
    setFeasibilityLoading(true)
    setFeasibilityErr('')
    setFeasibilityText('')

    ;(async () => {
      try {
        const { feasibility } = await previewGoalFeasibility(
          token,
          {
            distance_km: distKm,
            weeks,
            sessions_per_week: sessions,
            target_time: tt,
          },
          { signal: ac.signal }
        )
        if (!ac.signal.aborted) setFeasibilityText(feasibility)
      } catch (e) {
        if (ac.signal.aborted) return
        setFeasibilityErr(e instanceof Error ? e.message : 'Impossible de charger l’avis')
      } finally {
        if (!ac.signal.aborted) setFeasibilityLoading(false)
      }
    })()

    return () => ac.abort()
  }, [wizardOpen, step, distKm, weeks, sessions, targetTime])

  function openWizard() {
    setErr('')
    setWizardOpen(true)
    setStep(1)
    setDistKm(10)
    setWeeks(8)
    setSessions(3)
    setTargetTime('')
    setFeasibilityText('')
    setFeasibilityErr('')
    setFeasibilityLoading(false)
    const token = getToken()
    if (token) {
      void fetchMe(token)
        .then((me) => setStravaLinked(me.strava_linked))
        .catch(() => {})
    }
  }

  async function submitWizard() {
    const token = getToken()
    if (!token) return
    setErr('')
    setSubmitting(true)
    try {
      const g = await createGoal(token, {
        distance_km: distKm,
        weeks,
        sessions_per_week: sessions,
        target_time: targetTime.trim(),
      })
      setWizardOpen(false)
      await refresh()
      setSelectedId(g.id)
      setDetail(g)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(false)
    }
  }

  if (wizardOpen) {
    const dist = DISTANCES.find((d) => d.km === distKm)
    return (
      <div className="mx-auto w-full max-w-lg space-y-5 px-safe py-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Étape précédente"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60 transition hover:text-white disabled:opacity-30"
            disabled={step === 1 || submitting}
            onClick={() => setStep((st) => (st > 1 ? ((st - 1) as Step) : st))}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="min-w-0 flex-1 text-center">
            <p className="app-kicker text-brand-orange">Nouvel objectif</p>
            <h2 className="mt-1 font-display text-[19px] font-semibold leading-6 tracking-[-0.3px] text-white/95">
              {step === 1
                ? 'Quelle distance vises-tu ?'
                : step === 2
                  ? `Réglages · ${dist?.label ?? `${distKm} km`}`
                  : 'Validation'}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-white/60 transition hover:text-white disabled:opacity-30"
            onClick={() => setWizardOpen(false)}
            disabled={submitting}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <WizardSteps current={step} />

        {err ? (
          <div className="rounded-2xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">{err}</div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-4">
            <p className="text-[13px] leading-[19px] text-white/38">
              La durée de préparation est pré-remplie selon la distance ; tu pourras l’ajuster à l’étape suivante.
            </p>
            <div className="grid grid-cols-2 gap-3">
              {DISTANCES.map((d) => {
                const on = distKm === d.km
                const accent = distanceAccent(d.km)
                return (
                  <button
                    key={d.km}
                    type="button"
                    onClick={() => {
                      setDistKm(d.km)
                      setWeeks(d.weeks)
                    }}
                    className="rounded-2xl border-[1.5px] bg-white/[0.04] p-4 text-left transition"
                    style={{
                      borderColor: on ? accent : 'rgba(255,255,255,0.08)',
                      backgroundColor: on ? `${accent}14` : undefined,
                    }}
                  >
                    <span
                      className="mb-2 block h-2 w-2 rounded-full"
                      style={{ backgroundColor: accent }}
                      aria-hidden
                    />
                    <span className="block font-display text-[17px] font-semibold text-white/95">{d.label}</span>
                    <span className="mt-0.5 block text-[11px] text-white/38">{d.hint}</span>
                    <span className="mt-2 block text-[11px] text-white/50">{d.weeks} semaines conseillées</span>
                  </button>
                )
              })}
            </div>
            <button type="button" className="btn-brand w-full" onClick={() => setStep(2)}>
              Continuer
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-5">
            <Stepper
              label="Durée de préparation"
              hint="Nombre de semaines avant la course."
              value={weeks}
              unit={weeks > 1 ? 'semaines' : 'semaine'}
              min={WEEKS_MIN}
              max={WEEKS_MAX}
              onChange={setWeeks}
            />
            <Stepper
              label="Séances par semaine"
              hint="Moyenne visée, le plan s’y adapte."
              value={sessions}
              unit={sessions > 1 ? 'séances' : 'séance'}
              min={SESSIONS_MIN}
              max={SESSIONS_MAX}
              onChange={setSessions}
            />
            <div>
              <p className="text-[15px] font-medium text-white/92">Chrono visé</p>
              <p className="mt-1 text-[11px] leading-[16px] text-white/38">
                Ex. « 48 min », « 1h40 », « moins de 4h ». Tu peux aussi indiquer « finir sans chrono précis ».
              </p>
              <input
                type="text"
                className="field mt-2"
                placeholder="Ex. 50 min, 1h30…"
                value={targetTime}
                onChange={(e) => setTargetTime(e.target.value)}
                maxLength={120}
                autoComplete="off"
              />
            </div>
            <button
              type="button"
              className="btn-brand w-full"
              onClick={() => setStep(3)}
              disabled={targetTime.trim().length < 2}
            >
              Voir l’avis du coach
            </button>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-4">
            <div className="rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-4">
              <SummaryLine label="Course" value={dist?.label ?? `${distKm} km`} />
              <SummaryLine label="Chrono visé" value={targetTime.trim()} />
              <SummaryLine label="Délai" value={`${weeks} semaine${weeks > 1 ? 's' : ''}`} />
              <SummaryLine
                label="Rythme"
                value={`${sessions} séance${sessions > 1 ? 's' : ''} / semaine`}
              />
              <button
                type="button"
                className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-brand-orange/90 transition hover:text-brand-orange"
                onClick={() => setStep(2)}
              >
                Modifier les réglages
              </button>
            </div>

            <div className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-5 pl-7">
              <span className="absolute inset-y-0 left-0 w-1 bg-brand-ice/85" aria-hidden />
              <p className="app-kicker text-brand-ice">
                {stravaLinked ? 'Avis faisabilité · Strava + objectif' : 'Avis faisabilité · objectif'}
              </p>
              {feasibilityLoading ? (
                <p className="mt-3 text-sm text-white/45">Analyse en cours…</p>
              ) : null}
              {feasibilityErr ? <p className="mt-3 text-sm text-red-200/90">{feasibilityErr}</p> : null}
              {!feasibilityLoading && feasibilityText ? (
                <SimplePlanBody text={feasibilityText} className="mt-3" />
              ) : null}
              {stravaLinked === false ? (
                <p className="mt-3 text-[11px] leading-4 text-white/30">
                  Sans Strava, l’avis se base sur ton objectif seul ; il s’affinera après liaison.
                </p>
              ) : null}
            </div>

            <p className="text-[11px] leading-4 text-white/30">
              La génération du plan détaillé (semaine par semaine) complète cet avis. Compte jusqu’à une minute.
            </p>
            <button
              type="button"
              className="btn-brand w-full"
              onClick={() => void submitWizard()}
              disabled={
                submitting ||
                feasibilityLoading ||
                (!feasibilityErr && !feasibilityText && !feasibilityLoading)
              }
            >
              {submitting ? 'Génération…' : 'Générer le plan'}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  const timelines = goals.map((g) => goalTimeline(g))
  const activeCount = timelines.filter((t) => !t.finished).length
  const doneCount = timelines.length - activeCount
  const nextDays = timelines
    .filter((t) => !t.finished && t.daysLeft != null)
    .reduce<number | null>((min, t) => (min == null || t.daysLeft! < min ? t.daysLeft! : min), null)

  const listAside = (
    <aside className={`w-full shrink-0 space-y-3 ${detail ? 'lg:w-72 xl:w-80' : 'lg:w-96'}`}>
      <CreateGoalCta onClick={openWizard} />

      {goals.length > 0 ? (
        <GoalSummaryStrip active={activeCount} done={doneCount} nextDays={nextDays} />
      ) : null}

      {loadingList ? (
        <div className="app-skeleton h-[120px]" />
      ) : goals.length === 0 ? (
        <GoalsEmptyState />
      ) : (
        <div className="space-y-3">
          {goals.map((g) => (
            <GoalCard
              key={g.id}
              goal={g}
              selected={selectedId === g.id}
              onOpen={() => setSelectedId(g.id)}
            />
          ))}
        </div>
      )}
    </aside>
  )

  return (
    <div
      className={`mx-auto flex w-full flex-col gap-5 px-safe py-5 sm:gap-6 sm:py-6 lg:flex-row lg:items-start ${
        detail ? 'max-w-[min(100%,1520px)]' : 'max-w-3xl'
      }`}
    >
      {listAside}
      <main className="min-w-0 flex-1">
        {!detail ? (
          goals.length > 0 ? (
            <div className="app-empty">
              <p className="text-base font-semibold text-white/92">Aucun objectif sélectionné</p>
              <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] leading-[19px] text-white/38">
                Choisis un objectif dans la liste pour voir son plan, son calendrier et la discussion coach.
              </p>
            </div>
          ) : null
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-5">
            {/* Colonne plan : tuile « détail » puis tuile « calendrier » (scrolls séparés) */}
            <div className="flex w-full min-w-0 flex-col gap-5 sm:gap-6 lg:w-[min(100%,440px)] lg:shrink-0 xl:w-[min(100%,480px)]">
              <article className="panel flex min-h-0 w-full flex-col p-4 sm:p-6 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
                <header className="flex flex-col gap-3 border-b border-white/[0.06] pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-semibold text-white">{detail.distance_label}</h3>
                    <p className="mt-1 text-xs text-white/45">
                      {detail.target_time ? (
                        <>
                          Chrono visé : <span className="text-white/70">{detail.target_time}</span>
                          <span className="text-white/25"> · </span>
                        </>
                      ) : null}
                      {detail.weeks} semaine(s) · {detail.sessions_per_week} séance(s)/semaine · créé le{' '}
                      {new Date(detail.created_at).toLocaleDateString('fr-FR')}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn-quiet shrink-0 border-red-500/25 py-2 text-xs text-red-200/95 hover:border-red-500/40 hover:bg-red-500/10 disabled:opacity-50"
                    disabled={goalDeleteBusy}
                    onClick={() => void onDeleteGoal()}
                  >
                    {goalDeleteBusy ? 'Suppression…' : 'Supprimer l’objectif'}
                  </button>
                </header>
                {goalDeleteErr ? (
                  <p className="mt-3 text-sm text-red-200/90">{goalDeleteErr}</p>
                ) : null}
                {detail.plan_without_strava_data ? (
                  stravaLinked ? (
                    <div className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-3 py-2.5 text-xs leading-relaxed text-emerald-100/95">
                      Strava est associé : tu peux écrire au coach pour <span className="font-medium text-white">adapter ton objectif ou le plan</span> selon tes vraies sorties (allure, volume, régularité).
                    </div>
                  ) : (
                    <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5 text-xs leading-relaxed text-white/70">
                      Ce plan s’appuie sur ton objectif (sans historique Strava).{' '}
                      <Link
                        href="/link-strava/"
                        className="font-medium text-brand-ice/90 underline decoration-white/15 underline-offset-2 hover:text-white"
                      >
                        Associer Strava
                      </Link>{' '}
                      permet d’aligner conseils et calendrier sur tes sorties réelles.
                    </div>
                  )
                ) : null}
                <SimplePlanBody text={detail.plan} className="mt-5 min-w-0 flex-1" />
              </article>

              {authToken ? (
                <article className="panel flex min-h-[14rem] min-w-0 max-h-[min(70dvh,42rem)] flex-col overflow-hidden p-4 sm:min-h-[16rem] sm:p-6 lg:max-h-[calc(100dvh-10rem)]">
                  <GoalTrainingCalendar
                    goalId={detail.id}
                    token={authToken}
                    planStamp={`${detail.sessions_per_week}-${detail.weeks}-${detail.planned_sessions?.length ?? 0}-${detail.plan?.length ?? 0}`}
                  />
                </article>
              ) : null}
            </div>

            {/* Coach : prend le reste de la largeur — bulles IA plus larges, zone de scroll plus haute */}
            <section className="panel flex min-h-0 w-full min-w-0 flex-1 flex-col p-4 sm:p-6 lg:max-h-[calc(100dvh-9rem)]">
              <h4 className="font-display text-sm font-semibold text-white">Discussion avec le coach</h4>
              <p className="mt-1.5 text-xs leading-relaxed text-white/45">
                Partage ton ressenti (énergie, sommeil, stress), des douleurs ou une gêne, ou demande à alléger ou
                ajuster le chrono / le nombre de séances.
              </p>
              {goalChatErr ? (
                <p className="mt-2 text-xs text-red-200/90">{goalChatErr}</p>
              ) : null}
              <div className="mt-4 min-h-[12rem] flex-1 space-y-3 overflow-y-auto pr-1 lg:min-h-0">
                {(detail.coach_thread ?? []).length === 0 ? (
                  <p className="text-xs text-white/35">Écris un premier message pour ouvrir la discussion.</p>
                ) : null}
                {(detail.coach_thread ?? []).map((m, i) => (
                  <div
                    key={`${m.role}-${i}-${m.created_at}`}
                    className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[min(100%,720px)] rounded-2xl px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-gradient-to-br from-brand-orange/25 to-brand-deep/20 text-white'
                          : 'border border-white/[0.08] bg-surface-2/80 text-white/88'
                      }`}
                    >
                      {m.role === 'assistant' ? (
                        <SimplePlanBody
                          text={m.text}
                          className="!space-y-0.5 [&_h4]:mt-3 [&_h4]:pb-1 [&_h4]:text-sm [&_h5]:mt-2 [&_h5]:text-xs"
                        />
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed">{m.text}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <form className="mt-4 shrink-0 flex flex-col gap-2 border-t border-white/[0.06] pt-4 sm:flex-row" onSubmit={onGoalChatSubmit}>
                <input
                  className="field min-w-0 flex-1 border-white/[0.08] bg-surface-2/80 py-2.5 text-sm"
                  placeholder="Ex. J’ai mal au genou depuis hier…"
                  value={goalChatInput}
                  onChange={(e) => setGoalChatInput(e.target.value)}
                  disabled={goalChatBusy}
                  autoComplete="off"
                />
                <button type="submit" className="btn-brand shrink-0 px-5 py-2.5 sm:self-stretch" disabled={goalChatBusy || !goalChatInput.trim()}>
                  {goalChatBusy ? 'Envoi…' : 'Envoyer'}
                </button>
              </form>
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
