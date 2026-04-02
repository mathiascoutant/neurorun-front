import Link from 'next/link'
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
  /** Prénom affiché dans le lien Profil (bas du menu) */
  profileFirstName?: string | null
}

const itemBase =
  'group/nav flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/45 md:py-2.5'
const itemLabel = 'min-w-0 flex-1'
const titleClass = 'block text-sm font-semibold leading-tight'
const subtitleClass = 'mt-1 block text-[10px] font-normal leading-snug text-white/42'
const iconWrapBase =
  'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-white/[0.07] bg-white/[0.03] text-white/45 transition group-hover/nav:border-white/[0.12] group-hover/nav:bg-white/[0.05] group-hover/nav:text-white/75'
const iconWrapOn =
  'border-brand-orange/35 bg-brand-orange/15 text-brand-orange group-hover/nav:border-brand-orange/40 group-hover/nav:bg-brand-orange/18 group-hover/nav:text-brand-orange'

const itemOn = 'bg-brand-orange/[0.14] text-white ring-1 ring-brand-orange/35 shadow-[0_0_20px_-4px_rgba(252,76,2,0.35)]'
const itemOff = 'text-white/60 hover:bg-white/[0.06] hover:text-white/92'

function isOff(caps: MeCapabilities | undefined, key: keyof MeCapabilities): boolean {
  return caps != null && caps[key] === false
}

function NavIcon({ d }: { d: string }) {
  return (
    <svg className="h-[1.125rem] w-[1.125rem]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.65} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

const ICONS = {
  dashboard:
    'M4.5 6.75v10.5A2.25 2.25 0 007.5 19.5h9a2.25 2.25 0 002.25-2.25V6.75M4.5 6.75l7.72-3.09a.75.75 0 01.56 0L20.25 6.75M4.5 6.75l7.5 3 7.5-3',
  coach: 'M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.765 9.765 0 01-2.348-.306m-4.396 0l-.415-.553-.418-.552c-.22-.29-.44-.58-.652-.873-.23-.321-.45-.648-.655-.98M3 12a9.323 9.323 0 018.25-8.25',
  prevision:
    'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  run: 'M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 15H3.75V13.5z',
  circuit:
    'M12 3.75c-3.75 0-6.75 2.25-6.75 5.25 0 3 3 5.25 6.75 8.25 3.75-3 6.75-5.25 6.75-8.25 0-3-3-5.25-6.75-5.25zm0 7.5a2.25 2.25 0 110-4.5 2.25 2.25 0 010 4.5z',
  goals:
    'M12 21a9 9 0 100-18 9 9 0 000 18zm0-3a6 6 0 100-12 6 6 0 000 12zm0-3a3 3 0 100-6 3 3 0 000 6z',
  admin:
    'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
  profile:
    'M15.75 7.5a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 18.749a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z',
} as const

export function MemberPrimaryNav({ active, onNavigate, capabilities, isAdmin, profileFirstName }: Props) {
  const showCoach = !isOff(capabilities, 'coach_chat')
  const showForecast = !isOff(capabilities, 'forecast')
  const showRun = !isOff(capabilities, 'live_runs')
  const showCircuit = !isOff(capabilities, 'circuit_tracks')
  const showGoals = !isOff(capabilities, 'goals')
  const displayName = profileFirstName?.trim() || 'Profil'

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col">
      <nav
        className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-y-contain"
        aria-label="Navigation principale"
      >
        <p className="kicker px-1 pb-1 text-[10px] text-brand-ice/75">Menu</p>
        <Link
          href="/dashboard/"
          onClick={onNavigate}
          className={`${itemBase} ${active === 'dashboard' ? itemOn : itemOff}`}
        >
          <span className={`${iconWrapBase} ${active === 'dashboard' ? iconWrapOn : ''}`}>
            <NavIcon d={ICONS.dashboard} />
          </span>
          <span className={itemLabel}>
            <span className={titleClass}>Tableau de bord</span>
            <span className={subtitleClass}>Volume, allures, tendances Strava</span>
          </span>
        </Link>
        {showCoach ? (
          <Link href="/chat/" onClick={onNavigate} className={`${itemBase} ${active === 'coach' ? itemOn : itemOff}`}>
            <span className={`${iconWrapBase} ${active === 'coach' ? iconWrapOn : ''}`}>
              <NavIcon d={ICONS.coach} />
            </span>
            <span className={itemLabel}>
              <span className={titleClass}>Coach</span>
              <span className={subtitleClass}>IA · tes sorties Strava</span>
            </span>
          </Link>
        ) : null}
        {showForecast ? (
          <Link
            href="/prevision/"
            onClick={onNavigate}
            className={`${itemBase} ${active === 'prevision' ? itemOn : itemOff}`}
          >
            <span className={`${iconWrapBase} ${active === 'prevision' ? iconWrapOn : ''}`}>
              <NavIcon d={ICONS.prevision} />
            </span>
            <span className={itemLabel}>
              <span className={titleClass}>Prévision</span>
              <span className={subtitleClass}>5 km → marathon · Strava</span>
            </span>
          </Link>
        ) : null}
        {showRun ? (
          <Link href="/run/" onClick={onNavigate} className={`${itemBase} ${active === 'run' ? itemOn : itemOff}`}>
            <span className={`${iconWrapBase} ${active === 'run' ? iconWrapOn : ''}`}>
              <NavIcon d={ICONS.run} />
            </span>
            <span className={itemLabel}>
              <span className={titleClass}>Course</span>
              <span className={subtitleClass}>GPS · temps · allure · voix</span>
            </span>
          </Link>
        ) : null}
        {showCircuit ? (
          <Link
            href="/circuit/"
            onClick={onNavigate}
            className={`${itemBase} ${active === 'circuit' ? itemOn : itemOff}`}
          >
            <span className={`${iconWrapBase} ${active === 'circuit' ? iconWrapOn : ''}`}>
              <NavIcon d={ICONS.circuit} />
            </span>
            <span className={itemLabel}>
              <span className={titleClass}>Parcours</span>
              <span className={subtitleClass}>Carte · classements</span>
            </span>
          </Link>
        ) : null}
        {showGoals ? (
          <Link
            href="/chat/?section=goals"
            onClick={onNavigate}
            className={`${itemBase} ${active === 'goals' ? itemOn : itemOff}`}
          >
            <span className={`${iconWrapBase} ${active === 'goals' ? iconWrapOn : ''}`}>
              <NavIcon d={ICONS.goals} />
            </span>
            <span className={itemLabel}>
              <span className={titleClass}>Objectifs</span>
              <span className={subtitleClass}>Plan et suivi avec le coach</span>
            </span>
          </Link>
        ) : null}
        {isAdmin ? (
          <Link
            href="/admin/"
            onClick={onNavigate}
            className={`${itemBase} ${itemOff} border border-brand-ice/18 bg-brand-ice/[0.04]`}
          >
            <span className={`${iconWrapBase} text-brand-ice/70 group-hover/nav:text-brand-ice`}>
              <NavIcon d={ICONS.admin} />
            </span>
            <span className={itemLabel}>
              <span className={titleClass}>Administration</span>
              <span className={subtitleClass}>Codes promo, offres, utilisateurs</span>
            </span>
          </Link>
        ) : null}
      </nav>

      <div className="mt-auto shrink-0 border-t border-white/[0.06] pt-3">
        <Link
          href="/profile/"
          onClick={onNavigate}
          className={`${itemBase} ${active === 'profile' ? itemOn : itemOff}`}
        >
          <span className={`${iconWrapBase} ${active === 'profile' ? iconWrapOn : ''}`}>
            <NavIcon d={ICONS.profile} />
          </span>
          <span className={itemLabel}>
            <span className={titleClass}>{displayName}</span>
            <span className={subtitleClass}>Profil, offre & compte</span>
          </span>
        </Link>
      </div>
    </div>
  )
}
