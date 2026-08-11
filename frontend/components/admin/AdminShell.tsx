'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { Mark } from '@/components/Mark'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'

export type AdminSection = 'overview' | 'users' | 'offers' | 'promos' | 'circuits'

export const ADMIN_DRAWER_ID = 'admin-nav-drawer'

const ICONS = {
  overview:
    'M3.75 19.5h16.5M6.75 19.5V11.25m5.25 8.25V6.75m5.25 12.75v-5.25',
  users:
    'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  offers:
    'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.878.335 2.18-.601a18.6 18.6 0 004.831-4.83c.936-.302 1.3-1.482.6-2.181L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z',
  promos:
    'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.878.335 2.18-.601a18.6 18.6 0 004.831-4.83c.936-.302 1.3-1.482.6-2.181L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z',
  circuits:
    'M12 3.75c-3.75 0-6.75 2.25-6.75 5.25 0 3 3 5.25 6.75 8.25 3.75-3 6.75-5.25 6.75-8.25 0-3-3-5.25-6.75-5.25zm0 7.5a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z',
  back: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
} as const

/* Onglets « Offres » et « Codes promo » partagent l’icône étiquette : distinguons-les. */
const OFFER_ICON =
  'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z'

type Entry = {
  id: AdminSection
  label: string
  icon: keyof typeof ICONS | 'offerCard'
  /** Compteur discret à droite de l’entrée (effectifs connus). */
  count?: number
}

const GROUPS: { label: string; items: Entry[] }[] = [
  { label: 'Pilotage', items: [{ id: 'overview', label: 'Vue d’ensemble', icon: 'overview' }] },
  {
    label: 'Communauté',
    items: [
      { id: 'users', label: 'Utilisateurs', icon: 'users' },
      { id: 'circuits', label: 'Parcours & temps', icon: 'circuits' },
    ],
  },
  {
    label: 'Monétisation',
    items: [
      { id: 'offers', label: 'Offres & paliers', icon: 'offerCard' },
      { id: 'promos', label: 'Codes promo', icon: 'promos' },
    ],
  },
]

export const ADMIN_SECTION_META: Record<AdminSection, { title: string; subtitle: string }> = {
  overview: { title: 'Vue d’ensemble', subtitle: 'Croissance, revenus et usage du produit' },
  users: { title: 'Utilisateurs', subtitle: 'Comptes, rôles, offres et activité' },
  offers: { title: 'Offres & paliers', subtitle: 'Prix, libellés et fonctionnalités incluses' },
  promos: { title: 'Codes promo', subtitle: 'Réductions appliquées au paiement' },
  circuits: { title: 'Parcours & temps', subtitle: 'Tracés enregistrés et chronos des coureurs' },
}

function NavIcon({ entry }: { entry: Entry }) {
  const d = entry.icon === 'offerCard' ? OFFER_ICON : ICONS[entry.icon]
  return (
    <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

function Nav({
  section,
  onSelect,
  counts,
}: {
  section: AdminSection
  onSelect: (s: AdminSection) => void
  counts: Partial<Record<AdminSection, number>>
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <nav className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pb-2" aria-label="Sections d’administration">
        {GROUPS.map((group) => (
          <div key={group.label} className="nav-group">
            <p className="nav-group-label">{group.label}</p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const on = section === item.id
                const count = counts[item.id]
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(item.id)}
                      aria-current={on ? 'page' : undefined}
                      className={`nav-item nav-item--admin w-full cursor-pointer text-left ${on ? 'nav-item--on' : ''}`}
                    >
                      <NavIcon entry={item} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {count != null ? (
                        <span className="shrink-0 rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-white/50">
                          {count}
                        </span>
                      ) : null}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mt-auto shrink-0 space-y-2 border-t border-white/[0.06] pt-3">
        <Link href="/dashboard/" className="nav-item">
          <svg className="nav-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.back} />
          </svg>
          <span className="min-w-0 flex-1 truncate">Retour à l’espace membre</span>
        </Link>
      </div>
    </div>
  )
}

/**
 * Chrome de la console : colonne fixe ≥ md, tiroir en dessous, en-tête collant.
 *
 * Le repère visuel change volontairement par rapport à l’espace membre — bandeau
 * « Console admin » en glace, rail actif glace — pour qu’on sache en un regard
 * qu’une action ici porte sur les données de tout le monde, pas sur son compte.
 */
export function AdminShell({
  section,
  onSection,
  counts = {},
  open,
  onOpenChange,
  onLogout,
  email,
  actions,
  children,
}: {
  section: AdminSection
  onSection: (s: AdminSection) => void
  counts?: Partial<Record<AdminSection, number>>
  open: boolean
  onOpenChange: (v: boolean) => void
  onLogout: () => void
  email?: string
  /** Actions propres à la section, à droite de l’en-tête. */
  actions?: ReactNode
  children: ReactNode
}) {
  const meta = ADMIN_SECTION_META[section]

  const brand = (
    <div className="flex min-w-0 items-center gap-2.5">
      <Mark compact />
      <span className="badge badge--ice shrink-0">Admin</span>
    </div>
  )

  const select = (s: AdminSection) => {
    onSection(s)
    onOpenChange(false)
  }

  return (
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <aside className="relative z-30 hidden min-h-0 w-[264px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0c12] md:sticky md:top-0 md:flex md:h-[100dvh] md:max-h-[100dvh] xl:w-[280px]">
        <div className="border-b border-white/[0.06] px-safe pb-3.5 pt-safe">{brand}</div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-3 pb-safe pt-3.5">
          <Nav section={section} onSelect={onSection} counts={counts} />
        </div>
      </aside>

      <MemberMobileDrawer
        id={ADMIN_DRAWER_ID}
        open={open}
        onClose={() => onOpenChange(false)}
        headerLeading={brand}
      >
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden px-3 pb-safe pt-3.5">
          <Nav section={section} onSelect={select} counts={counts} />
        </div>
      </MemberMobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[#05060a]/85 pt-safe backdrop-blur-xl supports-[backdrop-filter]:bg-[#05060a]/72">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-2 px-safe py-3 sm:gap-4 sm:py-3.5">
            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="-ml-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-transparent text-white/55 transition hover:border-white/[0.08] hover:bg-white/[0.06] hover:text-white active:scale-[0.98] md:hidden"
                onClick={() => onOpenChange(!open)}
                aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
                aria-expanded={open}
                aria-controls={ADMIN_DRAWER_ID}
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
                  <path strokeLinecap="round" d={open ? 'M6 6l12 12M18 6L6 18' : 'M4 7h16M4 12h16M4 17h16'} />
                </svg>
              </button>
              <div className="min-w-0">
                <h1 className="min-w-0 truncate font-display text-lg font-bold tracking-[-0.01em] text-white sm:text-[1.375rem]">
                  {meta.title}
                </h1>
                <p className="mt-0.5 truncate text-[13px] leading-snug text-white/55">{meta.subtitle}</p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              {actions}
              {email ? (
                <span className="hidden max-w-[13rem] truncate text-xs text-white/35 lg:inline" title={email}>
                  {email}
                </span>
              ) : null}
              <button
                type="button"
                onClick={onLogout}
                className="shrink-0 touch-manipulation rounded-lg px-2 py-2 text-xs font-medium text-white/45 underline decoration-white/12 underline-offset-[0.2em] transition hover:bg-white/[0.05] hover:text-white/88 hover:decoration-white/28"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </header>

        <main className="member-main-pad-b mx-auto w-full max-w-6xl flex-1 space-y-6 px-safe py-6 sm:py-8">{children}</main>
      </div>
    </div>
  )
}
