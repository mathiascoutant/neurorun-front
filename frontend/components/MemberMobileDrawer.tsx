'use client'

import { useEffect, useRef, type ReactNode } from 'react'

export const MEMBER_MOBILE_NAV_DRAWER_ID = 'member-app-nav-drawer'

type Props = {
  open: boolean
  onClose: () => void
  headerLeading: ReactNode
  children: ReactNode
  /** Pour aria-controls / aria-labelledby depuis le bouton menu */
  id?: string
}

export function MemberMobileDrawer({ open, onClose, headerLeading, children, id = MEMBER_MOBILE_NAV_DRAWER_ID }: Props) {
  const asideRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = asideRef.current
    if (!el) return
    if (!open) el.setAttribute('inert', '')
    else el.removeAttribute('inert')
  }, [open])

  useEffect(() => {
    if (!open) return
    const mdUp = window.matchMedia('(min-width: 768px)')
    const syncBodyScroll = () => {
      document.body.style.overflow = mdUp.matches ? '' : 'hidden'
    }
    syncBodyScroll()
    mdUp.addEventListener('change', syncBodyScroll)
    return () => {
      mdUp.removeEventListener('change', syncBodyScroll)
      document.body.style.overflow = ''
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] transition-opacity duration-200 md:hidden ${
          open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden={!open}
        onClick={onClose}
      />

      <aside
        ref={asideRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label="Menu de navigation"
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 flex h-[100dvh] max-h-[100dvh] w-[min(21.5rem,calc(100vw-1rem))] flex-col border-r border-white/[0.08] bg-surface-1/98 shadow-lift backdrop-blur-xl transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:hidden ${
          open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] px-safe py-3 pt-safe">
          <div className="min-w-0 flex-1">{headerLeading}</div>
          <button
            type="button"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-white/75 transition hover:bg-white/[0.08] hover:text-white active:scale-[0.98]"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden overscroll-contain">{children}</div>
      </aside>
    </>
  )
}
