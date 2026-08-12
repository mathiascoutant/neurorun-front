'use client'

import { useEffect, useRef, useState } from 'react'
import type { Goal } from '@/lib/api'
import { formatCountdown, goalTimeline, plannedVolumeKm } from '@/lib/goalStats'

/*
 * En-tête d'un objectif ouvert.
 *
 * Il porte l'identité (quelle course, pour quand) et l'état d'avancement, qui
 * étaient auparavant noyés dans une ligne de texte gris. Les repères chiffrés
 * sont alignés en bande : ce sont eux qu'on relit d'un coup d'œil.
 *
 * La suppression quitte le fil de lecture pour un menu : une action irréversible
 * n'a pas à occuper la place d'une action principale.
 */

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase leading-none tracking-[0.12em] text-white/35">
        {label}
      </p>
      <p
        className={`mt-1.5 truncate font-display text-[15px] font-semibold leading-none tabular-nums ${
          accent ? 'text-brand-orange' : 'text-white/92'
        }`}
      >
        {value}
      </p>
    </div>
  )
}

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
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white/55 transition hover:border-white/20 hover:bg-white/[0.09] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Actions sur l’objectif"
        onClick={() => setOpen((o) => !o)}
      >
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-60 overflow-hidden rounded-2xl border border-white/[0.1] bg-[#12151f] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.55)]"
        >
          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-red-200/95 transition hover:bg-red-500/12 disabled:opacity-50"
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
  /** Retour à la liste — visible seulement tant que la liste est masquée (mobile). */
  onBack: () => void
  onDelete: () => void
  deleting: boolean
}) {
  const t = goalTimeline(goal)
  const volume = plannedVolumeKm(goal.planned_sessions ?? [])
  const weekRatio = t.totalWeeks > 0 ? Math.min(1, t.currentWeek / t.totalWeeks) : 0

  return (
    <header className="rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-brand-orange/[0.13] via-white/[0.02] to-transparent p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Revenir à mes objectifs"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white/70 transition hover:bg-white/[0.09] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 lg:hidden"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 5l-7 7 7 7" />
          </svg>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate font-display text-[22px] font-bold leading-tight tracking-[-0.02em] text-white sm:text-[26px]">
              {goal.distance_label}
            </h2>
            <span
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                t.finished
                  ? 'border-white/[0.12] bg-white/[0.05] text-white/50'
                  : 'border-emerald-400/30 bg-emerald-400/[0.1] text-emerald-200'
              }`}
            >
              {formatCountdown(t.daysLeft)}
            </span>
          </div>
          <p className="mt-1 text-[13px] text-white/45">
            Créé le {new Date(goal.created_at).toLocaleDateString('fr-FR')}
          </p>
        </div>

        <ActionsMenu onDelete={onDelete} deleting={deleting} />
      </div>

      {/* Repères chiffrés : une seule ligne de lecture, alignée et scannable. */}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/[0.07] pt-4 sm:grid-cols-4">
        <Stat label="Chrono visé" value={goal.target_time || '—'} accent />
        <Stat label="Durée" value={`${goal.weeks} sem.`} />
        <Stat label="Rythme" value={`${goal.sessions_per_week} × / sem.`} />
        <Stat label="Volume prévu" value={volume > 0 ? `${Math.round(volume)} km` : '—'} />
      </dl>

      <div className="mt-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[12px] font-medium text-white/70">
            Semaine {t.currentWeek} sur {t.totalWeeks}
          </p>
          <p className="text-[11px] tabular-nums text-white/35">{Math.round(weekRatio * 100)} %</p>
        </div>
        <div
          className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={t.totalWeeks}
          aria-valuenow={t.currentWeek}
          aria-label="Avancement de la préparation"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-orange to-[#ff8a4c] transition-[width] duration-500"
            style={{ width: `${Math.max(3, weekRatio * 100)}%` }}
          />
        </div>
      </div>
    </header>
  )
}
