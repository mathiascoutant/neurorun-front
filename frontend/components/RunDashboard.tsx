'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberSidebar } from '@/components/MemberSidebar'
import { StravaLinkBanner } from '@/components/StravaLinkBanner'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { DashboardLocked } from '@/components/dashboard/DashboardLocked'
import { Sparkline } from '@/components/dashboard/Sparkline'
import { StatTile, type StatDelta } from '@/components/dashboard/StatTile'
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  SERIES,
  average,
  formatDayMonth,
  formatNumber,
  formatPace,
  formatTimestamp,
  paceAxis,
  paddedTimeDomain,
} from '@/components/dashboard/chartTheme'
import {
  asArray,
  fetchMe,
  fetchStravaDashboard,
  isStravaUnlinked,
  type MeUser,
  type StravaDashboard,
  type StravaDashboardPeriod,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { useTierLabel } from '@/lib/useOfferConfig'

const PERIODS: { id: StravaDashboardPeriod; label: string; long: string }[] = [
  { id: '7d', label: '7J', long: 'les 7 derniers jours' },
  { id: '30d', label: '30J', long: 'les 30 derniers jours' },
  { id: '90d', label: '3M', long: 'les 3 derniers mois' },
  { id: '365d', label: '1A', long: 'la dernière année' },
  { id: 'all', label: 'Tout', long: "l'historique complet" },
]

/**
 * Séries d’allure : même unité (min/km) et même axe, donc un seul graphique
 * comparatif plutôt que quatre cartes isolées qui ne se lisaient jamais ensemble.
 */
const PACE_SERIES = [
  { id: 'k5', label: '≈ 5 km', color: SERIES.brand, key: 'pace_5k' },
  { id: 'k10', label: '≈ 10 km', color: SERIES.ice, key: 'pace_10k' },
  { id: 'half', label: '≈ Semi', color: SERIES.violet, key: 'pace_half' },
  { id: 'marathon', label: '≈ Marathon', color: SERIES.pink, key: 'pace_marathon' },
] as const

type PaceSeriesId = (typeof PACE_SERIES)[number]['id']
type PaceRow = { ts: number } & Partial<Record<PaceSeriesId, number>>

/** Barre du graphique de volume — une journée ou une semaine selon la période. */
type BarRow = {
  key: string
  /** Étiquette d’axe, courte */
  label: string
  /** Titre d’infobulle, en toutes lettres */
  full: string
  km: number
  hours: number
  runs: number
  avg_hr: number | null
}

const DAY_MS = 86_400_000

function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/**
 * Barres journalières sur les 7 derniers jours, jours de repos compris.
 *
 * L’API ne renvoie que les jours courus : sans remplissage, une semaine à deux
 * sorties donnerait deux barres collées et illisibles. La fenêtre part du plus
 * ancien entre « aujourd’hui − 6 » et la première sortie reçue, pour qu’une
 * sortie en limite de période ne disparaisse jamais du graphique.
 */
function buildDailyRows(days: { date: string; km: number; hours: number; runs: number; avg_hr?: number }[]): BarRow[] {
  const now = new Date()
  const todayMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const byDate = new Map(days.map((d) => [d.date, d]))

  let startMs = todayMs - 6 * DAY_MS
  for (const d of days) {
    const t = Date.parse(`${d.date}T00:00:00Z`)
    if (Number.isFinite(t) && t < startMs) startMs = t
  }
  // Garde-fou : la fenêtre « 7 jours » ne doit pas s’étirer indéfiniment.
  if (todayMs - startMs > 13 * DAY_MS) startMs = todayMs - 13 * DAY_MS

  const rows: BarRow[] = []
  for (let ms = startMs; ms <= todayMs; ms += DAY_MS) {
    const key = isoDay(ms)
    const found = byDate.get(key)
    const d = new Date(ms)
    rows.push({
      key,
      label: d
        .toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' })
        .replace('.', ''),
      full: d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }),
      km: found?.km ?? 0,
      hours: found?.hours ?? 0,
      runs: found?.runs ?? 0,
      avg_hr: found?.avg_hr != null && found.avg_hr > 0 ? found.avg_hr : null,
    })
  }
  return rows
}

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

/** Valeur et unité séparées : la tuile les compose elle-même à deux tailles. */
function splitDuration(hours: number): { value: string; unit: string } {
  const totalMin = Math.round((Number.isFinite(hours) ? hours : 0) * 60)
  if (totalMin < 60) return { value: String(totalMin), unit: 'min' }
  return { value: `${Math.floor(totalMin / 60)}h${(totalMin % 60).toString().padStart(2, '0')}`, unit: '' }
}

/**
 * Tendance de volume : moyenne des n dernières semaines contre les n précédentes.
 *
 * On compare des fenêtres de même longueur prises dans la période affichée — pas
 * de second appel réseau, et l’écart reste vrai quelle que soit la période choisie.
 */
function weeklyTrend(weeks: { km: number }[]): StatDelta | null {
  if (weeks.length < 4) return null
  const n = Math.min(4, Math.floor(weeks.length / 2))
  const recent = weeks.slice(-n)
  const previous = weeks.slice(-2 * n, -n)
  if (previous.length < n) return null
  const now = average(recent.map((w) => w.km))
  const before = average(previous.map((w) => w.km))
  if (before <= 0) return null
  return { percent: Math.round(((now - before) / before) * 100), comparedTo: `vs ${n} sem. préc.` }
}

/** Fusionne les quatre séries d’allure sur un axe temporel commun. */
function buildPaceRows(data: StravaDashboard | null): PaceRow[] {
  const byTimestamp = new Map<number, PaceRow>()
  for (const serie of PACE_SERIES) {
    for (const point of asArray(data?.[serie.key])) {
      const raw = String(point.date ?? '')
      const ts = new Date(raw.length <= 10 ? `${raw}T12:00:00Z` : raw).getTime()
      if (!Number.isFinite(ts) || !(point.pace_min_per_km > 0)) continue
      const row = byTimestamp.get(ts) ?? { ts }
      row[serie.id] = point.pace_min_per_km
      byTimestamp.set(ts, row)
    }
  }
  return Array.from(byTimestamp.values()).sort((a, b) => a.ts - b.ts)
}

function TipShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="chart-tip">
      <p className="text-[12px] font-semibold text-white">{title}</p>
      <div className="mt-1.5 space-y-1 text-[12px] leading-4 text-white/70">{children}</div>
    </div>
  )
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pt-1">
      <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-white">{children}</h2>
      {hint ? <p className="hidden text-[12px] text-white/38 sm:block">{hint}</p> : null}
    </div>
  )
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="app-empty">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.04] text-white/38">
        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v16.5A1.5 1.5 0 004.5 21H21M7.5 15.75l3.75-4.5 3 3 4.5-6" />
        </svg>
      </span>
      <p className="text-[15px] font-semibold text-white/90">Rien à afficher sur cette période</p>
      <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-[19px] text-white/40">{message}</p>
    </div>
  )
}

export function RunDashboard() {
  const router = useRouter()
  const [authReady, setAuthReady] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  const [stravaLinked, setStravaLinked] = useState(false)
  /** Le compte était relié et Strava a révoqué l'accès — à dire, sinon la demande d'association paraît sortie de nulle part. */
  const [stravaRevoked, setStravaRevoked] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [period, setPeriod] = useState<StravaDashboardPeriod>('30d')
  const [data, setData] = useState<StravaDashboard | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [hiddenPace, setHiddenPace] = useState<PaceSeriesId[]>([])

  const stravaOffer = me?.capabilities?.strava_dashboard !== false
  const planTitle = useTierLabel(me?.plan)

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
      setData(null)
      // Accès révoqué depuis Strava : l’API vient de délier le compte. Ce n’est
      // pas une panne — on repasse à l’écran de liaison plutôt qu’à « Réessayer ».
      if (isStravaUnlinked(e)) {
        setStravaLinked(false)
        setStravaRevoked(true)
        setErr('')
      } else {
        setErr(e instanceof Error ? e.message : 'Erreur')
      }
    } finally {
      setLoading(false)
    }
  }, [period, authReady, stravaLinked, stravaOffer])

  useEffect(() => {
    if (!authReady) return
    void load()
  }, [authReady, load])

  /**
   * Sur 7 jours, la maille hebdomadaire ne dirait rien : on passe au jour.
   * `daily` est un ajout récent de l’API — face à un backend plus ancien qui ne
   * l’envoie pas, on retombe sur les semaines plutôt que d’afficher un vide.
   */
  const dailyRows = asArray(data?.daily)
  const isDaily = period === '7d' && dailyRows.length > 0

  const weeklyRows = useMemo(
    () =>
      asArray(data?.weekly).map((w) => ({
        km: w.km,
        hours: w.hours,
        runs: w.runs,
      })),
    [data],
  )

  const barRows = useMemo<BarRow[]>(() => {
    if (isDaily) return buildDailyRows(asArray(data?.daily))
    return asArray(data?.weekly).map((w) => ({
      key: w.week_start,
      label: formatDayMonth(w.week_start),
      full: `Semaine du ${formatDayMonth(w.week_start)}`,
      km: w.km,
      hours: w.hours,
      runs: w.runs,
      avg_hr: w.avg_hr != null && w.avg_hr > 0 ? w.avg_hr : null,
    }))
  }, [data, isDaily])

  const paceRows = useMemo(() => buildPaceRows(data), [data])
  const paceAvailable = useMemo(
    () => PACE_SERIES.filter((s) => paceRows.some((r) => r[s.id] != null)),
    [paceRows],
  )
  const visiblePace = paceAvailable.filter((s) => !hiddenPace.includes(s.id))

  /* Graduations rondes (4:45, 5:00, 5:15…) plutôt que les décimales brutes. */
  const paceScale = useMemo(
    () => paceAxis(paceRows.flatMap((r) => visiblePace.map((s) => r[s.id]).filter((v): v is number => v != null))),
    [paceRows, visiblePace],
  )
  const paceTimeDomain = useMemo(() => paddedTimeDomain(paceRows.map((r) => r.ts)), [paceRows])
  /* Peu de sorties = points isolés : ils doivent rester visibles sans trait qui les relie. */
  const paceDotRadius = paceRows.length <= 4 ? 4.5 : 2.5

  const hrRows = barRows.filter((r) => r.avg_hr != null)
  const avgKm = average(barRows.map((r) => r.km))
  const best = barRows.reduce<BarRow | null>((top, r) => (top == null || r.km > top.km ? r : top), null)
  const trend = weeklyTrend(weeklyRows)
  /** Libellés qui changent avec la maille — évite d’écrire « par semaine » sur 7 jours. */
  const unitWord = isDaily ? 'jour' : 'semaine'

  function logout() {
    clearToken()
    router.push('/login/')
  }

  function togglePace(id: PaceSeriesId) {
    setHiddenPace((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      // Toujours au moins une série tracée : sinon le graphique n’a plus de sens.
      return next.length === paceAvailable.length ? prev : next
    })
  }

  if (!authReady || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div
          className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange"
          role="status"
          aria-label="Chargement"
        />
      </main>
    )
  }

  const duration = splitDuration(data?.total_hours ?? 0)
  const avgPace =
    data && data.total_km > 0 && data.total_hours > 0 ? (data.total_hours * 60) / data.total_km : 0

  return (
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <MemberSidebar
        active="dashboard"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        capabilities={me.capabilities}
        isAdmin={me.role === 'admin'}
        firstName={me.first_name}
        lastName={me.last_name}
        planLabel={planTitle}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
        {!stravaLinked && stravaOffer ? <StravaLinkBanner /> : null}
        <MemberPageHeader
          title="Tableau de bord"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
        />

        <main className="member-main-pad-b mx-auto w-full max-w-6xl flex-1 space-y-6 px-safe py-6 sm:py-8">
          {/* Accroche : qui, et quand. */}
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase leading-none tracking-[0.14em] text-white/38">
              {todayLabel()}
            </p>
            <h2 className="mt-2 truncate font-display text-[1.6rem] font-bold leading-8 tracking-[-0.02em] text-white sm:text-[1.75rem]">
              {greeting()}, {me.first_name || 'Runner'}
            </h2>
          </div>

          {/* Filtre de période — au-dessus de tout ce qu’il pilote. */}
          {stravaLinked && stravaOffer ? (
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="-mx-1 overflow-x-auto px-1 member-scroll-x">
                <div className="app-segment min-w-[19rem]" role="group" aria-label="Période analysée">
                  {PERIODS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={period === p.id}
                      onClick={() => setPeriod(p.id)}
                      className={`app-segment-item cursor-pointer ${period === p.id ? 'app-segment-item--on' : ''}`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[12px] leading-snug text-white/38">
                Strava + courses NeuroRun sur <span className="text-white/62">{periodLongLabel(period)}</span>
              </p>
            </div>
          ) : null}

          {err ? (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.09] px-4 py-3.5"
            >
              <svg className="mt-px h-5 w-5 shrink-0 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-red-50">Impossible de charger tes données</p>
                <p className="mt-0.5 text-[13px] leading-snug text-red-100/70">{err}</p>
              </div>
              <button type="button" onClick={() => void load()} className="btn-quiet shrink-0 cursor-pointer px-3 py-2 text-[13px]">
                Réessayer
              </button>
            </div>
          ) : null}

          {stravaLinked && stravaOffer && loading ? (
            <div className="space-y-6" aria-busy="true" aria-label="Chargement du tableau de bord">
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <div className="app-skeleton h-[132px]" />
                <div className="app-skeleton h-[132px]" />
                <div className="app-skeleton h-[132px]" />
                <div className="app-skeleton h-[132px]" />
              </div>
              <div className="app-skeleton h-[300px]" />
              <div className="app-skeleton h-[300px]" />
            </div>
          ) : null}

          {!loading && !stravaOffer ? (
            <DashboardLocked reason="offer" capabilities={me.capabilities} />
          ) : !loading && !stravaLinked ? (
            <DashboardLocked
              reason="strava"
              capabilities={me.capabilities}
              revoked={stravaRevoked}
            />
          ) : null}

          {!loading && data ? (
            <>
              {/* Chiffres-clés — quatre mesures, une seule ligne de lecture. */}
              <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <StatTile
                  accent
                  label="Distance"
                  value={formatNumber(data.total_km, data.total_km >= 100 ? 0 : 1)}
                  unit="km"
                  delta={trend}
                  footer={
                    barRows.length > 2 ? (
                      <Sparkline
                        values={barRows.map((r) => r.km)}
                        color={SERIES.brand}
                        ariaLabel={`Évolution du volume par ${unitWord} sur ${barRows.length} ${unitWord}s`}
                      />
                    ) : null
                  }
                />
                <StatTile
                  label="Temps de course"
                  value={duration.value}
                  unit={duration.unit}
                />
                <StatTile
                  label="Sorties"
                  value={formatNumber(data.runs_total)}
                />
                <StatTile
                  label="Allure moyenne"
                  value={formatPace(avgPace)}
                  unit={avgPace > 0 ? '/km' : undefined}
                  hint={
                    best && best.km > 0
                      ? `Meilleur${isDaily ? ' jour' : 'e semaine'} : ${formatNumber(best.km, 1)} km`
                      : undefined
                  }
                />
              </div>

              <SectionTitle hint={`Sur ${periodLongLabel(period)}`}>Ton activité</SectionTitle>

              <ChartCard
                title={isDaily ? 'Volume quotidien' : 'Volume hebdomadaire'}
                subtitle={
                  isDaily
                    ? 'Kilomètres par jour (UTC). Les jours sans sortie restent visibles.'
                    : 'Kilomètres cumulés par semaine (du lundi, en UTC).'
                }
                table={{
                  caption: `Volume, durée et nombre de sorties par ${unitWord}`,
                  columns: [isDaily ? 'Jour' : 'Semaine', 'km', 'Durée', 'Sorties', 'FC moy.'],
                  rows: barRows.map((r) => {
                    const d = splitDuration(r.hours)
                    return [
                      r.full,
                      formatNumber(r.km, 1),
                      r.runs > 0 ? `${d.value}${d.unit ? ` ${d.unit}` : ''}` : '—',
                      r.runs,
                      r.avg_hr != null ? `${r.avg_hr} bpm` : '—',
                    ]
                  }),
                }}
                empty={
                  barRows.length === 0 ? (
                    <EmptyChart
                      message={`Change de période ou enregistre une sortie : tes ${unitWord}s apparaîtront ici.`}
                    />
                  ) : undefined
                }
              >
                <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barRows} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                      <XAxis
                        dataKey="label"
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={{ stroke: AXIS_LINE }}
                        interval={isDaily ? 0 : 'preserveStartEnd'}
                        minTickGap={isDaily ? 0 : 16}
                        height={28}
                      />
                      <YAxis
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={38}
                        tickFormatter={(v: number) => formatNumber(v)}
                        allowDecimals={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const row = payload[0].payload as BarRow
                          const d = splitDuration(row.hours)
                          return (
                            <TipShell title={row.full}>
                              {row.runs === 0 ? (
                                <p className="text-white/50">Pas de sortie</p>
                              ) : (
                                <>
                                  <p>
                                    <span className="font-semibold text-white">{formatNumber(row.km, 1)} km</span> ·{' '}
                                    {d.value}
                                    {d.unit ? ` ${d.unit}` : ''}
                                  </p>
                                  <p>
                                    {row.runs} sortie{row.runs > 1 ? 's' : ''}
                                  </p>
                                  {row.avg_hr != null ? <p>FC moyenne ≈ {row.avg_hr} bpm</p> : null}
                                </>
                              )}
                            </TipShell>
                          )
                        }}
                      />
                      {avgKm > 0 ? (
                        <ReferenceLine
                          y={avgKm}
                          stroke="rgba(255,255,255,0.28)"
                          strokeWidth={1}
                          label={{
                            value: `moy. ${formatNumber(avgKm, 1)} km/${isDaily ? 'j' : 'sem'}`,
                            position: 'insideTopRight',
                            fill: 'rgba(255,255,255,0.45)',
                            fontSize: 10.5,
                          }}
                        />
                      ) : null}
                      <Bar dataKey="km" name="km" fill={SERIES.brand} radius={[4, 4, 0, 0]} maxBarSize={38} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <ChartCard
                title="Fréquence cardiaque moyenne"
                subtitle={`Moyenne pondérée par ${unitWord}, sur les sorties où le capteur a enregistré.`}
                table={{
                  caption: `Fréquence cardiaque moyenne par ${unitWord}`,
                  columns: [isDaily ? 'Jour' : 'Semaine', 'FC moy. (bpm)'],
                  rows: hrRows.map((r) => [r.full, r.avg_hr ?? '—']),
                }}
                empty={
                  hrRows.length === 0 ? (
                    <div className="app-note">
                      <span className="mt-px shrink-0 text-brand-ice">
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25h1.5v5.25m-.75-9h.008v.008H12V7.5zM21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </span>
                      <span>
                        Aucune <strong>donnée cardio</strong> sur cette période. Elle apparaîtra dès qu’une sortie sera
                        enregistrée avec une ceinture ou une montre compatible.
                      </span>
                    </div>
                  ) : undefined
                }
              >
                <div className="h-[180px] w-full min-w-0 sm:h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={hrRows} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                      <XAxis
                        dataKey="label"
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={{ stroke: AXIS_LINE }}
                        interval="preserveStartEnd"
                        minTickGap={16}
                        height={28}
                      />
                      <YAxis
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        domain={['auto', 'auto']}
                        tickFormatter={(v: number) => formatNumber(v)}
                      />
                      <Tooltip
                        cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null
                          const row = payload[0].payload as BarRow
                          return (
                            <TipShell title={row.full}>
                              <p className="font-semibold text-white">{row.avg_hr} bpm en moyenne</p>
                            </TipShell>
                          )
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="avg_hr"
                        name="FC moyenne"
                        stroke={SERIES.ice}
                        strokeWidth={2}
                        dot={{ r: 3, fill: SERIES.ice, strokeWidth: 0 }}
                        activeDot={{ r: 5, stroke: '#0d0f16', strokeWidth: 2 }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <SectionTitle hint="Axe inversé : plus haut = plus rapide">Évolution des allures</SectionTitle>

              <ChartCard
                title="Allure par distance"
                subtitle="Une courbe par tranche de distance, sur une même échelle min/km."
                table={{
                  caption: 'Allure moyenne par sortie et par tranche de distance',
                  columns: ['Date', ...paceAvailable.map((s) => s.label)],
                  rows: paceRows.map((r) => [
                    formatTimestamp(r.ts),
                    ...paceAvailable.map((s) => (r[s.id] != null ? formatPace(r[s.id] as number, true) : '—')),
                  ]),
                }}
                empty={
                  paceAvailable.length === 0 ? (
                    <EmptyChart message="Aucune sortie ne tombe dans les tranches 5 km, 10 km, semi ou marathon sur cette période." />
                  ) : undefined
                }
                actions={
                  <div className="flex flex-wrap gap-1.5">
                    {paceAvailable.map((s) => {
                      const off = hiddenPace.includes(s.id)
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => togglePace(s.id)}
                          aria-pressed={!off}
                          className={`chart-chip cursor-pointer ${off ? 'chart-chip--off' : ''}`}
                          style={off ? { color: s.color } : undefined}
                        >
                          <span className="chart-chip-dot" style={{ backgroundColor: s.color }} />
                          <span className={off ? 'text-white/50' : ''}>{s.label}</span>
                        </button>
                      )
                    })}
                  </div>
                }
              >
                <div className="h-[260px] w-full min-w-0 sm:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={paceRows} margin={{ top: 12, right: 10, left: 0, bottom: 4 }}>
                      <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                      <XAxis
                        dataKey="ts"
                        type="number"
                        scale="time"
                        domain={paceTimeDomain}
                        tickFormatter={formatTimestamp}
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={{ stroke: AXIS_LINE }}
                        minTickGap={28}
                        height={28}
                      />
                      <YAxis
                        reversed
                        domain={paceScale.domain}
                        ticks={paceScale.ticks}
                        interval={0}
                        tickFormatter={(v: number) => formatPace(v)}
                        tick={AXIS_TICK}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
                      <Tooltip
                        cursor={{ stroke: 'rgba(255,255,255,0.18)', strokeWidth: 1 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null
                          return (
                            <TipShell title={formatTimestamp(Number(label))}>
                              {payload.map((entry) => (
                                <p key={String(entry.dataKey)} className="flex items-center gap-2">
                                  <span
                                    className="h-2 w-2 shrink-0 rounded-sm"
                                    style={{ backgroundColor: entry.color }}
                                  />
                                  <span className="text-white/60">{entry.name}</span>
                                  <span className="ml-auto font-semibold text-white">
                                    {formatPace(Number(entry.value), true)}
                                  </span>
                                </p>
                              ))}
                            </TipShell>
                          )
                        }}
                      />
                      {visiblePace.map((s) => (
                        <Line
                          key={s.id}
                          type="monotone"
                          dataKey={s.id}
                          name={s.label}
                          stroke={s.color}
                          strokeWidth={2}
                          dot={{ r: paceDotRadius, fill: s.color, stroke: '#0d0f16', strokeWidth: 1.5 }}
                          activeDot={{ r: 6, stroke: '#0d0f16', strokeWidth: 2 }}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </ChartCard>

              <details className="group rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-[13px] font-medium text-white/62 transition hover:text-white/85">
                  <svg
                    className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Comment ces chiffres sont calculés
                </summary>
                <div className="mt-3 space-y-2 pl-6 text-[12.5px] leading-relaxed text-white/45">
                  <p>
                    Les données combinent tes sorties <span className="text-white/70">Strava</span> et tes courses
                    enregistrées dans NeuroRun ; les doublons évidents sont exclus.
                  </p>
                  <p>
                    Les tranches de distance sont indicatives : ≈ 5 km (4,2–6,8), ≈ 10 km (9–12,5), ≈ semi (19–24,5),
                    ≈ marathon (40–45,5).
                  </p>
                  <p>
                    La fréquence cardiaque dépend du capteur transmis par Strava — une semaine sans point cardio
                    signifie simplement qu’aucune sortie n’en portait.
                  </p>
                  <p>
                    Période « Tout » : jusqu’à environ 9 000 sorties récupérées via la pagination Strava.
                  </p>
                </div>
              </details>
            </>
          ) : null}
        </main>
      </div>
    </div>
  )
}
