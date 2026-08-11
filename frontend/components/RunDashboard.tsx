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
import { useTierLabel } from '@/lib/useOfferConfig'

/** Libellés courts façon contrôle segmenté de l’app (7J / 30J / 3M / 1A / Tout). */
const PERIODS: { id: StravaDashboardPeriod; label: string; long: string }[] = [
  { id: '7d', label: '7J', long: '7 derniers jours' },
  { id: '30d', label: '30J', long: '30 derniers jours' },
  { id: '90d', label: '3M', long: '3 derniers mois' },
  { id: '365d', label: '1A', long: 'dernière année' },
  { id: 'all', label: 'Tout', long: 'historique complet' },
]

function periodLongLabel(id: StravaDashboardPeriod): string {
  return PERIODS.find((p) => p.id === id)?.long ?? ''
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return 'Bonne nuit'
  if (h < 12) return 'Bonjour'
  if (h < 18) return 'Bon après-midi'
  return 'Bonsoir'
}

function todayLabel(): string {
  return new Date()
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
    .replace('.', '')
}

function initials(first?: string, last?: string): string {
  const a = (first ?? '').trim().charAt(0)
  const b = (last ?? '').trim().charAt(0)
  return `${a}${b}`.toUpperCase() || 'R'
}

/** Heures décimales → « 4h32 » / « 48 » (+ unité « min » séparée). */
function formatDuration(hours: number): string {
  const totalMin = Math.round(hours * 60)
  if (totalMin < 60) return String(totalMin)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h${m.toString().padStart(2, '0')}`
}

/** Couleur d’accent par palier — le nom affiché vient de la config serveur (`useTierLabel`). */
function planAccent(plan?: string): string {
  switch ((plan ?? 'standard').toLowerCase().trim()) {
    case 'performance':
      return '#fc4c02'
    case 'strava':
      return '#67e8f9'
    default:
      return 'rgba(255,255,255,0.6)'
  }
}

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
  const planTitle = useTierLabel(me?.plan)
  const accent = planAccent(me?.plan)

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
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0c12] md:sticky md:top-0 md:flex md:max-h-[100dvh] md:h-screen">
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

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
        {!stravaLinked && stravaOffer ? <StravaLinkBanner /> : null}
        <MemberPageHeader
          title="Tableau de bord"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
        />

        <main className="member-main-pad-b mx-auto w-full max-w-6xl flex-1 space-y-5 px-safe py-6 sm:space-y-6 sm:py-8">
        {/* En-tête d’accueil — salutation, date, avatar et offre, comme sur l’app */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase leading-none tracking-[0.14em] text-white/38">
                {todayLabel()}
              </p>
              <h2 className="mt-1.5 truncate font-display text-[1.625rem] font-bold leading-8 text-white">
                {greeting()}, {me.first_name || 'Runner'}
              </h2>
            </div>
            <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand-orange/45">
              <span className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#1a1e2a] font-display text-sm font-semibold tracking-wide text-white/92">
                {initials(me.first_name, me.last_name)}
              </span>
            </span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.05] px-3 py-[7px]">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: accent }}
            />
            <span className="text-[11px] uppercase leading-none tracking-[0.11em] text-white/38">Offre</span>
            <span
              className="font-display text-[13px] font-semibold leading-none"
              style={{ color: accent }}
            >
              {planTitle}
            </span>
          </div>
        </div>

        {stravaLinked && stravaOffer ? (
          <div className="app-segment">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`app-segment-item ${period === p.id ? 'app-segment-item--on' : ''}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : null}

        {err ? (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {stravaLinked && loading ? (
          <div className="space-y-4">
            <div className="app-skeleton h-[186px]" />
            <div className="app-skeleton h-[54px]" />
            <div className="app-skeleton h-[288px]" />
          </div>
        ) : null}

        {!stravaLinked && !loading && stravaOffer ? (
          <div className="app-card p-5">
            <div className="flex items-center gap-3">
              <span className="app-icon-tile border-brand-ice/25 bg-brand-ice/[0.12] text-brand-ice">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                  />
                </svg>
              </span>
              <h3 className="font-display text-base font-semibold text-white/95">Relier Strava</h3>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-white/60">
              Ton offre le permet : synchronise Strava pour voir ici tout ton volume, tes allures et tes tendances.
            </p>
            <Link href="/link-strava/" className="btn-brand mt-4 w-full sm:w-auto">
              Associer Strava
            </Link>
          </div>
        ) : null}

        {!stravaOffer && !loading ? (
          <div className="app-card p-5">
            <div className="flex items-center gap-3">
              <span className="app-icon-tile border-yellow-400/25 bg-yellow-400/[0.12] text-yellow-400">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              </span>
              <h3 className="font-display text-base font-semibold text-white/95">Tableau de bord Strava</h3>
            </div>
            <p className="mt-3 text-[15px] leading-relaxed text-white/60">
              Strava et les tableaux liés ne sont pas activés pour ton offre actuelle. Passe à une offre supérieure ou
              contacte un administrateur.
            </p>
            <Link href="/profile/" className="btn-quiet mt-4 inline-flex w-full px-5 sm:w-auto">
              Voir les offres
            </Link>
          </div>
        ) : null}

        {!loading && data ? (
          <>
            {/* Carte héro : métrique principale + métriques secondaires */}
            <div className="app-hero p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="app-kicker">Distance totale</p>
                <span className="app-hero-pill">{periodLongLabel(period)}</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="app-hero-value">{data.total_km}</span>
                <span className="font-display text-xl font-semibold text-brand-orange">km</span>
              </div>
              <div className="my-4 h-px bg-white/[0.12]" />
              <div className="flex items-center">
                <div className="flex flex-1 flex-col items-center gap-1">
                  <p className="font-display text-[19px] font-semibold leading-6 tracking-[-0.3px] text-white/94">
                    {formatDuration(data.total_hours)}
                    {Math.round(data.total_hours * 60) < 60 ? (
                      <span className="text-xs font-normal text-white/38"> min</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] leading-none tracking-wide text-white/38">Temps</p>
                </div>
                <div className="h-7 w-px bg-white/[0.08]" />
                <div className="flex flex-1 flex-col items-center gap-1">
                  <p className="font-display text-[19px] font-semibold leading-6 tracking-[-0.3px] text-white/94">
                    {data.runs_total}
                  </p>
                  <p className="text-[11px] leading-none tracking-wide text-white/38">Sorties</p>
                </div>
                <div className="h-7 w-px bg-white/[0.08]" />
                <div className="flex flex-1 flex-col items-center gap-1">
                  <p className="font-display text-[19px] font-semibold leading-6 tracking-[-0.3px] text-white/94">
                    {data.total_km > 0 && data.total_hours > 0
                      ? formatPaceDecimal((data.total_hours * 60) / data.total_km).replace('/km', '')
                      : '—'}
                    {data.total_km > 0 && data.total_hours > 0 ? (
                      <span className="text-xs font-normal text-white/38">/km</span>
                    ) : null}
                  </p>
                  <p className="text-[11px] leading-none tracking-wide text-white/38">Allure moy.</p>
                </div>
              </div>
            </div>

            {me.capabilities?.live_runs !== false ? (
            <Link
              href="/run/"
              className="flex items-center gap-3 rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-4 transition hover:border-white/[0.14] hover:bg-[#13161f]"
            >
              <span className="app-icon-tile border-brand-orange/28 bg-brand-orange/[0.15] text-brand-orange">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 15H3.75z" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-base font-semibold leading-tight text-white/92">Démarrer une course</span>
                <span className="mt-0.5 block text-[13px] text-white/38">Suivi GPS en direct</span>
              </span>
              <span className="font-display text-2xl leading-none text-white/20">›</span>
            </Link>
            ) : null}

            <p className="app-note">
              <span className="mt-px shrink-0 text-brand-ice">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.25 11.25h1.5v5.25m-.75-9h.008v.008H12V7.5zM21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
              <span>
                Tableau <strong>Strava + courses NeuroRun</strong> sur {periodLongLabel(period)} (doublons évidents
                exclus).
              </span>
            </p>

            <h3 className="pt-1 font-display text-[19px] font-semibold text-white">Ton activité</h3>

            <div className="panel p-5">
              <h2 className="font-display text-sm font-semibold text-white">Volume hebdomadaire</h2>
              <p className="mt-1 text-[11px] text-white/40">
                Kilomètres par semaine (lundi UTC) et fréquence cardiaque moyenne pondérée lorsque disponible.
              </p>
              {weeklyRows.length === 0 ? (
                <div className="app-empty mt-4">
                  <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.04] text-white/38">
                    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v16.5a1.5 1.5 0 001.5 1.5H21M7.5 15.75l3.75-4.5 3 3 4.5-6" />
                    </svg>
                  </span>
                  <p className="text-base font-semibold text-white/92">Aucune course sur cette période</p>
                  <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] leading-[19px] text-white/38">
                    Change de période ou enregistre une sortie : tes graphiques apparaîtront ici.
                  </p>
                </div>
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
