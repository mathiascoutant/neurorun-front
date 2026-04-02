'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { GoalsPanel } from '@/components/GoalsPanel'
import { Mark } from '@/components/Mark'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { NeuroRunSidebar, type AppSection } from '@/components/NeuroRunSidebar'
import { StravaLinkBanner } from '@/components/StravaLinkBanner'
import {
  chat,
  createConversation,
  deleteConversation,
  fetchMe,
  getConversation,
  listConversations,
  type ConversationListItem,
  type MeUser,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { saveMeCache } from '@/lib/meCache'

type Msg = { role: 'user' | 'assistant'; text: string }

const WELCOME: Msg = {
  role: 'assistant',
  text:
    'NeuroRun : pose une question sur l’entraînement ou la course. Tu peux utiliser le coach sans Strava (conseils, structure, récup). Si tu associes Strava, il pourra aussi s’appuyer sur ton historique pour des repères plus précis. Tes messages sont enregistrés dans cette conversation. Réponses brèves, en français.',
}

function coachSuggestions(stravaLinked: boolean): string[] {
  if (stravaLinked) {
    return [
      'Résume mes dernières sorties',
      'Comment progresser sur 10 km ?',
      'Analyse mon volume de la semaine',
      'Conseils récup après une séance intense',
      'Quel objectif pour mon prochain semi-marathon ?',
      'Explique l’évolution de mon allure sur le mois',
    ]
  }
  return [
    'Comment progresser sur 10 km ?',
    'Conseils récup après une séance intense',
    'Quel objectif pour mon prochain semi-marathon ?',
    'Comment structurer une semaine sans me blesser ?',
    'Différence entre footing et séance au seuil ?',
    'Comment gérer la fatigue en période chargée ?',
  ]
}

function mapConvToMessages(conv: { messages?: { role: string; text: string | null }[] | null }): Msg[] {
  const raw = Array.isArray(conv.messages) ? conv.messages : []
  if (raw.length === 0) return [WELCOME]
  return raw.map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    text: m.text == null ? '' : String(m.text),
  }))
}

function ChatPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const section: AppSection = searchParams.get('section') === 'goals' ? 'goals' : 'chat'
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  const [stravaLinked, setStravaLinked] = useState(false)
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
        const u = await fetchMe(token)
        setMe(u)
        saveMeCache(u)
        setStravaLinked(u.strava_linked)
      } catch {
        router.replace('/login/')
        return
      }

      // Ne pas renvoyer vers login si l’API conversations est absente ou en erreur (ancien backend) :
      // on affiche le coach sans historique persisté.
      try {
        const { conversations: list } = await listConversations(token)
        const safeList = Array.isArray(list) ? list : []
        setConversations(safeList)
        if (safeList.length > 0) {
          const top = safeList[0]
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
    if (!me) return
    if (section === 'goals' && me.capabilities?.goals === false) {
      router.replace('/chat/')
    }
  }, [me, section, router])

  useEffect(() => {
    listEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading, section, me])

  const showGoals = me?.capabilities?.goals !== false
  const showCoach = me?.capabilities?.coach_chat !== false
  const stravaOffer = me?.capabilities?.strava_dashboard !== false
  const effectiveSection: AppSection = section === 'goals' && !showGoals ? 'chat' : section

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

  async function handleDeleteConversation(id: string) {
    if (
      typeof window !== 'undefined' &&
      !window.confirm('Supprimer cette conversation ? Les messages seront effacés définitivement.')
    ) {
      return
    }
    const token = getToken()
    if (!token || loading) return
    setLoading(true)
    try {
      await deleteConversation(token, id)
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          text: 'Impossible de supprimer cette conversation pour le moment. Réessaie.',
        },
      ])
      setLoading(false)
      return
    }

    let remaining: ConversationListItem[] = []
    setConversations((prev) => {
      remaining = prev.filter((c) => c.id !== id)
      return remaining
    })

    if (activeConversationId === id) {
      if (remaining.length > 0) {
        const top = remaining[0]
        setActiveConversationId(top.id)
        try {
          const full = await getConversation(token, top.id)
          setMessages(mapConvToMessages(full))
        } catch {
          setMessages([WELCOME])
        }
      } else {
        setActiveConversationId(null)
        setMessages([WELCOME])
      }
    }
    setLoading(false)
  }

  async function send(text: string) {
    const token = getToken()
    if (!token || !text.trim() || loading) return
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
          text: "Impossible d'obtenir une réponse pour l'instant. Vérifie la connexion ou réessaie plus tard.",
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

  if (!ready || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden">
      {/* Desktop sidebar */}
      <aside className="relative z-30 hidden w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:sticky md:top-0 md:flex md:h-[100dvh] md:max-h-[100dvh]">
        <div className="shrink-0 border-b border-white/[0.06] px-safe pt-safe pb-3">
          <Mark compact />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <NeuroRunSidebar
          section={effectiveSection}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          suggestions={coachSuggestions(stravaLinked)}
          onSuggestion={send}
          disabled={loading}
          capabilities={me.capabilities}
          isAdmin={me.role === 'admin'}
          profileFirstName={me.first_name}
        />
        </div>
      </aside>

      <MemberMobileDrawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        headerLeading={
          <Link
            href="/dashboard/"
            className="inline-flex"
            onClick={() => setSidebarOpen(false)}
            aria-label="NeuroRun — tableau de bord"
          >
            <Mark compact />
          </Link>
        }
      >
        <NeuroRunSidebar
          section={effectiveSection}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewConversation={handleNewConversation}
          onDeleteConversation={handleDeleteConversation}
          suggestions={coachSuggestions(stravaLinked)}
          onSuggestion={send}
          disabled={loading}
          onCloseMobile={() => setSidebarOpen(false)}
          capabilities={me.capabilities}
          isAdmin={me.role === 'admin'}
          profileFirstName={me.first_name}
        />
      </MemberMobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {!stravaLinked && stravaOffer ? <StravaLinkBanner /> : null}
        <MemberPageHeader
          title={effectiveSection === 'chat' ? 'Coach' : 'Objectifs'}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
          maxWidthClass="mx-auto w-full max-w-6xl"
        />

        {effectiveSection === 'goals' && showGoals ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <GoalsPanel />
          </div>
        ) : effectiveSection === 'chat' && !showCoach ? (
          <div className="flex flex-1 items-center justify-center px-safe">
            <p className="max-w-md text-center text-sm text-white/55">
              Le coach IA n&apos;est pas activé pour ton offre actuelle. Mets à niveau ton abonnement ou contacte un
              administrateur.
            </p>
          </div>
        ) : effectiveSection === 'chat' ? (
          <>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
              <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 px-safe py-5 pb-36 sm:py-6 sm:pb-40">
                <div className="space-y-4">
                  {messages.map((msg, i) => (
                    <div
                      key={`${msg.role}-${i}-${(msg.text ?? '').slice(0, 12)}`}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-up`}
                    >
                      <div
                        className={`max-w-[min(100%,520px)] rounded-2xl px-3 py-2.5 text-sm leading-relaxed shadow-insetline sm:px-4 sm:py-3 ${
                          msg.role === 'user'
                            ? 'bg-gradient-to-br from-brand-orange/25 to-brand-deep/20 text-white'
                            : 'border border-white/[0.08] bg-surface-2/90 text-white/90'
                        }`}
                      >
                        {msg.text ?? ''}
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

            <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/[0.08] bg-surface-0/92 px-safe pb-safe pt-3 backdrop-blur-xl md:left-[280px]">
              <form onSubmit={onSubmit} className="mx-auto flex max-w-3xl flex-col gap-2 sm:flex-row sm:items-stretch">
                <input
                  className="field min-h-11 w-full flex-1 border-white/[0.08] bg-surface-2/80 sm:min-h-12"
                  placeholder="Ta question…"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  autoComplete="off"
                />
                <button type="submit" className="btn-brand w-full shrink-0 px-6 sm:w-auto sm:self-stretch" disabled={loading || !input.trim()}>
                  Envoyer
                </button>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default function ChatPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
        </main>
      }
    >
      <ChatPageContent />
    </Suspense>
  )
}
