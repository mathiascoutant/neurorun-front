'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { FormEvent, Suspense, useState } from 'react'
import { AuthShell } from '@/components/auth/AuthShell'
import { register } from '@/lib/api'
import { setToken } from '@/lib/auth'

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/dashboard/'
  if (raw.startsWith('//')) return '/dashboard/'
  return raw
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await register(email, password)
      setToken(res.token)
      router.push(safeNext(searchParams.get('next')))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      kicker="Onboarding"
      title="Créer ton compte"
      subtitle="Tu pourras lier Strava depuis l’accueil quand tu veux."
      footer={
        <p className="text-center text-sm text-white/45">
          Déjà inscrit ?{' '}
          <Link href="/login/" className="font-medium text-brand-ice hover:text-white">
            Connexion
          </Link>
        </p>
      }
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">Email</label>
          <input
            className="field"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-white/50">Mot de passe</label>
          <input
            className="field"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-100">{error}</div>
        ) : null}
        <button type="submit" className="btn-brand w-full" disabled={loading}>
          {loading ? 'Création…' : 'S’inscrire'}
        </button>
      </form>
    </AuthShell>
  )
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
        </main>
      }
    >
      <RegisterForm />
    </Suspense>
  )
}
