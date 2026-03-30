'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { LiveRunPanel } from '@/components/LiveRunPanel'
import { Mark } from '@/components/Mark'
import { MemberPrimaryNav } from '@/components/MemberPrimaryNav'
import { fetchMe } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

export default function RunPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
      } catch {
        router.replace('/login/')
        return
      }
      setReady(true)
    })()
  }, [router])

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
    <div className="flex min-h-[100dvh]">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:flex">
        <div className="border-b border-white/[0.06] p-4">
          <Link href="/dashboard/" aria-label="NeuroRun">
            <Mark compact />
          </Link>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <MemberPrimaryNav active="run" />
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
          <MemberPrimaryNav active="run" onNavigate={() => setSidebarOpen(false)} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-surface-0/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                <p className="font-display text-sm font-medium text-white/90">Course</p>
                <p className="hidden truncate text-[10px] text-white/35 sm:block">GPS · annonces vocales</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Link href="/dashboard/" className="btn-quiet py-2 text-xs">
                Accueil
              </Link>
              <Link href="/link-strava/" className="btn-quiet hidden py-2 text-xs sm:inline-flex">
                Strava
              </Link>
              <button type="button" className="btn-quiet py-2 text-xs" onClick={logout}>
                Sortir
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 pb-16">
          <LiveRunPanel />
        </main>
      </div>
    </div>
  )
}
