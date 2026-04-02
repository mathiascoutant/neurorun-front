'use client'

import type { ReactNode } from 'react'
import { MEMBER_MOBILE_NAV_DRAWER_ID } from '@/components/MemberMobileDrawer'

const logoutBtnClass =
  'shrink-0 touch-manipulation rounded-lg px-2 py-2 text-xs font-medium text-white/45 underline decoration-white/12 underline-offset-[0.2em] transition hover:bg-white/[0.05] hover:text-white/88 hover:decoration-white/28 sm:px-0 sm:py-2.5'

export type MemberPageHeaderProps = {
  onLogout: () => void
  /** ex. mx-auto w-full max-w-6xl */
  maxWidthClass?: string
  title?: string
  onMenuClick?: () => void
  /** État du tiroir (aria-expanded / controls) */
  menuOpen?: boolean
  menuDrawerId?: string
  /** Remplace titre + menu (ex. lien retour) */
  leading?: ReactNode
}

export function MemberPageHeader({
  onLogout,
  maxWidthClass = 'mx-auto w-full max-w-6xl',
  title,
  onMenuClick,
  menuOpen = false,
  menuDrawerId = MEMBER_MOBILE_NAV_DRAWER_ID,
  leading,
}: MemberPageHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-white/[0.05] bg-surface-0/80 pt-safe backdrop-blur-lg supports-[backdrop-filter]:bg-surface-0/65">
      <div
        className={`flex items-center justify-between gap-2 sm:gap-4 ${maxWidthClass} px-safe py-2.5 sm:py-3`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
          {onMenuClick ? (
            <button
              type="button"
              className="-ml-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-transparent text-white/55 transition hover:border-white/[0.08] hover:bg-white/[0.06] hover:text-white active:scale-[0.98] md:hidden"
              onClick={onMenuClick}
              aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
              aria-expanded={menuOpen}
              aria-controls={menuDrawerId}
            >
              {menuOpen ? (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              ) : (
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                  <path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          ) : null}
          {leading ? (
            <div className="min-w-0">{leading}</div>
          ) : title ? (
            <h1 className="min-w-0 truncate font-display text-[0.9375rem] font-semibold tracking-tight text-white/92 sm:text-base">
              {title}
            </h1>
          ) : null}
        </div>
        <button type="button" className={logoutBtnClass} onClick={onLogout}>
          Déconnexion
        </button>
      </div>
    </header>
  )
}
