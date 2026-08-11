import Link from 'next/link'
import type { ReactNode } from 'react'
import type { MeCapabilities } from '@/lib/api'

export type MemberNavActive = 'dashboard' | 'coach' | 'goals' | 'prevision' | 'run' | 'circuit' | 'profile'

type Props = {
  active: MemberNavActive
  /** Ferme le tiroir mobile après navigation */
  onNavigate?: () => void
  /** Si défini par l’API : masque les entrées dont le flag est à false */
  capabilities?: MeCapabilities
  /** Affiche le lien vers le panneau admin */
  isAdmin?: boolean
  /** Prénom affiché dans la carte compte (bas du menu) */
  profileFirstName?: string | null
  /** Nom, pour les initiales de l’avatar */
  profileLastName?: string | null
  /** Libellé d’offre affiché sous le nom (ex. « Performance ») */
  planLabel?: string | null
  /**
   * Panneau propre à la page, inséré entre la navigation et la carte compte
   * (ex. historique des conversations du coach). Il occupe la place restante.
   */
  secondary?: ReactNode
}

/**
 * Groupes de navigation.
 *
 * Les entrées sont regroupées par intention plutôt que listées à plat : on
 * cherche « où j’en suis » (Pilotage), « je cours » (Entraînement) ou « où je
 * vais » (Progression). Chaque entrée tient sur une ligne — les sous-titres
 * d’avant alourdissaient la lecture sans rien apprendre que le libellé ne dise.
 */
const ICONS = {
  dashboard:
    'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 018.25 20.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25A2.25 2.25 0 0113.5 8.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  coach:
    'M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM4.5 4.5h15a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5h-5.69l-3.87 3.53a.75.75 0 01-1.26-.55v-2.98H4.5A1.5 1.5 0 013 14.25V6a1.5 1.5 0 011.5-1.5z',
  prevision:
    'M3.75 19.5h16.5M4.5 16.5l4.5-5.25 3.75 3 6.75-8.25',
  run: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 15H3.75V13.5z',
  circuit:
    'M12 3.75c-3.75 0-6.75 2.25-6.75 5.25 0 3 3 5.25 6.75 8.25 3.75-3 6.75-5.25 6.75-8.25 0-3-3-5.25-6.75-5.25zm0 7.5a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z',
  goals:
    'M12 21a9 9 0 100-18 9 9 0 000 18zm0-3a6 6 0 100-12 6 6 0 000 12zm0-3a3 3 0 100-6 3 3 0 000 6z',
  admin:
    'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
} as const

type NavEntry = {
  key: MemberNavActive
  label: string
  href: string
  icon: keyof typeof ICONS
  /** Flag d’offre qui masque l’entrée quand il vaut `false` */
  capability?: keyof MeCapabilities
}

const GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: 'Pilotage',
    items: [
      { key: 'dashboard', label: 'Tableau de bord', href: '/dashboard/', icon: 'dashboard' },
      { key: 'coach', label: 'Coach IA', href: '/chat/', icon: 'coach', capability: 'coach_chat' },
    ],
  },
  {
    label: 'Entraînement',
    items: [
      { key: 'run', label: 'Course', href: '/run/', icon: 'run', capability: 'live_runs' },
      { key: 'circuit', label: 'Parcours', href: '/circuit/', icon: 'circuit', capability: 'circuit_tracks' },
    ],
  },
  {
    label: 'Progression',
    items: [
      { key: 'goals', label: 'Objectifs', href: '/chat/?section=goals', icon: 'goals', capability: 'goals' },
      { key: 'prevision', label: 'Prévision', href: '/prevision/', icon: 'prevision', capability: 'forecast' },
    ],
  },
]

function isOff(caps: MeCapabilities | undefined, key: keyof MeCapabilities): boolean {
  return caps != null && caps[key] === false
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg
      className="nav-item-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

function initials(first?: string | null, last?: string | null): string {
  const a = (first ?? '').trim().charAt(0)
  const b = (last ?? '').trim().charAt(0)
  return `${a}${b}`.toUpperCase() || 'NR'
}

export function MemberPrimaryNav({
  active,
  onNavigate,
  capabilities,
  isAdmin,
  profileFirstName,
  profileLastName,
  planLabel,
  secondary,
}: Props) {
  const displayName = profileFirstName?.trim() || 'Mon profil'

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <nav
        /* Avec un panneau secondaire, la navigation cède la hauteur restante et
           se borne à la moitié haute pour ne pas l’écraser sur petit écran. */
        className={`overflow-y-auto overscroll-y-contain pb-2 ${
          secondary ? 'max-h-[52%] shrink-0' : 'min-h-0 flex-1'
        }`}
        aria-label="Navigation principale"
      >
        {GROUPS.map((group) => {
          const items = group.items.filter((i) => !i.capability || !isOff(capabilities, i.capability))
          if (items.length === 0) return null
          return (
            <div key={group.label} className="nav-group">
              <p className="nav-group-label">{group.label}</p>
              <ul className="space-y-0.5">
                {items.map((item) => {
                  const on = active === item.key
                  return (
                    <li key={item.key}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={on ? 'page' : undefined}
                        className={`nav-item ${on ? 'nav-item--on' : ''}`}
                      >
                        <NavIcon d={ICONS[item.icon]} />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}

        {isAdmin ? (
          <div className="nav-group">
            <p className="nav-group-label">Administration</p>
            <Link href="/admin/" onClick={onNavigate} className="nav-item nav-item--admin">
              <NavIcon d={ICONS.admin} />
              <span className="min-w-0 flex-1 truncate">Panneau admin</span>
            </Link>
          </div>
        ) : null}
      </nav>

      {secondary ? (
        <div className="flex min-h-0 flex-1 flex-col border-t border-white/[0.06] pt-3">{secondary}</div>
      ) : null}

      <div className="mt-auto shrink-0 border-t border-white/[0.06] pt-3">
        <Link
          href="/profile/"
          onClick={onNavigate}
          aria-current={active === 'profile' ? 'page' : undefined}
          className={`nav-account ${active === 'profile' ? 'nav-account--on' : ''}`}
        >
          <span className="nav-avatar" aria-hidden>
            {initials(profileFirstName, profileLastName)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-white/92">
              {displayName}
            </span>
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-white/42">
              {planLabel ? `Offre ${planLabel}` : 'Profil, offre & compte'}
            </span>
          </span>
          <svg
            className="h-4 w-4 shrink-0 text-white/25"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.8}
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>
    </div>
  )
}
