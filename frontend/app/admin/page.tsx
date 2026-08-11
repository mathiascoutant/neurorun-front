'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  adminGetOfferConfig,
  adminStats,
  fetchMe,
  type AdminStats,
  type MeUser,
  type OfferConfigPayload,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { AdminShell, type AdminSection } from '@/components/admin/AdminShell'
import { AdminCircuits } from '@/components/admin/AdminCircuits'
import { AdminOffers } from '@/components/admin/AdminOffers'
import { AdminOverview } from '@/components/admin/AdminOverview'
import { AdminPromos } from '@/components/admin/AdminPromos'
import { AdminUsers } from '@/components/admin/AdminUsers'
import { AdminUiProvider, ErrorBanner, Spinner } from '@/components/admin/ui'

const SECTIONS: AdminSection[] = ['overview', 'users', 'offers', 'promos', 'circuits']

/** Section demandée dans l’URL (#users) : recharger la page garde sa place. */
function sectionFromHash(): AdminSection {
  if (typeof window === 'undefined') return 'overview'
  const raw = window.location.hash.replace('#', '')
  return (SECTIONS as string[]).includes(raw) ? (raw as AdminSection) : 'overview'
}

export default function AdminPage() {
  const router = useRouter()
  const [me, setMe] = useState<MeUser | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [section, setSection] = useState<AdminSection>('overview')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const [stats, setStats] = useState<AdminStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [offerCfg, setOfferCfg] = useState<OfferConfigPayload | null>(null)
  const [err, setErr] = useState('')
  const [counts, setCounts] = useState<Partial<Record<AdminSection, number>>>({})

  useEffect(() => {
    setSection(sectionFromHash())
    const onHash = () => setSection(sectionFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.replace('/login/?next=/admin/')
      return
    }
    ;(async () => {
      try {
        const u = await fetchMe(t)
        if (u.role !== 'admin') {
          router.replace('/dashboard/')
          return
        }
        setMe(u)
      } catch {
        clearToken()
        router.replace('/login/?next=/admin/')
      } finally {
        setAuthReady(true)
      }
    })()
  }, [router])

  /**
   * Stats et config offres sont chargées une fois pour toute la console : les
   * libellés de paliers servent dans presque tous les panneaux, les recharger à
   * chaque changement d’onglet ferait clignoter les badges sans rien apporter.
   */
  const loadShared = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setStatsLoading(true)
    setErr('')
    const [s, c] = await Promise.allSettled([adminStats(t), adminGetOfferConfig(t)])
    if (s.status === 'fulfilled') setStats(s.value)
    else setErr(s.reason instanceof Error ? s.reason.message : 'Statistiques indisponibles')
    if (c.status === 'fulfilled') setOfferCfg(c.value)
    setStatsLoading(false)
  }, [])

  useEffect(() => {
    if (!me) return
    void loadShared()
  }, [me, loadShared])

  function go(next: AdminSection) {
    setSection(next)
    window.history.replaceState(null, '', `#${next}`)
  }

  function logout() {
    clearToken()
    router.push('/login/')
  }

  const setCount = useCallback((key: AdminSection) => (n: number) => {
    setCounts((c) => (c[key] === n ? c : { ...c, [key]: n }))
  }, [])

  if (!authReady || !me) {
    return (
      <main className="member-app flex min-h-[100dvh] items-center justify-center">
        <Spinner className="h-12 w-12" />
      </main>
    )
  }

  return (
    <AdminUiProvider>
      <AdminShell
        section={section}
        onSection={go}
        counts={counts}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onLogout={logout}
        email={me.email}
        actions={
          section === 'overview' ? (
            <button
              type="button"
              className="icon-btn cursor-pointer"
              onClick={() => void loadShared()}
              disabled={statsLoading}
              title="Actualiser les statistiques"
              aria-label="Actualiser les statistiques"
            >
              <svg
                className={`h-4 w-4 ${statsLoading ? 'animate-spin' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992V4.356m-.001 0v4.99m0-4.99l-3.181 3.183a8.25 8.25 0 00-11.667 0L3.34 9.348m0 5.304h4.992m-4.993 0v4.99m0-4.99l3.181 3.183a8.25 8.25 0 0011.667 0l2.828-2.826"
                />
              </svg>
            </button>
          ) : null
        }
      >
        {err && section === 'overview' ? <ErrorBanner message={err} onRetry={() => void loadShared()} /> : null}

        {section === 'overview' ? <AdminOverview stats={stats} loading={statsLoading} /> : null}

        {section === 'users' ? (
          <AdminUsers meId={me.id} offerCfg={offerCfg} stats={stats} onTotal={setCount('users')} />
        ) : null}

        {section === 'offers' ? <AdminOffers stats={stats} onSaved={setOfferCfg} /> : null}

        {section === 'promos' ? <AdminPromos onTotal={setCount('promos')} /> : null}

        {section === 'circuits' ? <AdminCircuits onTotal={setCount('circuits')} /> : null}
      </AdminShell>
    </AdminUiProvider>
  )
}
