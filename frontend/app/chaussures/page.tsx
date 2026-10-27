'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { ShoesPanel } from '@/components/shoes/ShoesPanel'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberSidebar } from '@/components/MemberSidebar'
import { ApiError, fetchMe, type MeUser } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { saveMeCache } from '@/lib/meCache'

/** Chaussures : paires suivies, usure théorique et date de remplacement projetée. */
export default function ChaussuresPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) {
          clearToken()
          router.replace('/login/')
          return
        }
        /* API injoignable : le panneau dira lui-même qu’il n’a rien pu charger. */
      } finally {
        setReady(true)
      }
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
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <MemberSidebar
        active="shoes"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        capabilities={me?.capabilities}
        isAdmin={me?.role === 'admin'}
        isAmbassador={me?.is_ambassador}
        firstName={me?.first_name}
        lastName={me?.last_name}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
        <MemberPageHeader
          title="Chaussures"
          subtitle="Usure théorique de tes paires"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
          maxWidthClass="mx-auto w-full max-w-5xl"
        />

        <main className="member-main-pad-b mx-auto w-full max-w-5xl flex-1 space-y-6 px-safe py-6 sm:py-8">
          <ShoesPanel />
        </main>
      </div>
    </div>
  )
}
