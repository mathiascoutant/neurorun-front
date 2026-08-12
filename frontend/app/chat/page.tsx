'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { GoalsPanel } from '@/components/GoalsPanel'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberSidebar } from '@/components/MemberSidebar'
import { StravaLinkBanner } from '@/components/StravaLinkBanner'
import { ChatComposer } from '@/components/chat/ChatComposer'
import { ChatMessage, CoachTyping } from '@/components/chat/ChatMessage'
import { ChatWelcome } from '@/components/chat/ChatWelcome'
import { ConversationList } from '@/components/chat/ConversationList'
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

/** Section affichée sur cette route (le menu pointe ici avec `?section=goals`). */
type AppSection = 'chat' | 'goals'

/**
 * Fil vide : plus de faux message d'accueil dans la conversation.
 *
 * Le texte de bienvenue était injecté comme une réponse du coach, ce qui le
 * rendait indiscernable d'une vraie réponse et le laissait traîner en haut de
 * chaque fil. Il est désormais porté par `ChatWelcome`, qui disparaît au premier
 * échange.
 */
const EMPTY: Msg[] = []

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
  const [messages, setMessages] = useState<Msg[]>(EMPTY)
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
            setMessages(EMPTY)
          }
        } else {
          setActiveConversationId(null)
          setMessages(EMPTY)
        }
      } catch {
        setConversations([])
        setActiveConversationId(null)
        setMessages(EMPTY)
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
  /* Titre du fil courant, en sous-titre d'en-tête : sur mobile la barre est fermée,
     rien n'indiquait quelle conversation était ouverte. */
  const activeTitle =
    conversations.find((c) => c.id === activeConversationId)?.title?.trim() || undefined

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
      setMessages(EMPTY)
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
          setMessages(EMPTY)
        }
      } else {
        setActiveConversationId(null)
        setMessages(EMPTY)
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

  /*
   * Coque à hauteur fixe : le fil est le seul élément qui défile. Le composeur est
   * un enfant normal de la colonne — l'ancienne version le positionnait en `fixed`
   * avec un décalage `md:left-[280px]` écrit en dur, qui se désynchronisait de la
   * largeur réelle de la barre et imposait une réserve de padding sous le fil.
   */
  return (
    <div className="member-app flex h-[100dvh] overflow-hidden">
      <MemberSidebar
        active={effectiveSection === 'goals' ? 'goals' : 'coach'}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        capabilities={me.capabilities}
        isAdmin={me.role === 'admin'}
        firstName={me.first_name}
        lastName={me.last_name}
        secondary={
          effectiveSection === 'chat' && showCoach
            ? (onNavigate) => (
                <ConversationList
                  conversations={conversations}
                  activeId={activeConversationId}
                  onSelect={(id) => {
                    void handleSelectConversation(id)
                    onNavigate?.()
                  }}
                  onNew={() => {
                    void handleNewConversation()
                    onNavigate?.()
                  }}
                  onDelete={handleDeleteConversation}
                  disabled={loading}
                />
              )
            : undefined
        }
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {!stravaLinked && stravaOffer ? <StravaLinkBanner /> : null}
        <MemberPageHeader
          title={effectiveSection === 'chat' ? 'Coach' : 'Objectifs'}
          subtitle={effectiveSection === 'chat' ? activeTitle : undefined}
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
          maxWidthClass={
            effectiveSection === 'goals'
              ? 'mx-auto w-full max-w-[1400px]'
              : 'mx-auto w-full max-w-6xl'
          }
        />

        {effectiveSection === 'goals' && showGoals ? (
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
            <GoalsPanel />
          </div>
        ) : effectiveSection === 'chat' && !showCoach ? (
          <div className="flex flex-1 items-center justify-center px-safe">
            <div className="app-card max-w-md p-6 text-center">
              <span className="app-icon-tile mx-auto border-yellow-400/25 bg-yellow-400/[0.12] text-yellow-400">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                  />
                </svg>
              </span>
              <h2 className="mt-3 font-display text-base font-semibold text-white/95">Coach IA non activé</h2>
              <p className="mt-2 text-[14px] leading-relaxed text-white/55">
                Il n’est pas inclus dans ton offre actuelle. Passe à une offre supérieure ou contacte un administrateur.
              </p>
            </div>
          </div>
        ) : effectiveSection === 'chat' ? (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
              <div className="mx-auto w-full max-w-3xl px-safe py-5 sm:py-6">
                {messages.length === 0 && !loading ? (
                  <ChatWelcome
                    stravaLinked={stravaLinked}
                    suggestions={coachSuggestions(stravaLinked)}
                    onPick={send}
                    disabled={loading}
                  />
                ) : (
                  <div className="space-y-5">
                    {messages.map((msg, i) => (
                      <ChatMessage
                        key={`${msg.role}-${i}-${(msg.text ?? '').slice(0, 12)}`}
                        role={msg.role}
                        text={msg.text}
                      />
                    ))}
                    {loading ? <CoachTyping /> : null}
                  </div>
                )}
                <div ref={listEnd} />
              </div>
            </div>

            <div className="shrink-0 border-t border-white/[0.07] bg-surface-0/92 px-safe pb-safe pt-3 backdrop-blur-xl">
              <ChatComposer value={input} onChange={setInput} onSend={send} disabled={loading} />
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
