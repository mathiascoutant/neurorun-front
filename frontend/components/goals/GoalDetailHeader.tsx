'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkline } from '@/components/dashboard/Sparkline'
import { StatTile } from '@/components/dashboard/StatTile'
import { SERIES } from '@/components/dashboard/chartTheme'
import { PageHeading, formatDeadline, formatTarget, weeklyVolume } from '@/components/goals/GoalPieces'
import type { Goal } from '@/lib/api'
import { TERRAIN_LABELS, goalTimeline, plannedVolumeKm } from '@/lib/goalStats'

/*
 * En-tête d'un objectif ouvert.
 *
 * Même langage que le tableau de bord : surtitre et titre, puis quatre tuiles
 * de chiffres-clés — le compte à rebours en accent, l'avancement et la forme du
 * volume prévu en pied de tuile.
 *
 * La suppression quitte le fil de lecture pour un menu : une action irréversible
 * n'a pas à occuper la place d'une action principale.
 */

function ActionsMenu({ onDelete, deleting }: { onDelete: () => void; deleting: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-white/50 transition-colors duration-150 hover:bg-white/[0.05] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Actions sur l’objectif"
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 w-52 overflow-hidden rounded-lg border border-white/[0.08] bg-[#14161d] p-1 shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-50"
            disabled={deleting}
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M10 11v6m4-6v6M7 7l1 12a1 1 0 001 1h6a1 1 0 001-1l1-12M9.5 7V5a1 1 0 011-1h3a1 1 0 011 1v2" />
            </svg>
            {deleting ? 'Suppression…' : 'Supprimer l’objectif'}
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function GoalDetailHeader({
  goal,
  onBack,
  onDelete,
  deleting,
}: {
  goal: Goal
  /** Retour à la liste des objectifs. */
  onBack: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const t = goalTimeline(goal)
  const volume = plannedVolumeKm(goal.planned_sessions ?? [])
  const percent = Math.round(t.ratio * 100)
  const target = formatTarget(goal.target_time)
  const weeks = weeklyVolume(goal)

  return (
    <header className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-lg px-1 text-[13px] font-medium text-white/50 transition-colors duration-150 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
          Tous les objectifs
        </button>
        <ActionsMenu onDelete={onDelete} deleting={deleting} />
      </div>

      <PageHeading
        kicker={`${TERRAIN_LABELS[goal.terrain]} · ${t.finished ? 'course passée le' : 'course le'} ${formatDeadline(t.end, 'long')}`}
        title={target ? `${goal.distance_label} en ${target}` : goal.distance_label}
      />

      {/* Chiffres-clés — mêmes tuiles que le tableau de bord. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          accent
          label="Course dans"
          value={t.finished ? '—' : t.daysLeft === 0 ? 'Jour J' : String(t.daysLeft ?? '—')}
          unit={!t.finished && t.daysLeft ? (t.daysLeft > 1 ? 'jours' : 'jour') : undefined}
          hint={t.finished ? 'Course terminée' : formatDeadline(t.end, 'long')}
        />
        <StatTile
          label="Semaine"
          value={String(t.currentWeek)}
          unit={`/ ${t.totalWeeks}`}
          footer={
            <div
              className="h-1.5 overflow-hidden rounded-full bg-white/[0.07]"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-label="Avancement de la préparation"
            >
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{ width: `${Math.max(2, percent)}%`, backgroundImage: 'linear-gradient(90deg, #c73d00, #fc4c02)' }}
              />
            </div>
          }
        />
        <StatTile
          label="Séances"
          value={String(goal.sessions_per_week)}
          unit="/ semaine"
          hint={target ? `Objectif ${target}` : undefined}
        />
        <StatTile
          label="Volume prévu"
          value={volume > 0 ? String(Math.round(volume)) : '—'}
          unit={volume > 0 ? 'km' : undefined}
          footer={
            weeks.length > 2 && volume > 0 ? (
              <Sparkline values={weeks} color={SERIES.brand} ariaLabel="Volume prévu par semaine" />
            ) : null
          }
        />
      </div>
    </header>
  )
}
