'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Mark } from '@/components/Mark'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'
import { MemberPrimaryNav, type MemberNavActive } from '@/components/MemberPrimaryNav'
import type { MeCapabilities } from '@/lib/api'

type Props = {
  active: MemberNavActive
  /** État du tiroir mobile (piloté par le bouton menu de `MemberPageHeader`) */
  open: boolean
  onClose: () => void
  capabilities?: MeCapabilities
  isAdmin?: boolean
  firstName?: string | null
  lastName?: string | null
  planLabel?: string | null
  /**
   * Panneau propre à la page sous la navigation. Reçoit une fonction pour que
   * la version mobile puisse refermer le tiroir après une sélection.
   */
  secondary?: (onNavigate?: () => void) => ReactNode
}

/**
 * Chrome de navigation de l’espace connecté : colonne fixe ≥ md, tiroir en dessous.
 *
 * Toutes les pages membres passent par ici — c’est ce qui garantit que la barre
 * est identique d’un écran à l’autre (placement, largeur, état actif) plutôt que
 * recopiée dans chaque page.
 */
export function MemberSidebar({
  active,
  open,
  onClose,
  capabilities,
  isAdmin,
  firstName,
  lastName,
  planLabel,
  secondary,
}: Props) {
  const nav = (onNavigate?: () => void) => (
    <MemberPrimaryNav
      active={active}
      onNavigate={onNavigate}
      capabilities={capabilities}
      isAdmin={isAdmin}
      profileFirstName={firstName}
      profileLastName={lastName}
      planLabel={planLabel}
      secondary={secondary?.(onNavigate)}
    />
  )

  return (
    <>
      <aside className="relative z-30 hidden min-h-0 w-[264px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0c12] md:sticky md:top-0 md:flex md:h-[100dvh] md:max-h-[100dvh] xl:w-[280px]">
        <div className="border-b border-white/[0.06] px-safe pb-3.5 pt-safe">
          <Link
            href="/dashboard/"
            aria-label="NeuroRun — tableau de bord"
            className="inline-flex rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60"
          >
            <Mark compact />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-safe pt-3.5">{nav()}</div>
      </aside>

      <MemberMobileDrawer
        open={open}
        onClose={onClose}
        headerLeading={
          <Link
            href="/dashboard/"
            onClick={onClose}
            className="inline-flex rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60"
            aria-label="NeuroRun — tableau de bord"
          >
            <Mark compact />
          </Link>
        }
      >
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 pb-safe pt-3.5">{nav(onClose)}</div>
      </MemberMobileDrawer>
    </>
  )
}
