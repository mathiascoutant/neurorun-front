'use client'

import Link from 'next/link'
import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { Goal } from '@/lib/api'
import { GoalTrainingCalendar } from '@/components/GoalTrainingCalendar'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import { createGoal, deleteGoal, fetchMe, getGoal, goalChat, listGoals, previewGoalFeasibility } from '@/lib/api'
import { getToken } from '@/lib/auth'

const DISTANCES: { km: number; label: string }[] = [
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21, label: '21 km — semi' },
  { km: 42, label: '42 km — marathon' },
]

type Step = 1 | 2 | 3 | 4 | 5

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
    if (!wizardOpen || step !== 5) return
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
    return (
      <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-display text-lg font-semibold">Nouvel objectif</h2>
          <button
            type="button"
            className="btn-quiet shrink-0 py-2 text-xs"
            onClick={() => setWizardOpen(false)}
            disabled={submitting}
          >
            Fermer
          </button>
        </div>
        <p className="text-xs text-white/45">
          Étape {step} sur 5 — à l’étape finale, l’avis de faisabilité s’affiche avant la génération du plan.
          {stravaLinked === false
            ? ' Sans Strava, l’avis est basé sur ton objectif uniquement ; tu pourras l’affiner après liaison.'
            : null}
        </p>
        {err ? (
          <div className="rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-100">{err}</div>
        ) : null}
        {step === 1 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-white/85">Distance cible</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {DISTANCES.map((d) => (
                <button
                  key={d.km}
                  type="button"
                  onClick={() => setDistKm(d.km)}
                  className={`rounded-xl border px-3 py-3 text-sm font-medium transition ${
                    distKm === d.km
                      ? 'border-brand-orange/50 bg-brand-orange/15 text-white'
                      : 'border-white/10 bg-white/[0.04] text-white/70 hover:border-white/20'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
            <button type="button" className="btn-brand mt-4 w-full" onClick={() => setStep(2)}>
              Suivant
            </button>
          </div>
        ) : null}
        {step === 2 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-white/85">Dans combien de semaines vises-tu ta course ?</p>
            <input
              type="number"
              min={1}
              max={52}
              value={weeks}
              onChange={(e) => setWeeks(Math.min(52, Math.max(1, Number(e.target.value) || 1)))}
              className="field border-white/[0.08] bg-surface-2/80"
            />
            <div className="flex gap-2">
              <button type="button" className="btn-quiet flex-1" onClick={() => setStep(1)}>
                Retour
              </button>
              <button type="button" className="btn-brand flex-1" onClick={() => setStep(3)}>
                Suivant
              </button>
            </div>
          </div>
        ) : null}
        {step === 3 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-white/85">Combien de séances par semaine (moyenne) ?</p>
            <input
              type="range"
              min={1}
              max={7}
              value={sessions}
              onChange={(e) => setSessions(Number(e.target.value))}
              className="w-full accent-brand-orange"
            />
            <p className="text-center text-sm text-brand-ice">{sessions} séance(s) / semaine</p>
            <div className="flex gap-2">
              <button type="button" className="btn-quiet flex-1" onClick={() => setStep(2)}>
                Retour
              </button>
              <button type="button" className="btn-brand flex-1" onClick={() => setStep(4)}>
                Suivant
              </button>
            </div>
          </div>
        ) : null}
        {step === 4 ? (
          <div className="space-y-4">
            <p className="text-sm font-medium text-white/85">Quel chrono vises-tu sur cette distance ?</p>
            <p className="text-xs text-white/45">
              Ex. « 48 min », « 1h40 », « moins de 4h » — précise l’unité pour que l’avis soit clair. Tu peux aussi
              indiquer « finir sans chrono précis ».
            </p>
            <input
              type="text"
              className="field border-white/[0.08] bg-surface-2/80"
              placeholder="Ex. 50 min, 1h30…"
              value={targetTime}
              onChange={(e) => setTargetTime(e.target.value)}
              maxLength={120}
              autoComplete="off"
            />
            <div className="flex gap-2">
              <button type="button" className="btn-quiet flex-1" onClick={() => setStep(3)}>
                Retour
              </button>
              <button
                type="button"
                className="btn-brand flex-1"
                onClick={() => setStep(5)}
                disabled={targetTime.trim().length < 2}
              >
                Suivant
              </button>
            </div>
          </div>
        ) : null}
        {step === 5 ? (
          <div className="space-y-4">
            <div className="panel space-y-2 p-4 text-sm text-white/75">
              <p>
                <span className="text-white/45">Course :</span>{' '}
                {DISTANCES.find((d) => d.km === distKm)?.label ?? `${distKm} km`}
              </p>
              <p>
                <span className="text-white/45">Chrono visé :</span> {targetTime.trim()}
              </p>
              <p>
                <span className="text-white/45">Délai :</span> {weeks} semaine(s)
              </p>
              <p>
                <span className="text-white/45">Rythme :</span> {sessions} séance(s) / semaine
              </p>
            </div>

            <div className="panel border-brand-orange/20 bg-brand-orange/[0.06] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-brand-ice/90">
                {stravaLinked ? 'Avis faisabilité (Strava + objectif)' : 'Avis faisabilité (objectif)'}
              </p>
              {feasibilityLoading ? (
                <p className="mt-3 text-sm text-white/45">Analyse en cours…</p>
              ) : null}
              {feasibilityErr ? (
                <p className="mt-3 text-sm text-red-200/90">{feasibilityErr}</p>
              ) : null}
              {!feasibilityLoading && feasibilityText ? (
                <SimplePlanBody text={feasibilityText} className="mt-3" />
              ) : null}
            </div>

            <p className="text-xs text-white/40">
              Quand tu es prêt, génère le plan détaillé (semaine par semaine). Cela complète l’avis ci-dessus ; compte
              jusqu’à une minute.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-quiet flex-1" onClick={() => setStep(4)} disabled={submitting}>
                Retour
              </button>
              <button
                type="button"
                className="btn-brand flex-1"
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
          </div>
        ) : null}
      </div>
    )
  }

  const listAside = (
    <aside
      className={`panel w-full shrink-0 p-4 ${detail ? 'lg:w-56 xl:w-60' : 'lg:w-72'}`}
    >
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold">Tes objectifs</h2>
          <button type="button" className="btn-quiet py-1.5 text-xs" onClick={openWizard}>
            + Créer
          </button>
        </div>
        {loadingList ? (
          <p className="mt-4 text-xs text-white/40">Chargement…</p>
        ) : goals.length === 0 ? (
          <p className="mt-4 text-xs leading-relaxed text-white/45">
            Aucun objectif encore. Crée-en un : avec Strava lié, le plan s’appuie sur tes sorties ; sinon il reste cohérent
            avec ton objectif et s’affine quand tu associes Strava.
          </p>
        ) : (
          <ul className="mt-4 space-y-1">
            {goals.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(g.id)}
                  className={`flex w-full flex-col rounded-lg px-2 py-2 text-left text-xs transition ${
                    selectedId === g.id
                      ? 'bg-white/[0.08] text-white'
                      : 'text-white/55 hover:bg-white/[0.04]'
                  }`}
                >
                  <span className="font-medium">{g.distance_label}</span>
                  <span className="text-[10px] text-white/35">
                    {g.target_time ? `Chrono visé ${g.target_time} · ` : ''}
                    {g.weeks} sem. · {g.sessions_per_week} séances/sem.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
  )

  return (
    <div
      className={`mx-auto flex w-full flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start ${
        detail ? 'max-w-[min(100%,1520px)] xl:px-6' : 'max-w-3xl'
      }`}
    >
      {listAside}
      <main className="min-w-0 flex-1">
        {!detail ? (
          <div className="panel p-6 text-sm text-white/45">
            Choisis un objectif dans la liste ou crée-en un nouveau.
          </div>
        ) : (
          <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-5">
            {/* Colonne plan : tuile « détail » puis tuile « calendrier » (scrolls séparés) */}
            <div className="flex w-full min-w-0 flex-col gap-6 lg:w-[min(100%,440px)] lg:shrink-0 xl:w-[min(100%,480px)]">
              <article className="panel flex min-h-0 w-full flex-col p-5 sm:p-6 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto">
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
                <article className="panel flex min-h-[16rem] min-w-0 max-h-[min(78dvh,42rem)] flex-col overflow-hidden p-5 sm:p-6 lg:max-h-[calc(100dvh-10rem)]">
                  <GoalTrainingCalendar
                    goalId={detail.id}
                    token={authToken}
                    planStamp={`${detail.sessions_per_week}-${detail.weeks}-${detail.planned_sessions?.length ?? 0}-${detail.plan?.length ?? 0}`}
                  />
                </article>
              ) : null}
            </div>

            {/* Coach : prend le reste de la largeur — bulles IA plus larges, zone de scroll plus haute */}
            <section className="panel flex min-h-0 w-full min-w-0 flex-1 flex-col p-5 sm:p-6 lg:max-h-[calc(100dvh-9rem)]">
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
