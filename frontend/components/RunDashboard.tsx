'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { MemberPrimaryNav } from '@/components/MemberPrimaryNav'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Mark } from '@/components/Mark'
import {
  fetchMe,
  fetchStravaDashboard,
  type StravaDashboard,
  type StravaDashboardPeriod,
  type StravaPacePoint,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

const PERIODS: { id: StravaDashboardPeriod; label: string }[] = [
  { id: '7d', label: '7 jours' },
  { id: '30d', label: '30 jours' },
  { id: '90d', label: '3 mois' },
  { id: '365d', label: '1 an' },
  { id: 'all', label: 'Depuis le début' },
]

const tip = {
  contentStyle: {
    background: '#12151f',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 12,
    fontSize: 12,
  },
  labelStyle: { color: 'rgba(255,255,255,0.75)' },
}

function formatPaceDecimal(minPerKm: number): string {
  if (!minPerKm || minPerKm <= 0) return '—'
  const totalSec = Math.round(minPerKm * 60)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

function formatWeekShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function paceRows(points: StravaPacePoint[]) {
  return points.map((p) => ({
    ...p,
    label: new Date(p.date).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    }),
  }))
}

function PaceBlock({
  title,
  subtitle,
  points,
  stroke,
}: {
  title: string
  subtitle: string
  points: StravaPacePoint[]
  stroke: string
}) {
  if (points.length === 0) {
    return (
      <div className="panel p-5">
        <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-[11px] text-white/40">{subtitle}</p>
        <p className="mt-4 text-xs text-white/40">Aucune sortie dans cette tranche sur la période.</p>
      </div>
    )
  }
  const rows = paceRows(points)
  return (
    <div className="panel p-5">
      <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-[11px] text-white/40">{subtitle}</p>
      <div className="mt-4 h-[260px] w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
              tickFormatter={(v) => formatPaceDecimal(Number(v))}
              width={56}
            />
            <Tooltip
              {...tip}
              formatter={(value: number | string) => [formatPaceDecimal(Number(value)), 'Allure']}
            />
            <Line
              type="monotone"
              dataKey="pace_min_per_km"
              stroke={stroke}
              strokeWidth={2}
              dot={{ r: 3, fill: stroke }}
              name="Allure min/km"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function RunDashboard() {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [period, setPeriod] = useState<StravaDashboardPeriod>('30d')
  const [data, setData] = useState<StravaDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  useEffect(() => {
    const token = getToken()
    if (!token) {
      router.replace('/login/')
      return
    }
    ;(async () => {
      try {
        const me = await fetchMe(token)
        if (!me.strava_linked) {
          router.replace('/link-strava/')
          return
        }
        setAuthReady(true)
      } catch {
        router.replace('/login/')
      }
    })()
  }, [router])

  const load = useCallback(async () => {
    const token = getToken()
    if (!token || !authReady) return
    setLoading(true)
    setErr('')
    try {
      const d = await fetchStravaDashboard(token, period)
      setData(d)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [period, authReady])

  useEffect(() => {
    if (!authReady) return
    void load()
  }, [authReady, load])

  function logout() {
    clearToken()
    router.push('/login/')
  }

  if (!authReady) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const weeklyRows =
    data?.weekly.map((w) => ({
      week_short: formatWeekShort(w.week_start),
      km: w.km,
      hours: w.hours,
      runs: w.runs,
      avg_hr: w.avg_hr != null && w.avg_hr > 0 ? w.avg_hr : null,
    })) ?? []

  return (
    <div className="flex min-h-[100dvh]">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:flex">
        <div className="border-b border-white/[0.06] p-4">
          <Link href="/dashboard/" aria-label="NeuroRun">
            <Mark compact />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <MemberPrimaryNav active="dashboard" />
        </div>
      </aside>

      {sidebarOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          aria-hidden
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[min(100%,300px)] transform border-r border-white/[0.06] bg-surface-1 shadow-lift transition-transform duration-200 md:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-white/[0.06] p-3">
          <Link href="/dashboard/" onClick={() => setSidebarOpen(false)} aria-label="NeuroRun">
            <Mark compact />
          </Link>
          <button type="button" className="btn-quiet py-1.5 text-xs" onClick={() => setSidebarOpen(false)}>
            Fermer
          </button>
        </div>
        <div className="p-2">
          <MemberPrimaryNav active="dashboard" onNavigate={() => setSidebarOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-surface-0/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                className="btn-quiet py-2 text-xs md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Ouvrir le menu"
              >
                Menu
              </button>
              <Mark className="hidden sm:flex md:hidden" compact />
              <div className="min-w-0">
                <p className="font-display text-sm font-medium text-white/90">Tableau de bord</p>
                <p className="hidden truncate text-[10px] text-white/35 sm:block">
                  Strava — volume, allure, fréquence cardiaque
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/link-strava/" className="btn-quiet hidden py-2 text-xs sm:inline-flex">
                Strava
              </Link>
              <button type="button" className="btn-quiet py-2 text-xs" onClick={logout}>
                Sortir
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-4 py-8 pb-16">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`rounded-xl px-3 py-2 text-xs font-medium transition ${
                period === p.id
                  ? 'bg-brand-orange/25 text-white ring-1 ring-brand-orange/45'
                  : 'border border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:text-white/85'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {err ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {loading ? <p className="text-sm text-white/45">Chargement des sorties…</p> : null}

        {!loading && data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="panel p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Distance totale</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">{data.total_km} km</p>
                <p className="mt-1 text-[11px] text-white/35">Sur la période sélectionnée</p>
              </div>
              <div className="panel p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Temps en mouvement</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">{data.total_hours} h</p>
                <p className="mt-1 text-[11px] text-white/35">Cumul course (trail / virtuel inclus)</p>
              </div>
              <div className="panel p-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Sorties course</p>
                <p className="mt-1 font-display text-2xl font-semibold text-white">{data.runs_total}</p>
                <p className="mt-1 text-[11px] text-white/35">Activités Strava type « course »</p>
              </div>
            </div>

            <div className="panel p-5">
              <h2 className="font-display text-sm font-semibold text-white">Volume hebdomadaire</h2>
              <p className="mt-1 text-[11px] text-white/40">
                Kilomètres par semaine (lundi UTC) et fréquence cardiaque moyenne pondérée lorsque disponible.
              </p>
              {weeklyRows.length === 0 ? (
                <p className="mt-6 text-sm text-white/45">Pas de données sur cette période.</p>
              ) : (
                <div className="mt-4 h-[300px] w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={weeklyRows} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis dataKey="week_short" tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }} />
                      <YAxis
                        yAxisId="km"
                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                        label={{ value: 'km', fill: 'rgba(255,255,255,0.35)', fontSize: 10, angle: -90, position: 'insideLeft' }}
                      />
                      <YAxis
                        yAxisId="hr"
                        orientation="right"
                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 10 }}
                        domain={['auto', 'auto']}
                      />
                      <Tooltip
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          const row = payload[0].payload as {
                            km: number
                            hours: number
                            runs: number
                            avg_hr: number | null
                          }
                          return (
                            <div className="rounded-xl border border-white/10 bg-[#12151f] px-3 py-2 text-xs text-white/90 shadow-lift">
                              <p className="font-medium text-white">{label}</p>
                              <p className="mt-1 text-white/75">
                                {row.km} km · {row.hours} h (mouvement)
                              </p>
                              <p className="text-white/55">{row.runs} sortie(s)</p>
                              {row.avg_hr != null ? (
                                <p className="mt-1 text-brand-ice/90">FC moy. ~{row.avg_hr} bpm</p>
                              ) : (
                                <p className="mt-1 text-white/35">Pas de FC sur ces sorties</p>
                              )}
                            </div>
                          )
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar
                        yAxisId="km"
                        dataKey="km"
                        name="km"
                        fill="#fc4c02"
                        radius={[4, 4, 0, 0]}
                        opacity={0.9}
                      />
                      <Line
                        yAxisId="hr"
                        type="monotone"
                        dataKey="avg_hr"
                        name="FC moy."
                        stroke="#67e8f9"
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#67e8f9' }}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <PaceBlock
                title="Évolution allure (~5 km)"
                subtitle="Sorties entre 4,2 et 6,8 km — allure moyenne Strava."
                points={data.pace_5k}
                stroke="#fc4c02"
              />
              <PaceBlock
                title="Évolution allure (~10 km)"
                subtitle="Sorties entre 9 et 12,5 km."
                points={data.pace_10k}
                stroke="#67e8f9"
              />
              <PaceBlock
                title="Évolution allure (~semi)"
                subtitle="Sorties entre 19 et 24,5 km."
                points={data.pace_half}
                stroke="#a78bfa"
              />
              <PaceBlock
                title="Évolution allure (~marathon)"
                subtitle="Sorties entre 40 et 45,5 km."
                points={data.pace_marathon}
                stroke="#f472b6"
              />
            </div>
          </>
        ) : null}

        <p className="text-[11px] leading-relaxed text-white/35">
          Période « Depuis le début » : jusqu’à environ 9 000 sorties récupérées (pagination Strava). Les tranches
          distance sont indicatives. La FC dépend du capteur Strava ; semaines sans ligne FC = pas de données
          pondérées. Utilise l’onglet <span className="text-white/55">Coach</span> dans le menu pour parler à l’IA,
          ou <span className="text-white/55">Objectifs</span> pour ton plan.
        </p>
        </main>
      </div>
    </div>
  )
}
