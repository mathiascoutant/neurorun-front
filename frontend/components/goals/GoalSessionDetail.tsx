'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { SimplePlanBody } from '@/components/SimplePlanBody'
import { getStravaActivityDetail, type GoalCalendarItem, type LiveRunDetail } from '@/lib/api'
import {
  formatLongDate,
  formatPaceSecPerKm,
  sessionStatusMeta,
  sessionTypeMeta,
} from '@/lib/goalSessions'

/*
 * Fiche d'une séance du plan.
 *
 * La grille du calendrier dit si une séance est validée ; elle ne dit pas ce qui
 * était demandé, ni ce qui a été couru. C'est ici : le prévu et le réalisé côte à
 * côte, le texte de la séance tel qu'il est écrit dans le plan, et l'analyse
 * complète de la sortie Strava à la demande — elle est lourde à charger, elle ne
 * s'ouvre donc que si on la demande.
 */

/*
 * Les graphiques de `RunDetailPanel` pèsent une centaine de kilo-octets : chargés
 * avec la page, ils alourdiraient l'ouverture d'un objectif pour une analyse que
 * la plupart des visites n'ouvriront pas.
 */
const RunDetailPanel = dynamic(
  () => import('@/components/RunDetailPanel').then((m) => m.RunDetailPanel),
  { ssr: false, loading: () => <p className="text-[13px] text-white/45">Chargement de l’analyse…</p> },
)

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  readonly label: string
  readonly value: string
  readonly hint?: string
  /** Le réalisé ressort en blanc plein ; le prévu reste en retrait. */
  readonly tone?: 'actual'
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-wider text-white/40">
        {label}
      </p>
      <p
        className={`mt-1 font-display text-[15px] font-semibold leading-tight tabular-nums ${
          tone === 'actual' ? 'text-white' : 'text-white/75'
        }`}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-white/35">{hint}</p> : null}
    </div>
  )
}

/** Étiquette courte de l'état : le libellé long explique la règle, pas l'état. */
function statusChipLabel(item: GoalCalendarItem): string {
  switch (item.status) {
    case 'done':
      return 'Validée'
    case 'partial':
      return 'Partielle'
    case 'missed':
      return 'Manquée'
    case 'skipped':
      return 'Annulée'
    default:
      return 'À venir'
  }
}

function SessionHeader({
  item,
  planBody,
  onClose,
}: {
  readonly item: GoalCalendarItem
  readonly planBody: string
  readonly onClose: () => void
}) {
  const st = sessionStatusMeta(item.status)
  // Le texte du plan décrit la séance ; le résumé sert quand le plan est muet.
  const type = sessionTypeMeta(planBody || item.summary)
  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <p className="app-kicker text-brand-ice">
          Semaine {item.week} · séance {item.session}
        </p>
        <h4 className="mt-1 flex flex-wrap items-center gap-2 font-display text-[16px] font-semibold capitalize text-white">
          {formatLongDate(item.date)}
          {type ? (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] ${type.badgeClass}`}
            >
              {type.label}
            </span>
          ) : null}
        </h4>
      </div>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${st.badgeClass}`}>
        {st.sym} {statusChipLabel(item)}
      </span>
      <button
        type="button"
        aria-label="Fermer la séance"
        className="-mr-1 shrink-0 px-1 text-white/35 transition hover:text-white/80"
        onClick={onClose}
      >
        ×
      </button>
    </div>
  )
}

function SessionStats({ item }: { readonly item: GoalCalendarItem }) {
  const judgedPace = item.is_interval ? item.effort_pace_sec_per_km : item.actual_pace_sec_per_km
  const avgHint =
    item.is_interval && item.actual_pace_sec_per_km != null
      ? `${formatPaceSecPerKm(item.actual_pace_sec_per_km)} de moyenne, récup comprise`
      : undefined
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Distance prévue" value={`≥ ${item.planned_km} km`} hint="minimum, tu peux couvrir plus" />
      <Stat
        label="Allure cible"
        value={formatPaceSecPerKm(item.target_pace_sec_per_km)}
        hint={item.is_interval ? 'sur les efforts' : undefined}
      />
      <Stat
        label="Distance courue"
        value={item.actual_km != null ? `${item.actual_km.toFixed(1)} km` : '—'}
        tone="actual"
      />
      <Stat
        label={item.is_interval ? 'Allure des efforts' : 'Allure réalisée'}
        value={formatPaceSecPerKm(judgedPace)}
        tone="actual"
        hint={avgHint}
      />
    </div>
  )
}

/** Note de calendrier : report subi ou décidé, ou séance retirée du plan. */
function SessionScheduleNote({ item }: { readonly item: GoalCalendarItem }) {
  if (item.status === 'skipped') {
    return (
      <p className="mt-2 text-[12px] leading-relaxed text-white/45">
        Séance annulée{item.reason ? ` — ${item.reason}` : ''}, elle ne compte plus dans la prépa.
      </p>
    )
  }
  if (item.rescheduled && item.planned_date) {
    return (
      <p className="mt-2 text-[12px] leading-relaxed text-brand-ice/85">
        ↷ Reportée depuis le {item.planned_date}
        {item.reason ? ` — ${item.reason}` : ''}
      </p>
    )
  }
  return null
}

type Props = {
  readonly item: GoalCalendarItem
  /** Texte de la séance dans le plan, vide si le plan ne la détaille pas. */
  readonly planBody: string
  readonly token: string
  readonly onClose: () => void
}

export function GoalSessionDetail({ item, planBody, token, onClose }: Props) {
  const [run, setRun] = useState<LiveRunDetail | null>(null)
  const [runOpen, setRunOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')

  const activityId = item.strava_activity_id ?? null

  // Changer de séance : l'analyse affichée parlerait d'une autre sortie.
  useEffect(() => {
    setRun(null)
    setRunOpen(false)
    setErr('')
  }, [item.week, item.session, activityId])

  async function onToggleRun() {
    if (runOpen) {
      setRunOpen(false)
      return
    }
    setRunOpen(true)
    if (run || activityId == null) return
    setLoading(true)
    setErr('')
    try {
      setRun(await getStravaActivityDetail(token, activityId))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Analyse indisponible')
    } finally {
      setLoading(false)
    }
  }

  const noRunHint =
    item.status === 'upcoming'
      ? 'Séance à venir : elle se validera d’elle-même dès qu’une sortie Strava correspondra.'
      : 'Aucune sortie Strava n’a été rattachée à cette séance.'

  return (
    <section className="rounded-2xl border border-white/[0.1] bg-white/[0.035] p-4">
      <SessionHeader item={item} planBody={planBody} onClose={onClose} />
      <SessionScheduleNote item={item} />
      <SessionStats item={item} />

      {item.summary ? (
        <p className="mt-3 text-[13px] leading-relaxed text-white/60">{item.summary}</p>
      ) : null}

      {planBody ? (
        <div className="mt-3 rounded-xl border border-white/[0.07] bg-black/20 p-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
            La séance dans ton plan
          </p>
          <SimplePlanBody text={planBody} className="mt-2 max-w-[68ch]" />
        </div>
      ) : null}

      {activityId == null ? (
        <p className="mt-3 text-[12px] text-white/35">{noRunHint}</p>
      ) : (
        <div className="mt-3">
          <button type="button" className="btn-quiet min-h-[40px] text-[13px]" onClick={() => void onToggleRun()}>
            {runOpen ? 'Masquer l’analyse de la sortie' : 'Voir l’analyse de la sortie'}
          </button>
          {runOpen ? <RunAnalysis run={run} loading={loading} err={err} /> : null}
        </div>
      )}
    </section>
  )
}

function RunAnalysis({
  run,
  loading,
  err,
}: {
  readonly run: LiveRunDetail | null
  readonly loading: boolean
  readonly err: string
}) {
  if (loading) {
    return (
      <div className="mt-3 flex items-center gap-2 text-[13px] text-white/50">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-orange/30 border-t-brand-orange" />
        <span>Chargement de la sortie…</span>
      </div>
    )
  }
  if (run) {
    return (
      <div className="mt-3">
        <RunDetailPanel run={run} source="strava" />
      </div>
    )
  }
  return <p className="mt-3 text-[13px] text-amber-200/90">{err || 'Analyse indisponible'}</p>
}
