'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { GoalsPanel } from '@/components/GoalsPanel'
import { Mark } from '@/components/Mark'
import { NeuroRunSidebar, type AppSection } from '@/components/NeuroRunSidebar'
import {
  chat,
  createConversation,
  fetchMe,
  getConversation,
  listConversations,
  type ConversationListItem,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

type Msg = { role: 'user' | 'assistant'; text: string }

const WELCOME: Msg = {
  role: 'assistant',
  text:
    'NeuroRun : pose une question sur tes sorties Strava — entraînement ou lecture de tes résultats. Tes messages sont enregistrés dans cette conversation. Réponses brèves, en français.',
}

const SUGGESTIONS = [
  'Résume mes dernières sorties',
  'Comment progresser sur 10 km ?',
  'Analyse mon volume de la semaine',
  'Conseils récup après une séance intense',
  'Quel objectif pour mon prochain semi-marathon ?',
  'Explique l’évolution de mon allure sur le mois',
]

function mapConvToMessages(conv: { messages: { role: string; text: string }[] }): Msg[] {
  const raw = conv.messages || []
  if (raw.length === 0) return [WELCOME]
  return raw.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    text: m.text,
  }))
}

export default function ChatPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [section, setSection] = useState<AppSection>('chat')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [conversations, setConversations] = useState<ConversationListItem[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Msg[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const listEnd = useRef<HTMLDivElement>(null)

  const refreshConversations = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const { conversations: list } = await listConversations(token)
      setConversations(list)
    } catch {
      /* ignore */
    }
  }, [])

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

      // Ne pas renvoyer vers login si l’API conversations est absente ou en erreur (ancien backend) :
      // on affiche le coach sans historique persisté.
      try {
        const { conversations: list } = await listConversations(token)
        setConversations(list)
        if (list.length > 0) {
          const top = list[0]
          setActiveConversationId(top.id)
          try {
            const full = await getConversation(token, top.id)
            setMessages(mapConvToMessages(full))
          } catch {
            setActiveConversationId(null)
            setMessages([WELCOME])
          }
        } else {
          setActiveConversationId(null)
          setMessages([WELCOME])
        }
      } catch {
        setConversations([])
        setActiveConversationId(null)
        setMessages([WELCOME])
      }
      setReady(true)
    })()
  }, [router])

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, section])

  async function handleSelectConversation(id: string) {
    const token = getToken()
    if (!token || loading) return
    setLoading(true)
    try {
      const full = await getConversation(token, id)
      setActiveConversationId(id)
      setMessages(mapConvToMessages(full))
    } catch {
      setMessages([
        {
          role: 'assistant',
          text: 'Impossible de charger cette conversation.',
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function handleNewConversation() {
    const token = getToken()
    if (!token || loading) return
    setLoading(true)
    try {
      const conv = await createConversation(token)
      setActiveConversationId(conv.id)
      setMessages([WELCOME])
      await refreshConversations()
    } catch {
      setMessages([
        { role: 'assistant', text: 'Création de conversation impossible. Réessaie.' },
      ])
    } finally {
      setLoading(false)
    }
  }

  async function send(text: string) {
    const token = getToken()
    if (!token || !text.trim() || loading) return
    if (section !== 'chat') {
      setSection('chat')
    }
    const userText = text.trim()
    setInput('')
    setMessages((m) => [...m, { role: 'user', text: userText }])
    setLoading(true)
    try {
      const { reply, conversation_id } = await chat(token, userText, activeConversationId)
      if (!activeConversationId) {
        setActiveConversationId(conversation_id)
      }
      setMessages((m) => [...m, { role: 'assistant', text: reply }])
      await refreshConversations()
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
    <div className="flex min-h-[100dvh]">
      {/* Desktop sidebar */}
      <aside className="relative z-30 hidden w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:flex">
        <div className="border-b border-white/[0.06] p-4">
          <Mark compact />
        </div>
        <NeuroRunSidebar
          section={section}
          onSection={setSection}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          suggestions={SUGGESTIONS}
          onSuggestion={send}
          disabled={loading}
        />
      </aside>

      {/* Mobile drawer */}
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
          <Mark compact />
          <button type="button" className="btn-quiet py-1.5 text-xs" onClick={() => setSidebarOpen(false)}>
            Fermer
          </button>
        </div>
        <NeuroRunSidebar
          section={section}
          onSection={setSection}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          suggestions={SUGGESTIONS}
          onSuggestion={send}
          disabled={loading}
          onCloseMobile={() => setSidebarOpen(false)}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-surface-0/85 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-quiet py-2 text-xs md:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Ouvrir le menu"
              >
                Menu
              </button>
              <Mark className="hidden sm:flex md:hidden" compact />
              <span className="hidden font-display text-sm font-medium text-white/90 md:inline">
                {section === 'chat' ? 'Coach' : 'Objectifs'}
              </span>
            </div>
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

        {section === 'goals' ? (
          <div className="flex-1 overflow-y-auto">
            <GoalsPanel />
          </div>
        ) : (
          <>
            <div className="flex flex-1 flex-col overflow-y-auto">
              <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-4 py-6 pb-40">
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div
                      key={`${msg.role}-${i}-${msg.text.slice(0, 12)}`}
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

            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-surface-0/92 p-3 backdrop-blur-xl sm:p-4 md:left-[280px]">
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
          </>
        )}
      </div>
    </div>
  )
}
