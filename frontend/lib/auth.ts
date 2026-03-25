const KEY = 'runapp_token'

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(KEY)
}

export function setToken(t: string) {
  window.localStorage.setItem(KEY, t)
}

export function clearToken() {
  window.localStorage.removeItem(KEY)
}
