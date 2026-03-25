/**
 * Base de l’API (sans slash final).
 * - Non défini / vide en build prod → URLs relatives `/api/...` (même domaine, ex. neurorun.fr derrière nginx).
 * - En local : obligatoire dans `frontend/.env.local` → NEXT_PUBLIC_API_URL=http://localhost:8080
 */
function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL
  if (raw == null || raw === '') {
    return ''
  }
  return raw.replace(/\/$/, '')
}

const API = apiBase()

export type MeUser = {
  id: string
  email: string
  strava_linked: boolean
  created_at: string
}

export async function api<T>(
  path: string,
  init?: RequestInit & { token?: string | null }
): Promise<T> {
  const headers = new Headers(init?.headers)
  if (!headers.has('Content-Type') && init?.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = init?.token
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${API}${path}`, { ...init, headers })
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text }
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error || res.statusText
    throw new Error(err)
  }
  return data as T
}

export function getApiBase() {
  return API
}

export async function fetchMe(token: string): Promise<MeUser> {
  return api<MeUser>('/api/me', { token })
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: MeUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function register(email: string, password: string) {
  return api<{ token: string; user: MeUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export async function stravaAuthorizeUrl(token: string) {
  return api<{ url: string }>('/api/strava/authorize', { token })
}

export type ConversationListItem = {
  id: string
  title: string
  updated_at: string
}

export type ChatTurn = {
  role: 'user' | 'assistant'
  text: string
  created_at: string
}

export type Conversation = {
  id: string
  title: string
  messages: ChatTurn[]
  created_at: string
  updated_at: string
}

/** Mongo / JSON peuvent renvoyer null à la place d’un tableau vide. */
function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : []
}

function normalizeChatTurns(messages: ChatTurn[] | null | undefined): ChatTurn[] {
  return asArray(messages).map((m) => ({
    ...m,
    role: m.role === 'user' ? ('user' as const) : ('assistant' as const),
    text: m.text == null ? '' : String(m.text),
  }))
}

function normalizeConversation(c: Conversation): Conversation {
  return {
    ...c,
    messages: normalizeChatTurns(c.messages),
  }
}

export async function listConversations(token: string) {
  const data = await api<{ conversations: ConversationListItem[] | null }>('/api/conversations', { token })
  return { conversations: asArray(data.conversations) }
}

export async function createConversation(token: string) {
  const c = await api<Conversation>('/api/conversations', { method: 'POST', token })
  return normalizeConversation(c)
}

export async function getConversation(token: string, id: string) {
  const c = await api<Conversation>(`/api/conversations/${encodeURIComponent(id)}`, { token })
  return normalizeConversation(c)
}

export async function chat(token: string, message: string, conversationId?: string | null) {
  const d = await api<{ reply: string; conversation_id: string }>('/api/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  })
  return {
    reply: d.reply == null ? '' : String(d.reply),
    conversation_id: d.conversation_id == null ? '' : String(d.conversation_id),
  }
}

export type Goal = {
  id: string
  distance_km: number
  distance_label: string
  weeks: number
  sessions_per_week: number
  plan: string
  created_at: string
}

export async function listGoals(token: string) {
  const data = await api<{ goals: Goal[] | null }>('/api/goals', { token })
  return { goals: asArray(data.goals) }
}

export async function createGoal(
  token: string,
  body: { distance_km: number; weeks: number; sessions_per_week: number }
) {
  const g = await api<Goal>('/api/goals', {
    method: 'POST',
    token,
    body: JSON.stringify(body),
  })
  return { ...g, plan: g.plan == null ? '' : String(g.plan) }
}

export async function getGoal(token: string, id: string) {
  const g = await api<Goal>(`/api/goals/${encodeURIComponent(id)}`, { token })
  return { ...g, plan: g.plan == null ? '' : String(g.plan) }
}
