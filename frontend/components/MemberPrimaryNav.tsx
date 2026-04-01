import Link from 'next/link'
import type { MeCapabilities } from '@/lib/api'

export type MemberNavActive = 'dashboard' | 'coach' | 'goals' | 'prevision' | 'run'

type Props = {
  active: MemberNavActive
  /** Ferme le tiroir mobile après navigation */
  onNavigate?: () => void
  /** Si défini par l’API : masque les entrées dont le flag est à false */
  capabilities?: MeCapabilities
  /** Affiche le lien vers le panneau admin */
  isAdmin?: boolean
}

const itemBase =
  'block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50'
const itemOn = 'bg-brand-orange/20 text-white ring-1 ring-brand-orange/40'
const itemOff = 'text-white/55 hover:bg-white/[0.06] hover:text-white'

function isOff(caps: MeCapabilities | undefined, key: keyof MeCapabilities): boolean {
  return caps != null && caps[key] === false
}

export function MemberPrimaryNav({ active, onNavigate, capabilities, isAdmin }: Props) {
  const showCoach = !isOff(capabilities, 'coach_chat')
  const showForecast = !isOff(capabilities, 'forecast')
  const showRun = !isOff(capabilities, 'live_runs')
  const showGoals = !isOff(capabilities, 'goals')

  return (
    <nav className="space-y-2" aria-label="Navigation principale">
      <p className="kicker pl-1 text-[10px] text-brand-ice/80">Menu</p>
      <Link
        href="/dashboard/"
        onClick={onNavigate}
        className={`${itemBase} ${active === 'dashboard' ? itemOn : itemOff}`}
      >
        Tableau de bord
      </Link>
      {showCoach ? (
        <Link href="/chat/" onClick={onNavigate} className={`${itemBase} ${active === 'coach' ? itemOn : itemOff}`}>
          <span className="block">Coach</span>
          <span className="mt-0.5 block text-[10px] font-normal leading-snug text-white/40">
            IA · tes sorties Strava
          </span>
        </Link>
      ) : null}
      {showForecast ? (
        <Link
          href="/prevision/"
          onClick={onNavigate}
          className={`${itemBase} ${active === 'prevision' ? itemOn : itemOff}`}
        >
          <span className="block">Prévision</span>
          <span className="mt-0.5 block text-[10px] font-normal leading-snug text-white/40">
            5 km → marathon · Strava
          </span>
        </Link>
      ) : null}
      {showRun ? (
        <Link href="/run/" onClick={onNavigate} className={`${itemBase} ${active === 'run' ? itemOn : itemOff}`}>
          <span className="block">Course</span>
          <span className="mt-0.5 block text-[10px] font-normal leading-snug text-white/40">
            GPS · temps · allure · voix
          </span>
        </Link>
      ) : null}
      {showGoals ? (
        <Link
          href="/chat/?section=goals"
          onClick={onNavigate}
          className={`${itemBase} ${active === 'goals' ? itemOn : itemOff}`}
        >
          Objectifs
        </Link>
      ) : null}
      {isAdmin ? (
        <Link
          href="/admin/"
          onClick={onNavigate}
          className={`${itemBase} ${itemOff} border border-brand-ice/20 bg-brand-ice/5`}
        >
          <span className="block">Administration</span>
          <span className="mt-0.5 block text-[10px] font-normal text-white/40">Codes promo, offres, utilisateurs</span>
        </Link>
      ) : null}
    </nav>
  )
}
