'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'
import { MemberPageHeader } from '@/components/MemberPageHeader'
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
import { StravaLinkBanner } from '@/components/StravaLinkBanner'
import {
  asArray,
  fetchMe,
  fetchStravaDashboard,
  type MeUser,
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
  points: StravaPacePoint[] | null | undefined
  stroke: string
}) {
  const pts = asArray(points)
  if (pts.length === 0) {
    return (
      <div className="panel p-5">
        <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
        <p className="mt-1 text-[11px] text-white/40">{subtitle}</p>
        <p className="mt-4 text-xs text-white/40">Aucune sortie dans cette tranche sur la période.</p>
      </div>
    )
  }
  const rows = paceRows(pts)
  return (
    <div className="panel p-5">
      <h3 className="font-display text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1 text-[11px] text-white/40">{subtitle}</p>
      <div className="mt-4 h-[200px] w-full min-w-0 sm:h-[240px] md:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 4, left: -8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="label"
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }}
              interval="preserveStartEnd"
              angle={-35}
              textAnchor="end"
              height={48}
            />
            <YAxis
              tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }}
              tickFormatter={(v) => formatPaceDecimal(Number(v))}
              width={48}
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
  const [me, setMe] = useState<MeUser | null>(null)
  const [stravaLinked, setStravaLinked] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [period, setPeriod] = useState<StravaDashboardPeriod>('30d')
  const [data, setData] = useState<StravaDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const stravaOffer = me?.capabilities?.strava_dashboard !== false

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
        setStravaLinked(u.strava_linked)
        setAuthReady(true)
        if (!u.strava_linked) setLoading(false)
      } catch {
        router.replace('/login/')
      }
    })()
  }, [router])

  const load = useCallback(async () => {
    const token = getToken()
    if (!token || !authReady || !stravaLinked || !stravaOffer) return
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
  }, [period, authReady, stravaLinked, stravaOffer])

  useEffect(() => {
    if (!authReady) return
    void load()
  }, [authReady, load])

  function logout() {
    clearToken()
    router.push('/login/')
  }

  if (!authReady || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const weeklyRows = asArray(data?.weekly).map((w) => ({
    week_short: formatWeekShort(w.week_start),
    km: w.km,
    hours: w.hours,
    runs: w.runs,
    avg_hr: w.avg_hr != null && w.avg_hr > 0 ? w.avg_hr : null,
  }))

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:sticky md:top-0 md:flex md:max-h-[100dvh] md:h-screen">
        <div className="border-b border-white/[0.06] px-safe pt-safe pb-3">
          <Link href="/dashboard/" aria-label="NeuroRun">
            <Mark compact />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
          <MemberPrimaryNav
            active="dashboard"
            capabilities={me.capabilities}
            isAdmin={me.role === 'admin'}
            profileFirstName={me.first_name}
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
            active="dashboard"
            onNavigate={() => setSidebarOpen(false)}
            capabilities={me.capabilities}
            isAdmin={me.role === 'admin'}
            profileFirstName={me.first_name}
          />
        </div>
      </MemberMobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {!stravaLinked && stravaOffer ? <StravaLinkBanner /> : null}
        <MemberPageHeader
          title="Tableau de bord"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
        />

        <main className="member-main-pad-b mx-auto w-full max-w-6xl flex-1 space-y-5 px-safe py-6 sm:space-y-6 sm:py-8">
        {stravaLinked && stravaOffer ? (
        <div className="-mx-1 member-scroll-x flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`shrink-0 rounded-xl px-3 py-2 text-xs font-medium transition ${
                period === p.id
                  ? 'bg-brand-orange/25 text-white ring-1 ring-brand-orange/45'
                  : 'border border-white/10 bg-white/[0.04] text-white/60 hover:border-white/20 hover:text-white/85'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        ) : null}

        {err ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {stravaLinked && loading ? <p className="text-sm text-white/45">Chargement des sorties…</p> : null}

        {!stravaLinked && !loading && stravaOffer ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
            <p className="text-sm text-white/70">
              Les graphiques et statistiques apparaîtront ici une fois Strava associé.
            </p>
            <Link
              href="/link-strava/"
              className="btn-brand mt-4 inline-flex px-5 py-2.5 text-sm"
            >
              Associer Strava
            </Link>
          </div>
        ) : null}

        {!stravaOffer && !loading ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
            <p className="text-sm text-white/70">
              Strava et les tableaux liés ne sont pas activés pour ton offre actuelle. Passe à une offre supérieure ou
              contacte un administrateur.
            </p>
            <Link href="/" className="btn-quiet mt-4 inline-flex px-5 py-2.5 text-sm">
              Voir les offres
            </Link>
          </div>
        ) : null}

        {!loading && data ? (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
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
                <div className="mt-4 h-[220px] w-full min-w-0 sm:h-[280px] md:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={weeklyRows} margin={{ top: 8, right: 4, left: -12, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                      <XAxis
                        dataKey="week_short"
                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }}
                        angle={-30}
                        textAnchor="end"
                        height={52}
                      />
                      <YAxis
                        yAxisId="km"
                        width={36}
                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }}
                        label={{ value: 'km', fill: 'rgba(255,255,255,0.35)', fontSize: 9, angle: -90, position: 'insideLeft' }}
                      />
                      <YAxis
                        yAxisId="hr"
                        orientation="right"
                        width={40}
                        tick={{ fill: 'rgba(255,255,255,0.45)', fontSize: 9 }}
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-6">
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

        <p className="text-[10px] leading-relaxed text-white/35 sm:text-[11px]">
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
