'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  cancelBillingSubscription,
  fetchBillingState,
  resumeBillingSubscription,
  type BillingState,
} from '@/lib/api'
import { getToken } from '@/lib/auth'

function formatAmount(cents: number, currency = 'eur') {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100)
}

function formatDate(iso?: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

function planTitle(plan: string): string {
  if (plan === 'performance') return 'Performance'
  if (plan === 'strava') return 'Strava'
  return 'Standard'
}

/** Libellés des statuts Stripe susceptibles d’être affichés au client. */
function statusNote(state: BillingState): string {
  switch (state.status) {
    case 'past_due':
      return 'Dernier prélèvement refusé — Stripe va réessayer. Vérifie ta carte pour ne pas perdre ton offre.'
    case 'unpaid':
      return 'Paiement impossible après plusieurs tentatives. Ton offre a été suspendue.'
    case 'incomplete':
      return 'Paiement non finalisé.'
    default:
      return ''
  }
}

export function BillingPanel({ onPlanChange }: { onPlanChange?: () => void }) {
  const [state, setState] = useState<BillingState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [confirmingCancel, setConfirmingCancel] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    const token = getToken()
    if (!token) return
    try {
      const s = await fetchBillingState(token, { signal })
      if (!signal?.aborted) setState(s)
    } catch (e) {
      if (!signal?.aborted) setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    void load(ctrl.signal)
    return () => ctrl.abort()
  }, [load])

  async function run(action: 'cancel' | 'resume') {
    const token = getToken()
    if (!token) return
    setBusy(true)
    setErr('')
    try {
      const s = action === 'cancel'
        ? await cancelBillingSubscription(token)
        : await resumeBillingSubscription(token)
      setState(s)
      setConfirmingCancel(false)
      onPlanChange?.()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <section className="panel p-5 sm:p-6">
        <h2 className="font-display text-sm font-semibold text-white">Abonnement</h2>
        <p className="mt-3 text-sm text-white/40">Chargement…</p>
      </section>
    )
  }

  // Offre gratuite sans historique de paiement : rien à gérer ici.
  if (!state) return null

  const paidPlan = state.plan === 'strava' || state.plan === 'performance'

  /*
   * Offre payante active sans abonnement Stripe : code promo à 100 % (le serveur active
   * l’offre directement, sans créer d’abonnement) ou activation par un administrateur.
   * Sans ce cas, le panneau disparaissait entièrement et l’utilisateur cherchait en vain
   * un bouton de résiliation pour un abonnement qui n’existe pas.
   */
  if (!state.has_subscription && state.invoices.length === 0) {
    if (!paidPlan) return null
    return (
      <section className="panel p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-white">Abonnement</h2>
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.12] px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            Offerte
          </span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-white/60">
          Ton offre <span className="font-medium text-white/90">{planTitle(state.plan)}</span> est
          active <span className="font-medium text-white/90">sans abonnement payant</span> — code
          promo à 100 % ou activation par un administrateur.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-white/60">
          Aucun prélèvement n’est en cours : il n’y a donc rien à résilier. Pour revenir à l’offre
          gratuite, contacte un administrateur.
        </p>
        {err ? (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
            {err}
          </div>
        ) : null}
      </section>
    )
  }

  const note = statusNote(state)

  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="font-display text-sm font-semibold text-white">Abonnement</h2>

      {state.cancel_at_period_end && state.ends_at ? (
        <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-medium">Résiliation programmée</p>
          <p className="mt-1 text-amber-100/80">
            Plus aucun prélèvement. Tu gardes ton offre jusqu’au {formatDate(state.ends_at)}, puis ton
            compte bascule automatiquement sur l’offre gratuite.
          </p>
          <button
            type="button"
            onClick={() => run('resume')}
            className="btn-quiet mt-3 px-4 py-2 text-xs"
            disabled={busy}
          >
            {busy ? 'Traitement…' : 'Reprendre mon abonnement'}
          </button>
        </div>
      ) : null}

      {note ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {note}
        </div>
      ) : null}

      {state.has_subscription ? (
        <dl className="mt-4 space-y-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-white/45">Montant</dt>
            <dd className="tabular-nums text-white/90">
              {formatAmount(state.amount_cents ?? 0, state.currency)} / mois
            </dd>
          </div>
          {state.next_payment_at ? (
            <div className="flex justify-between gap-3">
              <dt className="text-white/45">Prochain prélèvement</dt>
              <dd className="text-right text-white/90">{formatDate(state.next_payment_at)}</dd>
            </div>
          ) : null}
          {state.ends_at && !state.cancel_at_period_end ? (
            <div className="flex justify-between gap-3">
              <dt className="text-white/45">Fin des droits</dt>
              <dd className="text-right text-white/90">{formatDate(state.ends_at)}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {state.invoices.length > 0 ? (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-white/45">
            Prélèvements
          </h3>
          <ul className="mt-3 divide-y divide-white/[0.05]">
            {state.invoices.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-white/70">{formatDate(inv.paid_at)}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums text-white/90">
                    {formatAmount(inv.amount_paid_cents, inv.currency)}
                  </span>
                  {inv.hosted_url ? (
                    <a
                      href={inv.hosted_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-brand-ice/85 underline decoration-white/15 underline-offset-2 transition hover:text-white"
                    >
                      Reçu
                    </a>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {err ? (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
          {err}
        </div>
      ) : null}

      {state.has_subscription && !state.cancel_at_period_end ? (
        <div className="mt-6 border-t border-white/[0.06] pt-5">
          {confirmingCancel ? (
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
              <p className="text-sm text-white/75">Résilier ton abonnement ?</p>
              <p className="mt-1 text-xs leading-relaxed text-white/45">
                Aucun nouveau prélèvement ne sera effectué. Tu conserves toutes les fonctionnalités
                {state.next_payment_at ? ` jusqu’au ${formatDate(state.next_payment_at)}` : ' jusqu’à la fin de la période payée'},
                puis ton compte passe à l’offre gratuite. Aucun remboursement du mois en cours.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => run('cancel')}
                  className="btn-quiet border-red-500/30 px-4 py-2 text-xs text-red-100 hover:border-red-500/50"
                  disabled={busy}
                >
                  {busy ? 'Résiliation…' : 'Confirmer la résiliation'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingCancel(false)}
                  className="btn-quiet px-4 py-2 text-xs"
                  disabled={busy}
                >
                  Garder mon offre
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingCancel(true)}
              className="text-xs text-white/40 underline decoration-white/15 underline-offset-4 transition hover:text-white/80"
            >
              Résilier mon abonnement
            </button>
          )}
        </div>
      ) : null}
    </section>
  )
}
