'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { adminAppDownloads, type AppDownloads } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { Badge, ErrorBanner, SectionHead, SkeletonRows } from '@/components/admin/ui'
import { StatTile } from '@/components/dashboard/StatTile'
import { formatDate, formatNumber } from '@/components/admin/format'

const DAYS = 30

const COUNTRY_NAMES = new Intl.DisplayNames(['fr'], { type: 'region' })

function countryLabel(code: string): string {
  try {
    return COUNTRY_NAMES.of(code) ?? code
  } catch {
    return code
  }
}

/**
 * Téléchargements App Store sur 30 jours.
 *
 * Volontairement séparé du reste de l’onglet : ce sont des totaux anonymes venus d’Apple, là où
 * le tableau des comptes nomme des gens. Les confondre ferait croire qu’on peut relier un
 * téléchargement à quelqu’un — ce qu’Apple ne permet à personne.
 */
export function AdminAppDownloads() {
  const [data, setData] = useState<AppDownloads | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      setData(await adminAppDownloads(t, DAYS))
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const topCountries = useMemo(() => {
    const entries = Object.entries(data?.installs_by_country ?? {})
    return entries.sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [data])

  const lastDay = useMemo(() => {
    const daily = data?.daily ?? []
    return daily.length > 0 ? daily[daily.length - 1] : null
  }, [data])

  if (loading && !data) {
    return <SkeletonRows rows={2} height={92} />
  }

  if (err) {
    return <ErrorBanner message={err} onRetry={() => void load()} />
  }

  if (!data) return null

  if (!data.configured) {
    const missing = data.missing ?? []
    return (
      <section className="panel p-5">
        <SectionHead
          title="Téléchargements App Store"
          subtitle="Pas encore branché — il manque la clé App Store Connect côté serveur."
          action={<Badge tone="warn" dot>Non configuré</Badge>}
        />
        <p className="mt-4 text-[13px] leading-relaxed text-white/60">
          Cette clé n’est pas celle des achats intégrés. Elle se crée dans App Store Connect →{' '}
          <strong className="font-semibold text-white/85">Users and Access → Integrations → App Store Connect API</strong>,
          avec le rôle Admin, Finance ou Sales. Le numéro de vendeur se trouve dans{' '}
          <strong className="font-semibold text-white/85">Payments and Financial Reports</strong>.
        </p>
        {missing.length > 0 ? (
          <ul className="mt-4 space-y-1">
            {missing.map((v) => (
              <li key={v} className="rounded-lg bg-white/[0.03] px-3 py-1.5">
                <code className="font-mono text-[11.5px] text-white/60">{v}</code>
              </li>
            ))}
          </ul>
        ) : null}
        <button type="button" className="btn-quiet mt-4 cursor-pointer px-4 text-[13px]" onClick={() => void load()}>
          Réessayer
        </button>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <SectionHead
        title="Téléchargements App Store"
        subtitle={`${DAYS} derniers jours — totaux anonymes fournis par Apple, jamais d’identités.`}
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

      {/* L’erreur n’efface pas les jours obtenus : le message d’Apple nomme ce qui cloche. */}
      {data.error ? <ErrorBanner message={data.error} onRetry={() => void load()} /> : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile
          accent
          label="Premiers téléchargements"
          value={formatNumber(data.first_installs ?? 0)}
          hint={`sur ${DAYS} jours`}
        />
        <StatTile
          label="Réinstallations"
          value={formatNumber(data.redownloads ?? 0)}
          hint="déjà téléchargée auparavant"
        />
        <StatTile label="Mises à jour" value={formatNumber(data.updates ?? 0)} hint="installations déjà en place" />
        <StatTile
          label="Dernier jour publié"
          value={lastDay ? formatNumber(lastDay.first_installs) : '—'}
          hint={lastDay ? formatDate(lastDay.day) : 'Apple publie avec ~1 jour de retard'}
        />
      </div>

      {topCountries.length > 0 ? (
        <div className="panel p-5">
          <h3 className="text-[10.5px] font-semibold uppercase tracking-[0.15em] text-white/40">
            Premiers téléchargements par pays
          </h3>
          <ul className="mt-3 space-y-1.5">
            {topCountries.map(([code, n]) => (
              <li key={code} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[13.5px] text-white/75">{countryLabel(code)}</span>
                <span className="shrink-0 text-[13px] tabular-nums text-white/45">{formatNumber(n)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="app-note">
        <span>
          Un téléchargement n’est pas un compte, et Apple ne dit jamais qui télécharge. Pour savoir{' '}
          <strong>qui</strong> utilise l’app, c’est le tableau des comptes ci-dessous qui répond.
        </span>
      </div>
    </section>
  )
}
