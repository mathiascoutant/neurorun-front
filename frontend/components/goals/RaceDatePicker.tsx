'use client'

import { useEffect, useRef, useState } from 'react'
import { isoDay } from '@/lib/goalStats'

/*
 * Choix du jour de la course.
 *
 * Le champ date natif s'affiche en « jj/mm/aaaa » avec une icône quasi invisible
 * sur fond sombre, et son calendrier dépend du navigateur. Ici : la date écrite
 * en toutes lettres, et un calendrier du mois aux couleurs de l'app — semaines du
 * lundi, jours hors des bornes acceptées par le plan grisés.
 */

const WEEKDAYS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.']

function parseDay(iso: string): Date | null {
  if (!iso) return null
  const d = new Date(`${iso}T00:00:00`)
  return Number.isNaN(d.getTime()) ? null : d
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function RaceDatePicker({
  id,
  value,
  min,
  max,
  onChange,
}: {
  id?: string
  /** Jour choisi, AAAA-MM-JJ (vide si aucun). */
  value: string
  min: string
  max: string
  onChange: (iso: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const start = parseDay(value) ?? parseDay(min) ?? new Date()
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() })

  // À l'ouverture, on montre le mois du jour choisi (ou le premier mois possible).
  useEffect(() => {
    if (!open) return
    const d = parseDay(value) ?? parseDay(min) ?? new Date()
    setView({ y: d.getFullYear(), m: d.getMonth() })
  }, [open, value, min])

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

  const selected = parseDay(value)
  const minDay = parseDay(min)
  const maxDay = parseDay(max)
  const today = isoDay(new Date())

  const first = new Date(view.y, view.m, 1)
  const offset = (first.getDay() + 6) % 7
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate()
  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  const monthLabel = capitalize(first.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }))
  const canPrev = !minDay || new Date(view.y, view.m, 0) >= new Date(minDay.getFullYear(), minDay.getMonth(), 1)
  const canNext = !maxDay || new Date(view.y, view.m + 1, 1) <= maxDay

  function shift(delta: number) {
    setView(({ y, m }) => {
      const d = new Date(y, m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  const navBtn =
    'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white disabled:cursor-default disabled:opacity-25 disabled:hover:bg-transparent'

  return (
    <div className="relative" ref={ref}>
      <button
        id={id}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex min-h-[52px] w-full cursor-pointer items-center gap-3 rounded-xl border bg-white/[0.04] px-4 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/40 ${
          open ? 'border-brand-orange/45' : 'border-white/[0.1] hover:border-white/[0.18]'
        }`}
      >
        <svg className="h-[18px] w-[18px] shrink-0 text-white/50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 4v2m10-2v2M4 9h16M5.5 6h13a1.5 1.5 0 011.5 1.5v11A1.5 1.5 0 0118.5 20h-13A1.5 1.5 0 014 18.5v-11A1.5 1.5 0 015.5 6z" />
        </svg>
        <span className={`min-w-0 flex-1 truncate text-[15px] ${selected ? 'text-white' : 'text-white/40'}`}>
          {selected
            ? capitalize(
                selected.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
              )
            : 'Choisir le jour de la course'}
        </span>
        <svg
          className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Calendrier"
          className="absolute left-0 right-0 z-30 mt-2 rounded-2xl border border-white/[0.1] bg-[#12151f] p-4 shadow-[0_18px_40px_rgba(0,0,0,0.55)] sm:right-auto sm:w-[340px]"
        >
          <div className="flex items-center justify-between">
            <button type="button" className={navBtn} disabled={!canPrev} onClick={() => shift(-1)} aria-label="Mois précédent">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <p className="font-display text-[15px] font-semibold text-white" aria-live="polite">
              {monthLabel}
            </p>
            <button type="button" className={navBtn} disabled={!canNext} onClick={() => shift(1)} aria-label="Mois suivant">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <div className="mt-3 grid grid-cols-7 gap-1 text-center" aria-hidden>
            {WEEKDAYS.map((w) => (
              <span key={w} className="py-1 text-[11px] text-white/35">
                {w}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((day, i) => {
              if (day == null) return <span key={`e-${i}`} />
              const date = new Date(view.y, view.m, day)
              const iso = isoDay(date)
              const disabled = (minDay != null && date < minDay) || (maxDay != null && date > maxDay)
              const on = value === iso
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  aria-pressed={on}
                  aria-label={capitalize(date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
                  onClick={() => {
                    onChange(iso)
                    setOpen(false)
                  }}
                  className={`flex h-10 cursor-pointer items-center justify-center rounded-lg text-[14px] tabular-nums transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 disabled:cursor-default ${
                    on
                      ? 'bg-brand-orange font-semibold text-white'
                      : disabled
                        ? 'text-white/20'
                        : iso === today
                          ? 'text-white ring-1 ring-inset ring-white/25 hover:bg-white/[0.08]'
                          : 'text-white/85 hover:bg-white/[0.08]'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
