import type { OfferConfigPayload } from './api'

export type TierFeatureKey = keyof OfferConfigPayload['tiers'][string]

/** Ordre et libellés des fonctionnalités, identiques à l’admin (app + site). */
export const TIER_FEATURE_ROWS: readonly (readonly [TierFeatureKey, string])[] = [
  ['coach_chat', 'Coach IA (chat)'],
  ['strava_dashboard', 'Tableaux & sync Strava'],
  ['goals', 'Objectifs & plans'],
  ['live_runs', 'Course GPS (live)'],
  ['forecast', 'Prévision course'],
  ['circuit', 'Calendrier (objectif)'],
  ['circuit_tracks', 'Parcours GPS + classements'],
] as const

/** Aligné sur `models.DefaultOfferConfig` (backend) — sert de repli si l’API est injoignable. */
export const DEFAULT_OFFER_CONFIG: OfferConfigPayload = {
  tiers: {
    standard: {
      coach_chat: true,
      strava_dashboard: false,
      goals: true,
      live_runs: true,
      forecast: false,
      circuit: false,
      circuit_tracks: false,
    },
    strava: {
      coach_chat: true,
      strava_dashboard: true,
      goals: true,
      live_runs: true,
      forecast: true,
      circuit: false,
      circuit_tracks: false,
    },
    performance: {
      coach_chat: true,
      strava_dashboard: true,
      goals: true,
      live_runs: true,
      forecast: true,
      circuit: true,
      circuit_tracks: true,
    },
  },
  prices_eur: {
    strava: 3.99,
    performance: 7.99,
  },
  tier_display_names: {
    standard: 'standard',
    strava: 'allure',
    performance: 'performance',
  },
}

/**
 * Fusionne la config serveur avec les défauts : les paliers ajoutés côté admin sont conservés,
 * et un champ manquant ne casse pas l’affichage.
 */
export function mergePublicOfferConfig(
  incoming: OfferConfigPayload | null | undefined,
): OfferConfigPayload {
  const base = DEFAULT_OFFER_CONFIG
  if (!incoming) return { ...base, tiers: { ...base.tiers } }

  const tiers: OfferConfigPayload['tiers'] = { ...base.tiers }
  for (const id of Object.keys(incoming.tiers ?? {})) {
    tiers[id] = { ...(base.tiers[id] ?? base.tiers.standard), ...incoming.tiers[id] }
  }
  return {
    tiers,
    prices_eur: { ...base.prices_eur, ...incoming.prices_eur },
    tier_display_names: { ...base.tier_display_names, ...incoming.tier_display_names },
  }
}

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/** Libellé d’offre configuré en admin (« allure », « performance »…). */
export function tierLabelFromConfig(
  cfg: OfferConfigPayload,
  plan: string | undefined | null,
): string {
  const p = (plan ?? 'standard').toLowerCase().trim()
  const raw = cfg.tier_display_names?.[p]
  if (raw != null && String(raw).trim() !== '') return String(raw).trim()
  return p
}

export function tierPriceEUR(cfg: OfferConfigPayload, plan: string): number {
  const v = cfg.prices_eur?.[plan]
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0
}

const CANONICAL_ORDER = ['standard', 'strava', 'performance']

/** Paliers connus dans l’ordre commercial, puis tout palier ajouté en admin, du moins cher au plus cher. */
export function orderedTierIds(cfg: OfferConfigPayload): string[] {
  const ids = Object.keys(cfg.tiers ?? {})
  const known = CANONICAL_ORDER.filter((id) => ids.includes(id))
  const extra = ids
    .filter((id) => !CANONICAL_ORDER.includes(id))
    .sort((a, b) => tierPriceEUR(cfg, a) - tierPriceEUR(cfg, b) || a.localeCompare(b))
  return [...known, ...extra]
}
