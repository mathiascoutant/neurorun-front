'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getToken } from '@/lib/auth'
import { fetchMe } from '@/lib/api'

export default function GatePage() {
  const router = useRouter()

  useEffect(() => {
    let off = false
    ;(async () => {
      const token = getToken()
      if (!token) {
        router.replace('/login/')
        return
      }
      try {
        const me = await fetchMe(token)
        if (off) return
        if (!me.strava_linked) router.replace('/link-strava/')
        else router.replace('/chat/')
      } catch {
        if (!off) router.replace('/login/')
      }
    })()
    return () => {
      off = true
    }
  }, [router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <div className="relative h-14 w-14">
        <div className="absolute inset-0 rounded-2xl border-2 border-brand-orange/25" />
        <div className="absolute inset-0 animate-spin rounded-2xl border-2 border-transparent border-t-brand-orange [animation-duration:0.85s]" />
      </div>
      <p className="text-sm text-white/45">Synchronisation…</p>
    </main>
  )
}
