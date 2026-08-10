'use client'

import { useEffect, useState, type ReactNode } from 'react'
import type {
  ForecastAdjustEnergy,
  ForecastConfidence,
  RaceForecastPayload,
  RaceLegForecast,
} from '@/lib/api'

/*
 * Blocs de la page Prévision — repris de `PrevisionScreen` de l’app mobile :
 * héro de synthèse, panneau « Forme du jour », carte par distance, méthode.
 */

/* ------------------------------------------------------------------ formats */

export function fmtTime(sec: number): string {
  if (!sec || sec <= 0) return '—'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

export function fmtPaceShort(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.floor(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}/km`
}

function fmtGeneratedAt(iso: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function fmtKm(km: number): string {
  return String(km.toFixed(1)).replace('.', ',')
}

/* -------------------------------------------------------------- vocabulaire */

const LEG_SHORT_LABEL: Record<string, string> = {
  '5k': '5 km',
  '10k': '10 km',
  half: 'semi',
  marathon: 'marathon',
}

export function legIsInsufficient(leg: RaceLegForecast): boolean {
  return leg.time_sec <= 0 || leg.data_source === 'insufficient_data'
}

/** Origine de l’estimation en clair — jamais l’identifiant technique brut. */
function legSourceLine(leg: RaceLegForecast): string {
  if (leg.data_source === 'riegel_extrapolation') {
    const ref = leg.ref_leg_id ? LEG_SHORT_LABEL[leg.ref_leg_id] : ''
    return ref
      ? `Aucune sortie à cette distance — projeté depuis ton ${ref}`
      : 'Aucune sortie à cette distance — projection'
  }
  const n = leg.direct_runs ?? 0
  if (n > 0) {
    return `${n} sortie${n > 1 ? 's' : ''} à cette distance · ${leg.sample_runs} au total dans le calcul`
  }
  return 'D’après tes meilleurs efforts'
}

const CONFIDENCE_META: Record<
  ForecastConfidence,
  { label: string; color: string; bg: string }
> = {
  high: { label: 'Fiable', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.14)' },
  medium: { label: 'Indicatif', color: '#67e8f9', bg: 'rgba(103, 232, 249, 0.15)' },
  low: { label: 'Très approximatif', color: '#eab308', bg: 'rgba(234, 179, 8, 0.14)' },
}

/** Demi-largeur relative de la fourchette, sur un axe fixe de ±25 %. */
const RANGE_AXIS = 0.25

function rangeSpread(leg: RaceLegForecast): number {
  if (!leg.time_low_sec || !leg.time_high_sec || leg.time_sec <= 0) return 0
  return (leg.time_high_sec - leg.time_low_sec) / 2 / leg.time_sec
}

/** Projeter un semi / marathon sans sortie longue reste très théorique. */
function enduranceNote(leg: RaceLegForecast): string | null {
  const longest = leg.longest_run_km
  if (!longest || leg.distance_km <= 10 || leg.time_sec <= 0) return null
  if (longest >= leg.distance_km * 0.75) return null
  return `Ta plus longue sortie récente fait ${fmtKm(longest)} km : le chrono est majoré pour tenir compte du manque de références longues.`
}

function hrHint(leg: RaceLegForecast): string | null {
  if (typeof leg.target_hr_bpm === 'number' && leg.target_hr_bpm > 0) {
    return `FC visée · ${Math.round(leg.target_hr_bpm)} bpm`
  }
  if (
    typeof leg.hr_band_low === 'number' &&
    typeof leg.hr_band_high === 'number' &&
    leg.hr_band_high > 0
  ) {
    return `Zone · ${Math.round(leg.hr_band_low)}–${Math.round(leg.hr_band_high)} bpm`
  }
  return null
}

/* -------------------------------------------------------------------- icônes */

function Icon({ d, className = 'h-5 w-5' }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  )
}

export const ENERGY_OPTIONS: {
  key: ForecastAdjustEnergy
  label: string
  hint: string
  color: string
  icon: string
}[] = [
  {
    key: 'great',
    label: 'En forme',
    hint: 'Jambes fraîches, sommeil correct : les chronos visés sont un peu plus ambitieux.',
    color: '#22c55e',
    icon: 'M2.25 18L9 11.25l4.5 4.5L21.75 6M21.75 6h-6m6 0v6',
  },
  {
    key: 'normal',
    label: 'Normal',
    hint: 'Ni pic ni creux : la projection reste alignée sur tes dernières sorties.',
    color: '#67e8f9',
    icon: 'M3.75 9h16.5M3.75 15h16.5',
  },
  {
    key: 'tired',
    label: 'Sur la réserve',
    hint: 'Fatigue, sommeil court, grosse semaine : les chronos sont adoucis.',
    color: '#eab308',
    icon: 'M2.25 6L9 12.75l4.5-4.5L21.75 18M21.75 18h-6m6 0v-6',
  },
]

function energyMeta(energy: ForecastAdjustEnergy) {
  return ENERGY_OPTIONS.find((o) => o.key === energy) ?? ENERGY_OPTIONS[1]
}

function FoldChevron({ open }: { open: boolean }) {
  return (
    <span className={`shrink-0 text-white/38 transition-transform ${open ? 'rotate-180' : ''}`}>
      <Icon d="M6 9l6 6 6-6" className="h-5 w-5" />
    </span>
  )
}

/* --------------------------------------------------------------- héro résumé */

export function HeroSummary({ forecast }: { forecast: RaceForecastPayload }) {
  const months = forecast.window_days && forecast.window_days > 0 ? Math.round(forecast.window_days / 30) : 0
  const longest = forecast.longest_run_km ? `${fmtKm(forecast.longest_run_km)} km` : '—'
  const stats = [
    { value: String(forecast.runs_analyzed), label: 'sorties retenues' },
    { value: months > 0 ? `${months} mois` : '—', label: 'd’historique' },
    { value: longest, label: 'plus longue' },
  ]

  return (
    <section
      className="overflow-hidden rounded-[24px] border border-white/[0.12] p-5 sm:p-6"
      style={{
        backgroundImage:
          'linear-gradient(135deg, rgba(252,76,2,0.20) 0%, rgba(103,232,249,0.07) 45%, rgba(13,15,22,0.96) 100%)',
      }}
    >
      <p className="app-kicker text-brand-orange">Projection</p>
      <h2 className="mt-2 font-display text-[22px] font-semibold leading-tight tracking-[-0.3px] text-white sm:text-2xl">
        Ce que tu peux viser aujourd’hui
      </h2>
      <p className="mt-2 text-[13px] leading-[19px] text-white/60">
        Chronos estimés à partir de tes sorties réelles, en donnant plus de poids aux plus récentes et aux
        distances proches de l’épreuve.
      </p>

      <div className="mt-5 flex items-stretch rounded-2xl bg-black/35 px-2 py-3">
        {stats.map((s, i) => (
          <div key={s.label} className="flex flex-1 items-stretch">
            {i > 0 ? <span className="w-px shrink-0 bg-white/[0.18]" /> : null}
            <div className="flex flex-1 flex-col items-center justify-center gap-1 px-1 text-center">
              <span className="font-display text-[17px] font-semibold leading-[22px] tabular-nums text-white">
                {s.value}
              </span>
              <span className="text-[11px] leading-[14px] text-white/38">{s.label}</span>
            </div>
          </div>
        ))}
      </div>

      {forecast.generated_at ? (
        <p className="mt-3 text-[11px] text-white/20">Calculé le {fmtGeneratedAt(forecast.generated_at)}</p>
      ) : null}
    </section>
  )
}

/* ----------------------------------------------------------- forme du jour */

export function FormeDuJourPanel({
  energy,
  onEnergy,
  injured,
  onInjured,
  adjustLoading,
  onAdjust,
  onReset,
  adjustError,
  applied,
}: {
  energy: ForecastAdjustEnergy
  onEnergy: (v: ForecastAdjustEnergy) => void
  injured: boolean
  onInjured: (v: boolean) => void
  adjustLoading: boolean
  onAdjust: () => void
  onReset: () => void
  adjustError: string
  applied: boolean
}) {
  const [open, setOpen] = useState(false)
  const active = energyMeta(energy)

  /* Une erreur repliée serait invisible : on rouvre le panneau. */
  useEffect(() => {
    if (adjustError) setOpen(true)
  }, [adjustError])

  return (
    <section className="rounded-[20px] border border-white/[0.12] bg-[#13161f] p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 text-left"
      >
        <span
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-2xl border bg-white/[0.04]"
          style={{ borderColor: `${active.color}44`, color: active.color }}
        >
          <Icon d={active.icon} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[17px] font-semibold text-white/95">Forme du jour</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold" style={{ color: active.color }}>
              {active.label}
            </span>
            {injured ? (
              <span className="rounded-lg border border-brand-orange/35 bg-brand-orange/[0.08] px-2 py-0.5 text-[11px] font-semibold text-brand-orange">
                Prudent
              </span>
            ) : null}
            {applied ? (
              <span className="rounded-lg bg-white/[0.08] px-2 py-0.5 text-[11px] text-white/38">appliqué</span>
            ) : null}
          </span>
        </span>
        <FoldChevron open={open} />
      </button>

      {open ? (
        <div className="mt-5 space-y-3">
          <p className="text-xs leading-[18px] text-white/38">
            Un curseur subjectif appliqué par-dessus la projection statistique — il ne modifie jamais tes données.
          </p>

          <div className="flex gap-2" role="radiogroup" aria-label="Forme du jour">
            {ENERGY_OPTIONS.map((opt) => {
              const selected = energy === opt.key
              return (
                <button
                  key={opt.key}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onEnergy(opt.key)}
                  className="flex min-h-[84px] flex-1 flex-col items-center gap-2 rounded-2xl border px-1.5 py-3 transition"
                  style={
                    selected
                      ? { backgroundColor: `${opt.color}1f`, borderColor: `${opt.color}66`, color: opt.color }
                      : {
                          backgroundColor: 'rgba(255,255,255,0.04)',
                          borderColor: 'rgba(255,255,255,0.08)',
                          color: 'rgba(255,255,255,0.38)',
                        }
                  }
                >
                  <Icon d={opt.icon} className="h-[18px] w-[18px]" />
                  <span
                    className={`text-center text-[11px] leading-[15px] ${
                      selected ? 'font-semibold' : 'font-medium text-white/60'
                    }`}
                  >
                    {opt.label}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex gap-2.5">
            <span
              className="w-0.5 shrink-0 rounded-full opacity-60"
              style={{ backgroundColor: active.color }}
              aria-hidden
            />
            <p className="text-xs leading-[18px] text-white/38">{active.hint}</p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={injured}
            onClick={() => onInjured(!injured)}
            className={`flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition ${
              injured
                ? 'border-brand-orange/35 bg-brand-orange/[0.08]'
                : 'border-white/[0.08] bg-white/[0.04]'
            }`}
          >
            <span
              className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-xl ${
                injured ? 'bg-brand-orange/[0.16] text-brand-orange' : 'bg-white/[0.06] text-white/38'
              }`}
            >
              <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path
                  d="M11.25 2.4a1.5 1.5 0 011.5 0l6.4 3.1a1.5 1.5 0 01.85 1.35v4.4c0 4.6-3.1 8.6-7.5 9.9-4.4-1.3-7.5-5.3-7.5-9.9v-4.4c0-.57.32-1.09.85-1.35l6.4-3.1z"
                  strokeWidth={1.7}
                  strokeLinejoin="round"
                />
                <path d="M9.5 12.2l1.9 1.9 3.4-3.6" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold text-white/92">Mode prudent</span>
              <span className="mt-0.5 block text-[11px] leading-[15px] text-white/38">
                Blessure, maladie ou grande fatigue — projections nettement plus conservatrices.
              </span>
            </span>
            <span
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                injured ? 'bg-brand-orange/45' : 'bg-white/[0.12]'
              }`}
              aria-hidden
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                  injured ? 'left-[1.375rem]' : 'left-0.5 bg-white/60'
                }`}
              />
            </span>
          </button>

          <button
            type="button"
            className="btn-brand w-full"
            disabled={adjustLoading}
            onClick={onAdjust}
          >
            {adjustLoading
              ? 'Calcul…'
              : applied
                ? 'Recalculer la projection'
                : 'Appliquer à mes chronos'}
          </button>

          {applied ? (
            <button type="button" className="btn-quiet w-full text-sm" onClick={onReset}>
              Revenir aux prévisions brutes
            </button>
          ) : null}

          {adjustError ? (
            <p className="text-center text-[13px] leading-5 text-red-400">{adjustError}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------------------- titre section */

export function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="pt-4">
      <p className="app-kicker text-brand-orange">{eyebrow}</p>
      <h2 className="mt-1 font-display text-xl font-semibold text-white/95">{title}</h2>
    </div>
  )
}

/* ---------------------------------------------------------- carte distance */

function ConfidenceChip({ level }: { level: ForecastConfidence }) {
  const meta = CONFIDENCE_META[level] ?? CONFIDENCE_META.medium
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ backgroundColor: meta.bg, color: meta.color }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
      {meta.label}
    </span>
  )
}

/** Axe fixe ±25 % : plus la zone colorée est large, moins la projection est resserrée. */
function RangeBar({ spread, color }: { spread: number; color: string }) {
  const pct = Math.min(spread / RANGE_AXIS, 1)
  const widthPct = Math.max(pct * 100, 6)
  return (
    <div className="relative flex h-1.5 items-center justify-center overflow-hidden rounded-full bg-white/[0.08]">
      <span
        className="absolute h-1.5 rounded-full"
        style={{ width: `${widthPct}%`, backgroundColor: color, opacity: 0.35 }}
      />
      <span className="relative h-2.5 w-0.5 rounded-full" style={{ backgroundColor: color }} />
    </div>
  )
}

export function LegCard({
  leg,
  adjusted,
  children,
}: {
  leg: RaceLegForecast
  /** Version ajustée « forme du jour », si elle diffère de la projection brute. */
  adjusted?: RaceLegForecast
  /** Bloc dépliable propre au web (détail km, FC cible). */
  children?: ReactNode
}) {
  const insufficient = legIsInsufficient(leg)
  const hasAdj = !insufficient && adjusted != null && adjusted.time_sec !== leg.time_sec
  const shown = hasAdj && adjusted ? adjusted : leg
  const meta = CONFIDENCE_META[leg.confidence] ?? CONFIDENCE_META.medium
  const hr = insufficient ? null : hrHint(shown)
  const note = insufficient ? null : enduranceNote(leg)

  return (
    <article className="rounded-[20px] border border-white/[0.12] bg-[#13161f] p-5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-[17px] font-semibold text-white/95">{leg.label}</h3>
          <p className="mt-1 text-[11px] tabular-nums text-white/38">
            {String(leg.distance_km.toFixed(2)).replace('.', ',')} km
          </p>
        </div>
        {insufficient ? null : <ConfidenceChip level={leg.confidence} />}
      </div>

      {insufficient ? (
        <>
          <p className="mt-3 font-display text-[40px] font-bold leading-[44px] tracking-[-1.2px] text-white/20">—</p>
          <p className="mt-2 text-xs leading-[18px] text-white/38">
            Pas encore de sortie exploitable pour estimer cette distance.
          </p>
        </>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <span className="font-display text-[40px] font-bold leading-[44px] tracking-[-1.2px] tabular-nums text-white">
              {fmtTime(shown.time_sec)}
            </span>
            {hasAdj ? (
              <span className="rounded-full bg-brand-ice/15 px-2.5 py-0.5 text-[11px] font-semibold text-brand-ice">
                ajusté
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-base font-medium tabular-nums text-white/60">
            {fmtPaceShort(shown.pace_sec_per_km)}
            {hr ? <span className="font-normal text-white/38">{`  ·  ${hr}`}</span> : null}
          </p>

          {shown.time_low_sec && shown.time_high_sec ? (
            <div className="mt-4 space-y-2">
              <RangeBar spread={rangeSpread(shown)} color={meta.color} />
              <p className="text-xs tabular-nums text-white/60">
                Fourchette réaliste {fmtTime(shown.time_low_sec)} – {fmtTime(shown.time_high_sec)}
              </p>
            </div>
          ) : null}

          {hasAdj ? (
            <p className="mt-2 text-[11px] tabular-nums text-white/38">
              Sans ajustement forme : {fmtTime(leg.time_sec)}
            </p>
          ) : null}

          <div className="mt-4 space-y-1.5 border-t border-white/[0.08] pt-3">
            <p className="text-[11px] leading-4 text-white/38">{legSourceLine(leg)}</p>
            {note ? <p className="text-[11px] leading-4 text-yellow-500/90">{note}</p> : null}
          </div>

          {children}
        </>
      )}
    </article>
  )
}

/* ------------------------------------------------------------------ méthode */

const METHOD_POINTS: { title: string; body: string }[] = [
  {
    title: 'Toutes tes sorties comptent',
    body: 'Chaque sortie d’au moins 3 km est ramenée à une allure équivalente sur la distance visée (formule de Riegel), pas seulement celles qui font pile 5 ou 10 km.',
  },
  {
    title: 'Le récent pèse plus lourd',
    body: 'Une sortie de quatre mois compte deux fois moins qu’une sortie d’hier, et rien au-delà de 18 mois : c’est ta forme actuelle qui est projetée, pas ton record de 2022.',
  },
  {
    title: 'Une allure de bon jour, pas ta moyenne',
    body: 'L’estimation prend le haut du panier de tes allures (15 % les plus rapides, pondérées), ce qui approche l’allure tenue en course sans se caler sur un pic GPS isolé.',
  },
  {
    title: 'Le long ne s’improvise pas',
    body: 'Sans sortie longue récente, le semi et le marathon sont majorés et signalés comme approximatifs : Riegel seul est trop optimiste sur ces distances.',
  },
]

export function MethodCard() {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-[20px] border border-white/[0.08] bg-[#0d0f16] px-4 py-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[44px] w-full items-center gap-2 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold text-white/92">Comment c’est calculé</span>
          <span className="mt-0.5 block text-[11px] text-white/38">La méthode, ses forces et ses limites.</span>
        </span>
        <FoldChevron open={open} />
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          {METHOD_POINTS.map((p) => (
            <div key={p.title} className="flex gap-2.5">
              <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-white/92">{p.title}</p>
                <p className="mt-0.5 text-xs leading-[18px] text-white/38">{p.body}</p>
              </div>
            </div>
          ))}
          <p className="border-t border-white/[0.08] pt-3 text-[11px] leading-4 text-white/20">
            Une projection reste une projection : météo, parcours, sommeil et gestion de course pèsent facilement
            autant que la fourchette affichée.
          </p>
        </div>
      ) : null}
    </section>
  )
}

/* ------------------------------------------------ justification d’ajustement */

export function RationaleCard({ text, aiUsed }: { text: string; aiUsed: boolean }) {
  return (
    <section className="relative overflow-hidden rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-5 pl-7">
      <span className="absolute inset-y-0 left-0 w-1 bg-brand-ice/85" aria-hidden />
      <p className="app-kicker text-brand-ice">{aiUsed ? 'Ajustement IA' : 'Ajustement automatique'}</p>
      <p className="mt-2 text-sm leading-[22px] text-white/60">{text}</p>
      <p className="mt-3 text-[11px] leading-4 text-white/20">
        Ce facteur agit sur le ressenti déclaré, pas sur les données : la projection statistique reste celle
        affichée sous « Sans ajustement forme ».
      </p>
    </section>
  )
}
