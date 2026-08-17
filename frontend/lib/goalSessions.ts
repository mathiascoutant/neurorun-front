/*
 * Lecture des séances d'un objectif.
 *
 * L'API renvoie une liste plate de séances datées, chacune avec son état comparé
 * aux sorties Strava. Ce module en tire ce dont l'interface a besoin : de quoi
 * nommer un état, situer un jour, retrouver le détail d'une séance dans le plan
 * Markdown, et compter ce qui est fait.
 */

import type { GoalCalendarItem } from '@/lib/api'
import { parsePlanOutline, splitWeekSessions } from '@/lib/planOutline'

export type SessionStatus = GoalCalendarItem['status']

export type SessionStatusMeta = {
  sym: string
  label: string
  /** Couleur du symbole dans la grille. */
  className: string
  /** Pastille d'état dans une fiche. */
  badgeClass: string
}

export function sessionStatusMeta(status: SessionStatus): SessionStatusMeta {
  switch (status) {
    case 'done':
      return {
        sym: '✓',
        label: 'Validé (Strava)',
        className: 'text-emerald-300',
        badgeClass: 'border-emerald-400/35 bg-emerald-400/[0.12] text-emerald-200',
      }
    case 'partial':
      return {
        sym: '◐',
        label: 'Partiel — distance OK, allure hors cible (~5 s/km)',
        className: 'text-amber-200',
        badgeClass: 'border-amber-400/35 bg-amber-400/[0.12] text-amber-100',
      }
    case 'missed':
      return {
        sym: '✗',
        label: 'Manqué ou distance trop courte',
        className: 'text-red-300/90',
        badgeClass: 'border-red-400/30 bg-red-400/[0.1] text-red-200',
      }
    case 'skipped':
      return {
        sym: '–',
        label: 'Annulée avec le coach',
        className: 'text-white/25',
        badgeClass: 'border-white/[0.12] bg-white/[0.05] text-white/50',
      }
    default:
      return {
        sym: '○',
        label: 'Prévu',
        className: 'text-white/40',
        badgeClass: 'border-white/[0.14] bg-white/[0.05] text-white/60',
      }
  }
}

/**
 * Nature d'une séance du plan.
 *
 * Le plan est rédigé par un modèle : la nature de la séance n'est écrite nulle
 * part en tant que donnée, elle est dans la phrase (« 6x400 m », « sortie
 * longue », « au seuil »). On la relit donc du texte, et on ne conclut pas quand
 * rien ne ressort — mieux vaut pas d'étiquette qu'une étiquette fausse.
 */
export type SessionType =
  | 'hills'
  | 'race'
  | 'interval'
  | 'threshold'
  | 'long'
  | 'recovery'
  | 'easy'
  | 'strength'

export type SessionTypeMeta = {
  type: SessionType
  label: string
  badgeClass: string
  /** Couleur du repère là où une pastille ne tient pas (case du calendrier). */
  color: string
}

/**
 * L'ordre fait la décision, et il va du plus précis au plus général. Beaucoup de
 * séances répondent à plusieurs motifs à la fois : « 8 x 200 m en côte » et
 * « 3 x 2 km à allure spécifique » sont l'une et l'autre du fractionné, mais ce
 * n'est pas ce qu'on veut lire sur la carte — le terrain et l'allure visée en
 * disent plus. Les répétitions ne l'emportent donc qu'à défaut.
 */
const SESSION_TYPE_RULES: { re: RegExp; meta: SessionTypeMeta }[] = [
  {
    // « côté » se replie aussi en « cote » : on n'accepte que les tournures qui
    // désignent vraiment le relief.
    re: /\ben cotes?\b|\bcotes\b|\bbosses\b|\bmontees\b/,
    meta: {
      type: 'hills',
      label: 'Côtes',
      badgeClass: 'border-orange-400/35 bg-orange-400/[0.12] text-orange-200',
      color: '#fb923c',
    },
  },
  {
    re: /allure (?:specifique|objectif|course|cible|semi|marathon)|allure 10\s?km/,
    meta: {
      type: 'race',
      label: 'Allure spécifique',
      badgeClass: 'border-violet-400/35 bg-violet-400/[0.12] text-violet-200',
      color: '#a78bfa',
    },
  },
  {
    re: /fractionn|\bvma\b|intervalle|\d+\s*[x×]\s*\d+|30\s*[/-]\s*30|repetition|fartlek|\bpiste\b/,
    meta: {
      type: 'interval',
      label: 'Fractionné',
      badgeClass: 'border-emerald-400/35 bg-emerald-400/[0.12] text-emerald-200',
      color: '#34d399',
    },
  },
  {
    re: /\bseuil\b|\btempo\b/,
    meta: {
      type: 'threshold',
      label: 'Seuil',
      badgeClass: 'border-amber-400/35 bg-amber-400/[0.12] text-amber-100',
      color: '#fbbf24',
    },
  },
  {
    re: /sortie longue|\blongue\b/,
    meta: {
      type: 'long',
      label: 'Sortie longue',
      badgeClass: 'border-sky-400/35 bg-sky-400/[0.12] text-sky-200',
      color: '#38bdf8',
    },
  },
  {
    re: /recuperation|\brecup\b|regeneration|decrassage/,
    meta: {
      type: 'recovery',
      label: 'Récupération',
      badgeClass: 'border-white/[0.14] bg-white/[0.05] text-white/60',
      color: 'rgba(255,255,255,0.4)',
    },
  },
  {
    re: /footing|endurance|allure facile|\bfacile\b|\bsouple\b/,
    meta: {
      type: 'easy',
      label: 'Endurance',
      badgeClass: 'border-white/[0.14] bg-white/[0.05] text-white/70',
      color: 'rgba(255,255,255,0.6)',
    },
  },
  {
    // En dernier : une séance de course qui mentionne du gainage reste une séance
    // de course. Seule celle où il ne reste que ça est du renforcement.
    re: /renforcement|\brenfo\b|gainage|etirements|mobilite|\bppg\b/,
    meta: {
      type: 'strength',
      label: 'Renforcement',
      badgeClass: 'border-teal-400/30 bg-teal-400/[0.1] text-teal-200',
      color: '#2dd4bf',
    },
  },
]

/** Minuscules sans accents : le plan écrit « côtes », « Côtes » ou « cotes ». */
function fold(text: string): string {
  return (text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

export function sessionTypeMeta(text: string): SessionTypeMeta | null {
  const t = fold(text)
  if (!t.trim()) return null
  return SESSION_TYPE_RULES.find((r) => r.re.test(t))?.meta ?? null
}

/** Natures possibles dans l'ordre des règles : sert à trier une légende. */
export const SESSION_TYPES: readonly SessionType[] = SESSION_TYPE_RULES.map((r) => r.meta.type)

/**
 * Nature de chaque séance du plan, indexée par `semaine:séance` — la clé de
 * `sessionKey`. Le plan est parcouru une fois : le calendrier a besoin de la
 * nature de toutes ses séances d'un coup, pas d'une relecture par case.
 */
export function planSessionTypes(plan: string): Map<string, SessionTypeMeta> {
  const out = new Map<string, SessionTypeMeta>()
  for (const week of parsePlanOutline(plan).weeks) {
    const blocks = splitWeekSessions(week.body).filter((b) => b.label)
    blocks.forEach((b, i) => {
      // Même règle que `planSessionBody` : le numéro écrit fait foi, la position
      // sert de repli quand le plan ne numérote pas ses séances.
      const written = Number(b.label.replace(/\D+/g, ''))
      const session = Number.isFinite(written) && written > 0 ? written : i + 1
      const meta = sessionTypeMeta(b.body)
      const key = `${week.index}:${session}`
      if (meta && !out.has(key)) out.set(key, meta)
    })
  }
  return out
}

export function formatPaceSecPerKm(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec <= 0) return '—'
  const m = Math.floor(sec / 60)
  const s = Math.round(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

/** Interprète YYYY-MM-DD comme jour civil local (aligné sur le fuseau du plan). */
export function dateKeyFromParts(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function parseDateKey(key: string): { y: number; m: number; d: number } | null {
  const p = (key || '').split('-').map(Number)
  if (p.length !== 3 || p.some((n) => !Number.isFinite(n))) return null
  return { y: p[0], m: p[1], d: p[2] }
}

export function todayKeyLocal(): string {
  const n = new Date()
  return dateKeyFromParts(n.getFullYear(), n.getMonth() + 1, n.getDate())
}

/** « mardi 25 août » — l'année n'est ajoutée que si elle n'est pas l'année en cours. */
export function formatLongDate(key: string): string {
  const p = parseDateKey(key)
  if (!p) return '—'
  const d = new Date(p.y, p.m - 1, p.d)
  const withYear = p.y !== new Date().getFullYear()
  return d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  })
}

/** Clé stable d'une séance du plan (une séance existe une seule fois par semaine). */
export function sessionKey(it: { week: number; session: number }): string {
  return `${it.week}:${it.session}`
}

/**
 * Détail rédigé d'une séance, extrait du plan Markdown. Le plan est écrit par un
 * modèle : la numérotation peut manquer, on retombe alors sur la position.
 */
export function planSessionBody(plan: string, week: number, session: number): string {
  const week1 = parsePlanOutline(plan).weeks.find((w) => w.index === week)
  if (!week1) return ''
  const blocks = splitWeekSessions(week1.body).filter((b) => b.label)
  const numbered = blocks.find((b) => Number(b.label.replace(/\D+/g, '')) === session)
  return (numbered ?? blocks[session - 1])?.body ?? ''
}

export type SessionCounts = {
  done: number
  partial: number
  missed: number
  upcoming: number
  skipped: number
  /** Séances qui comptent dans la préparation (les annulées n'en font plus partie). */
  planned: number
}

export function sessionCounts(items: GoalCalendarItem[]): SessionCounts {
  const c: SessionCounts = { done: 0, partial: 0, missed: 0, upcoming: 0, skipped: 0, planned: 0 }
  for (const it of items) {
    if (it.status === 'skipped') {
      c.skipped++
      continue
    }
    c.planned++
    if (it.status === 'done') c.done++
    else if (it.status === 'partial') c.partial++
    else if (it.status === 'missed') c.missed++
    else c.upcoming++
  }
  return c
}

/**
 * Séances déjà courues, de la plus récente à la plus ancienne. Une séance partielle
 * en fait partie : elle a été courue, c'est l'allure qui n'était pas dans la cible.
 */
export function completedSessions(items: GoalCalendarItem[]): GoalCalendarItem[] {
  return items
    .filter((it) => it.status === 'done' || it.status === 'partial')
    .sort((a, b) => b.date.localeCompare(a.date))
}
