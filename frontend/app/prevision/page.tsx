'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberSidebar } from '@/components/MemberSidebar'
import {
  FormeDuJourPanel,
  HeroSummary,
  LegCard,
  MethodCard,
  RationaleCard,
  SectionTitle,
  legIsInsufficient,
} from '@/components/forecast/ForecastPieces'
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
  const [adjErr, setAdjErr] = useState('')

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
    setAdjErr('')
    try {
      const res = await adjustRaceForecast(token, { energy, injured })
      setAdjust(res)
    } catch (e) {
      setAdjErr(e instanceof Error ? e.message : 'Ajustement impossible.')
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

  return (
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <MemberSidebar
        active="prevision"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        capabilities={me?.capabilities}
        isAdmin={me?.role === 'admin'}
        firstName={me?.first_name}
        lastName={me?.last_name}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
      <MemberPageHeader
        title="Prévision"
        onMenuClick={() => setSidebarOpen((o) => !o)}
        menuOpen={sidebarOpen}
        onLogout={logout}
        maxWidthClass="mx-auto w-full max-w-4xl"
      />

      <main className="member-main-pad-b mx-auto w-full max-w-3xl flex-1 space-y-4 px-safe py-6 sm:py-8">
        {err ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {loading ? (
          <div className="space-y-4">
            <div className="app-skeleton h-[186px]" />
            <div className="app-skeleton h-[54px]" />
            <div className="app-skeleton h-[288px]" />
          </div>
        ) : null}

        {!loading && base ? (
          <>
            <HeroSummary forecast={base} />

            <FormeDuJourPanel
              energy={energy}
              onEnergy={setEnergy}
              injured={injured}
              onInjured={setInjured}
              adjustLoading={adjLoading}
              onAdjust={() => void onAdjust()}
              onReset={() => setAdjust(null)}
              adjustError={adjErr}
              applied={adjust != null}
            />

            <SectionTitle eyebrow="Distances" title="Tes chronos projetés" />

            {base.legs.map((leg) => {
              const adjustedLeg = adjust?.adjusted.legs.find((l) => l.id === leg.id)
              const open = expanded === leg.id
              const shown = adjustedLeg ?? leg
              return (
                <LegCard key={leg.id} leg={leg} adjusted={adjustedLeg}>
                  {legIsInsufficient(leg) ? null : (
                    <>
                      <button
                        type="button"
                        onClick={() => setExpanded((x) => (x === leg.id ? null : leg.id))}
                        aria-expanded={open}
                        className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-brand-orange/90 transition hover:text-brand-orange"
                      >
                        {open ? 'Masquer le détail' : 'Détail km · FC'}
                      </button>
                      {open ? <LegDetail leg={shown} /> : null}
                    </>
                  )}
                </LegCard>
              )
            })}

            {adjust?.rationale_fr ? (
              <RationaleCard text={adjust.rationale_fr} aiUsed={adjust.ai_used} />
            ) : null}

            <MethodCard />

            <button
              type="button"
              onClick={() => void load()}
              className="btn-quiet w-full text-sm sm:w-auto"
            >
              Rafraîchir depuis Strava
            </button>

            {base.legs.every(legIsInsufficient) ? (
              <p className="rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-5 text-sm leading-relaxed text-white/45">
                Il manque des sorties dans les tranches utiles (environ 5 km, 10 km, 21 km ou 42 km). Enchaîne
                quelques courses dans ces zones — le tableau de bord Strava t’aide à voir ce que tu as déjà fait.
              </p>
            ) : null}
          </>
        ) : null}
      </main>

      </div>
    </div>
  )
}

/** Détail dépliable propre au web : découpage au km et zone cardiaque cible. */
function LegDetail({ leg }: { leg: RaceLegForecast }) {
  const splits = kmSplits(leg)

  return (
    <div className="mt-4 border-t border-white/[0.08] pt-4">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
        Objectifs par kilomètre
      </h4>
      <p className="mt-1 text-[11px] text-white/38">
        Répartition en allure constante (même temps par km, dernière ligne = fraction restante si besoin).
      </p>
      <div className="member-scroll-x mt-3 max-h-[min(50vh,280px)] overflow-auto rounded-xl border border-white/[0.08]">
        <table className="w-full min-w-[320px] text-left text-xs">
          <thead className="sticky top-0 bg-[#1a1e2a] text-[10px] uppercase tracking-wide text-white/45">
            <tr>
              <th className="px-3 py-2">Segment</th>
              <th className="px-3 py-2">Allure cible</th>
              <th className="px-3 py-2">Temps segment</th>
              <th className="px-3 py-2">Cumul</th>
            </tr>
          </thead>
          <tbody className="text-white/80">
            {splits.map((row, idx) => (
              <tr key={`${row.label}-${idx}`} className="border-t border-white/[0.05]">
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 tabular-nums">{formatPaceSecPerKm(leg.pace_sec_per_km)}</td>
                <td className="px-3 py-2 tabular-nums">{formatRaceTime(row.splitSec)}</td>
                <td className="px-3 py-2 tabular-nums">{formatRaceTime(row.cumSec)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wider text-white/50">
        Fréquence cardiaque cible
      </h4>
      {leg.target_hr_bpm != null && leg.hr_band_low != null && leg.hr_band_high != null ? (
        <p className="mt-2 text-[13px] leading-relaxed text-white/70">
          D’après tes sorties Strava avec capteur FC sur des distances comparables : viser environ{' '}
          <strong className="text-white">{Math.round(leg.target_hr_bpm)} bpm</strong>, avec une zone typique entre{' '}
          <strong className="text-white">{Math.round(leg.hr_band_low)}</strong> et{' '}
          <strong className="text-white">{Math.round(leg.hr_band_high)}</strong> bpm (quartiles de ton historique,
          pas une FC max théorique).
        </p>
      ) : (
        <p className="mt-2 text-[13px] leading-relaxed text-white/45">
          Pas assez de données de fréquence cardiaque sur ces tranches dans Strava. Active le cardio sur ta montre
          ou ta ceinture pour affiner cette zone.
        </p>
      )}

      <p className="mt-3 text-[11px] text-white/30">
        {dataSourceLabel(leg.data_source)}
        {leg.runs_with_hr > 0 ? ` · ${leg.runs_with_hr} sortie(s) avec FC.` : ''}
      </p>
    </div>
  )
}
