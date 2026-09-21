'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminPlatforms, type PlatformAccount, type PlatformReport } from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  Badge,
  EmptyState,
  ErrorBanner,
  Pagination,
  SearchInput,
  SectionHead,
  Segmented,
  SkeletonRows,
  usePagedList,
} from '@/components/admin/ui'
import { AdminAppDownloads } from '@/components/admin/AdminAppDownloads'
import { StatTile } from '@/components/dashboard/StatTile'
import { emailInitials, formatDate, formatNumber, formatRelative } from '@/components/admin/format'

const PAGE_SIZE = 25

const PLATFORMS = ['ios', 'android', 'web', 'unknown'] as const
type Platform = (typeof PLATFORMS)[number]
type Filter = 'all' | Platform

const LABELS: Record<Platform, string> = {
  ios: 'app iOS',
  android: 'app Android',
  web: 'site web',
  unknown: 'non classé',
}

const TONES: Record<Platform, 'brand' | 'ice' | 'neutral' | 'warn'> = {
  ios: 'brand',
  android: 'ice',
  web: 'neutral',
  unknown: 'warn',
}

function isPlatform(v: string): v is Platform {
  return (PLATFORMS as readonly string[]).includes(v)
}

/**
 * D’où viennent les comptes : app iOS, app Android, site web.
 *
 * Ce panneau ne compte pas les téléchargements — l’App Store ne dit à personne qui installe
 * une app. Il compte les comptes qui ont ouvert une session depuis l’app, ce qui est à la fois
 * moins (une installation sans inscription reste invisible) et plus utile (on sait qui).
 *
 * La plateforme est déduite du User-Agent des sessions, faute d’en-tête envoyé par l’app :
 * c’est une heuristique, donc l’écran montre les libellés bruts qui l’ont alimentée. On vérifie
 * le classement au lieu de le croire.
 */
export function AdminPlatforms({ onTotal }: { onTotal?: (n: number) => void }) {
  const [report, setReport] = useState<PlatformReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('ios')
  const [showRaw, setShowRaw] = useState(false)

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const r = await adminPlatforms(t)
      setReport(r)
      onTotal?.(r.accounts_by_platform?.ios ?? 0)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [onTotal])

  useEffect(() => {
    void load()
  }, [load])

  const accounts = useMemo(() => report?.accounts ?? [], [report])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return accounts.filter((a) => {
      if (filter !== 'all' && !a.platforms.includes(filter)) return false
      if (needle && !a.email.toLowerCase().includes(needle) && !(a.name ?? '').toLowerCase().includes(needle)) {
        return false
      }
      return true
    })
  }, [accounts, q, filter])

  const { page, pageCount, setPage, slice, shown } = usePagedList(filtered, PAGE_SIZE)

  if (loading && !report) {
    return <SkeletonRows rows={6} height={64} />
  }

  if (!report) {
    return (
      <div className="space-y-4">
        {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}
        <EmptyState
          title="Répartition indisponible"
          body="Vérifie la connexion et tes droits administrateur, puis réessaie."
          action={
            <button type="button" className="btn-quiet cursor-pointer px-4 text-sm" onClick={() => void load()}>
              Recharger
            </button>
          }
        />
      </div>
    )
  }

  const byPlatform = report.accounts_by_platform ?? {}
  const counted = accounts.length
  const unknownCount = byPlatform.unknown ?? 0

  /** Date d’arrivée sur une plateforme : la première session qu’on y a vue. */
  function firstOn(a: PlatformAccount, p: Platform): string | undefined {
    return a.first_seen?.[p]
  }

  return (
    <div className="space-y-6">
      {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

      <AdminAppDownloads />

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          accent
          label="Comptes sur l’app iOS"
          value={formatNumber(byPlatform.ios ?? 0)}
          hint={`sur ${formatNumber(report.users_total)} comptes au total`}
        />
        <StatTile
          label="Comptes sur Android"
          value={formatNumber(byPlatform.android ?? 0)}
          hint="app Android"
        />
        <StatTile
          label="Comptes sur le web"
          value={formatNumber(byPlatform.web ?? 0)}
          hint="neurorun.fr"
        />
        <StatTile
          label="Sans session connue"
          value={formatNumber(report.users_without_session)}
          hint="jamais reconnectés depuis les sessions longues"
        />
      </div>

      <div className="app-note">
        <span>
          Ce tableau ne compte pas les téléchargements : l’App Store ne communique jamais l’identité des personnes
          qui installent une app. Il compte les comptes ayant <strong>ouvert une session depuis l’app</strong>. Une
          installation sans inscription reste invisible ici.
        </span>
      </div>

      <section className="space-y-4">
        <SectionHead
          title="Comptes par plateforme"
          subtitle="Qui utilise l’app, et depuis quand."
          action={
            <button
              type="button"
              className="btn-quiet cursor-pointer px-4 text-[13px]"
              disabled={loading}
              onClick={() => void load()}
            >
              {loading ? 'Chargement…' : 'Actualiser'}
            </button>
          }
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={q}
            onChange={setQ}
            label="Rechercher un compte"
            placeholder="Rechercher par e-mail ou nom…"
            className="lg:max-w-sm lg:flex-1"
          />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            label="Filtrer par plateforme"
            className="!max-w-none"
            options={[
              { id: 'ios', label: 'iOS', count: byPlatform.ios ?? 0 },
              { id: 'android', label: 'Android', count: byPlatform.android ?? 0 },
              { id: 'web', label: 'Web', count: byPlatform.web ?? 0 },
              { id: 'all', label: 'Tous', count: counted },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="Aucun compte ne correspond"
            body={
              filter === 'ios' && (byPlatform.ios ?? 0) === 0
                ? 'Aucune session ouverte depuis l’app iOS pour l’instant. Si tu sais que des gens l’utilisent, vérifie le classement plus bas : leurs sessions sont peut-être rangées en « non classé ».'
                : 'Modifie la recherche ou change de plateforme.'
            }
          />
        ) : (
          <>
            <div className="table-wrap max-h-[calc(100dvh-28rem)]">
              <table className="data-table min-w-[720px]">
                <thead>
                  <tr>
                    <th scope="col">Compte</th>
                    <th scope="col">Plateformes</th>
                    <th scope="col">Première session</th>
                    <th scope="col">Dernière</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((a) => {
                    const ref: Platform = filter === 'all' ? (a.platforms[0] as Platform) ?? 'unknown' : filter
                    const first = firstOn(a, ref)
                    const last = a.last_seen?.[ref]
                    return (
                      <tr key={a.id}>
                        <td>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="nav-avatar !h-8 !w-8 !rounded-[10px] !text-[11px]" aria-hidden>
                              {emailInitials(a.email)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-white">{a.name || a.email}</span>
                              {a.name ? (
                                <span className="block truncate text-[11px] text-white/35">{a.email}</span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td>
                          <div className="flex flex-wrap gap-1.5">
                            {a.platforms.filter(isPlatform).map((p) => (
                              <Badge key={p} tone={TONES[p]} title={`${a.sessions?.[p] ?? 0} session(s)`}>
                                {LABELS[p]}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="text-white/60">{first ? formatDate(first) : '—'}</td>
                        <td className="text-white/45">{last ? formatRelative(last) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} shown={shown} />
          </>
        )}
      </section>

      <section className="panel p-5">
        <SectionHead
          title="Contrôle du classement"
          subtitle="La plateforme est devinée à partir du User-Agent des sessions : voici ce qui a servi à décider."
          action={
            unknownCount > 0 ? (
              <Badge tone="warn" dot>
                {formatNumber(unknownCount)} compte{unknownCount > 1 ? 's' : ''} non classé
                {unknownCount > 1 ? 's' : ''}
              </Badge>
            ) : (
              <Badge tone="ok" dot>
                Tout est classé
              </Badge>
            )
          }
        />

        <button
          type="button"
          className="btn-quiet mt-4 cursor-pointer px-4 text-[13px]"
          onClick={() => setShowRaw((v) => !v)}
          aria-expanded={showRaw}
        >
          {showRaw ? 'Masquer les libellés bruts' : 'Voir les libellés bruts'}
        </button>

        {showRaw ? (
          <div className="mt-4 space-y-4">
            {PLATFORMS.map((p) => {
              const samples = report.samples_by_platform?.[p] ?? []
              if (samples.length === 0) return null
              return (
                <div key={p}>
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-white/40">
                    {LABELS[p]}
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {samples.map((s) => (
                      <li
                        key={s.device || '(vide)'}
                        className="flex items-baseline justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-1.5"
                      >
                        <code className="min-w-0 flex-1 break-all font-mono text-[11.5px] text-white/60">
                          {s.device || '(libellé vide)'}
                        </code>
                        <span className="shrink-0 text-[11.5px] tabular-nums text-white/35">
                          {formatNumber(s.count)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
            {unknownCount > 0 ? (
              <div className="app-note">
                <span>
                  Des sessions ne sont rattachées à aucune plateforme. Si leur libellé ressemble à celui de l’app,
                  le classement doit être ajusté côté serveur — sans ça, le compteur iOS est sous-évalué.
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  )
}
