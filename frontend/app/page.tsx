'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mark } from '@/components/Mark'
import { RevealOnScroll } from '@/components/RevealOnScroll'
import { fetchMe, fetchPublicOfferConfig } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

const DEFAULT_STRAVA_EUR = 3.99
const DEFAULT_PERF_EUR = 7.99

type OfferId = 'standard' | 'strava' | 'performance'

const OFFER_ACTIVE_SHADOW: Record<OfferId, string> = {
  standard:
    'z-[1] shadow-[0_0_0_2px_rgba(255,255,255,0.22),0_0_28px_rgba(255,255,255,0.12),0_0_52px_rgba(103,232,249,0.1)]',
  strava:
    'z-[1] shadow-[0_0_0_2px_rgba(252,76,2,0.55),0_0_32px_rgba(252,76,2,0.32),0_0_56px_rgba(252,76,2,0.15)]',
  performance:
    'z-[1] shadow-[0_0_0_2px_rgba(103,232,249,0.45),0_0_32px_rgba(103,232,249,0.22),0_0_52px_rgba(103,232,249,0.12)]',
}

const OFFER_HOVER_SHADOW: Record<OfferId, string> = {
  standard:
    'lg:hover:z-[1] lg:hover:shadow-[0_0_0_2px_rgba(255,255,255,0.18),0_0_28px_rgba(255,255,255,0.1)]',
  strava:
    'lg:hover:z-[1] lg:hover:shadow-[0_0_0_2px_rgba(252,76,2,0.45),0_0_36px_rgba(252,76,2,0.22)]',
  performance:
    'lg:hover:z-[1] lg:hover:shadow-[0_0_0_2px_rgba(103,232,249,0.35),0_0_32px_rgba(103,232,249,0.18)]',
}

function formatMonthlyEUR(n: number): string {
  return `${n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function CheckIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={`shrink-0 text-brand-ice/90 ${className}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
      <path
        fillRule="evenodd"
        d="M16.704 4.153a.75.75 0 01.143 1.052l-7.5 10.5a.75.75 0 01-1.127.077l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 6.951-9.731a.75.75 0 011.052-.143z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export default function HomePage() {
  const router = useRouter()
  const [gate, setGate] = useState<'checking' | 'landing'>('checking')
  const [priceStravaEur, setPriceStravaEur] = useState(DEFAULT_STRAVA_EUR)
  const [pricePerfEur, setPricePerfEur] = useState(DEFAULT_PERF_EUR)
  const offersScrollRef = useRef<HTMLDivElement | null>(null)
  const standardOfferRef = useRef<HTMLDivElement | null>(null)
  const stravaOfferRef = useRef<HTMLDivElement | null>(null)
  const performanceOfferRef = useRef<HTMLDivElement | null>(null)
  const [carouselActive, setCarouselActive] = useState<OfferId | null>(null)

  useEffect(() => {
    let off = false
    ;(async () => {
      try {
        const cfg = await fetchPublicOfferConfig()
        if (off) return
        const p = cfg.prices_eur ?? {}
        if (typeof p.strava === 'number' && !Number.isNaN(p.strava)) setPriceStravaEur(p.strava)
        if (typeof p.performance === 'number' && !Number.isNaN(p.performance)) setPricePerfEur(p.performance)
      } catch {
        /* garde les défauts si l’API est injoignable */
      }
    })()
    return () => {
      off = true
    }
  }, [])

  useEffect(() => {
    let off = false
    ;(async () => {
      const token = getToken()
      if (!token) {
        if (!off) setGate('landing')
        return
      }
      try {
        await fetchMe(token)
        if (off) return
        router.replace('/dashboard/')
      } catch {
        clearToken()
        if (!off) setGate('landing')
      }
    })()
    return () => {
      off = true
    }
  }, [router])

  /* Carrousel : centrage Strava + halo sur la carte au centre (mobile) */
  useEffect(() => {
    if (gate !== 'landing') return
    const scroller = offersScrollRef.current
    if (!scroller) return

    const isDesktop = () => window.matchMedia('(min-width: 1024px)').matches

    const syncActive = () => {
      if (isDesktop()) {
        setCarouselActive(null)
        return
      }
      const centerX = scroller.getBoundingClientRect().left + scroller.clientWidth / 2
      const items: { id: OfferId; el: HTMLElement | null }[] = [
        { id: 'standard', el: standardOfferRef.current },
        { id: 'strava', el: stravaOfferRef.current },
        { id: 'performance', el: performanceOfferRef.current },
      ]
      let best: OfferId = 'strava'
      let bestD = Infinity
      for (const { id, el } of items) {
        if (!el) continue
        const r = el.getBoundingClientRect()
        const mid = r.left + r.width / 2
        const d = Math.abs(mid - centerX)
        if (d < bestD) {
          bestD = d
          best = id
        }
      }
      setCarouselActive(best)
    }

    const centerStrava = () => {
      const mid = stravaOfferRef.current
      if (!scroller || !mid || isDesktop()) return
      const sc = scroller.getBoundingClientRect()
      const m = mid.getBoundingClientRect()
      const next =
        scroller.scrollLeft + (m.left - sc.left) - (scroller.clientWidth - mid.clientWidth) / 2
      const max = scroller.scrollWidth - scroller.clientWidth
      scroller.scrollTo({ left: Math.max(0, Math.min(next, max)), behavior: 'auto' })
    }

    let scrollRaf = 0
    const onScroll = () => {
      cancelAnimationFrame(scrollRaf)
      scrollRaf = requestAnimationFrame(syncActive)
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        centerStrava()
        requestAnimationFrame(syncActive)
      })
    })

    scroller.addEventListener('scroll', onScroll, { passive: true })
    const mq = window.matchMedia('(min-width: 1024px)')
    const onMq = () => syncActive()
    mq.addEventListener('change', onMq)
    syncActive()

    return () => {
      mq.removeEventListener('change', onMq)
      scroller.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(scrollRaf)
    }
  }, [gate])

  if (gate === 'checking') {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4">
        <div className="relative h-14 w-14">
          <div className="absolute inset-0 rounded-2xl border-2 border-brand-orange/25" />
          <div className="absolute inset-0 animate-spin rounded-2xl border-2 border-transparent border-t-brand-orange [animation-duration:0.85s]" />
        </div>
        <p className="text-sm text-white/45">Synchronisation…</p>
      </main>
    )
  }

  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_75%_55%_at_50%_-5%,black,transparent)]" />
        <div className="absolute -left-32 top-24 h-80 w-80 rounded-full bg-brand-orange/18 blur-[100px]" />
        <div className="absolute bottom-20 right-0 h-96 w-96 rounded-full bg-brand-ice/10 blur-[120px]" />
        <div className="absolute left-1/2 top-[26%] h-px w-[min(92vw,40rem)] -translate-x-1/2 bg-gradient-to-r from-transparent via-brand-orange/20 to-transparent" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-surface-0/75 pt-safe backdrop-blur-2xl supports-[backdrop-filter]:bg-surface-0/55">
        <div className="mx-auto flex max-w-6xl flex-nowrap items-center justify-between gap-2 px-safe py-3 sm:gap-4 sm:px-8 sm:py-3.5">
          <Link href="/" className="min-w-0 shrink transition hover:opacity-90">
            <span className="sm:hidden">
              <Mark compact />
            </span>
            <span className="hidden sm:block">
              <Mark />
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3" aria-label="Accès rapide">
            <Link
              href="/login/"
              className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white sm:px-4 sm:py-2 sm:text-sm"
            >
              Connexion
            </Link>
            <a
              href="#offres"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/[0.14] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/80 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white sm:px-4 sm:py-2 sm:text-sm"
            >
              <span className="sm:hidden">Offres</span>
              <span className="hidden sm:inline">Voir les offres</span>
            </a>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-16 pt-10 sm:px-8 sm:pb-24 sm:pt-12">
        <div className="lg:grid lg:grid-cols-[1fr_min(18.5rem,32%)] lg:items-end lg:gap-14">
          <RevealOnScroll variant="fade-up" className="min-w-0">
            <div className="text-center lg:text-left">
            <p className="kicker mb-3 text-[10px] tracking-[0.24em] sm:mb-4 sm:text-[11px]">Coach d&apos;entraînement</p>
            <h1 className="font-display text-[1.7rem] font-semibold leading-[1.12] tracking-tight text-white sm:text-5xl sm:leading-[1.08] lg:text-[2.65rem]">
              NeuroRun : ton rythme,{' '}
              <span className="bg-gradient-to-r from-brand-ice via-white to-brand-orange bg-clip-text text-transparent">
                une IA qui s&apos;adapte
              </span>
            </h1>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-white/55 sm:mt-5 sm:text-base lg:mx-0 lg:max-w-md">
              Du chat gratuit aux analyses Strava et aux plans circuit : une seule progression de tarifs, sans
              redondance inutile dans l&apos;expérience.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2 sm:mt-6 lg:justify-start">
              {['IA contextuelle', 'Strava optionnel', 'Circuit'].map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1 text-[11px] font-medium text-white/58 backdrop-blur-sm sm:text-xs"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          </RevealOnScroll>
          <RevealOnScroll
            variant="fade-right"
            delayMs={90}
            className="relative mx-auto mt-10 hidden max-h-[15rem] min-h-[13rem] w-full max-w-[19rem] lg:mx-0 lg:mt-0 lg:block lg:max-h-none lg:min-h-[16.5rem] lg:max-w-none"
          >
            <div className="absolute inset-0 rounded-[1.65rem] border border-white/[0.09] bg-gradient-to-br from-white/[0.06] via-transparent to-brand-orange/[0.07] shadow-[0_28px_90px_rgba(0,0,0,0.38)]" />
            <div className="absolute inset-px rounded-[1.6rem] bg-surface-0/45 backdrop-blur-xl" />
            <div className="relative flex h-full min-h-[13rem] flex-col justify-between p-6 lg:min-h-[16.5rem]">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-orange/95">Vue rapide</p>
                <p className="mt-2.5 font-display text-sm font-medium text-white/92">Coach + données</p>
                <p className="mt-1.5 text-xs leading-relaxed text-white/42">
                  Historique et ressenti injectés dans le dialogue quand tu actives Strava.
                </p>
              </div>
              <div className="flex items-end gap-1.5 pt-4">
                <div className="h-10 flex-1 rounded-lg bg-gradient-to-t from-brand-ice/30 to-white/[0.02]" />
                <div className="h-14 flex-[1.15] rounded-lg bg-gradient-to-t from-brand-orange/35 to-white/[0.02]" />
                <div className="h-8 flex-1 rounded-lg bg-gradient-to-t from-white/15 to-transparent" />
              </div>
            </div>
          </RevealOnScroll>
        </div>

        <div
          id="offres"
          ref={offersScrollRef}
          className={
            '-mx-4 mt-12 flex snap-x snap-mandatory gap-3 overflow-x-auto overflow-y-visible pb-1 pt-0.5 scroll-mt-24 ' +
            'max-lg:scroll-px-[max(1rem,calc(50%-min(34vw,8.5rem)))] max-lg:px-[max(1rem,calc(50%-min(34vw,8.5rem)))] ' +
            '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' +
            'lg:mx-0 lg:mt-16 lg:grid lg:grid-cols-3 lg:scroll-p-0 lg:gap-5 lg:snap-none lg:overflow-visible lg:px-0 lg:pb-0 lg:pt-0 lg:items-stretch'
          }
        >
          {/* Offre 1 — Standard gratuit */}
          <RevealOnScroll
            ref={standardOfferRef}
            className="h-full w-[min(68vw,17rem)] shrink-0 snap-center"
            delayMs={0}
          >
            <section
              className={
                'panel relative flex h-full flex-col rounded-3xl p-5 transition-shadow duration-300 ease-out ' +
                'lg:min-h-0 lg:w-full lg:p-8 ' +
                OFFER_HOVER_SHADOW.standard +
                (carouselActive === 'standard' ? ` ${OFFER_ACTIVE_SHADOW.standard}` : '')
              }
            >
            <p className="kicker text-white/50">Standard</p>
            <h2 className="mt-1.5 font-display text-lg font-semibold text-white lg:mt-2 lg:text-xl">IA classique</h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white lg:text-3xl">
              0 €<span className="text-sm font-normal text-white/40 lg:text-base"> / mois</span>
            </p>
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-white/45 lg:mt-3 lg:line-clamp-none lg:text-sm">
              Coach IA standard : conseils et dialogue sans Strava.
            </p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-xs text-white/75 lg:mt-6 lg:gap-3 lg:text-sm">
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                Chat coach IA classique
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                Compte gratuit
              </li>
              <li className="flex items-start gap-2 text-white/40">
                <span className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-white/20 lg:mt-1 lg:h-4 lg:w-4" />
                Pas de Strava
              </li>
            </ul>
            <Link href="/register/" className="btn-quiet mt-5 w-full justify-center text-xs sm:text-sm lg:mt-auto">
              Compte gratuit
            </Link>
          </section>
          </RevealOnScroll>

          {/* Offre 2 — Strava */}
          <RevealOnScroll
            ref={stravaOfferRef}
            className="h-full w-[min(68vw,17rem)] shrink-0 snap-center"
            delayMs={70}
          >
            <section
              className={
                'panel relative flex h-full flex-col overflow-hidden rounded-3xl p-5 transition-shadow duration-300 ease-out ' +
                (carouselActive === 'strava'
                  ? OFFER_ACTIVE_SHADOW.strava
                  : 'shadow-[0_0_40px_rgba(252,76,2,0.1)]') +
                ' lg:w-full lg:p-8 ' +
                OFFER_HOVER_SHADOW.strava
              }
            >
            <div className="absolute right-3 top-3 rounded-full bg-brand-orange/20 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-brand-orange lg:right-4 lg:top-4 lg:px-2.5 lg:text-[10px]">
              Populaire
            </div>
            <p className="kicker text-brand-orange">Strava</p>
            <h2 className="mt-1.5 pr-16 font-display text-lg font-semibold text-white lg:mt-2 lg:pr-0 lg:text-xl">
              Strava connecté
            </h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white lg:text-3xl">
              {formatMonthlyEUR(priceStravaEur)}
              <span className="text-sm font-normal text-white/40 lg:text-base"> / mois</span>
            </p>
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-white/45 lg:mt-3 lg:line-clamp-none lg:text-sm">
              Sync Strava : analyses basées sur tes sorties réelles.
            </p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-xs text-white/75 lg:mt-6 lg:gap-3 lg:text-sm">
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                Tout du Standard
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                Synchronisation Strava
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                Tendances & tableaux de bord
              </li>
            </ul>
            <Link
              href="/register/?next=/checkout/strava/"
              className="btn-brand mt-5 w-full justify-center text-xs sm:text-sm lg:mt-auto"
            >
              Choisir Strava
            </Link>
          </section>
          </RevealOnScroll>

          {/* Offre 3 — Complet */}
          <RevealOnScroll
            ref={performanceOfferRef}
            className="h-full w-[min(68vw,17rem)] shrink-0 snap-center"
            delayMs={140}
          >
            <section
              className={
                'panel relative flex h-full flex-col rounded-3xl border-brand-ice/20 bg-surface-2/40 p-5 transition-shadow duration-300 ease-out ' +
                'lg:w-full lg:p-8 ' +
                OFFER_HOVER_SHADOW.performance +
                (carouselActive === 'performance' ? ` ${OFFER_ACTIVE_SHADOW.performance}` : '')
              }
            >
            <p className="kicker text-brand-ice/90">Performance</p>
            <h2 className="mt-1.5 font-display text-lg font-semibold text-white lg:mt-2 lg:text-xl">IA + Strava + circuit</h2>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-white lg:text-3xl">
              {formatMonthlyEUR(pricePerfEur)}
              <span className="text-sm font-normal text-white/40 lg:text-base"> / mois</span>
            </p>
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-white/45 lg:mt-3 lg:line-clamp-none lg:text-sm">
              Complet : IA avancée, Strava et plans sur circuit.
            </p>
            <ul className="mt-4 flex flex-1 flex-col gap-2 text-xs text-white/75 lg:mt-6 lg:gap-3 lg:text-sm">
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                IA + contexte Strava
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                Prévisions & objectifs
              </li>
              <li className="flex items-start gap-2">
                <CheckIcon className="h-3.5 w-3.5 lg:h-4 lg:w-4" />
                Plans circuit
              </li>
            </ul>
            <Link
              href="/register/?next=/checkout/performance/"
              className="btn-quiet mt-5 w-full justify-center border-brand-ice/25 bg-brand-ice/5 text-xs hover:bg-brand-ice/10 sm:text-sm lg:mt-auto"
            >
              Performance
            </Link>
          </section>
          </RevealOnScroll>
        </div>

        <section className="mt-20 sm:mt-28" aria-labelledby="how-heading">
          <RevealOnScroll variant="fade-up">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between sm:gap-10">
            <div className="flex gap-4">
              <div
                className="hidden w-1 shrink-0 rounded-full bg-gradient-to-b from-brand-orange via-brand-orange/50 to-brand-ice/80 sm:block sm:h-[4.5rem]"
                aria-hidden
              />
              <div className="text-center sm:text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-ice/75">Parcours</p>
                <h2 id="how-heading" className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                  Trois étapes
                </h2>
                <p className="mt-2 max-w-md text-sm text-white/45">
                  Compte, montée en gamme optionnelle, puis pilotage depuis le dashboard — dans l&apos;ordre naturel.
                </p>
              </div>
            </div>
          </div>
          </RevealOnScroll>
          <ol className="mt-10 divide-y divide-white/[0.07] border-y border-white/[0.07]">
            {[
              {
                title: 'Crée ton compte',
                body: 'Inscription gratuite, coach IA Standard immédiat — zéro friction pour tester le ton du dialogue.',
              },
              {
                title: 'Monte en gamme si besoin',
                body: 'Strava pour le contexte réel, Performance pour prévisions et plans circuit. Tu restes maître du passage à la caisse.',
              },
              {
                title: 'Pilotage depuis le dashboard',
                body: 'Chat, tendances et suivi selon ton offre : tout part du même espace une fois connecté.',
              },
            ].map((step, i) => (
              <li key={step.title}>
                <RevealOnScroll
                  variant={i % 2 === 0 ? 'fade-left' : 'fade-right'}
                  delayMs={i * 75}
                  className="min-w-0"
                >
                  <div className="group flex gap-5 py-7 sm:gap-8 sm:py-8">
                    <span className="w-8 shrink-0 pt-0.5 font-display text-xl font-bold tabular-nums text-white/[0.15] transition duration-300 group-hover:text-brand-orange/90 sm:w-10 sm:text-2xl">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-base font-semibold text-white sm:text-lg">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-white/48 sm:max-w-xl">{step.body}</p>
                    </div>
                  </div>
                </RevealOnScroll>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-20 sm:mt-28" aria-labelledby="benefits-heading">
          <RevealOnScroll variant="fade-up">
            <div className="max-w-xl">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-brand-orange/85">Différenciation</p>
              <h2 id="benefits-heading" className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Au-delà du chat
              </h2>
              <p className="mt-2 text-sm text-white/45">
                Du coaching dialogue à la préparation piste : les briques utiles, sans répéter quatre fois la même promesse.
              </p>
            </div>
          </RevealOnScroll>
          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-12 lg:grid-rows-2 lg:gap-4">
            <li className="sm:col-span-2 lg:col-span-7 lg:row-span-2">
              <RevealOnScroll variant="zoom" delayMs={0} className="h-full">
                <div className="relative h-full overflow-hidden rounded-3xl border border-brand-orange/22 bg-gradient-to-br from-brand-orange/[0.14] via-surface-2/35 to-transparent p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:p-7 lg:p-8">
                  <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-brand-orange/20 blur-2xl" />
                  <h3 className="font-display text-lg font-semibold text-white sm:text-xl">Conseils contextualisés</h3>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-white/52">
                    Un dialogue qui s&apos;aligne sur ton ressenti et, avec Strava, sur tes sorties réelles — pas un générique
                    copié-collé.
                  </p>
                </div>
              </RevealOnScroll>
            </li>
            <li className="lg:col-span-5">
              <RevealOnScroll variant="fade-right" delayMs={80} className="h-full">
                <div className="h-full rounded-3xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-md transition hover:border-white/[0.12] hover:bg-white/[0.04] sm:p-6">
                  <h3 className="font-display text-sm font-semibold text-white sm:text-base">Tendances sans tableur</h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/48 sm:text-sm">
                    Volume, rythme et évolution visibles dans l&apos;app plutôt que dans un fichier Excel.
                  </p>
                </div>
              </RevealOnScroll>
            </li>
            <li className="lg:col-span-5">
              <RevealOnScroll variant="fade-left" delayMs={140} className="h-full">
                <div className="h-full rounded-3xl border border-brand-ice/22 bg-gradient-to-br from-brand-ice/[0.09] to-transparent p-5 sm:p-6">
                  <h3 className="font-display text-sm font-semibold text-white sm:text-base">Objectifs &amp; prévisions</h3>
                  <p className="mt-2 text-xs leading-relaxed text-white/48 sm:text-sm">
                    Lecture des signaux et cadrage quand tu es sur l&apos;offre Performance.
                  </p>
                </div>
              </RevealOnScroll>
            </li>
            <li className="sm:col-span-2 lg:col-span-12">
              <RevealOnScroll variant="fade-up" delayMs={100} className="h-full">
                <div className="rounded-3xl border border-dashed border-white/[0.14] bg-transparent p-5 sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                    <div>
                      <h3 className="font-display text-sm font-semibold text-white sm:text-base">Plans circuit</h3>
                      <p className="mt-1 text-xs leading-relaxed text-white/45 sm:text-sm">
                        Séquences pensées pour la piste et la distance visée — inclus dans Performance.
                      </p>
                    </div>
                    <Link
                      href="/register/?next=/checkout/performance/"
                      className="shrink-0 rounded-2xl border border-white/15 px-4 py-2.5 text-center text-xs font-medium text-white/75 transition hover:border-brand-ice/35 hover:bg-brand-ice/5 hover:text-white sm:text-sm"
                    >
                      Voir l&apos;offre Performance
                    </Link>
                  </div>
                </div>
              </RevealOnScroll>
            </li>
          </ul>
        </section>

        <section className="mt-16 sm:mt-20" aria-labelledby="trust-heading">
          <h2 id="trust-heading" className="sr-only">
            Données et confiance
          </h2>
          <RevealOnScroll variant="fade-up" delayMs={40}>
          <div className="flex flex-col gap-6 border-y border-white/[0.06] py-7 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between sm:gap-x-10 sm:gap-y-5 sm:py-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">Données</p>
            <div className="flex min-w-0 flex-1 flex-col gap-4 sm:max-w-md">
              <p className="text-sm leading-relaxed text-white/55">
                <span className="text-brand-ice/90">Strava optionnel</span> en Standard : tu peux valider le coach avant
                toute connexion.
              </p>
              <p className="text-sm leading-relaxed text-white/45">
                Les synchros alimentent le contexte IA et les écrans de suivi ; la déconnexion se fait depuis ton espace
                compte.
              </p>
            </div>
          </div>
          </RevealOnScroll>
        </section>

        <section className="mt-16 sm:mt-24" id="faq" aria-labelledby="faq-heading">
          <div className="mx-auto max-w-2xl lg:mx-0 lg:max-w-none lg:grid lg:grid-cols-12 lg:gap-10">
            <RevealOnScroll variant="fade-right" className="lg:col-span-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/40">FAQ</p>
              <h2 id="faq-heading" className="mt-2 font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
                Questions fréquentes
              </h2>
              <p className="mt-2 text-sm text-white/42">
                Strava, changement d&apos;offre, confidentialité — les points qui bloquent souvent avant l&apos;inscription.
              </p>
            </div>
            </RevealOnScroll>
            <RevealOnScroll variant="fade-left" delayMs={100} className="mt-8 lg:col-span-8 lg:mt-0">
            <div className="divide-y divide-white/[0.07] overflow-hidden rounded-3xl border border-white/[0.09] bg-white/[0.02] backdrop-blur-md">
              {[
                {
                  q: 'Strava est-il obligatoire ?',
                  a: 'Non pour l’offre Standard : chat coach IA sans liaison. Strava est inclus ou pertinent pour les offres payantes qui s’appuient sur tes sorties.',
                },
                {
                  q: 'Puis-je changer d’offre plus tard ?',
                  a: 'Oui. Tu peux commencer gratuitement, puis souscrire à Strava ou Performance depuis le parcours d’inscription ou ton compte selon les options disponibles.',
                },
                {
                  q: 'Qui a accès à mes activités Strava ?',
                  a: 'Les données synchronisées sont utilisées pour enrichir ton coaching et tes écrans dans l’app. Tu gères la connexion depuis ton compte utilisateur.',
                },
              ].map((item) => (
                <details
                  key={item.q}
                  className="group [&_summary::-webkit-details-marker]:hidden"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-left text-sm font-medium text-white/88 transition hover:bg-white/[0.04] sm:px-6 sm:py-5 sm:text-[0.9375rem]">
                    {item.q}
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-[10px] text-white/40 transition group-open:rotate-180"
                      aria-hidden
                    >
                      ▼
                    </span>
                  </summary>
                  <p className="border-t border-white/[0.05] px-4 pb-4 pt-3 text-sm leading-relaxed text-white/48 sm:px-6 sm:pb-5">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
            </RevealOnScroll>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-white/[0.05] bg-gradient-to-b from-transparent to-surface-0/80 backdrop-blur-xl">
        <RevealOnScroll variant="fade-up" rootMargin="0px 0px 0px 0px" threshold={0.2}>
        <div className="mx-auto flex max-w-6xl flex-col gap-5 px-4 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-11">
          <Link href="/" className="inline-flex w-fit items-center gap-2 text-white/40 transition hover:text-white/55">
            <Mark />
            <span className="text-xs text-white/35 sm:text-sm">© {new Date().getFullYear()}</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/45">
            <Link href="/login/" className="transition hover:text-white/75">
              Connexion
            </Link>
            <a href="#offres" className="transition hover:text-white/75">
              Offres
            </a>
            <a href="#faq" className="transition hover:text-white/75">
              FAQ
            </a>
          </nav>
        </div>
        </RevealOnScroll>
      </footer>
    </div>
  )
}
