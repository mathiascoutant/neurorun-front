'use client'

import Link from 'next/link'

type Props = {
  className?: string
}

/** Même bandeau que Tableau de bord et Coach : Strava optionnel, lien discret. */
export function StravaLinkBanner({ className = '' }: Props) {
  return (
    <div
      className={`border-b border-white/[0.06] bg-white/[0.02] px-safe py-2.5 text-[11px] leading-relaxed text-white/50 ${className}`}
      role="status"
    >
      <span className="font-medium text-white/65">Strava optionnel</span> — le coach fonctionne sans compte lié.{' '}
      <Link
        href="/link-strava/"
        className="text-brand-ice/90 underline decoration-white/15 underline-offset-2 hover:text-white"
      >
        Associer Strava
      </Link>{' '}
      ajoute ton historique (volume, allure) pour des réponses plus personnalisées.
    </div>
  )
}
