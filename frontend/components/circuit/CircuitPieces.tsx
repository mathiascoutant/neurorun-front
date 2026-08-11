'use client'

import type { ReactNode } from 'react'
import type { CircuitSummary } from '@/lib/api'

/*
 * Blocs de la page Parcours.
 *
 * Même grammaire visuelle que l’historique de courses : une mesure sert d’ancre
 * à gauche, les informations secondaires passent en icônes, et les intitulés ne
 * se répètent pas d’une ligne à l’autre.
 */

/** Longueur d’un tracé : mètres sous le kilomètre, sinon km à deux décimales. */
function fmtCircuitLength(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m) || m < 0) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toLocaleString('fr-FR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} km`
}

/** Longueur découpée pour l’ancre de la carte : valeur d’un côté, unité de l’autre. */
function splitLength(m: number | null | undefined): { value: string; unit: string } {
  if (m == null || !Number.isFinite(m) || m < 0) return { value: '—', unit: '' }
  if (m < 1000) return { value: String(Math.round(m)), unit: 'm' }
  return {
    value: (m / 1000).toLocaleString('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }),
    unit: 'km',
  }
}

/** Distance jusqu’au départ : arrondie au plus lisible selon l’ordre de grandeur. */
function fmtDistanceToStart(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—'
  if (m < 950) return `${Math.round(m / 10) * 10} m`
  return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
}

const ICONS = {
  pin: 'M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z',
  runners:
    'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  trophy:
    'M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.871M7.5 18.75v-3.375c0-.621.504-1.125 1.125-1.125h.872m5.007 0H9.497m5.007 0a7.454 7.454 0 01-.982-3.172M9.497 14.25a7.454 7.454 0 00.981-3.172M5.25 4.236c-.982.143-1.954.317-2.916.52A6.003 6.003 0 007.73 9.728M5.25 4.236V4.5c0 2.108.966 3.99 2.48 5.228M5.25 4.236V2.721C7.456 2.41 9.71 2.25 12 2.25c2.291 0 4.545.16 6.75.47v1.516M7.73 9.728a6.726 6.726 0 002.748 1.35m8.272-6.842V4.5c0 2.108-.966 3.99-2.48 5.228m2.48-5.492a46.32 46.32 0 012.916.52 6.003 6.003 0 01-5.395 4.972m0 0a6.726 6.726 0 01-2.749 1.35m0 0a6.772 6.772 0 01-3.044 0',
} as const

function Meta({
  icon,
  children,
  label,
  highlight,
}: {
  icon: keyof typeof ICONS
  children: ReactNode
  label: string
  highlight?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" title={label}>
      <svg
        className={`h-3.5 w-3.5 shrink-0 ${highlight ? 'text-brand-orange/70' : 'text-white/28'}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[icon]} />
      </svg>
      <span className={highlight ? 'font-medium text-brand-orange' : 'text-white/62'}>{children}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/* --------------------------------------------------------- carte de parcours */

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
  const len = splitLength(circuit.length_m)
  const runners = circuit.participant_count ?? 0

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={`group/circuit relative flex w-full cursor-pointer items-center gap-3.5 rounded-[18px] border py-3.5 pl-4 pr-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${
        selected
          ? 'border-brand-orange/40 bg-brand-orange/[0.07]'
          : 'border-white/[0.07] bg-[#0d0f16] hover:border-white/[0.16] hover:bg-[#12151f]'
      }`}
    >
      <span
        aria-hidden
        className={`absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-brand-orange transition-opacity duration-200 ${
          selected ? 'opacity-100' : 'opacity-0 group-hover/circuit:opacity-50'
        }`}
      />

      {/* Ancre de lecture : la longueur du tracé, alignée d’une carte à l’autre. */}
      <span className="w-[68px] shrink-0">
        <span className="block font-display text-[20px] font-bold leading-none tracking-[-0.025em] tabular-nums text-white">
          {len.value}
          {len.unit ? <span className="ml-1 text-[11px] font-semibold text-white/35">{len.unit}</span> : null}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-tight text-white/92">
          {circuit.name}
        </span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[12px] leading-none">
          <Meta icon="pin" label="Distance jusqu’au départ" highlight>
            {distanceToStartM != null ? `à ${fmtDistanceToStart(distanceToStartM)}` : 'position inconnue'}
          </Meta>
          <Meta icon="runners" label="Coureurs classés">
            {runners > 0 ? `${runners} coureur${runners > 1 ? 's' : ''}` : 'aucun temps'}
          </Meta>
        </span>
      </span>

      <svg
        className={`h-4 w-4 shrink-0 text-white/20 transition-colors group-hover/circuit:text-white/55 ${
          selected ? 'text-brand-orange/70' : ''
        }`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

/* ------------------------------------------------------------ fiche détail */

/**
 * Chiffres-clés d’un parcours.
 *
 * Remplace la liste « intitulé à gauche, valeur à droite » : sur cinq lignes,
 * l’œil faisait cinq allers-retours d’un bord à l’autre de la carte. En grille,
 * chaque valeur est lue là où elle est.
 */
export function CircuitStats({
  lengthM,
  participants,
  completions,
  record,
}: {
  lengthM: number | null | undefined
  participants: number
  completions: number
  record: string | null
}) {
  const items: { label: string; value: string }[] = [
    { label: 'Longueur', value: fmtCircuitLength(lengthM) },
    { label: 'Record', value: record ?? '—' },
    { label: 'Coureurs', value: String(participants) },
    { label: 'Complétions', value: String(completions) },
  ]

  return (
    <div className="grid grid-cols-2 gap-2.5">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl border border-white/[0.07] bg-[#0d0f16] px-3.5 py-3">
          <p className="text-[9.5px] uppercase tracking-[0.13em] text-white/28">{it.label}</p>
          <p className="mt-1.5 truncate font-display text-[17px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-white/92">
            {it.value}
          </p>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------- classement */

/** Teintes du podium — l’or reprend l’orange de marque plutôt qu’un jaune importé. */
const PODIUM = [
  { ring: 'border-brand-orange/45 bg-brand-orange/15 text-brand-orange', time: 'text-brand-orange' },
  { ring: 'border-white/20 bg-white/[0.09] text-white/80', time: 'text-white/80' },
  { ring: 'border-amber-700/40 bg-amber-700/15 text-amber-500/90', time: 'text-amber-500/90' },
] as const

export function LeaderboardCard({
  rows,
}: {
  rows: { id: string; name: string; time: string }[]
}) {
  return (
    <section className="rounded-[20px] border border-white/[0.07] bg-[#0d0f16] p-4">
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-4 w-4 text-brand-orange/70"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={ICONS.trophy} />
        </svg>
        <h3 className="font-display text-[15px] font-semibold text-white/92">Classement</h3>
      </div>

      <ol className="space-y-0.5">
        {rows.map((r, i) => {
          const podium = i < 3 ? PODIUM[i] : null
          return (
            <li key={r.id} className="flex items-center gap-3 rounded-xl px-1 py-2 transition hover:bg-white/[0.03]">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold tabular-nums ${
                  podium ? podium.ring : 'border-white/[0.08] bg-white/[0.03] text-white/35'
                }`}
              >
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13.5px] text-white/85">{r.name}</span>
              <span
                className={`shrink-0 font-display text-[13.5px] font-semibold tabular-nums ${
                  podium ? podium.time : 'text-white/55'
                }`}
              >
                {r.time}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
