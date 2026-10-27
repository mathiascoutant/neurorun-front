'use client'

import { useMemo, useState } from 'react'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import { parsePlanOutline } from '@/lib/planOutline'

/*
 * Les sections du plan qui ne sont pas le calendrier : faisabilité, repères
 * d'allure, sécurité, échanges avec le coach.
 *
 * On les lit une fois au début, puis on y revient ponctuellement. Elles sont donc
 * repliées, sauf la première : dépliées, elles repoussaient les séances hors de
 * l'écran. Un plan lu deux fois ne mérite pas la place d'un plan lu chaque jour.
 */

export function GoalGuidance({ plan }: { plan: string }) {
  const outline = useMemo(() => parsePlanOutline(plan), [plan])
  const [open, setOpen] = useState<string | null>(outline.sections[0]?.title ?? null)

  if (outline.sections.length === 0) {
    return <SimplePlanBody text={plan} className="max-w-[72ch]" />
  }

  return (
    <div className="chart-card overflow-hidden">
      {outline.sections.map((section, i) => {
        const expanded = open === section.title
        return (
          <div key={section.title} className={i > 0 ? 'border-t border-white/[0.06]' : ''}>
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : section.title)}
                className="flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-3 px-4 text-left sm:px-5 transition-colors hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange/60"
              >
                <span className="text-[15px] font-semibold text-white/90">
                  {section.title}
                </span>
                <svg
                  className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${
                    expanded ? 'rotate-180' : ''
                  }`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </h3>
            {expanded ? (
              <div className="px-4 pb-5 pt-1 sm:px-5">
                <SimplePlanBody text={section.body} className="max-w-[72ch]" />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
