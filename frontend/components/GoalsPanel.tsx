'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { GoalTrainingCalendar } from '@/components/GoalTrainingCalendar'
import { GoalDetailHeader } from '@/components/goals/GoalDetailHeader'
import { GoalGuidance } from '@/components/goals/GoalGuidance'
import { GoalProgram } from '@/components/goals/GoalProgram'
import { GoalTabs, type GoalTabId } from '@/components/goals/GoalTabs'
import { ProgressRing } from '@/components/ProgressRing'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import {
  CreateGoalCta,
  GoalCard,
  GoalSummaryStrip,
  GoalsEmptyState,
  WizardSteps,
} from '@/components/goals/GoalPieces'
import {
  createGoalStreaming,
  deleteGoal,
  fetchMe,
  getGoal,
  goalChat,
  listGoals,
  previewGoalFeasibility,
  replanGoalWithStravaStreaming,
  type Goal,
  type GoalCoachAction,
  type PlanProgress,
} from '@/lib/api'
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
  /** Modifications que le coach vient d'appliquer au plan ou au calendrier. */
  const [coachActions, setCoachActions] = useState<GoalCoachAction[]>([])
  const coachThreadRef = useRef<HTMLDivElement | null>(null)
  const [goalDeleteBusy, setGoalDeleteBusy] = useState(false)
  const [goalDeleteErr, setGoalDeleteErr] = useState('')
  const [goalReplanBusy, setGoalReplanBusy] = useState(false)
  const [goalReplanErr, setGoalReplanErr] = useState('')
  /** Avancement rapporté par l'API pendant la génération — des faits, pas une estimation. */
  const [replanProgress, setReplanProgress] = useState<PlanProgress | null>(null)
  const [createProgress, setCreateProgress] = useState<PlanProgress | null>(null)
  const [stravaLinked, setStravaLinked] = useState<boolean | null>(null)
  const [tab, setTab] = useState<GoalTabId>('program')
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
    setTab('program')
    setGoalChatInput('')
    setGoalChatErr('')
    setGoalDeleteErr('')
    setCoachActions([])
    const token = getToken()
    if (token) {
      void fetchMe(token)
        .then((me) => setStravaLinked(me.strava_linked))
        .catch(() => {})
    }
  }, [selectedId])

  /** La réponse du coach arrive en bas du fil : c'est elle qu'on veut voir. */
  useEffect(() => {
    if (tab !== 'coach') return
    const el = coachThreadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [tab, detail?.coach_thread?.length])

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

  /**
   * Réécrit le plan avec les sorties Strava. Nécessaire pour un objectif créé avant
   * l'association : son plan est un texte figé, qui garde sinon ses réserves
   * « sans historique importé » alors que les données sont désormais disponibles.
   */
  async function onReplanWithStrava() {
    const token = getToken()
    if (!token || !detail?.id || goalReplanBusy) return
    if (
      !window.confirm(
        'Recalculer le plan à partir de tes sorties Strava ? Le plan actuel sera remplacé. Ton objectif, ton nombre de séances et ta discussion avec le coach sont conservés.',
      )
    ) {
      return
    }
    setGoalReplanBusy(true)
    setGoalReplanErr('')
    setReplanProgress(null)
    try {
      const g = await replanGoalWithStravaStreaming(token, detail.id, setReplanProgress)
      setDetail(g)
      await refresh()
    } catch (er) {
      setGoalReplanErr(er instanceof Error ? er.message : 'Recalcul impossible')
    } finally {
      setGoalReplanBusy(false)
      setReplanProgress(null)
    }
  }

  async function onGoalChatSubmit(e: FormEvent) {
    e.preventDefault()
    const token = getToken()
    if (!token || !detail?.id || !goalChatInput.trim() || goalChatBusy) return
    setGoalChatErr('')
    setGoalChatBusy(true)
    try {
      const { goal, actions } = await goalChat(token, detail.id, goalChatInput.trim())
      setGoalChatInput('')
      setCoachActions(actions)
      // Le coach a pu déplacer des séances : on repart de l'objectif qu'il renvoie,
      // sinon l'affichage décrirait le calendrier d'avant sa réponse.
      setDetail(goal ?? (await getGoal(token, detail.id)))
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
    setCreateProgress(null)
    try {
      const g = await createGoalStreaming(
        token,
        {
          distance_km: distKm,
          weeks,
          sessions_per_week: sessions,
          target_time: targetTime.trim(),
        },
        setCreateProgress,
      )
      setWizardOpen(false)
      await refresh()
      setSelectedId(g.id)
      setDetail(g)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setSubmitting(false)
      setCreateProgress(null)
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
            {submitting ? (
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-4 py-3.5">
                <ProgressRing
                  done={createProgress?.done ?? 0}
                  total={createProgress?.total ?? 1}
                  label="Génération du plan"
                  color="#fc4c02"
                />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-white/92">Génération du plan…</p>
                  <p className="mt-0.5 text-[12px] text-white/45">
                    {createProgress?.label || 'Le coach prépare ta préparation.'}
                  </p>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn-brand w-full"
                onClick={() => void submitWizard()}
                disabled={
                  feasibilityLoading ||
                  (!feasibilityErr && !feasibilityText && !feasibilityLoading)
                }
              >
                Générer le plan
              </button>
            )}
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

  const hasDetail = detail != null

  const listAside = (
    <aside
      className={`w-full shrink-0 space-y-3 lg:sticky lg:top-4 lg:self-start ${
        hasDetail ? 'hidden lg:block lg:w-[300px] xl:w-[330px]' : 'lg:w-[420px]'
      }`}
    >
      <CreateGoalCta onClick={openWizard} />

      {goals.length > 0 ? (
        <GoalSummaryStrip active={activeCount} done={doneCount} nextDays={nextDays} />
      ) : null}

      {loadingList ? (
        <div className="app-skeleton h-[120px]" />
      ) : goals.length === 0 ? (
        <GoalsEmptyState />
      ) : (
        <div className="space-y-3 lg:max-h-[calc(100dvh-19rem)] lg:overflow-y-auto lg:pr-1">
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

  const stravaNotice = detail?.plan_without_strava_data ? (
    stravaLinked ? (
      <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.08] p-4 text-[13px] leading-relaxed text-emerald-100/95">
        <p className="max-w-[70ch]">
          Strava est associé, mais ce plan a été écrit{' '}
          <span className="font-medium text-white">avant</span> : ses repères ne tiennent pas compte
          de tes sorties.
        </p>
        {goalReplanBusy ? (
          <div className="mt-3 flex items-center gap-3">
            <ProgressRing
              done={replanProgress?.done ?? 0}
              total={replanProgress?.total ?? 1}
              label="Recalcul du plan"
            />
            <div className="min-w-0">
              <p className="font-medium text-white">Chargement…</p>
              <p className="mt-0.5 text-emerald-100/70">
                {replanProgress?.label || 'Le coach relit tes sorties.'}
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn-quiet mt-3 min-h-[44px] border-emerald-400/30 text-[13px] text-emerald-50 hover:border-emerald-400/50 hover:bg-emerald-400/10"
            onClick={() => void onReplanWithStrava()}
          >
            Recalculer avec mes sorties Strava
          </button>
        )}
        {goalReplanErr ? <p className="mt-2 text-red-200/90">{goalReplanErr}</p> : null}
      </div>
    ) : (
      <div className="rounded-2xl border border-white/[0.08] bg-white/[0.04] p-4 text-[13px] leading-relaxed text-white/70">
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
  ) : null

  const programPanel = detail ? (
    <div
      role="tabpanel"
      id="goal-panel-program"
      aria-labelledby="goal-tab-program"
      className="panel p-4 sm:p-5"
    >
      <GoalProgram goal={detail} />
    </div>
  ) : null

  const guidancePanel = detail ? (
    <div
      role="tabpanel"
      id="goal-panel-guidance"
      aria-labelledby="goal-tab-guidance"
      className="panel p-4 sm:p-5"
    >
      <GoalGuidance plan={detail.plan} />
    </div>
  ) : null

  const calendarPanel = detail && authToken ? (
    <div
      role="tabpanel"
      id="goal-panel-calendar"
      aria-labelledby="goal-tab-calendar"
      className="panel p-4 sm:p-5"
    >
      <GoalTrainingCalendar
        goalId={detail.id}
        token={authToken}
        plan={detail.plan}
        planStamp={JSON.stringify([
          detail.sessions_per_week,
          detail.weeks,
          detail.planned_sessions?.length ?? 0,
          detail.plan?.length ?? 0,
          detail.calendar_day_offsets ?? null,
          detail.session_overrides ?? null,
          detail.unavailabilities ?? null,
        ])}
      />
    </div>
  ) : null

  const coachPanel = detail ? (
    // Hauteur bornée dès le mobile : sans elle, le panneau s'étire à la taille du fil,
    // la zone de messages ne défile plus par elle-même, et le champ de saisie se
    // retrouve sous toute la conversation.
    <div
      role="tabpanel"
      id="goal-panel-coach"
      aria-labelledby="goal-tab-coach"
      className="panel flex h-[calc(100dvh-12rem)] max-h-[46rem] min-h-[24rem] flex-col p-4 sm:p-6 lg:h-[calc(100dvh-18rem)]"
    >
      <div className="shrink-0">
        <h3 className="font-display text-[15px] font-semibold text-white">Discussion avec le coach</h3>
        <p className="mt-1 max-w-[70ch] text-[12px] leading-[17px] text-white/40">
          Ton ressenti, une douleur, un jour qui ne va plus, une période sans course : le coach ajuste
          lui-même ton calendrier.
        </p>
      </div>
      {goalChatErr ? <p className="mt-2 shrink-0 text-[13px] text-red-200/90">{goalChatErr}</p> : null}

      {coachActions.length > 0 ? (
        <div className="mt-2.5 flex shrink-0 items-start gap-2 rounded-xl border border-brand-ice/25 bg-brand-ice/[0.07] px-3 py-2 text-[12px] leading-[17px] text-white/85">
          <div className="min-w-0 flex-1">
            <span className="font-medium text-white">Plan mis à jour · </span>
            <span className="text-white/70">{coachActions.map((a) => a.label).join(' · ')}</span>
            <button
              type="button"
              className="ml-1.5 font-semibold text-brand-ice/90 underline decoration-brand-ice/30 underline-offset-2 transition hover:text-white"
              onClick={() => setTab('calendar')}
            >
              voir le calendrier
            </button>
          </div>
          <button
            type="button"
            aria-label="Masquer le récapitulatif"
            className="-mr-1 shrink-0 px-1 text-white/35 transition hover:text-white/80"
            onClick={() => setCoachActions([])}
          >
            ×
          </button>
        </div>
      ) : null}

      <div ref={coachThreadRef} className="mt-3 min-h-[10rem] flex-1 space-y-3 overflow-y-auto pr-1">
        {(detail.coach_thread ?? []).length === 0 ? (
          <p className="text-[13px] text-white/35">Écris un premier message pour ouvrir la discussion.</p>
        ) : null}
        {(detail.coach_thread ?? []).map((m, i) => (
          <div
            key={`${m.role}-${i}-${m.created_at}`}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[min(100%,62ch)] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
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
                <p className="whitespace-pre-wrap">{m.text}</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Collé au bas de la zone visible : le champ reste atteignable même quand le
          panneau déborde de l'écran, sans avoir à faire défiler la page. */}
      <form
        className="sticky bottom-0 -mx-4 mt-4 flex shrink-0 flex-col gap-2 border-t border-white/[0.06] bg-[rgba(18,21,31,0.96)] px-4 pb-2 pt-4 backdrop-blur-xl sm:-mx-6 sm:flex-row sm:px-6"
        onSubmit={onGoalChatSubmit}
      >
        <label htmlFor="goal-coach-input" className="sr-only">
          Message au coach
        </label>
        <input
          id="goal-coach-input"
          className="field min-h-[44px] min-w-0 flex-1 border-white/[0.08] bg-surface-2/80 text-[15px]"
          placeholder="Ex. J’ai mal au genou depuis hier…"
          value={goalChatInput}
          onChange={(e) => setGoalChatInput(e.target.value)}
          disabled={goalChatBusy}
          autoComplete="off"
        />
        <button
          type="submit"
          className="btn-brand min-h-[44px] shrink-0 px-6"
          disabled={goalChatBusy || !goalChatInput.trim()}
        >
          {goalChatBusy ? 'Envoi…' : 'Envoyer'}
        </button>
      </form>
    </div>
  ) : null

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-safe py-5 sm:gap-6 sm:py-6 lg:flex-row lg:items-start">
      {listAside}

      <main className="min-w-0 flex-1">
        {!detail ? (
          goals.length > 0 ? (
            <div className="app-empty hidden lg:flex">
              <p className="text-base font-semibold text-white/92">Aucun objectif sélectionné</p>
              <p className="mx-auto mt-1.5 max-w-[320px] text-[13px] leading-[19px] text-white/38">
                Choisis un objectif dans la liste pour voir son plan, son calendrier et la discussion
                avec le coach.
              </p>
            </div>
          ) : null
        ) : (
          <div className="space-y-4 sm:space-y-5">
            <GoalDetailHeader
              goal={detail}
              onBack={() => setSelectedId(null)}
              onDelete={() => void onDeleteGoal()}
              deleting={goalDeleteBusy}
            />
            {goalDeleteErr ? (
              <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-[13px] text-red-100">
                {goalDeleteErr}
              </p>
            ) : null}

            {stravaNotice}

            <GoalTabs active={tab} onChange={setTab} />

            {tab === 'program'
              ? programPanel
              : tab === 'guidance'
                ? guidancePanel
                : tab === 'calendar'
                  ? calendarPanel
                  : coachPanel}
          </div>
        )}
      </main>
    </div>
  )
}
