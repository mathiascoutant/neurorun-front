'use client'

import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import { Mark } from '@/components/Mark'
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

export function CheckoutPlanClient() {
  const router = useRouter()
  const params = useParams()
  const raw = (params?.plan as string | undefined)?.toLowerCase() ?? ''
  const plan = (raw === 'strava' || raw === 'performance' ? raw : null) as PaidPlan | null

  const [me, setMe] = useState<MeUser | null>(null)
  const [promo, setPromo] = useState('')
  const [preview, setPreview] = useState<{
    base_price_eur: number
    discount_percent: number
    final_price_eur: number
  } | null>(null)
  const [previewErr, setPreviewErr] = useState('')
  const [submitErr, setSubmitErr] = useState('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

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
      <main className="mx-auto max-w-lg px-5 py-20 text-center">
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
    <div className="relative min-h-screen">
      <header className="border-b border-white/[0.06] bg-surface-0/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/">
            <Mark />
          </Link>
          <Link href="/dashboard/" className="btn-quiet py-2 text-xs">
            Tableau de bord
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5 py-12">
        <p className="kicker mb-2">Paiement (simulation)</p>
        <h1 className="font-display text-2xl font-semibold text-white">{meta.title}</h1>
        <p className="mt-2 text-sm text-white/55">{meta.blurb}</p>

        <div className="panel mt-8 p-6 sm:p-8">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-white/45">Compte</dt>
              <dd className="text-right text-white/90">{me.email}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-white/45">Offre</dt>
              <dd className="text-right font-medium text-white">{plan}</dd>
            </div>
            {preview ? (
              <>
                <div className="flex justify-between gap-4">
                  <dt className="text-white/45">Prix de base</dt>
                  <dd className="text-right text-white">{preview.base_price_eur.toFixed(2)} € / mois</dd>
                </div>
                {preview.discount_percent > 0 ? (
                  <div className="flex justify-between gap-4">
                    <dt className="text-white/45">Réduction</dt>
                    <dd className="text-right text-brand-ice">− {preview.discount_percent} %</dd>
                  </div>
                ) : null}
                <div className="flex justify-between gap-4 border-t border-white/[0.06] pt-3">
                  <dt className="text-white/70">Total estimé</dt>
                  <dd className="text-right font-display text-lg font-semibold text-white">
                    {preview.final_price_eur.toFixed(2)} € / mois
                  </dd>
                </div>
              </>
            ) : (
              <p className="text-xs text-white/40">{loading ? 'Calcul du prix…' : 'Saisis un code ou valide pour voir le total.'}</p>
            )}
          </dl>

          <form className="mt-8 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-white/50">Code promo (optionnel)</label>
              <input
                className="field"
                value={promo}
                onChange={(e) => setPromo(e.target.value.toUpperCase())}
                placeholder="EX : ETE2026"
                autoComplete="off"
              />
            </div>
            {previewErr ? (
              <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                Aperçu : {previewErr}
              </div>
            ) : null}
            {submitErr ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {submitErr}
              </div>
            ) : null}
            <button type="submit" className="btn-brand w-full" disabled={busy}>
              {busy ? 'Validation…' : 'Confirmer et activer l’offre'}
            </button>
            <p className="text-center text-[11px] text-white/35">
              Le paiement par carte sera branché ici ; pour l’instant l’offre est activée côté compte après
              confirmation.
            </p>
          </form>
        </div>
      </main>
    </div>
  )
}
