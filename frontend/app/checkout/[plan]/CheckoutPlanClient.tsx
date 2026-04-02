'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import { ApiError, checkoutPreview, checkoutSubscribe, fetchMe, type MeUser } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

type PaidPlan = 'strava' | 'performance'

const LABELS: Record<PaidPlan, { title: string; blurb: string }> = {
  strava: {
    title: 'Offre Strava',
    blurb: 'Synchronisation Strava, tableaux de bord et analyses sur tes sorties.',
  },
  performance: {
    title: 'Offre Performance',
    blurb: 'IA enrichie, Strava, prévisions et plans circuit.',
  },
}

function formatCardNumber(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 16)
  return d.replace(/(\d{4})(?=\d)/g, '$1 ').trim()
}

function formatExpiry(raw: string) {
  const d = raw.replace(/\D/g, '').slice(0, 4)
  if (d.length <= 2) return d
  return `${d.slice(0, 2)}/${d.slice(2)}`
}

function CardBrandMarks() {
  return (
    <div className="flex items-center gap-2 opacity-80" aria-hidden>
      <span className="inline-flex h-7 w-11 items-center justify-center rounded bg-white/[0.07] text-[9px] font-bold tracking-tight text-white/90">
        VISA
      </span>
      <span className="inline-flex h-7 w-11 items-center justify-center rounded bg-white/[0.07] text-[8px] font-bold text-white/90">
        MC
      </span>
    </div>
  )
}

export function CheckoutPlanClient() {
  const router = useRouter()
  const params = useParams()
  const raw = (params?.plan as string | undefined)?.toLowerCase() ?? ''
  const plan = (raw === 'strava' || raw === 'performance' ? raw : null) as PaidPlan | null

  const [me, setMe] = useState<MeUser | null>(null)
  const [promo, setPromo] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvc, setCvc] = useState('')
  const [cardName, setCardName] = useState('')
  const [preview, setPreview] = useState<{
    base_price_eur: number
    discount_percent: number
    final_price_eur: number
  } | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [submitErr, setSubmitErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

  const digitsOnly = cardNumber.replace(/\D/g, '')
  const displayExpiry = expiry.length >= 4 ? expiry : 'MM/AA'

  useEffect(() => {
    if (!plan) return
    const token = getToken()
    if (!token) {
      router.replace(`/login/?next=/checkout/${plan}/`)
      return
    }
    ;(async () => {
      try {
        const u = await fetchMe(token)
        setMe(u)
      } catch {
        clearToken()
        router.replace(`/login/?next=/checkout/${plan}/`)
      }
    })()
  }, [plan, router])

  useEffect(() => {
    if (!plan || !me) return
    const token = getToken()
    if (!token) return
    let off = false
    setLoading(true)
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
        if (!off) setLoading(false)
      }
    })()
    return () => {
      off = true
    }
  }, [plan, me, promo])

  const ctaLabel = useMemo(() => {
    if (busy) return 'Traitement du paiement…'
    if (preview) return `Payer ${preview.final_price_eur.toFixed(2).replace('.', ',')} €`
    return 'Payer'
  }, [busy, preview])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const token = getToken()
    if (!token || !plan) return
    setBusy(true)
    setSubmitErr('')
    try {
      await checkoutSubscribe(token, plan, promo.trim() || undefined)
      router.replace('/dashboard/')
    } catch (e) {
      const msg =
        e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Erreur'
      setSubmitErr(msg)
    } finally {
      setBusy(false)
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

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const meta = LABELS[plan]

  return (
    <div className="relative min-h-[100dvh] overflow-x-hidden">
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
              Environnement de démonstration
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
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/55">{meta.blurb}</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_min(380px,100%)] lg:items-start lg:gap-10"
        >
          {/* Colonne paiement — en premier sur mobile pour le flux naturel */}
          <div className="order-2 space-y-6 lg:order-1">
            <section className="panel overflow-hidden">
              <div className="border-b border-white/[0.06] px-6 py-4 sm:px-8">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="font-display text-base font-semibold text-white">Carte bancaire</h2>
                    <p className="mt-0.5 text-xs text-white/45">Débit ou crédit — simulation visuelle</p>
                  </div>
                  <CardBrandMarks />
                </div>
              </div>

              <div className="space-y-6 p-6 sm:p-8">
                {/* Aperçu carte */}
                <div
                  className="relative overflow-hidden rounded-2xl border border-white/[0.1] p-6 shadow-lg"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(35, 42, 64, 0.95) 0%, rgba(18, 22, 38, 0.98) 45%, rgba(8, 12, 24, 1) 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.08), 0 24px 48px rgba(0,0,0,0.45)',
                  }}
                >
                  <div className="mb-8 flex items-start justify-between">
                    <div className="h-9 w-12 rounded-md bg-gradient-to-br from-amber-200/90 to-amber-500/80 opacity-90" />
                    <svg className="h-6 w-6 text-white/25" fill="none" viewBox="0 0 24 24" aria-hidden>
                      <path
                        stroke="currentColor"
                        strokeLinecap="round"
                        strokeWidth={1.5}
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <p className="font-mono text-lg tracking-[0.2em] text-white/95 sm:text-xl">
                    {digitsOnly.length === 0 ? '•••• •••• •••• ••••' : formatCardNumber(digitsOnly)}
                  </p>
                  <div className="mt-6 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-white/35">Titulaire</p>
                      <p className="mt-1 font-medium text-white/85">
                        {cardName.trim() || 'NOM SUR LA CARTE'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] font-semibold uppercase tracking-widest text-white/35">Expire</p>
                      <p className="mt-1 font-mono text-white/85">{displayExpiry}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label htmlFor="cc-number" className="mb-1.5 block text-xs font-medium text-white/50">
                      Numéro de carte
                    </label>
                    <input
                      id="cc-number"
                      className="field font-mono tracking-wide"
                      inputMode="numeric"
                      autoComplete="cc-number"
                      placeholder="1234 5678 9012 3456"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label htmlFor="cc-exp" className="mb-1.5 block text-xs font-medium text-white/50">
                        Date d’expiration
                      </label>
                      <input
                        id="cc-exp"
                        className="field font-mono"
                        inputMode="numeric"
                        autoComplete="cc-exp"
                        placeholder="MM/AA"
                        value={expiry}
                        onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                      />
                    </div>
                    <div>
                      <label htmlFor="cc-cvc" className="mb-1.5 block text-xs font-medium text-white/50">
                        Cryptogramme
                      </label>
                      <input
                        id="cc-cvc"
                        className="field font-mono"
                        inputMode="numeric"
                        autoComplete="cc-csc"
                        placeholder="123"
                        maxLength={4}
                        value={cvc}
                        onChange={(e) => setCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="cc-name" className="mb-1.5 block text-xs font-medium text-white/50">
                      Nom sur la carte
                    </label>
                    <input
                      id="cc-name"
                      className="field"
                      autoComplete="cc-name"
                      placeholder="Jean Dupont"
                      value={cardName}
                      onChange={(e) => setCardName(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

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
                  />
                </div>

                {previewErr ? (
                  <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                    Aperçu du prix : {previewErr}
                  </div>
                ) : null}
                {submitErr ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                    {submitErr}
                  </div>
                ) : null}

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
                      Connexion chiffrée (simulation). Aucune donnée de carte n’est envoyée au serveur : l’offre est
                      activée sur ton compte après confirmation.
                    </span>
                  </div>
                </div>

                <button type="submit" className="btn-brand w-full sm:min-h-[3.25rem] sm:text-base" disabled={busy}>
                  {ctaLabel}
                </button>
              </div>
            </section>
          </div>

          {/* Récap commande */}
          <aside className="order-1 lg:order-2">
            <div className="panel p-5 sm:p-7 lg:sticky lg:top-[max(5.5rem,calc(env(safe-area-inset-top,0px)+4.5rem))]">
              <h2 className="font-display text-sm font-semibold uppercase tracking-wider text-white/50">
                Récapitulatif
              </h2>
              <div className="mt-5 space-y-4 border-b border-white/[0.06] pb-5">
                <div>
                  <p className="font-display text-lg font-semibold text-white">{meta.title}</p>
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
                    <dd className="text-right font-medium text-white">{plan}</dd>
                  </div>
                </dl>
              </div>

              <dl className="mt-5 space-y-2.5 text-sm">
                {!preview ? (
                  <p className="text-xs text-white/40">
                    {loading ? 'Calcul du montant…' : 'Saisis un code promo si besoin ; le total se met à jour automatiquement.'}
                  </p>
                ) : (
                  <>
                    <div className="flex justify-between gap-3">
                      <dt className="text-white/45">Sous-total</dt>
                      <dd className="tabular-nums text-white/90">{preview.base_price_eur.toFixed(2).replace('.', ',')} €</dd>
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
                        {preview.final_price_eur.toFixed(2).replace('.', ',')} €
                      </dd>
                    </div>
                    <p className="pt-1 text-[11px] text-white/35">Puis le même montant chaque mois. Résiliation depuis le compte.</p>
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
                Données de carte&nbsp;: démonstration uniquement.
              </p>
            </div>
          </aside>
        </form>
      </main>
    </div>
  )
}
