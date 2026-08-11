'use client'

import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartCard } from '@/components/dashboard/ChartCard'
import { StatTile } from '@/components/dashboard/StatTile'
import { AXIS_LINE, AXIS_TICK, GRID_STROKE, SERIES } from '@/components/dashboard/chartTheme'
import { Badge, EmptyState, SkeletonRows } from '@/components/admin/ui'
import { formatDate, formatEuro, formatNumber, tierLabel } from '@/components/admin/format'
import type { AdminStats } from '@/lib/api'

type DayPoint = { day: string; count: number; label: string }

/** Somme des inscriptions sur les `n` derniers jours de la série. */
function sumLast(points: DayPoint[], n: number): number {
  return points.slice(-n).reduce((acc, p) => acc + p.count, 0)
}

/**
 * Écart en pourcentage entre deux fenêtres consécutives de même longueur.
 * `null` quand la fenêtre précédente est vide : « +∞ % » n’apprend rien.
 */
function windowDelta(points: DayPoint[], n: number): number | null {
  if (points.length < n * 2) return null
  const current = sumLast(points, n)
  const previous = points.slice(-n * 2, -n).reduce((acc, p) => acc + p.count, 0)
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 100)
}

function TipShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="chart-tip">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-white/45">{title}</p>
      <div className="mt-1 space-y-0.5 text-[12.5px] text-white/75">{children}</div>
    </div>
  )
}

/**
 * Écran d’accueil de la console : ce qui se mesure en premier — combien de
 * comptes, à quel rythme ils arrivent, ce qu’ils rapportent, et qui utilise
 * vraiment le produit.
 */
export function AdminOverview({ stats, loading }: { stats: AdminStats | null; loading: boolean }) {
  const points = useMemo<DayPoint[]>(
    () =>
      (stats?.signups_by_day ?? []).map((d) => ({
        day: d.day,
        count: d.count,
        label: new Date(`${d.day}T12:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
      })),
    [stats],
  )

  const tiers = useMemo(() => {
    if (!stats) return []
    const ids =
      stats.tier_order && stats.tier_order.length > 0
        ? stats.tier_order
        : Object.keys(stats.users_by_plan ?? {}).sort()
    const total = ids.reduce((acc, id) => acc + (stats.users_by_plan?.[id] ?? 0), 0)
    return ids.map((id) => {
      const users = stats.users_by_plan?.[id] ?? 0
      const price = stats.prices_eur?.[id] ?? 0
      return {
        id,
        label: tierLabel(id, stats.tier_display_names),
        users,
        price,
        mrr: users * price,
        share: total > 0 ? (users / total) * 100 : 0,
      }
    })
  }, [stats])

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="app-skeleton h-[132px]" />
          ))}
        </div>
        <div className="app-skeleton h-[300px]" />
        <SkeletonRows rows={4} height={52} />
      </div>
    )
  }

  if (!stats) {
    return <EmptyState title="Statistiques indisponibles" body="Le serveur n’a pas renvoyé de données. Réessaie via le bouton Actualiser." />
  }

  const paidUsers = tiers.filter((t) => t.price > 0).reduce((acc, t) => acc + t.users, 0)
  const conversion = stats.users_total > 0 ? (paidUsers / stats.users_total) * 100 : 0
  const delta7 = windowDelta(points, 7)
  const arpu = paidUsers > 0 && stats.mrr_estimated_eur != null ? stats.mrr_estimated_eur / paidUsers : null

  return (
    <div className="space-y-6">
      {/* Quatre mesures, une seule ligne de lecture : volume, rythme, revenu, conversion. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          accent
          label="Comptes"
          value={formatNumber(stats.users_total)}
          hint={`${formatNumber(stats.users_last_7d)} nouveau${stats.users_last_7d > 1 ? 'x' : ''} sur 7 jours`}
        />
        <StatTile
          label="Inscriptions 7 j."
          value={formatNumber(stats.users_last_7d)}
          delta={delta7 != null ? { percent: delta7, comparedTo: 'aux 7 j. précédents' } : null}
          hint={points.length > 0 ? `${formatNumber(sumLast(points, 30))} sur 30 jours` : undefined}
        />
        <StatTile
          label="MRR estimé"
          value={formatEuro(stats.mrr_estimated_eur, 0)}
          unit="€/mois"
          hint={arpu != null ? `${formatEuro(arpu)} € par abonné payant` : 'Σ prix × abonnés par palier'}
        />
        <StatTile
          label="Conversion payante"
          value={formatNumber(conversion, 1)}
          unit="%"
          hint={`${formatNumber(paidUsers)} compte${paidUsers > 1 ? 's' : ''} sur offre payante`}
          footer={
            <div className="meter" role="img" aria-label={`${formatNumber(conversion, 1)} % de comptes payants`}>
              <div className="meter-fill" style={{ width: `${Math.min(100, conversion)}%` }} />
            </div>
          }
        />
      </div>

      <ChartCard
        title="Inscriptions par jour"
        subtitle="30 derniers jours, en heure UTC."
        table={{
          caption: 'Inscriptions par jour',
          columns: ['Jour', 'Inscriptions'],
          rows: points.map((p) => [p.label, p.count]),
        }}
        empty={
          points.length === 0 ? (
            <EmptyState title="Aucune inscription sur la période" body="La courbe apparaîtra dès le premier compte créé." />
          ) : undefined
        }
      >
        <div className="h-[240px] w-full min-w-0 sm:h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 12, right: 10, left: 0, bottom: 4 }}>
              <defs>
                <linearGradient id="admin-signups" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={SERIES.brand} stopOpacity={0.42} />
                  <stop offset="100%" stopColor={SERIES.brand} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis
                dataKey="label"
                tick={AXIS_TICK}
                tickLine={false}
                axisLine={{ stroke: AXIS_LINE }}
                minTickGap={22}
                height={28}
              />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={34} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: 'rgba(255,255,255,0.16)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as DayPoint
                  return (
                    <TipShell title={formatDate(row.day)}>
                      <p>
                        <span className="font-semibold text-white">{row.count}</span> inscription{row.count > 1 ? 's' : ''}
                      </p>
                    </TipShell>
                  )
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="Inscriptions"
                stroke={SERIES.brand}
                strokeWidth={2}
                fill="url(#admin-signups)"
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Répartition par offre : la part de chaque palier et ce qu’il pèse au mois. */}
        <section className="panel p-5">
          <h2 className="font-display text-[15px] font-semibold text-white">Répartition par offre</h2>
          <p className="mt-1 text-[12.5px] text-white/45">Effectif de chaque palier et contribution au MRR.</p>
          {tiers.length === 0 ? (
            <p className="mt-4 text-sm text-white/45">Aucun palier configuré.</p>
          ) : (
            <ul className="mt-4 space-y-3.5">
              {tiers.map((t) => (
                <li key={t.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-white/88">{t.label}</span>
                      {t.price > 0 ? (
                        <Badge tone="brand">{formatEuro(t.price)} €</Badge>
                      ) : (
                        <Badge>Gratuit</Badge>
                      )}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-white/55">
                      <span className="font-semibold text-white">{formatNumber(t.users)}</span>
                      <span className="text-white/35"> · {formatNumber(t.share, 0)} %</span>
                      {t.mrr > 0 ? <span className="text-white/35"> · {formatEuro(t.mrr, 0)} €/mois</span> : null}
                    </span>
                  </div>
                  <div className="meter mt-2">
                    <div
                      className={`meter-fill ${t.price > 0 ? '' : 'meter-fill--ice'}`}
                      style={{ width: `${Math.max(1.5, t.share)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Classement d’usage : sert à repérer qui interroger avant une évolution produit. */}
        <section className="panel p-5">
          <h2 className="font-display text-[15px] font-semibold text-white">Comptes les plus actifs</h2>
          <p className="mt-1 text-[12.5px] text-white/45">
            Score = courses live + objectifs + conversations. Un indicateur d’usage, pas de performance sportive.
          </p>
          {!stats.top_active_users || stats.top_active_users.length === 0 ? (
            <p className="mt-4 text-sm text-white/45">Pas encore assez d’activité pour un classement.</p>
          ) : (
            <ol className="mt-4 space-y-1.5">
              {stats.top_active_users.slice(0, 8).map((u, i) => {
                const max = stats.top_active_users?.[0]?.activity || 1
                return (
                  <li
                    key={u.user_id}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2"
                  >
                    <span
                      className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11.5px] font-bold tabular-nums ${
                        i === 0 ? 'bg-brand-orange/20 text-brand-orange' : 'bg-white/[0.06] text-white/45'
                      }`}
                      aria-hidden
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] text-white/85">{u.email || u.user_id}</span>
                      <span className="mt-1 block">
                        <span className="meter">
                          <span
                            className="meter-fill meter-fill--ice block"
                            style={{ width: `${Math.max(3, (u.activity / max) * 100)}%` }}
                          />
                        </span>
                      </span>
                    </span>
                    <span
                      className="shrink-0 text-right text-[11.5px] leading-tight tabular-nums text-white/45"
                      title={`${u.live_runs} course(s) · ${u.goals} objectif(s) · ${u.conversations} conversation(s)`}
                    >
                      <span className="block text-[13px] font-semibold text-white">{u.activity}</span>
                      {u.live_runs}·{u.goals}·{u.conversations}
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </section>
      </div>
    </div>
  )
}
