const API = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080').replace(/\/$/, '')

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

export async function chat(token: string, message: string) {
  return api<{ reply: string }>('/api/chat', {
    method: 'POST',
    token,
    body: JSON.stringify({ message }),
  })
}
