'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useRef, useState } from 'react'
import { Mark } from '@/components/Mark'
import { chat, fetchMe } from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

type Msg = { role: 'user' | 'assistant'; text: string }

const SUGGESTIONS = [
  'Résume mes dernières sorties',
  'Comment progresser sur 10 km ?',
  'Analyse mon volume de la semaine',
  'Conseils récup après une séance intense',
]

export default function ChatPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      text:
        "Je suis ton coach RunApp. Pose-moi une question sur tes séances Strava — je m'appuie sur tes activités récentes pour répondre en français.",
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listEnd = useRef<HTMLDivElement>(null)

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
        setReady(true)
      } catch {
        router.replace('/login/')
      }
    })()
  }, [router])

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text: string) {
    const token = getToken()
    if (!token || !text.trim() || loading) return
    const userText = text.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: userText }])
    setLoading(true)
    try {
      const { reply } = await chat(token, userText)
      setMessages((m) => [...m, { role: 'assistant', text: reply }])
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: "Impossible d'obtenir une réponse (API ou Strava). Vérifie le backend et reconnecte Strava si besoin.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    send(input)
  }

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
    <div className="flex min-h-[100dvh] flex-col">
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-surface-0/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Mark />
          <div className="flex items-center gap-2">
            <Link href="/link-strava/" className="btn-quiet hidden text-xs sm:inline-flex">
              Strava
            </Link>
            <button type="button" className="btn-quiet text-xs" onClick={logout}>
              Sortir
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 pb-40">
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => send(s)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/75 transition hover:border-brand-orange/35 hover:bg-brand-orange/10 hover:text-white disabled:opacity-40"
              >
                {s}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}
              >
                <div
                  className={`max-w-[min(100%,520px)] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-insetline ${
                    msg.role === 'user'
                      ? 'bg-gradient-to-br from-brand-orange/25 to-brand-deep/20 text-white'
                      : 'border border-white/[0.08] bg-surface-2/90 text-white/90'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-white/[0.08] bg-surface-2/60 px-4 py-3 text-sm text-white/45">
                  <span className="inline-flex gap-1">
                    <span className="animate-pulse">Analyse</span>
                    <span className="inline-flex gap-0.5 pt-0.5">
                      <span className="h-1 w-1 animate-bounce rounded-full bg-brand-orange [animation-delay:0ms]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-brand-orange [animation-delay:150ms]" />
                      <span className="h-1 w-1 animate-bounce rounded-full bg-brand-orange [animation-delay:300ms]" />
                    </span>
                  </span>
                </div>
              </div>
            ) : null}
            <div ref={listEnd} />
          </div>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-surface-0/92 p-3 backdrop-blur-xl sm:p-4">
        <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl gap-2">
          <input
            className="field flex-1 border-white/[0.08] bg-surface-2/80"
            placeholder="Pose ta question sur tes sorties…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            autoComplete="off"
          />
          <button type="submit" className="btn-brand shrink-0 px-6" disabled={loading || !input.trim()}>
            Envoyer
          </button>
        </form>
      </div>
    </div>
  )
}
