'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Goal } from '@/lib/api'
import { createGoal, getGoal, listGoals } from '@/lib/api'
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
      } finally {
        if (!off) setLoadingList(false)
      }
    })()
    return () => {
      off = true
    }
  }, [refresh])

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

  function openWizard() {
    setErr('')
    setWizardOpen(true)
    setStep(1)
    setDistKm(10)
    setWeeks(8)
    setSessions(3)
    setTargetTime('')
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
          Étape {step} sur 5 — le plan et un avis de faisabilité s’appuient sur ton historique Strava.
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
            <p className="text-sm font-medium text-white/85">Quel temps vises-tu sur cette distance ?</p>
            <p className="text-xs text-white/45">
              Ex. « 48 min », « 1h40 », « moins de 4h », ou « finir sans chrono précis ». L’IA jugera la faisabilité avec
              tes stats Strava, le nombre de semaines et tes séances par semaine.
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
                <span className="text-white/45">Temps visé :</span> {targetTime.trim()}
              </p>
              <p>
                <span className="text-white/45">Délai :</span> {weeks} semaine(s)
              </p>
              <p>
                <span className="text-white/45">Rythme :</span> {sessions} séance(s) / semaine
              </p>
            </div>
            <p className="text-xs text-white/40">
              L’IA commence par un avis de faisabilité (chrono vs tes sorties), puis détaille le plan. Jusqu’à 50
              activités Strava — compte jusqu’à une minute.
            </p>
            <div className="flex gap-2">
              <button type="button" className="btn-quiet flex-1" onClick={() => setStep(4)} disabled={submitting}>
                Retour
              </button>
              <button type="button" className="btn-brand flex-1" onClick={() => void submitWizard()} disabled={submitting}>
                {submitting ? 'Génération…' : 'Générer le plan'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start">
      <aside className="panel w-full shrink-0 p-4 lg:w-72">
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
            Aucun objectif encore. Crée-en un : le plan sera basé sur ton historique Strava.
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
                    {g.target_time ? `${g.target_time} · ` : ''}
                    {g.weeks} sem. · {g.sessions_per_week} séances/sem.
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <main className="min-w-0 flex-1">
        {!detail ? (
          <div className="panel p-6 text-sm text-white/45">
            Choisis un objectif dans la liste ou crée-en un nouveau.
          </div>
        ) : (
          <article className="panel p-5 sm:p-6">
            <header className="border-b border-white/[0.06] pb-4">
              <h3 className="font-display text-lg font-semibold text-white">{detail.distance_label}</h3>
              <p className="mt-1 text-xs text-white/45">
                {detail.target_time ? (
                  <>
                    Temps visé : <span className="text-white/70">{detail.target_time}</span>
                    <span className="text-white/25"> · </span>
                  </>
                ) : null}
                {detail.weeks} semaine(s) · {detail.sessions_per_week} séance(s)/semaine · créé le{' '}
                {new Date(detail.created_at).toLocaleDateString('fr-FR')}
              </p>
            </header>
            <div className="prose-plan mt-5 whitespace-pre-wrap text-sm leading-relaxed text-white/85">{detail.plan}</div>
          </article>
        )}
      </main>
    </div>
  )
}
