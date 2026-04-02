'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'
import { LiveRunHistory } from '@/components/LiveRunHistory'
import { LiveRunPanel } from '@/components/LiveRunPanel'
import { StravaLinkBanner } from '@/components/StravaLinkBanner'
import { Mark } from '@/components/Mark'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberPrimaryNav } from '@/components/MemberPrimaryNav'
import { ApiError, fetchMe, type MeUser } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { saveMeCache } from '@/lib/meCache'

export default function RunPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  /** `null` = profil inconnu (API injoignable), pas de bannière Strava. */
  const [stravaLinked, setStravaLinked] = useState<boolean | null>(null)
  const [apiUnreachable, setApiUnreachable] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  /** Course en cours : UI minimale (pas de menu / header) pour éviter les touches parasites. */
  const [runFocusMode, setRunFocusMode] = useState(false)
  const [historyTick, setHistoryTick] = useState(0)
  const onRunSaved = useCallback(() => {
    setHistoryTick((n) => n + 1)
  }, [])

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
        saveMeCache(u)
        setStravaLinked(u.strava_linked)
        setApiUnreachable(false)
        setReady(true)
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearToken()
          router.replace('/login/')
          return
        }
        /* Réseau ou serveur indisponible : la course reste utilisable (GPS + calcul local, sans API). */
        setStravaLinked(null)
        setApiUnreachable(true)
        setReady(true)
      }
    })()
  }, [router])

  useEffect(() => {
    if (runFocusMode) setSidebarOpen(false)
  }, [runFocusMode])

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
    <div
      className={`flex overflow-x-hidden ${runFocusMode ? 'h-[100dvh] max-h-[100dvh] min-h-[100dvh]' : 'min-h-[100dvh]'}`}
    >
      {!runFocusMode ? (
        <>
          <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:sticky md:top-0 md:flex md:h-[100dvh] md:max-h-[100dvh]">
            <div className="border-b border-white/[0.06] px-safe pt-safe pb-3">
              <Link href="/dashboard/" aria-label="NeuroRun">
                <Mark compact />
              </Link>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
              <MemberPrimaryNav
                active="run"
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
                active="run"
                onNavigate={() => setSidebarOpen(false)}
                capabilities={me?.capabilities}
                isAdmin={me?.role === 'admin'}
                profileFirstName={me?.first_name}
              />
            </div>
          </MemberMobileDrawer>
        </>
      ) : null}

      <div
        className={`flex min-w-0 flex-1 flex-col overflow-x-hidden ${runFocusMode ? 'min-h-0 bg-surface-0' : ''}`}
      >
        {!runFocusMode &&
        stravaLinked === false &&
        me?.capabilities?.strava_dashboard !== false ? (
          <StravaLinkBanner />
        ) : null}
        {!runFocusMode ? (
          <MemberPageHeader
            title="Course"
            onMenuClick={() => setSidebarOpen((o) => !o)}
            menuOpen={sidebarOpen}
            onLogout={logout}
            maxWidthClass="mx-auto w-full max-w-3xl"
          />
        ) : null}

        <main
          className={
            runFocusMode
              ? 'flex min-h-0 flex-1 flex-col pt-safe'
              : 'member-main-pad-b mx-auto w-full max-w-3xl flex-1 space-y-6 px-safe py-6 sm:space-y-8 sm:py-8'
          }
        >
          <LiveRunPanel
            apiUnreachableAtLoad={apiUnreachable}
            onRunSaved={onRunSaved}
            onRunFocusModeChange={setRunFocusMode}
          />
          {!runFocusMode ? (
            <LiveRunHistory
              apiUnreachableAtLoad={apiUnreachable}
              refreshTrigger={historyTick}
            />
          ) : null}
        </main>
      </div>
    </div>
  )
}
