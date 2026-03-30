import Link from 'next/link'

export type MemberNavActive = 'dashboard' | 'coach' | 'goals' | 'prevision' | 'run'

type Props = {
  active: MemberNavActive
  /** Ferme le tiroir mobile après navigation */
  onNavigate?: () => void
}

const itemBase =
  'block w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50'
const itemOn = 'bg-brand-orange/20 text-white ring-1 ring-brand-orange/40'
const itemOff = 'text-white/55 hover:bg-white/[0.06] hover:text-white'

export function MemberPrimaryNav({ active, onNavigate }: Props) {
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
      <Link href="/chat/" onClick={onNavigate} className={`${itemBase} ${active === 'coach' ? itemOn : itemOff}`}>
        <span className="block">Coach</span>
        <span className="mt-0.5 block text-[10px] font-normal leading-snug text-white/40">
          IA · tes sorties Strava
        </span>
      </Link>
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
      <Link href="/run/" onClick={onNavigate} className={`${itemBase} ${active === 'run' ? itemOn : itemOff}`}>
        <span className="block">Course</span>
        <span className="mt-0.5 block text-[10px] font-normal leading-snug text-white/40">
          GPS · temps · allure · voix
        </span>
      </Link>
      <Link
        href="/chat/?section=goals"
        onClick={onNavigate}
        className={`${itemBase} ${active === 'goals' ? itemOn : itemOff}`}
      >
        Objectifs
      </Link>
    </nav>
  )
}
