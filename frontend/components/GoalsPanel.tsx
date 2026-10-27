'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GoalTrainingCalendar } from '@/components/GoalTrainingCalendar'
import { GoalDetailHeader } from '@/components/goals/GoalDetailHeader'
import { GoalGuidance } from '@/components/goals/GoalGuidance'
import { GoalProgram } from '@/components/goals/GoalProgram'
import { FeasibilityReview } from '@/components/goals/FeasibilityReview'
import { GoalTabs, type GoalTabId } from '@/components/goals/GoalTabs'
import { RaceDatePicker } from '@/components/goals/RaceDatePicker'
import { ProgressRing } from '@/components/ProgressRing'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import {
  CreateGoalCta,
  GoalCard,
  formatTarget,
  GoalsEmptyState,
  GoalsSummary,
  PageHeading,
  SectionTitle,
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
  type FeasibilityFacts,
  type Goal,
  type GoalCoachAction,
  type GoalTerrain,
  type PlanProgress,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import { TERRAIN_LABELS, goalTimeline, isoDay, weeksUntil } from '@/lib/goalStats'

/** Distances proposées, avec la durée de préparation par défaut (identique à l’app). */
const DISTANCES: { km: number; label: string; hint: string; weeks: number }[] = [
  { km: 5, label: '5K', hint: 'Vitesse & régularité · 5 km', weeks: 8 },
  { km: 10, label: '10K', hint: 'Endurance courte · 10 km', weeks: 10 },
  { km: 21, label: 'Semi', hint: 'Semi-marathon · 21,1 km', weeks: 12 },
  { km: 42, label: 'Marathon', hint: 'Endurance longue · 42,2 km', weeks: 16 },
]

/** Terrains proposés — le plan généré en tient compte (dénivelé, côtes, marche). */
const TERRAINS: { id: GoalTerrain; hint: string }[] = [
  { id: 'road', hint: 'Bitume, profil roulant : tout se joue à l’allure (min/km).' },
  { id: 'trail', hint: 'Chemins et dénivelé : côtes, descentes, marche en montée.' },
]

const WEEKS_MIN = 2
const WEEKS_MAX = 52
const SESSIONS_MIN = 1
const SESSIONS_MAX = 7

/** La durée de prépa se dit de deux façons ; l’API, elle, ne connaît que les semaines. */
type DurationMode = 'weeks' | 'date'

const DURATION_MODES: { id: DurationMode; label: string }[] = [
  { id: 'weeks', label: 'Nombre de semaines' },
  { id: 'date', label: 'Date de la course' },
]

type Step = 1 | 2 | 3

/** Bornes du champ date, déduites des semaines acceptées par l’API. */
function raceDateBounds(now: Date = new Date()): { min: string; max: string } {
  const day = (offset: number) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset)
    return isoDay(d)
  }
  return { min: day(WEEKS_MIN * 7), max: day(WEEKS_MAX * 7) }
}

/** Chronos proposés selon la distance : un point de départ, que l’on peut réécrire. */
const TARGET_SUGGESTIONS: Record<number, string[]> = {
  5: ['20 min', '25 min', '30 min'],
  10: ['45 min', '50 min', '1h'],
  21: ['1h45', '2h', '2h15'],
  42: ['3h30', '4h', '4h30'],
}
const TARGET_FINISH = 'Finir sans chrono précis'

/** Incrémenteur − / + : plus sûr qu’un champ libre pour une valeur bornée. */
function StepperControl({
  label,
  value,
  unit,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  unit: string
  min: number
  max: number
  onChange: (v: number) => void
}) {
  const btn =
    'flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/[0.09] bg-white/[0.05] text-white/80 transition-colors hover:border-white/[0.18] hover:bg-white/[0.08] disabled:cursor-default disabled:opacity-30'
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2">
      <button
        type="button"
        className={btn}
        aria-label={`Diminuer ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path strokeLinecap="round" d="M5 12h14" />
        </svg>
      </button>
      <p className="flex flex-1 items-baseline justify-center gap-1.5" aria-live="polite">
        <span className="stat-value">{value}</span>
        <span className="stat-unit">{unit}</span>
      </p>
      <button
        type="button"
        className={btn}
        aria-label={`Augmenter ${label}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  )
}

/** Question de l’assistant : intitulé, aide, puis le contrôle. Pas de cadre autour. */
function WizardField({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[14px] font-semibold text-white">{label}</p>
      {hint ? <p className="mt-1 text-[13px] leading-[19px] text-white/45">{hint}</p> : null}
      <div className="mt-3">{children}</div>
    </div>
  )
}

function RecapRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-white/[0.06] py-2.5">
      <dt className="shrink-0 text-[13px] text-white/45">{label}</dt>
      <dd className="min-w-0 text-right text-[14px] font-medium text-white">{value}</dd>
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
  const [terrain, setTerrain] = useState<GoalTerrain>('road')
  const [weeks, setWeeks] = useState(8)
  const [durationMode, setDurationMode] = useState<DurationMode>('weeks')
  /** Date de la course (AAAA-MM-JJ) quand la durée est dite en date. */
  const [raceDate, setRaceDate] = useState('')
  const [sessions, setSessions] = useState(3)
  const [targetTime, setTargetTime] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')
  const [feasibilityLoading, setFeasibilityLoading] = useState(false)
  const [feasibilityText, setFeasibilityText] = useState('')
  /** Chiffres calculés par l’API : verdict, chrono visé, niveau actuel. */
  const [feasibilityFacts, setFeasibilityFacts] = useState<FeasibilityFacts | null>(null)
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
    setFeasibilityFacts(null)

    ;(async () => {
      try {
        const { feasibility, facts } = await previewGoalFeasibility(
          token,
          {
            distance_km: distKm,
            terrain,
            weeks,
            sessions_per_week: sessions,
            target_time: tt,
          },
          { signal: ac.signal }
        )
        if (!ac.signal.aborted) {
          setFeasibilityText(feasibility)
          setFeasibilityFacts(facts)
        }
      } catch (e) {
        if (ac.signal.aborted) return
        setFeasibilityErr(e instanceof Error ? e.message : 'Impossible de charger l’avis')
      } finally {
        if (!ac.signal.aborted) setFeasibilityLoading(false)
      }
    })()

    return () => ac.abort()
  }, [wizardOpen, step, distKm, terrain, weeks, sessions, targetTime])

  function openWizard() {
    setErr('')
    setWizardOpen(true)
    setStep(1)
    setDistKm(10)
    setTerrain('road')
    // La durée conseillée pour la distance pré-sélectionnée, comme au choix d’une distance.
    setWeeks(DISTANCES.find((d) => d.km === 10)?.weeks ?? 10)
    setDurationMode('weeks')
    setRaceDate('')
    setSessions(3)
    setTargetTime('')
    setFeasibilityText('')
    setFeasibilityFacts(null)
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
          terrain,
          ...(durationMode === 'date' && raceDate ? { race_date: raceDate } : {}),
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

  /** Semaines déduites de la date, seulement si elles tiennent dans les bornes de l’API. */
  function onRaceDateChange(v: string) {
    setRaceDate(v)
    const w = weeksUntil(v)
    if (w != null && w >= WEEKS_MIN && w <= WEEKS_MAX) setWeeks(w)
  }

  if (wizardOpen) {
    const dist = DISTANCES.find((d) => d.km === distKm)
    const dateBounds = raceDateBounds()
    const parsedWeeks = weeksUntil(raceDate)
    const raceWeeks =
      parsedWeeks != null && parsedWeeks >= WEEKS_MIN && parsedWeeks <= WEEKS_MAX
        ? parsedWeeks
        : null
    const durationReady = durationMode === 'weeks' || raceWeeks != null
    const settingsReady = targetTime.trim().length >= 2 && durationReady
    const canGenerate = !feasibilityLoading && Boolean(feasibilityErr || feasibilityText)
    const raceDay =
      durationMode === 'date' && raceDate
        ? new Date(`${raceDate}T00:00:00`).toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })
        : ''
    const titles: Record<Step, string> = {
      1: 'Quelle course prépares-tu ?',
      2: 'Ton rythme de préparation',
      3: 'Vérifie et lance ton plan',
    }
    const subtitles: Record<Step, string> = {
      1: 'Le plan s’adapte au terrain et à la distance.',
      2: 'Combien de temps, combien de séances, et quel chrono.',
      3: 'Le coach donne son avis avant de construire tes semaines.',
    }
    const suggestions = [...(TARGET_SUGGESTIONS[distKm] ?? []), TARGET_FINISH]

    return (
      <div className="mx-auto w-full max-w-[640px] px-safe py-5 sm:py-8">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setWizardOpen(false)}
            disabled={submitting}
            className="-ml-1 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-white/50 transition-colors duration-150 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 disabled:opacity-40"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
            Annuler
          </button>
          <span className="text-[12px] tabular-nums text-white/40">Étape {step} sur 3</span>
        </div>

        <div className="mt-4">
          <WizardSteps current={step} onSelect={submitting ? undefined : setStep} />
        </div>

        <div className="mt-10">
          <p className="text-[11px] font-medium uppercase leading-none tracking-[0.14em] text-brand-orange">
            Nouvel objectif
          </p>
          <h2 className="mt-3 font-display text-[1.75rem] font-bold leading-9 tracking-[-0.02em] text-white">
            {titles[step]}
          </h2>
          <p className="mt-2 text-[14px] leading-[21px] text-white/50">{subtitles[step]}</p>
        </div>

        {err ? (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.09] px-4 py-3 text-[13px] text-red-100"
          >
            {err}
          </div>
        ) : null}

        <div className="mt-8 space-y-8">
          {step === 1 ? (
            <>
              <WizardField label="Type de course" hint={TERRAINS.find((t) => t.id === terrain)?.hint}>
                <div className="app-segment !max-w-none" role="group" aria-label="Type de course">
                  {TERRAINS.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={terrain === t.id}
                      className={`app-segment-item cursor-pointer ${terrain === t.id ? 'app-segment-item--on' : ''}`}
                      onClick={() => setTerrain(t.id)}
                    >
                      {TERRAIN_LABELS[t.id]}
                    </button>
                  ))}
                </div>
              </WizardField>

              <WizardField label="Distance">
                <div className="space-y-2" role="radiogroup" aria-label="Distance">
                  {DISTANCES.map((d) => {
                    const on = distKm === d.km
                    return (
                      <button
                        key={d.km}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => {
                          setDistKm(d.km)
                          // En mode date, c’est l’échéance qui fixe les semaines : la valeur
                          // conseillée pour la distance n’a pas à l’écraser.
                          if (durationMode === 'weeks') setWeeks(d.weeks)
                        }}
                        className={`flex w-full cursor-pointer items-center gap-4 rounded-2xl border px-4 py-3.5 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 sm:px-5 ${
                          on
                            ? 'border-brand-orange/60 bg-brand-orange/[0.08]'
                            : 'border-white/[0.08] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.04]'
                        }`}
                      >
                        <span className="w-[112px] shrink-0 font-display text-[20px] font-bold tracking-[-0.02em] text-white sm:w-[124px] sm:text-[22px]">
                          {d.label}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] text-white/85">{d.hint}</span>
                          <span className="block text-[12px] text-white/40">{d.weeks} semaines conseillées</span>
                        </span>
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            on ? 'border-brand-orange' : 'border-white/25'
                          }`}
                          aria-hidden
                        >
                          {on ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </WizardField>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <WizardField
                label="Durée de préparation"
                hint={
                  durationMode === 'weeks'
                    ? `Pour un ${dist?.label ?? `${distKm} km`}, ${dist?.weeks ?? weeks} semaines sont conseillées.`
                    : 'La durée se déduit du jour de ta course.'
                }
              >
                <div className="app-segment !max-w-none" role="group" aria-label="Façon d’indiquer la durée">
                  {DURATION_MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={durationMode === m.id}
                      className={`app-segment-item cursor-pointer ${durationMode === m.id ? 'app-segment-item--on' : ''}`}
                      onClick={() => setDurationMode(m.id)}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mt-3">
                  {durationMode === 'weeks' ? (
                    <StepperControl
                      label="Durée de préparation"
                      value={weeks}
                      unit={weeks > 1 ? 'semaines' : 'semaine'}
                      min={WEEKS_MIN}
                      max={WEEKS_MAX}
                      onChange={setWeeks}
                    />
                  ) : (
                    <>
                      <label htmlFor="goal-race-date" className="sr-only">
                        Date de la course
                      </label>
                      <RaceDatePicker
                        id="goal-race-date"
                        value={raceDate}
                        min={dateBounds.min}
                        max={dateBounds.max}
                        onChange={onRaceDateChange}
                      />
                      <p
                        className={`mt-2 text-[12px] leading-4 ${
                          raceDate && raceWeeks == null ? 'text-red-200/90' : 'text-white/40'
                        }`}
                      >
                        {raceWeeks != null
                          ? `Soit ${raceWeeks} semaine${raceWeeks > 1 ? 's' : ''} de préparation.`
                          : raceDate
                            ? `Choisis une date entre ${WEEKS_MIN} et ${WEEKS_MAX} semaines d’ici.`
                            : 'Le jour de ta course — le plan s’arrête dessus.'}
                      </p>
                    </>
                  )}
                </div>
              </WizardField>

              <WizardField label="Séances par semaine" hint="Moyenne visée : le plan s’y adapte.">
                <div className="grid grid-cols-7 gap-2" role="radiogroup" aria-label="Séances par semaine">
                  {Array.from({ length: SESSIONS_MAX - SESSIONS_MIN + 1 }, (_, i) => i + SESSIONS_MIN).map((n) => {
                    const on = sessions === n
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        aria-label={`${n} séance${n > 1 ? 's' : ''} par semaine`}
                        onClick={() => setSessions(n)}
                        className={`h-12 cursor-pointer rounded-xl border font-display text-[17px] font-semibold tabular-nums transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${
                          on
                            ? 'border-brand-orange/60 bg-brand-orange/[0.12] text-white'
                            : 'border-white/[0.08] bg-white/[0.02] text-white/60 hover:border-white/[0.16] hover:text-white'
                        }`}
                      >
                        {n}
                      </button>
                    )
                  })}
                </div>
              </WizardField>

              <WizardField label="Chrono visé" hint="Un temps, une fourchette ou simplement finir.">
                <label htmlFor="goal-target" className="sr-only">
                  Chrono visé
                </label>
                <input
                  id="goal-target"
                  type="text"
                  className="field"
                  placeholder={`Ex. ${suggestions[1] ?? '50 min'}`}
                  value={targetTime}
                  onChange={(e) => setTargetTime(e.target.value)}
                  maxLength={120}
                  autoComplete="off"
                />
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTargetTime(s)}
                      aria-pressed={targetTime.trim() === s}
                      className={`chart-chip cursor-pointer ${
                        targetTime.trim() === s ? '!border-brand-orange/50 !bg-brand-orange/[0.12] !text-white' : ''
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </WizardField>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <section className="chart-card p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="stat-label">Ton objectif</p>
                    <p className="mt-2 font-display text-[24px] font-bold leading-8 tracking-[-0.02em] text-white">
                      {dist?.label ?? `${distKm} km`}
                      <span className="ml-2 text-[15px] font-semibold text-white/42">
                        {targetTime.trim() === TARGET_FINISH ? 'à finir' : `en ${formatTarget(targetTime)}`}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[13px] text-white/45">{TERRAIN_LABELS[terrain]}</p>
                  </div>
                  <button type="button" onClick={() => setStep(2)} className="chart-chip shrink-0 cursor-pointer">
                    Modifier
                  </button>
                </div>
                <dl className="mt-4">
                  <RecapRow label="Préparation" value={`${weeks} semaine${weeks > 1 ? 's' : ''}`} />
                  {raceDay ? <RecapRow label="Course le" value={raceDay} /> : null}
                  <RecapRow label="Séances" value={`${sessions} par semaine`} />
                </dl>
              </section>

              <FeasibilityReview
                text={feasibilityText}
                facts={feasibilityFacts}
                loading={feasibilityLoading}
                error={feasibilityErr}
                stravaLinked={stravaLinked}
              />
            </>
          ) : null}
        </div>

        <div className="mt-10 border-t border-white/[0.06] pt-6">
          {submitting ? (
            <div className="flex items-center gap-4" role="status">
              <ProgressRing
                done={createProgress?.done ?? 0}
                total={createProgress?.total ?? 1}
                label="Génération du plan"
                color="#fc4c02"
              />
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-white">Génération de ton plan…</p>
                <p className="mt-0.5 text-[12px] text-white/45">
                  {createProgress?.label || 'Le coach prépare tes semaines, compte une minute environ.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep((step - 1) as Step)}
                  className="inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[14px] font-medium text-white/60 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60"
                >
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
                  </svg>
                  Retour
                </button>
              ) : (
                <span />
              )}
              {step < 3 ? (
                <button
                  type="button"
                  className="btn-brand min-w-[160px] cursor-pointer px-6"
                  onClick={() => setStep((step + 1) as Step)}
                  disabled={step === 2 && !settingsReady}
                >
                  {step === 1 ? 'Continuer' : 'Voir l’avis du coach'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-brand min-w-[160px] cursor-pointer px-6"
                  onClick={() => void submitWizard()}
                  disabled={!canGenerate}
                >
                  Générer mon plan
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  const withTimeline = goals.map((g) => ({ goal: g, t: goalTimeline(g) }))
  const active = withTimeline
    .filter(({ t }) => !t.finished)
    .sort((a, b) => (a.t.daysLeft ?? Infinity) - (b.t.daysLeft ?? Infinity))
  const finished = withTimeline.filter(({ t }) => t.finished)
  const hasDetail = detail != null

  /*
   * Deux pages distinctes : la liste, puis l’objectif ouvert, seul à l’écran — ce
   * qu’on lit alors, c’est le plan, et le retour à la liste se fait par le fil
   * d’Ariane de l’en-tête.
   */
  const list = hasDetail ? null : (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <PageHeading
        kicker="Tes objectifs"
        title={
          active.length > 0
            ? `${active.length} course${active.length > 1 ? 's' : ''} en préparation`
            : 'Prépare ta prochaine course'
        }
        action={goals.length > 0 ? <CreateGoalCta onClick={openWizard} /> : null}
      />
      {loadingList ? (
        <div className="space-y-6" aria-busy="true">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="app-skeleton h-[118px]" />
            <div className="app-skeleton h-[118px]" />
            <div className="app-skeleton h-[118px]" />
            <div className="app-skeleton h-[118px]" />
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="app-skeleton h-[230px]" />
            <div className="app-skeleton h-[230px]" />
          </div>
        </div>
      ) : goals.length === 0 ? (
        <GoalsEmptyState onCreate={openWizard} />
      ) : (
        <>
          <GoalsSummary active={active.map(({ goal }) => goal)} finished={finished.length} />
          {active.length > 0 ? (
            <>
              <SectionTitle hint="La course la plus proche en premier">En cours</SectionTitle>
              <div className="grid gap-3 md:grid-cols-2">
                {active.map(({ goal }) => (
                  <GoalCard key={goal.id} goal={goal} onOpen={() => setSelectedId(goal.id)} />
                ))}
              </div>
            </>
          ) : null}
          {finished.length > 0 ? (
            <>
              <SectionTitle>Terminés</SectionTitle>
              <div className="grid gap-3 opacity-75 md:grid-cols-2">
                {finished.map(({ goal }) => (
                  <GoalCard key={goal.id} goal={goal} onOpen={() => setSelectedId(goal.id)} />
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </section>
  )

  const stravaNotice = detail?.plan_without_strava_data ? (
    stravaLinked ? (
      <div className="rounded-lg border border-white/[0.08] p-4 text-[13px] leading-relaxed text-white/70">
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
              <p className="mt-0.5 text-white/50">
                {replanProgress?.label || 'Le coach relit tes sorties.'}
              </p>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="mt-3 inline-flex h-9 cursor-pointer items-center rounded-lg border border-white/[0.12] px-3.5 text-[13px] font-medium text-white transition-colors hover:bg-white/[0.05]"
            onClick={() => void onReplanWithStrava()}
          >
            Recalculer avec mes sorties Strava
          </button>
        )}
        {goalReplanErr ? <p className="mt-2 text-red-200/90">{goalReplanErr}</p> : null}
      </div>
    ) : (
      <p className="text-[13px] leading-relaxed text-white/45">
        Ce plan s’appuie sur ton objectif seul.{' '}
        <Link
          href="/link-strava/"
          className="font-medium text-white/80 underline decoration-white/20 underline-offset-4 transition-colors hover:text-white hover:decoration-white/60"
        >
          Associe Strava
        </Link>{' '}
        pour caler conseils et calendrier sur tes sorties réelles.
      </p>
    )
  ) : null

  const programPanel = detail ? (
    <div role="tabpanel" id="goal-panel-program" aria-labelledby="goal-tab-program">
      <GoalProgram goal={detail} />
    </div>
  ) : null

  const guidancePanel = detail ? (
    <div role="tabpanel" id="goal-panel-guidance" aria-labelledby="goal-tab-guidance">
      <GoalGuidance plan={detail.plan} />
    </div>
  ) : null

  // Ce qui change le calendrier : l’onglet le relit alors.
  const planStamp = detail
    ? JSON.stringify([
        detail.sessions_per_week,
        detail.weeks,
        detail.planned_sessions?.length ?? 0,
        detail.plan?.length ?? 0,
        detail.calendar_day_offsets ?? null,
        detail.session_overrides ?? null,
        detail.unavailabilities ?? null,
      ])
    : ''

  const calendarPanel = detail && authToken ? (
    <div
      role="tabpanel"
      id="goal-panel-calendar"
      aria-labelledby="goal-tab-calendar"
      className="chart-card p-4 sm:p-5"
    >
      <GoalTrainingCalendar goalId={detail.id} token={authToken} plan={detail.plan} planStamp={planStamp} />
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
      className="flex h-[calc(100dvh-12rem)] max-h-[46rem] min-h-[24rem] flex-col chart-card p-4 sm:p-6"
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
        className="sticky bottom-0 -mx-4 mt-4 flex shrink-0 flex-col gap-2 border-t border-white/[0.06] bg-[#0d0f16] px-4 pb-2 pt-4 backdrop-blur-xl sm:-mx-6 sm:flex-row sm:px-6"
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
    <div className="mx-auto w-full max-w-[1400px] px-safe py-5 sm:py-6">
      {list}

      {detail ? (
        <main className="mx-auto min-w-0 max-w-6xl">
          <GoalDetailHeader
            goal={detail}
            onBack={() => setSelectedId(null)}
            onDelete={() => void onDeleteGoal()}
            deleting={goalDeleteBusy}
          />
          {goalDeleteErr ? (
            <p className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/[0.09] px-4 py-3 text-[13px] text-red-100">{goalDeleteErr}</p>
          ) : null}

          {stravaNotice ? <div className="mt-6">{stravaNotice}</div> : null}

          <div className="mt-8 space-y-6">
            <GoalTabs active={tab} onChange={setTab} />

            {tab === 'program'
              ? programPanel
              : tab === 'guidance'
                ? guidancePanel
                : tab === 'calendar'
                  ? calendarPanel
                  : coachPanel}
          </div>
        </main>
      ) : null}
    </div>
  )
}
