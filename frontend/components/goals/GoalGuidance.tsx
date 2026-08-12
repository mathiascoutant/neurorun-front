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
    <div className="space-y-2.5">
      {outline.sections.map((section) => {
        const expanded = open === section.title
        return (
          <div
            key={section.title}
            className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]"
          >
            <h3>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : section.title)}
                className="flex min-h-[52px] w-full items-center justify-between gap-3 px-4 text-left transition hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-orange/60"
              >
                <span className="font-display text-[14px] font-semibold text-white/92">
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
              <div className="border-t border-white/[0.06] px-4 py-3.5">
                <SimplePlanBody text={section.body} className="max-w-[72ch]" />
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
