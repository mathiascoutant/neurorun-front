'use client'

import { SimplePlanBody } from '@/components/SimplePlanBody'
import type { FeasibilityFacts } from '@/lib/api'

/*
 * Avis de faisabilité d'un objectif.
 *
 * Le verdict d'abord, en bandeau coloré avec sa phrase de résumé ; puis la
 * comparaison qui le justifie — chrono visé contre niveau actuel, calculés par
 * l'API — et enfin les explications du coach. Le texte du coach arrive en
 * Markdown à sections (« ## Verdict », « ## En une phrase »…) : on en reprend
 * le verdict et le résumé pour le bandeau, le reste s'affiche tel quel.
 */

type Tone = 'good' | 'warn' | 'bad'

const VERDICT_TONE: Record<string, Tone> = {
  'Largement à ta portée': 'good',
  Réaliste: 'good',
  'Ambitieux mais jouable': 'warn',
  'Très tendu / peu réaliste': 'bad',
}

const TONE_STYLE: Record<Tone, { box: string; icon: string; path: string }> = {
  good: {
    box: 'border-emerald-400/30 bg-emerald-400/[0.08]',
    icon: 'bg-emerald-400/15 text-emerald-300',
    path: 'M5 13l4 4L19 7',
  },
  warn: {
    box: 'border-amber-400/30 bg-amber-400/[0.08]',
    icon: 'bg-amber-400/15 text-amber-300',
    path: 'M12 8v4m0 4h.01',
  },
  bad: {
    box: 'border-red-400/30 bg-red-400/[0.08]',
    icon: 'bg-red-400/15 text-red-300',
    path: 'M6 6l12 12M18 6L6 18',
  },
}

function splitSections(md: string): { title: string; body: string }[] {
  const out: { title: string; body: string }[] = []
  for (const line of md.split('\n')) {
    const h = /^##\s+(.+)$/.exec(line.trim())
    if (h) out.push({ title: h[1].trim(), body: '' })
    else if (out.length) out[out.length - 1].body += `${line}\n`
    else if (line.trim()) out.push({ title: '', body: `${line}\n` })
  }
  return out.map((s) => ({ ...s, body: s.body.trim() }))
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function formatTime(sec: number): string {
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  return r ? `${m} min ${String(r).padStart(2, '0')}` : `${m} min`
}

function formatPace(sec: number): string {
  const s = Math.round(sec)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}/km`
}

/** L'écart dit en clair : « 2× plus lent que ton niveau », « gagner 6 % ». */
function gapSentence(f: FeasibilityFacts): string {
  if (!(f.target_sec > 0 && f.predicted_sec > 0)) return ''
  if (f.gap_pct <= -0.1) {
    const ratio = f.target_sec / f.predicted_sec
    return ratio >= 1.5
      ? `Ton chrono visé est ${ratio.toFixed(1).replace('.', ',')}× plus lent que ton niveau actuel : aucune progression n’est nécessaire.`
      : `Ton chrono visé est ${Math.round(-f.gap_pct * 100)} % plus lent que ton niveau actuel : tu l’as déjà.`
  }
  if (f.gap_pct <= 0) return 'Ton chrono visé correspond à ton niveau actuel.'
  return `Il te faut gagner ${Math.round(f.gap_pct * 100)} % ; sur cette préparation, environ ${Math.round(f.allowed_pct * 100)} % est raisonnable.`
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-5">
      <p className="stat-label">{label}</p>
      <p className="mt-1.5 font-display text-[22px] font-bold leading-7 tracking-[-0.02em] text-white tabular-nums">{value}</p>
      {sub ? <p className="mt-0.5 truncate text-[12px] text-white/45">{sub}</p> : null}
    </div>
  )
}

export function FeasibilityReview({
  text,
  facts,
  loading,
  error,
  stravaLinked,
}: {
  text: string
  facts: FeasibilityFacts | null
  loading: boolean
  error: string
  stravaLinked: boolean | null
}) {
  const sections = splitSections(text)
  const verdictSection = sections.find((s) => fold(s.title).startsWith('verdict'))
  const summarySection = sections.find((s) => fold(s.title).startsWith('en une phrase'))
  const rest = sections.filter((s) => s !== verdictSection && s !== summarySection)
  const verdict = facts?.verdict || verdictSection?.body.replace(/\*\*/g, '').split('\n')[0].trim() || ''
  const tone = TONE_STYLE[VERDICT_TONE[verdict] ?? 'warn']
  const ref = facts?.reference_run
  const hasCompare = facts != null && (facts.target_sec > 0 || facts.predicted_sec > 0)
  const gap = facts ? gapSentence(facts) : ''

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[14px] font-semibold text-white">Avis du coach</p>
        <p className="text-[12px] text-white/40">{stravaLinked ? 'Objectif + sorties Strava' : 'Basé sur ton objectif seul'}</p>
      </div>

      {loading ? (
        <div className="mt-3 space-y-3" aria-busy="true" aria-label="Analyse en cours">
          <div className="app-skeleton h-[76px]" />
          <div className="app-skeleton h-[92px]" />
          <div className="app-skeleton h-[120px]" />
        </div>
      ) : error ? (
        <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/[0.09] px-4 py-3 text-[13px] text-red-100">{error}</p>
      ) : text ? (
        <div className="mt-3 space-y-3">
          {verdict ? (
            <div className={`flex items-start gap-3.5 rounded-2xl border p-4 sm:p-5 ${tone.box}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone.icon}`} aria-hidden>
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={tone.path} />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="font-display text-[18px] font-bold leading-6 tracking-[-0.01em] text-white">{verdict}</p>
                {summarySection?.body ? (
                  <p className="mt-1 text-[14px] leading-[21px] text-white/75">{summarySection.body.replace(/\*\*/g, '')}</p>
                ) : null}
              </div>
            </div>
          ) : null}

          {hasCompare && facts ? (
            <div className="chart-card overflow-hidden">
              <div className="grid grid-cols-2 divide-x divide-white/[0.06]">
                <Figure
                  label="Ton chrono visé"
                  value={facts.target_sec > 0 ? formatTime(facts.target_sec) : 'Finir'}
                  sub={facts.target_pace_sec_per_km > 0 ? `soit ${formatPace(facts.target_pace_sec_per_km)}` : undefined}
                />
                <Figure
                  label="Ton niveau actuel"
                  value={facts.predicted_sec > 0 ? `≈ ${formatTime(facts.predicted_sec)}` : '—'}
                  sub={
                    facts.predicted_pace_sec_per_km > 0
                      ? `soit ${formatPace(facts.predicted_pace_sec_per_km)}`
                      : 'Pas de sortie exploitable'
                  }
                />
              </div>
              {gap || ref ? (
                <div className="space-y-1 border-t border-white/[0.06] px-4 py-3 text-[12px] leading-[18px] sm:px-5">
                  {gap ? <p className="text-white/75">{gap}</p> : null}
                  {ref ? (
                    <p className="text-white/40">
                      Niveau estimé d’après ta sortie du{' '}
                      {new Date(`${ref.date}T00:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })} :{' '}
                      {ref.distance_km.toFixed(1).replace('.', ',')} km en {formatTime(ref.time_sec)}.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {rest.length > 0 ? (
            <div className="chart-card divide-y divide-white/[0.06] overflow-hidden">
              {rest.map((s, i) => (
                <div key={`${s.title}-${i}`} className="px-4 py-4 sm:px-5">
                  {s.title ? <p className="stat-label mb-2.5">{s.title}</p> : null}
                  <SimplePlanBody text={s.body} className="[&_p]:!text-[14px]" />
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
