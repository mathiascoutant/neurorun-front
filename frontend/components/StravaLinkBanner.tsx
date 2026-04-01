'use client'

import Link from 'next/link'
import { useState } from 'react'

type Props = {
  className?: string
}

export function StravaLinkBanner({ className = '' }: Props) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null

  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-brand-orange/25 bg-brand-orange/[0.12] px-4 py-2.5 backdrop-blur-sm ${className}`}
      role="status"
    >
      <p className="min-w-0 flex-[1_1_12rem] text-xs leading-snug text-white/85 sm:text-[13px]">
        <span className="font-medium text-white">Strava non associé.</span>{' '}
        Lie ton compte pour afficher tes sorties, prévisions et le coach sur tes données.
      </p>
      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <Link
          href="/link-strava/"
          className="rounded-lg bg-brand-orange/90 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-orange"
        >
          Associer
        </Link>
        <button
          type="button"
          className="rounded-lg p-1.5 text-white/50 transition hover:bg-white/10 hover:text-white"
          onClick={() => setDismissed(true)}
          aria-label="Fermer la bannière"
        >
          <span className="block text-xl leading-none" aria-hidden>
            ×
          </span>
        </button>
      </div>
    </div>
  )
}
