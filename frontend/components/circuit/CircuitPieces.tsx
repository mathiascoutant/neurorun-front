'use client'

import type { ReactNode } from 'react'
import type { CircuitSummary } from '@/lib/api'

/*
 * Blocs de la page Parcours — repris de `CircuitScreen` de l’app mobile :
 * carte de parcours à liseré + pastilles, fiche « À propos », classement.
 */

/** Longueur d’un tracé : mètres sous le kilomètre, sinon km à deux décimales. */
export function fmtCircuitLength(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m) || m < 0) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} km`
}

/** Distance jusqu’au départ : arrondie au plus lisible selon l’ordre de grandeur. */
export function fmtDistanceToStart(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—'
  if (m < 950) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

export function participantShortLabel(c: CircuitSummary): string {
  const n = c.participant_count ?? 0
  if (n <= 0) return 'Aucun temps'
  return `${n} coureur${n > 1 ? 's' : ''}`
}

/* --------------------------------------------------------- carte de parcours */

function Pill({ children, highlight }: { children: ReactNode; highlight?: boolean }) {
  return (
    <span
      className={`inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-[5px] text-[13px] ${
        highlight
          ? 'border-brand-orange/25 bg-brand-orange/[0.08] font-medium text-brand-orange'
          : 'border-white/[0.12] bg-white/[0.06] text-white/60'
      }`}
    >
      {children}
    </span>
  )
}

export function CircuitListCard({
  circuit,
  distanceToStartM,
  selected,
  onOpen,
}: {
  circuit: CircuitSummary
  /** Distance entre la position de l’utilisateur et le départ, si connue. */
  distanceToStartM: number | null
  selected: boolean
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={`flex w-full items-stretch gap-3 rounded-[20px] border p-4 text-left transition ${
        selected
          ? 'border-brand-orange/45 bg-brand-orange/[0.07]'
          : 'border-white/[0.12] bg-[#13161f] hover:border-white/20 hover:bg-[#171b26]'
      }`}
    >
      <span className="w-[3px] shrink-0 self-stretch rounded-full bg-brand-orange" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="min-w-0 flex-1 font-display text-base font-semibold leading-snug text-white/95">
            {circuit.name}
          </span>
          <span className="shrink-0 font-display text-xl leading-none text-white/20">›</span>
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-2">
          <Pill highlight>
            {distanceToStartM != null ? `Départ à ${fmtDistanceToStart(distanceToStartM)}` : 'Départ —'}
          </Pill>
          <Pill>{fmtCircuitLength(circuit.length_m)}</Pill>
          <Pill>{participantShortLabel(circuit)}</Pill>
        </span>
      </span>
    </button>
  )
}

/* ------------------------------------------------------------ fiche détail */

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="shrink-0 text-[15px] text-white/60">{label}</span>
      <span className="min-w-0 flex-1 text-right text-[15px] font-medium text-white/92">{value}</span>
    </div>
  )
}

export function DetailInfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-4">
      <h3 className="mb-1 font-display text-[17px] font-semibold text-white/92">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------- classement */

export function LeaderboardCard({
  rows,
}: {
  rows: { id: string; name: string; time: string }[]
}) {
  return (
    <section className="rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-4">
      <h3 className="mb-3 font-display text-[17px] font-semibold text-white/92">Classement</h3>
      <ol>
        {rows.map((r, i) => (
          <li
            key={r.id}
            className={`flex items-center gap-2 rounded-lg px-1 py-2 ${
              i % 2 === 0 ? 'bg-white/[0.04]' : ''
            }`}
          >
            <span className="w-10 shrink-0 text-[15px] font-medium text-brand-orange">#{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-[15px] text-white/92">{r.name}</span>
            <span className="shrink-0 text-[15px] font-medium tabular-nums text-brand-ice">{r.time}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
