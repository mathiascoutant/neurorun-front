'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ApiError,
  checkoutPreview,
  confirmCheckoutSession,
  createCheckoutSession,
  fetchMe,
  fetchPaymentConfig,
  type MeUser,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { useTierLabel } from '@/lib/useOfferConfig'

type PaidPlan = 'strava' | 'performance'

/** recap : promo + total, puis redirection vers Stripe. returning : retour de checkout.stripe.com. */
type Phase = 'loading' | 'recap' | 'redirecting' | 'returning' | 'done'

/** Le nom commercial vient de l’admin (`tier_display_names`) ; seul le descriptif reste local. */
const BLURBS: Record<PaidPlan, string> = {
  strava: 'Synchronisation Strava, tableaux de bord et analyses sur tes sorties.',
  performance: 'IA enrichie, Strava, prévisions et plans circuit.',
}

function formatEUR(value: number) {
  return `${value.toFixed(2).replace('.', ',')} €`
}

export function CheckoutPlanClient() {
  const router = useRouter()
  const params = useParams()
  const raw = (params?.plan as string | undefined)?.toLowerCase() ?? ''
  const plan = (raw === 'strava' || raw === 'performance' ? raw : null) as PaidPlan | null

  const [phase, setPhase] = useState<Phase>('loading')
  const [me, setMe] = useState<MeUser | null>(null)
  const planLabel = useTierLabel(plan)
  const [promo, setPromo] = useState('')
  const [preview, setPreview] = useState<{
    base_price_eur: number
    discount_percent: number
    final_price_eur: number
  } | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [submitErr, setSubmitErr] = useState('')
  const [notice, setNotice] = useState('')
  const [stripeUnavailable, setStripeUnavailable] = useState('')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const returnHandled = useRef(false)

  /** Active l’offre côté API : le serveur relit la session chez Stripe avant de l’accorder. */
  const finalizeSession = useCallback(
    async (sessionId: string) => {
      const token = getToken()
      if (!token) throw new Error('Session expirée')
      await confirmCheckoutSession(token, sessionId)
      setPhase('done')
      router.replace('/dashboard/')
    },
    [router],
  )

  useEffect(() => {
    if (!plan) return
    const token = getToken()
    if (!token) {
      router.replace(`/login/?next=/checkout/${plan}/`)
      return
    }
    let off = false
    ;(async () => {
      try {
        const u = await fetchMe(token)
        if (off) return
        setMe(u)
      } catch {
        clearToken()
        router.replace(`/login/?next=/checkout/${plan}/`)
        return
      }
      try {
        const cfg = await fetchPaymentConfig()
        if (!off && !cfg.stripe_enabled) {
          setStripeUnavailable(
            'Le paiement par carte n’est pas configuré sur cette API (clés Stripe manquantes).',
          )
        }
      } catch {
        /* Non bloquant : la création de la session renverra l’erreur détaillée. */
      }

      const search = new URLSearchParams(window.location.search)
      const sessionId = search.get('session_id')
      if (sessionId && !returnHandled.current) {
        returnHandled.current = true
        if (off) return
        setPhase('returning')
        try {
          await finalizeSession(sessionId)
        } catch (err) {
          if (off) return
          setSubmitErr(err instanceof Error ? err.message : 'Erreur')
          window.history.replaceState(null, '', window.location.pathname)
          setPhase('recap')
        }
        return
      }
      if (off) return
      if (search.get('canceled')) {
        setNotice('Paiement annulé — ton offre n’a pas été modifiée.')
        window.history.replaceState(null, '', window.location.pathname)
      }
      setPhase('recap')
    })()
    return () => {
      off = true
    }
  }, [plan, router, finalizeSession])

  useEffect(() => {
    if (!plan || !me || phase !== 'recap') return
    const token = getToken()
    if (!token) return
    let off = false
    setLoadingPreview(true)
    setPreviewErr('')
    ;(async () => {
      try {
        const p = await checkoutPreview(token, plan, promo.trim() || undefined)
        if (!off) setPreview(p)
      } catch (e) {
        if (!off) {
          setPreview(null)
          setPreviewErr(e instanceof Error ? e.message : 'Erreur')
        }
      } finally {
        if (!off) setLoadingPreview(false)
      }
    })()
    return () => {
      off = true
    }
  }, [plan, me, promo, phase])

  /** Crée la session puis quitte l’app pour la page de paiement Stripe. */
  async function goToStripe() {
    const token = getToken()
    if (!token || !plan) return
    setPhase('redirecting')
    setSubmitErr('')
    setNotice('')
    try {
      const res = await createCheckoutSession(token, plan, promo.trim() || undefined)
      if (res.free) {
        setPhase('done')
        router.replace('/dashboard/')
        return
      }
      window.location.href = res.url
    } catch (e) {
      setSubmitErr(e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Erreur')
      setPhase('recap')
    }
  }

  if (!plan) {
    return (
      <main className="mx-auto max-w-lg px-safe py-20 text-center">
        <p className="text-sm text-white/60">Offre inconnue.</p>
        <Link href="/" className="btn-brand mt-6 inline-flex">
          Retour
        </Link>
      </main>
    )
  }

  if (!me || phase === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const busy = phase === 'redirecting' || phase === 'returning' || phase === 'done'

  return (
    <div className="member-app relative min-h-[100dvh] overflow-x-hidden">
      <header className="sticky top-0 z-10 border-b border-white/[0.04] bg-surface-0/75 pt-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-safe py-2.5 sm:py-3">
          <Link
            href="/"
            className="shrink-0 text-sm font-semibold text-white/90 underline decoration-transparent underline-offset-4 transition hover:decoration-white/25"
          >
            Accueil
          </Link>
          <div className="flex min-w-0 items-center justify-end gap-3 sm:gap-4">
            <span className="hidden text-[10px] font-medium uppercase tracking-wider text-white/35 md:inline">
              Paiement sécurisé par Stripe
            </span>
            <Link
              href="/dashboard/"
              className="shrink-0 text-xs font-medium text-white/40 underline decoration-white/15 underline-offset-4 transition hover:text-white/85 hover:decoration-white/30"
            >
              Tableau de bord
            </Link>
          </div>
        </div>
      </header>

      <main className="member-main-pad-b mx-auto max-w-5xl px-safe py-8 lg:py-14">
        <div className="mb-10">
          <p className="kicker mb-2">Paiement sécurisé</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Finaliser votre abonnement
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">{BLURBS[plan]}</p>
        </div>

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(380px,100%)] lg:items-start lg:gap-10">
          <div className="order-2 space-y-6 lg:order-1">
            <section className="panel overflow-hidden">
              <div className="border-b border-white/[0.06] px-6 py-4 sm:px-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-semibold text-white">Paiement</h2>
                    <p className="mt-0.5 text-xs text-white/45">
                      Tu seras redirigé vers la page sécurisée de Stripe
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md bg-white/[0.07] px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/70">
                    Stripe
                  </span>
                </div>
              </div>

              <div className="space-y-6 p-6 sm:p-8">
                {phase === 'returning' ? (
                  <div className="flex flex-col items-center gap-4 py-10 text-center">
                    <div className="h-10 w-10 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
                    <p className="text-sm text-white/60">Validation du paiement…</p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                      <label htmlFor="promo" className="mb-1.5 block text-xs font-medium text-white/50">
                        Code promo <span className="font-normal text-white/35">(optionnel)</span>
                      </label>
                      <input
                        id="promo"
                        className="field"
                        value={promo}
                        onChange={(e) => setPromo(e.target.value.toUpperCase())}
                        placeholder="EX : ETE2026"
                        autoComplete="off"
                        disabled={busy}
                      />
                    </div>

                    {notice ? (
                      <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white/70">
                        {notice}
                      </div>
                    ) : null}
                    {previewErr ? (
                      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        Aperçu du prix : {previewErr}
                      </div>
                    ) : null}
                    {stripeUnavailable ? (
                      <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                        {stripeUnavailable}
                      </div>
                    ) : null}
                    {submitErr ? (
                      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                        {submitErr}
                      </div>
                    ) : null}

                    <div className="flex items-start gap-3 text-xs leading-relaxed text-white/45">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-300/90">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" aria-hidden>
                          <path
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={1.8}
                            d="M6 12v6a2 2 0 002 2h8a2 2 0 002-2v-6M9 9V7a3 3 0 116 0v2m-8 4h10"
                          />
                        </svg>
                      </span>
                      <span>
                        Carte bancaire, Apple Pay ou Google Pay sur la page Stripe. Tes coordonnées
                        bancaires ne transitent jamais par NeuroRun.
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={goToStripe}
                      className="btn-brand w-full sm:min-h-[3.25rem] sm:text-base"
                      disabled={busy || loadingPreview || !preview}
                    >
                      {phase === 'redirecting'
                        ? 'Redirection vers Stripe…'
                        : preview
                          ? `Payer ${formatEUR(preview.final_price_eur)}`
                          : 'Payer'}
                    </button>
                  </>
                )}
              </div>
            </section>
          </div>

          <aside className="order-1 lg:order-2">
            <div className="panel p-5 sm:p-7 lg:sticky lg:top-[max(5.5rem,calc(env(safe-area-inset-top,0px)+4.5rem))]">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-white/50">
                Récapitulatif
              </h2>
              <div className="mt-5 space-y-4 border-b border-white/[0.06] pb-5">
                <div>
                  <p className="font-display text-lg font-semibold text-white">Offre {planLabel}</p>
                  <p className="mt-1 text-xs capitalize text-white/40">Facturation mensuelle</p>
                </div>
                <dl className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Compte</dt>
                    <dd className="max-w-[60%] truncate text-right text-white/85" title={me.email}>
                      {me.email}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-white/45">Formule</dt>
                    <dd className="text-right font-medium text-white">{planLabel}</dd>
                  </div>
                </dl>
              </div>

              <dl className="mt-5 space-y-2.5 text-sm">
                {!preview ? (
                  <p className="text-xs text-white/40">
                    {loadingPreview
                      ? 'Calcul du montant…'
                      : 'Saisis un code promo si besoin ; le total se met à jour automatiquement.'}
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-white/45">Sous-total</dt>
                      <dd className="tabular-nums text-white/90">{formatEUR(preview.base_price_eur)}</dd>
                    </div>
                    {preview.discount_percent > 0 ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-white/45">Réduction</dt>
                        <dd className="tabular-nums text-brand-ice">− {preview.discount_percent} %</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3 border-t border-white/[0.06] pt-4">
                      <dt className="text-sm font-medium text-white/75">Total aujourd’hui</dt>
                      <dd className="font-display text-xl font-semibold tabular-nums text-white">
                        {formatEUR(preview.final_price_eur)}
                      </dd>
                    </div>
                    <p className="pt-1 text-[11px] text-white/35">
                      Puis le même montant chaque mois. Résiliation depuis le compte.
                    </p>
                  </>
                )}
              </dl>

              <p className="mt-6 flex items-center gap-2 border-t border-white/[0.06] pt-5 text-[11px] text-white/35">
                <svg className="h-3.5 w-3.5 shrink-0 text-white/45" fill="currentColor" viewBox="0 0 20 20" aria-hidden>
                  <path
                    fillRule="evenodd"
                    d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
                    clipRule="evenodd"
                  />
                </svg>
                Coordonnées bancaires chiffrées et hébergées par Stripe.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
