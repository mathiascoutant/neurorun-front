'use client'

import Link from 'next/link'
import type { MeCapabilities } from '@/lib/api'

/**
 * Écran affiché quand le tableau de bord n'a rien à montrer — offre sans Strava,
 * ou Strava pas encore associé.
 *
 * L'ancienne version se contentait d'un cadenas et d'une phrase de refus au
 * milieu d'une page vide : l'utilisateur ne savait ni ce qu'il manquait, ni quoi
 * faire d'autre. Ici on montre l'allure du tableau, on énumère ce qu'il apporte,
 * et on renvoie vers ce qui est déjà accessible pour que la page ne soit pas un
 * cul-de-sac.
 */

/** Aperçu décoratif — formes abstraites, aucun chiffre : ce ne sont pas des données. */
function TeaserChart() {
  const bars = [38, 62, 45, 78, 55, 88, 66, 95, 72, 58]
  return (
    <div className="pointer-events-none relative h-[132px] w-full overflow-hidden sm:h-[168px]" aria-hidden>
      <svg viewBox="0 0 320 100" preserveAspectRatio="none" className="h-full w-full opacity-[0.55] blur-[1px]">
        <defs>
          <linearGradient id="teaser-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fc4c02" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#fc4c02" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="teaser-fade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="55%" stopColor="#fff" stopOpacity="1" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <mask id="teaser-mask">
            <rect width="320" height="100" fill="url(#teaser-fade)" />
          </mask>
        </defs>
        <g mask="url(#teaser-mask)">
          {bars.map((h, i) => (
            <rect
              key={i}
              x={i * 32 + 8}
              y={100 - h}
              width={17}
              height={h}
              rx={3}
              fill="url(#teaser-bar)"
            />
          ))}
          <polyline
            points={bars.map((h, i) => `${i * 32 + 16.5},${100 - h * 0.72}`).join(' ')}
            fill="none"
            stroke="#0f9cb8"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      <div className="absolute inset-0 bg-gradient-to-t from-[#0d0f16] via-[#0d0f16]/35 to-transparent" />
    </div>
  )
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <svg
        className="mt-[3px] h-4 w-4 shrink-0 text-brand-orange"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.1}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
      <span className="text-[13.5px] leading-snug text-white/62">{children}</span>
    </li>
  )
}

const ALTERNATIVES: {
  key: keyof MeCapabilities
  href: string
  label: string
  hint: string
  icon: string
}[] = [
  {
    key: 'coach_chat',
    href: '/chat/',
    label: 'Coach IA',
    hint: 'Conseils, plans, récup',
    icon: 'M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM4.5 4.5h15a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5h-5.69l-3.87 3.53a.75.75 0 01-1.26-.55v-2.98H4.5A1.5 1.5 0 013 14.25V6a1.5 1.5 0 011.5-1.5z',
  },
  {
    key: 'goals',
    href: '/chat/?section=goals',
    label: 'Objectifs',
    hint: 'Fixe une cible et suis-la',
    icon: 'M12 21a9 9 0 100-18 9 9 0 000 18zm0-3a6 6 0 100-12 6 6 0 000 12zm0-3a3 3 0 100-6 3 3 0 000 6z',
  },
  {
    key: 'live_runs',
    href: '/run/',
    label: 'Mes courses',
    hint: 'Historique détaillé',
    icon: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 15H3.75V13.5z',
  },
  {
    key: 'circuit_tracks',
    href: '/circuit/',
    label: 'Parcours',
    hint: 'Tracés et classements',
    icon: 'M12 3.75c-3.75 0-6.75 2.25-6.75 5.25 0 3 3 5.25 6.75 8.25 3.75-3 6.75-5.25 6.75-8.25 0-3-3-5.25-6.75-5.25zm0 7.5a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z',
  },
]

export function DashboardLocked({
  reason,
  capabilities,
}: {
  /** `strava` : l’offre le permet mais le compte n’est pas relié. `offer` : hors offre. */
  reason: 'strava' | 'offer'
  capabilities?: MeCapabilities
}) {
  const isStrava = reason === 'strava'
  const available = ALTERNATIVES.filter((a) => capabilities?.[a.key] !== false)

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#0d0f16]">
        <TeaserChart />

        <div className="px-5 pb-5 sm:px-6 sm:pb-6">
          <div className="flex items-center gap-2.5">
            <span
              className={`app-icon-tile h-9 w-9 ${
                isStrava
                  ? 'border-brand-ice/25 bg-brand-ice/[0.12] text-brand-ice'
                  : 'border-brand-orange/25 bg-brand-orange/[0.12] text-brand-orange'
              }`}
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                {isStrava ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                )}
              </svg>
            </span>
            <h2 className="font-display text-[19px] font-bold tracking-[-0.02em] text-white sm:text-[21px]">
              {isStrava ? 'Connecte Strava, et tout s’affiche' : 'Ton tableau de bord t’attend'}
            </h2>
          </div>

          <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-white/50">
            {isStrava
              ? 'Ton offre inclut le tableau de bord. Il ne manque que la synchronisation : une fois Strava associé, tout ton historique de course remonte automatiquement.'
              : 'L’analyse de tes sorties n’est pas incluse dans ton offre actuelle. Elle transforme ton historique en repères concrets, sortie après sortie.'}
          </p>

          <ul className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <Check>Volume hebdomadaire et distance cumulée</Check>
            <Check>Évolution des allures du 5 km au marathon</Check>
            <Check>Fréquence cardiaque moyenne par séance</Check>
            <Check>Un coach IA qui s’appuie sur tes vraies sorties</Check>
          </ul>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href={isStrava ? '/link-strava/' : '/profile/'}
              className="btn-brand cursor-pointer px-5 py-3 text-[15px]"
            >
              {isStrava ? 'Associer Strava' : 'Découvrir les offres'}
            </Link>
            <p className="text-[12px] text-white/35">
              {isStrava ? 'Prend moins d’une minute, révocable à tout moment.' : 'Sans engagement, résiliable à tout moment.'}
            </p>
          </div>
        </div>
      </section>

      {available.length > 0 ? (
        <section>
          <h3 className="px-1 font-display text-[13px] font-semibold text-white/55">
            Déjà accessible avec ton offre
          </h3>
          <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
            {available.map((a) => (
              <Link
                key={a.key}
                href={a.href}
                className="group/alt flex cursor-pointer items-center gap-3 rounded-[18px] border border-white/[0.07] bg-[#0d0f16] px-4 py-3.5 transition hover:border-white/[0.16] hover:bg-[#12151f] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50"
              >
                <span className="app-icon-tile h-9 w-9 text-white/45 transition group-hover/alt:text-white/75">
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d={a.icon} />
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-medium leading-tight text-white/90">{a.label}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-white/38">{a.hint}</span>
                </span>
                <svg
                  className="h-4 w-4 shrink-0 text-white/20 transition group-hover/alt:text-white/50"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.9}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
