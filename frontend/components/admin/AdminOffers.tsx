'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminGetOfferConfig, adminPutOfferConfig, type AdminStats, type OfferConfigPayload } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { Badge, EmptyState, ErrorBanner, SkeletonRows, Switch, useNotify } from '@/components/admin/ui'
import { formatEuro, formatNumber, tierLabel } from '@/components/admin/format'

type FeatureKey = keyof OfferConfigPayload['tiers'][string]

/**
 * Libellés des fonctionnalités.
 *
 * Chaque ligne dit ce que l’utilisateur final gagne, pas le nom du flag : c’est
 * ce texte qu’on relit quand on hésite à ouvrir une fonction à un palier.
 */
const FEATURES: { key: FeatureKey; label: string; hint: string }[] = [
  { key: 'coach_chat', label: 'Coach IA', hint: 'Conversation et plans générés' },
  { key: 'strava_dashboard', label: 'Tableaux & Strava', hint: 'Synchronisation et analyses' },
  { key: 'goals', label: 'Objectifs & plans', hint: 'Calendrier d’entraînement' },
  { key: 'live_runs', label: 'Course GPS', hint: 'Suivi live depuis l’app' },
  { key: 'forecast', label: 'Prévision de course', hint: 'Estimation de chrono' },
  { key: 'circuit', label: 'Calendrier objectif', hint: 'Préparation d’une échéance' },
  { key: 'circuit_tracks', label: 'Parcours & classements', hint: 'Tracés partagés et chronos' },
]

const EMPTY_TIER: OfferConfigPayload['tiers'][string] = {
  coach_chat: false,
  strava_dashboard: false,
  goals: false,
  live_runs: false,
  forecast: false,
  circuit: false,
  circuit_tracks: false,
}

/**
 * Édition des paliers : libellé affiché, prix, contenu.
 *
 * L’écran travaille sur un brouillon local et n’envoie qu’au clic sur
 * « Enregistrer ». Une barre collante rappelle qu’il reste des changements —
 * quitter l’onglet en cours d’édition faisait perdre le travail sans un mot.
 */
export function AdminOffers({ stats, onSaved }: { stats: AdminStats | null; onSaved?: (cfg: OfferConfigPayload) => void }) {
  const notify = useNotify()
  const [cfg, setCfg] = useState<OfferConfigPayload | null>(null)
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const c = await adminGetOfferConfig(t)
      setCfg(c)
      setBaseline(JSON.stringify(c))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const dirty = cfg != null && JSON.stringify(cfg) !== baseline

  /* Filet de sécurité : la fermeture d’onglet avec des changements non envoyés. */
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const tierIds = useMemo(() => Object.keys(cfg?.tiers ?? {}).sort(), [cfg])

  function patchTier(tier: string, key: FeatureKey, value: boolean) {
    setCfg((prev) => {
      if (!prev) return prev
      const tiers = { ...prev.tiers }
      tiers[tier] = { ...(tiers[tier] ?? EMPTY_TIER), [key]: value }
      return { ...prev, tiers }
    })
  }

  async function save() {
    const t = getToken()
    if (!t || !cfg) return
    setSaving(true)
    setErr('')
    try {
      const out = await adminPutOfferConfig(t, cfg)
      setCfg(out)
      setBaseline(JSON.stringify(out))
      onSaved?.(out)
      notify('ok', 'Offres enregistrées. Un court délai de cache est possible côté app.')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur'
      setErr(message)
      notify('error', message)
    } finally {
      setSaving(false)
    }
  }

  if (loading && !cfg) {
    return <SkeletonRows rows={3} height={260} />
  }

  if (!cfg) {
    return (
      <div className="space-y-4">
        {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}
        <EmptyState
          title="Configuration des offres indisponible"
          body="Vérifie la connexion et tes droits administrateur, puis réessaie."
          action={
            <button type="button" className="btn-quiet cursor-pointer px-4 text-sm" onClick={() => void load()}>
              Recharger
            </button>
          }
        />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {err ? <ErrorBanner message={err} /> : null}

      <div className="app-note">
        <span>
          L’identifiant technique entre parenthèses est la clé stockée en base (abonnements, API) : il ne change pas
          depuis cet écran. Le <strong>nom affiché</strong> est ce que voient les visiteurs sur le site et dans l’app.
        </span>
      </div>

      {tierIds.map((tier) => {
        const isFree = (cfg.prices_eur?.[tier] ?? 0) === 0 && tier === 'standard'
        const enabled = FEATURES.filter((f) => cfg.tiers[tier]?.[f.key]).length
        const users = stats?.users_by_plan?.[tier]

        return (
          <section key={tier} className="panel p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-[17px] font-semibold text-white">
                  {tierLabel(tier, cfg.tier_display_names)}
                  <span className="ml-2 font-mono text-[11.5px] font-normal text-white/35">({tier})</span>
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone={isFree ? 'neutral' : 'brand'}>
                    {isFree ? 'Palier gratuit' : `${formatEuro(cfg.prices_eur?.[tier] ?? 0)} € / mois`}
                  </Badge>
                  <Badge tone="ice">
                    {enabled} / {FEATURES.length} fonctions
                  </Badge>
                  {users != null ? <Badge>{formatNumber(users)} compte{users > 1 ? 's' : ''}</Badge> : null}
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor={`tier-name-${tier}`} className="text-xs text-white/45">
                  Nom affiché (marketing)
                </label>
                <input
                  id={`tier-name-${tier}`}
                  type="text"
                  className="field mt-1 !min-h-[46px]"
                  placeholder={tier}
                  value={cfg.tier_display_names?.[tier] ?? ''}
                  onChange={(e) =>
                    setCfg((prev) =>
                      prev
                        ? { ...prev, tier_display_names: { ...prev.tier_display_names, [tier]: e.target.value } }
                        : prev,
                    )
                  }
                />
              </div>
              <div>
                <label htmlFor={`tier-price-${tier}`} className="text-xs text-white/45">
                  Prix mensuel (€)
                </label>
                {isFree ? (
                  <p className="mt-2.5 text-[13px] text-white/45">Gratuit — non modifiable ici.</p>
                ) : (
                  <input
                    id={`tier-price-${tier}`}
                    type="number"
                    step="0.01"
                    min={0}
                    className="field mt-1 !min-h-[46px] tabular-nums"
                    value={cfg.prices_eur?.[tier] ?? ''}
                    onChange={(e) =>
                      setCfg((prev) =>
                        prev
                          ? { ...prev, prices_eur: { ...prev.prices_eur, [tier]: parseFloat(e.target.value) || 0 } }
                          : prev,
                      )
                    }
                  />
                )}
              </div>
            </div>

            <h3 className="mt-6 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-white/40">
              Contenu de l’offre
            </h3>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
              {FEATURES.map((f) => (
                <Switch
                  key={f.key}
                  label={f.label}
                  hint={f.hint}
                  checked={cfg.tiers[tier]?.[f.key] ?? false}
                  onChange={(v) => patchTier(tier, f.key, v)}
                />
              ))}
            </div>
          </section>
        )
      })}

      {dirty ? (
        <div className="save-bar">
          <p className="flex items-center gap-2 text-[13px] text-white/80">
            <span className="h-2 w-2 shrink-0 rounded-full bg-brand-orange" aria-hidden />
            Modifications non enregistrées
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-quiet !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
              disabled={saving}
              onClick={() => {
                setCfg(JSON.parse(baseline) as OfferConfigPayload)
              }}
            >
              Annuler
            </button>
            <button
              type="button"
              className="btn-brand !min-h-[44px] cursor-pointer px-5 text-[13.5px]"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-quiet cursor-pointer px-4 text-[13.5px]"
            disabled={loading}
            onClick={() => void load()}
          >
            Recharger depuis le serveur
          </button>
          <p className="text-[12.5px] text-white/35">Aucune modification en attente.</p>
        </div>
      )}
    </div>
  )
}
