/*
 * Découpage d'un plan d'entraînement en structure navigable.
 *
 * Le plan arrive en Markdown : une dizaine de sections, dont un calendrier de
 * plusieurs semaines. Déroulé d'un bloc, il oblige à traverser les conseils pour
 * atteindre les séances — c'est-à-dire la seule partie qu'on relit tous les jours.
 * On l'éclate donc en semaines d'un côté, en repères de l'autre.
 */

export type PlanWeek = {
  /** Numéro lu dans le titre (`### Semaine 3`). */
  index: number
  title: string
  /** Corps Markdown de la semaine, titre exclu. */
  body: string
};

export type PlanSection = {
  title: string
  body: string
};

export type PlanOutline = {
  /** Semaines du calendrier, dans l'ordre. */
  weeks: PlanWeek[]
  /** Sections hors calendrier : faisabilité, repères d'allure, sécurité… */
  sections: PlanSection[]
  /** Vrai quand le plan n'a pas la forme attendue : on retombe sur l'affichage brut. */
  unstructured: boolean
};

const RE_H2 = /^##\s+(.+?)\s*$/
const RE_H3 = /^###\s+(.+?)\s*$/
const RE_WEEK = /^semaine\s*(\d{1,2})/i

/** Une section de calendrier contient les semaines ; les autres sont des repères. */
function isCalendarSection(title: string): boolean {
  return /calendrier|semaine\s+par\s+semaine|programme/i.test(title)
}

export function parsePlanOutline(plan: string): PlanOutline {
  const lines = (plan || '').split('\n')
  const weeks: PlanWeek[] = []
  const sections: PlanSection[] = []

  let sectionTitle = ''
  let sectionLines: string[] = []
  let week: PlanWeek | null = null
  let weekLines: string[] = []

  const flushWeek = () => {
    if (week) {
      weeks.push({ ...week, body: weekLines.join('\n').trim() })
      week = null
      weekLines = []
    }
  }
  const flushSection = () => {
    flushWeek()
    const body = sectionLines.join('\n').trim()
    // Une section de calendrier n'a pas de corps propre : tout est dans ses semaines.
    if (sectionTitle && !isCalendarSection(sectionTitle) && body) {
      sections.push({ title: sectionTitle, body })
    }
    sectionTitle = ''
    sectionLines = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    const h2 = RE_H2.exec(line)
    if (h2) {
      flushSection()
      sectionTitle = h2[1]
      continue
    }

    const h3 = RE_H3.exec(line)
    if (h3) {
      const w = RE_WEEK.exec(h3[1])
      if (w) {
        flushWeek()
        week = { index: Number(w[1]), title: h3[1], body: '' }
        continue
      }
      // Sous-titre ordinaire : il appartient au corps courant.
      if (week) weekLines.push(line)
      else sectionLines.push(line)
      continue
    }

    if (week) weekLines.push(line)
    else if (sectionTitle) sectionLines.push(line)
    // Avant la première section (titre `#` du plan), rien à retenir.
  }
  flushSection()

  weeks.sort((a, b) => a.index - b.index)
  return { weeks, sections, unstructured: weeks.length === 0 }
}

/**
 * Séances d'une semaine : chaque puce ou ligne « Séance N » en est une. Le
 * découpage reste tolérant — un plan écrit par un modèle n'est jamais garanti.
 */
export type PlanSessionBlock = {
  /** Étiquette courte pour la carte (« Séance 2 »), déduite du texte. */
  label: string
  body: string
};

const RE_SESSION = /^\s*(?:[-*]\s*)?(?:\*\*)?\s*(séance\s*\d{1,2}|jour\s*\d{1,2})\b/i

export function splitWeekSessions(weekBody: string): PlanSessionBlock[] {
  const lines = weekBody.split('\n')
  const blocks: PlanSessionBlock[] = []
  let current: { label: string; lines: string[] } | null = null
  const intro: string[] = []

  for (const line of lines) {
    const m = RE_SESSION.exec(line)
    if (m) {
      if (current) blocks.push({ label: current.label, body: current.lines.join('\n').trim() })
      const label = m[1].replace(/\s+/g, ' ').trim()
      current = { label: label.charAt(0).toUpperCase() + label.slice(1), lines: [line] }
      continue
    }
    if (current) current.lines.push(line)
    else intro.push(line)
  }
  if (current) blocks.push({ label: current.label, body: current.lines.join('\n').trim() })

  const introText = intro.join('\n').trim()
  if (introText) blocks.unshift({ label: '', body: introText })
  return blocks
}
