'use client'

import { useRef } from 'react'

/*
 * Onglets du détail d'un objectif.
 *
 * Le plan, le calendrier et la discussion coach se disputaient la largeur en
 * trois colonnes : chacun était trop étroit sur ordinateur, et sur téléphone la
 * discussion se retrouvait à des milliers de pixels sous le plan. Un seul de ces
 * contenus à la fois, sur toute la largeur, règle les deux.
 *
 * L'ordre suit l'usage : le programme de la semaine d'abord, les repères qu'on
 * relit rarement ensuite.
 */

export type GoalTabId = 'program' | 'guidance' | 'calendar' | 'coach'

export const GOAL_TABS: { id: GoalTabId; label: string; icon: string }[] = [
  {
    id: 'program',
    label: 'Programme',
    icon: 'M8 6h9M8 12h9M8 18h5M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  },
  {
    id: 'guidance',
    label: 'Repères',
    icon: 'M12 3.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.77l-5.2 2.73.99-5.78-4.21-4.1 5.82-.85z',
  },
  {
    id: 'calendar',
    label: 'Calendrier',
    icon: 'M7 4v2m10-2v2M4 9h16M5.5 6h13a1.5 1.5 0 011.5 1.5v11A1.5 1.5 0 0118.5 20h-13A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6z',
  },
  {
    id: 'coach',
    label: 'Coach',
    icon: 'M4.5 4.5h15a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5h-5.69l-3.87 3.53a.75.75 0 01-1.26-.55v-2.98H4.5A1.5 1.5 0 013 14.25V6a1.5 1.5 0 011.5-1.5z',
  },
]

export function GoalTabs({
  active,
  onChange,
  badges,
}: {
  active: GoalTabId
  onChange: (id: GoalTabId) => void
  /** Pastille facultative par onglet (ex. nombre de messages non lus). */
  badges?: Partial<Record<GoalTabId, number>>
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  // Flèches gauche/droite entre onglets : comportement attendu d'un tablist.
  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % GOAL_TABS.length
        : (index - 1 + GOAL_TABS.length) % GOAL_TABS.length
    const id = GOAL_TABS[next].id
    onChange(id)
    refs.current[id]?.focus()
  }

  return (
    <div
      role="tablist"
      aria-label="Sections de l’objectif"
      className="flex gap-1 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-1"
    >
      {GOAL_TABS.map((tab, i) => {
        const selected = tab.id === active
        const badge = badges?.[tab.id]
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el
            }}
            type="button"
            role="tab"
            id={`goal-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`goal-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-medium transition duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 ${
              selected
                ? 'bg-white/[0.1] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                : 'text-white/50 hover:bg-white/[0.05] hover:text-white/80'
            }`}
          >
            <svg
              className="h-[18px] w-[18px] shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
            </svg>
            <span className="truncate max-[420px]:sr-only">{tab.label}</span>
            {badge ? (
              <span className="rounded-full bg-brand-orange/25 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-brand-orange">
                {badge}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
