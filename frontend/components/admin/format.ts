/**
 * Mises en forme partagées par la console admin.
 *
 * Tout est en `fr-FR` : la console n’est utilisée qu’en interne, autant coller
 * aux conventions locales (espace insécable pour les milliers, 24 h, jj/mm).
 */

/** Durée en secondes → « 1:04:32 » ou « 4:32 ». */
export function formatClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0:00'
  const s = Math.floor(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
  return `${m}:${r.toString().padStart(2, '0')}`
}

/** Allure en secondes/km → « 5:12/km ». */
export function formatPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function formatDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Écart au présent en clair : « il y a 3 j », « à l’instant ».
 *
 * Sur la colonne « dernière connexion », c’est l’information utile — savoir que
 * c’était le 14 mars n’aide pas à repérer un compte dormant.
 */
export function formatRelative(iso?: string | null): string {
  if (!iso) return 'jamais'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000)
  if (diffSec < 60) return 'à l’instant'
  const mins = Math.round(diffSec / 60)
  if (mins < 60) return `il y a ${mins} min`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  if (days < 31) return `il y a ${days} j`
  const months = Math.round(days / 30.4)
  if (months < 12) return `il y a ${months} mois`
  return `il y a ${Math.round(months / 12)} an${months >= 24 ? 's' : ''}`
}

/** Millisecondes depuis l’ISO, ou 0 si la date est illisible (tri stable). */
export function timeValue(iso?: string | null): number {
  if (!iso) return 0
  const t = new Date(iso).getTime()
  return Number.isNaN(t) ? 0 : t
}

export function formatNumber(value: number, digits = 0): string {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function formatEuro(value?: number | null, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Initiales pour la pastille d’une ligne utilisateur (partie locale de l’e-mail). */
export function emailInitials(email: string): string {
  const local = (email.split('@')[0] ?? '').replace(/[^a-zA-Z0-9]+/g, ' ').trim()
  const parts = local.split(' ').filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Libellé marketing d’un palier, avec repli sur l’identifiant technique. */
export function tierLabel(id: string, names?: Record<string, string>): string {
  return names?.[id]?.trim() || id
}
