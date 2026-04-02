'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { Mark } from '@/components/Mark'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberPrimaryNav } from '@/components/MemberPrimaryNav'
import {
  adjustRaceForecast,
  fetchMe,
  fetchRaceForecast,
  type MeUser,
  type ForecastAdjustEnergy,
  type RaceForecastAdjustResponse,
  type RaceForecastPayload,
  type RaceLegForecast,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

function formatPaceSecPerKm(paceSec: number): string {
  if (!paceSec || paceSec <= 0) return '—'
  const m = Math.floor(paceSec / 60)
  const s = Math.round(paceSec % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

function formatRaceTime(sec: number): string {
  if (!sec || sec <= 0) return '—'
  const s = Math.round(sec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const rs = s % 60
  if (h > 0) {
    return `${h}h ${m.toString().padStart(2, '0')}min ${rs.toString().padStart(2, '0')}s`
  }
  return `${m}min ${rs.toString().padStart(2, '0')}s`
}

function dataSourceLabel(src: string): string {
  switch (src) {
    case 'bucket_median':
      return 'Médiane d’allure sur tes sorties Strava (tranche de distance proche).'
    case 'riegel_extrapolation':
      return 'Extrapolation (formule Riegel) à partir d’une autre distance où tu as assez de données.'
    case 'insufficient_data':
      return 'Pas assez de sorties dans cette tranche pour estimer.'
    default:
      return src
  }
}

type KmRow = { label: string; km: number; splitSec: number; cumSec: number }

function kmSplits(leg: RaceLegForecast): KmRow[] {
  const pace = leg.pace_sec_per_km
  if (!pace || pace <= 0 || !leg.distance_km) return []
  const d = leg.distance_km
  const rows: KmRow[] = []
  let cum = 0
  let remaining = d
  let i = 1
  while (remaining > 0.0001) {
    const chunk = remaining >= 1 ? 1 : remaining
    const split = pace * chunk
    cum += split
    const label =
      chunk >= 0.999
        ? `Kilomètre ${i}`
        : `Dernière portion (${(chunk * 1000).toFixed(0)} m)`
    rows.push({ label, km: chunk, splitSec: split, cumSec: cum })
    remaining -= chunk
    i++
  }
  return rows
}

export default function PrevisionPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [base, setBase] = useState<RaceForecastPayload | null>(null)
  const [adjust, setAdjust] = useState<RaceForecastAdjustResponse | null>(null)
  const [energy, setEnergy] = useState<ForecastAdjustEnergy>('normal')
  const [injured, setInjured] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adjLoading, setAdjLoading] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.replace('/login/')
      return
    }
    ;(async () => {
      try {
        const u = await fetchMe(token)
        setMe(u)
        if (u.capabilities?.forecast === false) {
          router.replace('/dashboard/')
          return
        }
        if (!u.strava_linked) {
          router.replace('/link-strava/')
          return
        }
        setReady(true)
      } catch {
        router.replace('/login/')
      }
    })()
  }, [router])

  const load = useCallback(async () => {
    const token = getToken()
    if (!token || !ready) return
    setLoading(true)
    setErr('')
    try {
      const d = await fetchRaceForecast(token)
      setBase(d)
      setAdjust(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
      setBase(null)
    } finally {
      setLoading(false)
    }
  }, [ready])

  useEffect(() => {
    if (!ready) return
    void load()
  }, [ready, load])

  async function onAdjust() {
    const token = getToken()
    if (!token) return
    setAdjLoading(true)
    setErr('')
    try {
      const res = await adjustRaceForecast(token, { energy, injured })
      setAdjust(res)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setAdjLoading(false)
    }
  }

  function logout() {
    clearToken()
    router.push('/login/')
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const displayLegs = adjust?.adjusted.legs ?? base?.legs ?? []

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:sticky md:top-0 md:flex md:h-[100dvh] md:max-h-[100dvh]">
        <div className="border-b border-white/[0.06] px-safe pt-safe pb-3">
          <Link href="/dashboard/" aria-label="NeuroRun">
            <Mark compact />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
          <MemberPrimaryNav
            active="prevision"
            capabilities={me?.capabilities}
            isAdmin={me?.role === 'admin'}
            profileFirstName={me?.first_name}
          />
        </div>
      </aside>

      <MemberMobileDrawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        headerLeading={
          <Link
            href="/dashboard/"
            onClick={() => setSidebarOpen(false)}
            className="inline-flex"
            aria-label="NeuroRun — tableau de bord"
          >
            <Mark compact />
          </Link>
        }
      >
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
          <MemberPrimaryNav
            active="prevision"
            onNavigate={() => setSidebarOpen(false)}
            capabilities={me?.capabilities}
            isAdmin={me?.role === 'admin'}
            profileFirstName={me?.first_name}
          />
        </div>
      </MemberMobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
      <MemberPageHeader
        title="Prévision"
        onMenuClick={() => setSidebarOpen((o) => !o)}
        menuOpen={sidebarOpen}
        onLogout={logout}
        maxWidthClass="mx-auto w-full max-w-4xl"
      />

      <main className="member-main-pad-b mx-auto w-full max-w-4xl flex-1 space-y-5 px-safe py-6 sm:space-y-6 sm:py-8">
        <p className="text-sm leading-relaxed text-white/55">
          Prévisions calculées sur <strong className="text-white/80">l’ensemble de tes sorties course Strava</strong>{' '}
          (tranches proches du 5 km, 10 km, semi et marathon). Tu peux indiquer ton ressenti et une blessure : un clic sur{' '}
          <strong className="text-white/80">Adapter mes pronostics</strong> applique un ajustement (IA si configurée
          côté serveur, sinon règles de secours).
        </p>

        {err ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{err}</div>
        ) : null}

        {loading ? (
          <p className="text-sm text-white/45">Analyse de ton historique Strava…</p>
        ) : null}

        {!loading && base ? (
          <div className="panel space-y-4 p-5">
            <h2 className="font-display text-sm font-semibold text-white">Ton état du moment</h2>
            <p className="text-[11px] text-white/40">Sert à calibrer l’ajustement (ressenti + blessure).</p>
            <div className="member-scroll-x -mx-1 flex flex-nowrap gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
              {(
                [
                  { id: 'great' as const, label: 'Plutôt en forme' },
                  { id: 'normal' as const, label: 'Ni fatigué ni survolté' },
                  { id: 'tired' as const, label: 'Fatigué' },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setEnergy(o.id)}
                  className={`shrink-0 rounded-xl px-3 py-2 text-left text-xs font-medium transition ${
                    energy === o.id
                      ? 'bg-brand-orange/25 text-white ring-1 ring-brand-orange/45'
                      : 'border border-white/10 bg-white/[0.04] text-white/65 hover:border-white/20'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                checked={injured}
                onChange={(e) => setInjured(e.target.checked)}
                className="rounded border-white/20 bg-surface-2"
              />
              Je suis blessé ou je dois ménager une zone (ajustement plus prudent)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                disabled={adjLoading}
                onClick={() => void onAdjust()}
                className="btn-brand w-full px-4 py-2.5 text-xs disabled:opacity-40 sm:w-auto"
              >
                {adjLoading ? 'Ajustement…' : 'Adapter mes pronostics'}
              </button>
              {adjust ? (
                <button
                  type="button"
                  onClick={() => setAdjust(null)}
                  className="btn-quiet w-full px-4 py-2.5 text-xs sm:w-auto"
                >
                  Revenir aux prévisions brutes
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => void load()}
                className="btn-quiet w-full px-4 py-2.5 text-xs sm:w-auto"
              >
                Rafraîchir Strava
              </button>
            </div>
            {adjust?.rationale_fr ? (
              <p className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs leading-relaxed text-white/70">
                {adjust.rationale_fr}
                {adjust.ai_used ? (
                  <span className="mt-1 block text-[10px] text-emerald-300/90">Ajustement assisté par IA</span>
                ) : (
                  <span className="mt-1 block text-[10px] text-white/35">Ajustement par règles (ou secours)</span>
                )}
              </p>
            ) : null}
          </div>
        ) : null}

        {!loading && displayLegs.length > 0 ? (
          <div className="space-y-4">
            {displayLegs.map((leg) => (
              <LegCard
                key={leg.id}
                leg={leg}
                expanded={expanded === leg.id}
                onToggle={() => setExpanded((x) => (x === leg.id ? null : leg.id))}
                baseline={
                  adjust && leg.baseline_time_sec != null && leg.time_sec !== leg.baseline_time_sec
                    ? leg.baseline_time_sec
                    : undefined
                }
              />
            ))}
          </div>
        ) : null}

        {!loading && base && displayLegs.every((l) => l.data_source === 'insufficient_data') ? (
          <p className="text-sm text-white/45 panel p-5">
            Il manque des sorties dans les tranches utiles (environ 5 km, 10 km, 21 km ou 42 km). Enchaîne quelques
            courses dans ces zones — le tableau de bord Strava t’aide à voir ce que tu as déjà fait.
          </p>
        ) : null}
      </main>
      </div>
    </div>
  )
}

function LegCard({
  leg,
  expanded,
  onToggle,
  baseline,
}: {
  leg: RaceLegForecast
  expanded: boolean
  onToggle: () => void
  baseline?: number
}) {
  const ok = leg.time_sec > 0 && leg.data_source !== 'insufficient_data'
  const splits = ok ? kmSplits(leg) : []

  return (
    <div className="panel overflow-hidden p-5">
      <button
        type="button"
        onClick={onToggle}
        disabled={!ok}
        className={`flex w-full flex-col gap-1 text-left ${!ok ? 'cursor-default opacity-70' : ''}`}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-base font-semibold text-white">{leg.label}</h3>
          {ok ? (
            <span className="text-[10px] font-medium uppercase tracking-wide text-brand-orange/90">
              {expanded ? 'Masquer le détail' : 'Détail km · FC'}
            </span>
          ) : null}
        </div>
        <p className="text-[11px] text-white/40">{dataSourceLabel(leg.data_source)}</p>
        {leg.ref_leg_id ? (
          <p className="text-[10px] text-white/35">Référence extrapolation : {leg.ref_leg_id}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-end gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/35">Temps prévu</p>
            <p className="font-display text-xl font-semibold text-white">{formatRaceTime(leg.time_sec)}</p>
            {baseline != null && baseline > 0 ? (
              <p className="text-xs text-white/40 line-through">{formatRaceTime(baseline)}</p>
            ) : null}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/35">Allure moyenne</p>
            <p className="text-lg font-medium text-white/90">{formatPaceSecPerKm(leg.pace_sec_per_km)}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-white/35">
          Basé sur {leg.sample_runs} sortie(s) dans la tranche — {leg.runs_with_hr} avec FC.
        </p>
      </button>

      {expanded && ok ? (
        <div className="mt-5 border-t border-white/[0.06] pt-5">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50">Objectifs par kilomètre</h4>
          <p className="mt-1 text-[11px] text-white/40">
            Répartition en allure constante (même temps par km, dernière ligne = fraction restante si besoin).
          </p>
          <div className="member-scroll-x mt-3 max-h-[min(50vh,280px)] overflow-auto rounded-xl border border-white/[0.06] sm:max-h-[280px]">
            <table className="w-full min-w-[320px] text-left text-xs">
              <thead className="sticky top-0 bg-surface-2/95 text-[10px] uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2">Segment</th>
                  <th className="px-3 py-2">Allure cible</th>
                  <th className="px-3 py-2">Temps segment</th>
                  <th className="px-3 py-2">Cumul</th>
                </tr>
              </thead>
              <tbody className="text-white/80">
                {splits.map((row, idx) => (
                  <tr key={`${row.label}-${idx}`} className="border-t border-white/[0.04]">
                    <td className="px-3 py-2">{row.label}</td>
                    <td className="px-3 py-2">{formatPaceSecPerKm(leg.pace_sec_per_km)}</td>
                    <td className="px-3 py-2">{formatRaceTime(row.splitSec)}</td>
                    <td className="px-3 py-2">{formatRaceTime(row.cumSec)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-white/50">Fréquence cardiaque cible</h4>
            {leg.target_hr_bpm != null && leg.hr_band_low != null && leg.hr_band_high != null ? (
              <p className="mt-2 text-sm leading-relaxed text-white/75">
                D’après tes sorties Strava avec capteur FC sur des distances comparables : viser environ{' '}
                <strong className="text-white">{Math.round(leg.target_hr_bpm)} bpm</strong>, avec une zone typique entre{' '}
                <strong className="text-white">{Math.round(leg.hr_band_low)}</strong> et{' '}
                <strong className="text-white">{Math.round(leg.hr_band_high)}</strong> bpm (quartiles de ton historique,
                pas une FC max théorique).
              </p>
            ) : (
              <p className="mt-2 text-sm text-white/45">
                Pas assez de données de fréquence cardiaque sur ces tranches dans Strava. Active le cardio sur ta
                montre ou ceinture pour affiner cette zone.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
