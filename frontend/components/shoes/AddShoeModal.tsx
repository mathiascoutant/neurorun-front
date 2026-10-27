'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  createShoe,
  fetchShoeCatalog,
  fetchShoeHistoryKm,
  type Shoe,
  type ShoeCatalogModel,
  type ShoeCategory,
  type ShoeCategoryInfo,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import { CATEGORY_LABELS, formatDay, formatShoeKm, matchesQuery, todayDay } from '@/lib/shoes'
import { ModalClose, ShoeModal } from '@/components/shoes/ShoeModal'

type Step = 'model' | 'since'

/** Ce que l’utilisateur a choisi à la première étape : un modèle du catalogue ou une saisie libre. */
type Choice =
  | { kind: 'catalog'; model: ShoeCatalogModel }
  | { kind: 'manual'; brand: string; model: string; category: ShoeCategory }

const CATEGORY_ORDER: ShoeCategory[] = ['daily', 'cushion', 'stability', 'tempo', 'race', 'trail']

function choiceTitle(c: Choice): string {
  return c.kind === 'catalog' ? `${c.model.brand} ${c.model.model}` : `${c.brand} ${c.model}`
}

/**
 * Ajout d’une paire en deux temps : quel modèle, puis depuis quand. La
 * deuxième étape relit l’historique pour proposer les kilomètres déjà faits.
 */
export function AddShoeModal({
  onClose,
  onCreated,
  hasOtherShoes,
}: {
  onClose: () => void
  onCreated: (shoe: Shoe) => void
  /** Le coureur a déjà des paires : l’estimation compte toutes ses courses, il faut le dire. */
  hasOtherShoes: boolean
}) {
  const [step, setStep] = useState<Step>('model')
  const [models, setModels] = useState<ShoeCatalogModel[]>([])
  const [categories, setCategories] = useState<ShoeCategoryInfo[]>([])
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [manual, setManual] = useState(false)
  const [brand, setBrand] = useState('')
  const [modelName, setModelName] = useState('')
  const [category, setCategory] = useState<ShoeCategory>('daily')
  const [choice, setChoice] = useState<Choice | null>(null)

  const [since, setSince] = useState(todayDay())
  const [estimate, setEstimate] = useState<{ km: number; runs: number; strava: boolean } | null>(null)
  const [estimating, setEstimating] = useState(false)
  const [initialKm, setInitialKm] = useState('0')
  const [kmTouched, setKmTouched] = useState(false)
  const [lifespan, setLifespan] = useState('')
  const [nickname, setNickname] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetchShoeCatalog(token)
      .then((d) => {
        setModels(d.models)
        setCategories(d.categories)
      })
      .catch(() => setCatalogError('Catalogue indisponible — tu peux saisir ta paire à la main.'))
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return models
    return models.filter((m) => matchesQuery(`${m.brand} ${m.model} ${CATEGORY_LABELS[m.category]}`, q))
  }, [models, query])

  // Kilomètres déjà faits : relus dans l’historique à chaque changement de date,
  // tant que le coureur n’a pas corrigé la valeur lui-même.
  useEffect(() => {
    if (step !== 'since' || !since) return
    const token = getToken()
    if (!token) return
    let cancelled = false
    setEstimating(true)
    const t = window.setTimeout(() => {
      fetchShoeHistoryKm(token, since)
        .then((d) => {
          if (cancelled) return
          setEstimate({ km: d.km, runs: d.runs, strava: d.strava_included })
          if (!kmTouched) setInitialKm(String(d.km).replace('.', ','))
        })
        .catch(() => {
          if (!cancelled) setEstimate(null)
        })
        .finally(() => {
          if (!cancelled) setEstimating(false)
        })
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(t)
    }
  }, [step, since, kmTouched])

  function lifespanOf(c: Choice): number {
    if (c.kind === 'catalog') return c.model.lifespan_km
    return categories.find((x) => x.id === c.category)?.lifespan_km ?? 700
  }

  function pick(c: Choice) {
    setChoice(c)
    setLifespan(String(lifespanOf(c)))
    setError(null)
    setStep('since')
  }

  function submitManual() {
    const b = brand.trim()
    const m = modelName.trim()
    if (!b || !m) {
      setError('Indique la marque et le modèle.')
      return
    }
    pick({ kind: 'manual', brand: b, model: m, category })
  }

  async function save() {
    if (!choice) return
    const token = getToken()
    if (!token) return
    const km = Number(initialKm.replace(',', '.'))
    const life = Number(lifespan.replace(',', '.'))
    if (!Number.isFinite(km) || km < 0) {
      setError('Kilomètres déjà faits invalides.')
      return
    }
    if (!Number.isFinite(life) || life < 100 || life > 3000) {
      setError('La durée de vie doit être comprise entre 100 et 3000 km.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const shoe = await createShoe(token, {
        ...(choice.kind === 'catalog'
          ? { catalog_id: choice.model.id }
          : { brand: choice.brand, model: choice.model, category: choice.category }),
        nickname: nickname.trim() || undefined,
        lifespan_km: life,
        started_on: since,
        initial_km: km,
      })
      onCreated(shoe)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
      setSaving(false)
    }
  }

  return (
    <ShoeModal onClose={onClose} labelledBy="add-shoe-title" width="max-w-xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 pb-4 pt-5">
        <div className="min-w-0">
          <p className="app-kicker">{step === 'model' ? 'Étape 1 sur 2' : 'Étape 2 sur 2'}</p>
          <h2 id="add-shoe-title" className="mt-1 font-display text-lg font-semibold text-white">
            {step === 'model' ? 'Quelle paire ?' : 'Depuis quand tu les as ?'}
          </h2>
        </div>
        <ModalClose onClick={onClose} />
      </div>

      {step === 'model' ? (
        <div className="space-y-4 px-5 py-5">
          {!manual ? (
            <>
              <input
                type="search"
                autoFocus
                className="field"
                placeholder="Rechercher : Pegasus, Novablast, Speedgoat…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher un modèle"
              />
              {catalogError ? <p className="text-sm text-amber-300/90">{catalogError}</p> : null}
              <ul className="max-h-[46dvh] space-y-1 overflow-y-auto pr-1" aria-label="Modèles">
                {filtered.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => pick({ kind: 'catalog', model: m })}
                      className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-left transition hover:border-white/[0.08] hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] font-semibold text-white/92">
                          {m.brand} <span className="font-medium text-white/75">{m.model}</span>
                        </span>
                        <span className="mt-0.5 block text-[12px] text-white/40">{CATEGORY_LABELS[m.category]}</span>
                      </span>
                      <span className="shrink-0 text-[12px] tabular-nums text-white/45">
                        ~{formatShoeKm(m.lifespan_km)}
                      </span>
                    </button>
                  </li>
                ))}
                {models.length > 0 && filtered.length === 0 ? (
                  <li className="px-3 py-6 text-center text-sm text-white/45">Aucun modèle ne correspond.</li>
                ) : null}
              </ul>
              <button
                type="button"
                className="btn-quiet w-full"
                onClick={() => {
                  setManual(true)
                  setError(null)
                  const [b, ...rest] = query.trim().split(/\s+/)
                  if (b && !brand) setBrand(b)
                  if (rest.length && !modelName) setModelName(rest.join(' '))
                }}
              >
                Mon modèle n’est pas dans la liste
              </button>
            </>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-white/55">Marque</span>
                  <input className="field" value={brand} maxLength={40} onChange={(e) => setBrand(e.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1.5 block text-[12px] font-medium text-white/55">Modèle</span>
                  <input
                    className="field"
                    value={modelName}
                    maxLength={40}
                    onChange={(e) => setModelName(e.target.value)}
                  />
                </label>
              </div>
              <div>
                <p className="mb-1.5 text-[12px] font-medium text-white/55">Type de chaussure</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORY_ORDER.map((c) => {
                    const on = category === c
                    const km = categories.find((x) => x.id === c)?.lifespan_km
                    return (
                      <button
                        key={c}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setCategory(c)}
                        className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition ${
                          on
                            ? 'border-brand-orange/50 bg-brand-orange/15 text-white'
                            : 'border-white/10 bg-white/[0.04] text-white/65 hover:text-white/90'
                        }`}
                      >
                        {CATEGORY_LABELS[c]}
                        {km ? <span className="ml-1.5 text-white/40">~{km} km</span> : null}
                      </button>
                    )
                  })}
                </div>
              </div>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <div className="flex gap-2">
                <button type="button" className="btn-quiet flex-1" onClick={() => setManual(false)}>
                  Retour au catalogue
                </button>
                <button type="button" className="btn-brand flex-1" onClick={submitManual}>
                  Continuer
                </button>
              </div>
            </>
          )}
        </div>
      ) : choice ? (
        <div className="space-y-5 px-5 py-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold text-white">{choiceTitle(choice)}</p>
              <p className="text-[12px] text-white/45">
                {CATEGORY_LABELS[choice.kind === 'catalog' ? choice.model.category : choice.category]}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 text-[12.5px] font-medium text-brand-orange hover:text-[#ff7a3d]"
              onClick={() => setStep('model')}
            >
              Changer
            </button>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-white/55">Date d’achat (ou de première sortie)</span>
            <input
              type="date"
              className="field [color-scheme:dark]"
              value={since}
              max={todayDay()}
              onChange={(e) => setSince(e.target.value)}
            />
          </label>

          <div>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/55">
                Kilomètres déjà faits avec cette paire
              </span>
              <input
                inputMode="decimal"
                className="field"
                value={initialKm}
                onChange={(e) => {
                  setKmTouched(true)
                  setInitialKm(e.target.value)
                }}
              />
            </label>
            <p className="mt-1.5 text-[12px] leading-[18px] text-white/45">
              {estimating
                ? 'Lecture de ton historique…'
                : estimate
                  ? `Depuis le ${formatDay(since)}, tu as couru ${formatShoeKm(estimate.km)} (${estimate.runs} sortie${
                      estimate.runs > 1 ? 's' : ''
                    }${estimate.strava ? ', Strava compris' : ''}).${
                      hasOtherShoes ? ' Si tu alternes avec une autre paire, ne garde que la part de celle-ci.' : ''
                    }`
                  : 'Indique le kilométrage approximatif.'}
            </p>
            {kmTouched && estimate ? (
              <button
                type="button"
                className="mt-1 text-[12px] font-medium text-brand-orange hover:text-[#ff7a3d]"
                onClick={() => {
                  setKmTouched(false)
                  setInitialKm(String(estimate.km).replace('.', ','))
                }}
              >
                Reprendre l’estimation
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/55">Durée de vie théorique (km)</span>
              <input
                inputMode="numeric"
                className="field"
                value={lifespan}
                onChange={(e) => setLifespan(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[12px] font-medium text-white/55">Surnom (facultatif)</span>
              <input
                className="field"
                placeholder="Les rouges, la paire du trail…"
                value={nickname}
                maxLength={40}
                onChange={(e) => setNickname(e.target.value)}
              />
            </label>
          </div>

          {error ? <p className="text-sm text-red-300">{error}</p> : null}

          <div className="flex gap-2">
            <button type="button" className="btn-quiet flex-1" onClick={() => setStep('model')}>
              Retour
            </button>
            <button type="button" className="btn-brand flex-1" disabled={saving} onClick={save}>
              {saving ? 'Ajout…' : 'Ajouter la paire'}
            </button>
          </div>
        </div>
      ) : null}
    </ShoeModal>
  )
}
