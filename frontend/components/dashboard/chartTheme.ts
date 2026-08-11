/**
 * Réglages partagés par tous les graphiques du tableau de bord.
 *
 * Palette de séries : les quatre teintes ont été validées ensemble sur fond
 * sombre (#0d0f16) — bande de luminosité, chroma, séparation deutan/protan/tritan
 * et contraste ≥ 3:1. L’orange de marque tient le premier créneau ; le glace des
 * accents d’interface (#67e8f9) est trop clair pour un tracé, on utilise donc un
 * cran plus sombre de la même teinte.
 */
export const SERIES = {
  brand: '#fc4c02',
  ice: '#0f9cb8',
  violet: '#8b5cf6',
  pink: '#e0568f',
} as const

/** Grille et axes : un cran au-dessus du fond, jamais en pointillés. */
export const AXIS_TICK = { fill: 'rgba(255,255,255,0.42)', fontSize: 11 } as const
export const GRID_STROKE = 'rgba(255,255,255,0.055)'
export const AXIS_LINE = 'rgba(255,255,255,0.09)'

/** Allure décimale (min/km) → « 4:32 ». */
export function formatPace(minPerKm: number, withUnit = false): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return '—'
  const totalSec = Math.round(minPerKm * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}${withUnit ? '/km' : ''}`
}

/** Heures décimales → « 4h32 » ou « 48 min ». */
export function formatDuration(hours: number): string {
  const totalMin = Math.round((Number.isFinite(hours) ? hours : 0) * 60)
  if (totalMin < 60) return `${totalMin} min`
  return `${Math.floor(totalMin / 60)}h${(totalMin % 60).toString().padStart(2, '0')}`
}

/** Nombre lisible en français : espace fine insécable comme séparateur de milliers. */
export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatDayMonth(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00Z` : iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function formatTimestamp(ms: number): string {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Domaine et graduations d'un axe d'allure.
 *
 * Laissé à Recharts, un axe d'allure gradue sur les valeurs décimales brutes et
 * produit des repères illisibles (4:50, 5:11, 5:32…). On force ici un palier
 * rond — 5, 10, 15, 20, 30 ou 60 secondes — choisi pour tomber sur 4 à 6 repères.
 */
export function paceAxis(values: number[]): { domain: [number, number]; ticks: number[] } {
  const usable = values.filter((v) => Number.isFinite(v) && v > 0)
  if (usable.length === 0) return { domain: [0, 1], ticks: [] }

  const min = Math.min(...usable)
  const max = Math.max(...usable)
  const spanSec = Math.max((max - min) * 60, 1)
  const stepSec = [5, 10, 15, 20, 30, 60, 120, 300].find((s) => spanSec / s <= 5) ?? 600
  const step = stepSec / 60

  let lo = Math.floor(min / step) * step
  let hi = Math.ceil(max / step) * step
  // Série quasi plate (ou point unique) : ouvrir d'un cran pour ne pas coller aux bords.
  if (hi - lo < step * 1.5) {
    lo -= step
    hi += step
  }

  const ticks: number[] = []
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Math.round(v * 1e6) / 1e6)
  return { domain: [lo, hi], ticks }
}

/**
 * Domaine temporel élargi de quelques pourcents.
 *
 * Sans cette marge, une sortie en début ou en fin de période se dessine
 * exactement sur l'axe et se retrouve à moitié rognée.
 */
export function paddedTimeDomain(timestamps: number[]): [number, number] {
  if (timestamps.length === 0) return [0, 1]
  const min = Math.min(...timestamps)
  const max = Math.max(...timestamps)
  const pad = Math.max((max - min) * 0.06, 12 * 3600 * 1000)
  return [min - pad, max + pad]
}

export function average(values: number[]): number {
  const usable = values.filter((v) => Number.isFinite(v))
  if (usable.length === 0) return 0
  return usable.reduce((sum, v) => sum + v, 0) / usable.length
}
