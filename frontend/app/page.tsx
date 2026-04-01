'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mark } from '@/components/Mark'
import { fetchMe } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 shrink-0 text-brand-ice/90 ${className}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden>
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
        <div className="absolute -left-32 top-24 h-80 w-80 rounded-full bg-brand-orange/15 blur-[100px]" />
        <div className="absolute bottom-20 right-0 h-96 w-96 rounded-full bg-brand-ice/8 blur-[120px]" />
      </div>

      <header className="relative z-10 border-b border-white/[0.06] bg-surface-0/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="transition hover:opacity-90">
            <Mark />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link href="/login/" className="btn-quiet px-4 py-2 text-sm">
              Connexion
            </Link>
            <Link href="/register/" className="btn-brand px-4 py-2 text-sm">
              S&apos;inscrire
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-5 pb-20 pt-14 sm:px-8 sm:pt-20">
        <div className="mx-auto max-w-2xl text-center animate-fade-up">
          <p className="kicker mb-4">Coach d&apos;entraînement</p>
          <h1 className="font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            NeuroRun : ton rythme, une IA qui s&apos;adapte
          </h1>
          <p className="mt-5 text-base leading-relaxed text-white/55 sm:text-lg">
            Choisis l&apos;offre qui te correspond : dialogue avec un coach IA, puis enrichis avec Strava et des plans
            circuit quand tu veux aller plus loin.
          </p>
        </div>

        <div className="mt-16 grid gap-6 lg:grid-cols-3 lg:items-stretch">
          {/* Offre 1 — Standard gratuit */}
          <section className="panel flex flex-col p-7 sm:p-8 animate-fade-up">
            <p className="kicker text-white/50">Standard</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">IA classique</h2>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
              0 €<span className="text-base font-normal text-white/40"> / mois</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              Accès au coach IA standard : conseils et dialogue sans synchronisation Strava.
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-white/75">
              <li className="flex gap-2.5">
                <CheckIcon />
                Chat coach IA classique
              </li>
              <li className="flex gap-2.5">
                <CheckIcon />
                Création de compte gratuit
              </li>
              <li className="flex gap-2.5 text-white/40">
                <span className="inline-block h-4 w-4 shrink-0 rounded-full border border-white/20" />
                Pas de lien Strava
              </li>
            </ul>
            <Link href="/register/" className="btn-quiet mt-8 w-full justify-center sm:mt-auto">
              Créer un compte gratuit
            </Link>
          </section>

          {/* Offre 2 — Strava */}
          <section className="panel relative flex flex-col overflow-hidden p-7 shadow-[0_0_48px_rgba(252,76,2,0.12)] sm:p-8 animate-fade-up [animation-delay:0.05s]">
            <div className="absolute right-4 top-4 rounded-full bg-brand-orange/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-orange">
              Populaire
            </div>
            <p className="kicker text-brand-orange">Strava</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">Strava connecté</h2>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
              3,99 €<span className="text-base font-normal text-white/40"> / mois</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              Lie ton compte Strava : le coach s&apos;appuie sur tes sorties réelles pour des analyses plus pertinentes.
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-white/75">
              <li className="flex gap-2.5">
                <CheckIcon />
                Tout du plan Standard
              </li>
              <li className="flex gap-2.5">
                <CheckIcon />
                Synchronisation Strava
              </li>
              <li className="flex gap-2.5">
                <CheckIcon />
                Tableaux de bord & tendances
              </li>
            </ul>
            <Link
              href="/register/?next=/checkout/strava/"
              className="btn-brand mt-8 w-full justify-center sm:mt-auto"
            >
              Choisir Strava
            </Link>
          </section>

          {/* Offre 3 — Complet */}
          <section className="panel flex flex-col border-brand-ice/20 bg-surface-2/40 p-7 sm:p-8 animate-fade-up [animation-delay:0.1s]">
            <p className="kicker text-brand-ice/90">Performance</p>
            <h2 className="mt-2 font-display text-xl font-semibold text-white">IA + Strava + circuit</h2>
            <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
              7,99 €<span className="text-base font-normal text-white/40"> / mois</span>
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              L&apos;expérience complète : coach IA avancé, données Strava et plans d&apos;entraînement sur circuit.
            </p>
            <ul className="mt-6 flex flex-1 flex-col gap-3 text-sm text-white/75">
              <li className="flex gap-2.5">
                <CheckIcon />
                IA enrichie + contexte Strava
              </li>
              <li className="flex gap-2.5">
                <CheckIcon />
                Prévisions & objectifs course
              </li>
              <li className="flex gap-2.5">
                <CheckIcon />
                Plans et séances sur circuit
              </li>
            </ul>
            <Link
              href="/register/?next=/checkout/performance/"
              className="btn-quiet mt-8 w-full justify-center border-brand-ice/25 bg-brand-ice/5 hover:bg-brand-ice/10 sm:mt-auto"
            >
              Passer en Performance
            </Link>
          </section>
        </div>
      </main>
    </div>
  )
}
