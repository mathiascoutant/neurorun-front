'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useId, useMemo, useState, type FormEvent } from 'react'
import { AuthShell } from '@/components/auth/AuthShell'
import { GenderSelect } from '@/components/auth/GenderSelect'
import { checkRegistrationEmail, register, type RegisterGender } from '@/lib/api'
import { setToken } from '@/lib/auth'

const STEP_TITLES = [
  'Qui es-tu ?',
  'Quelques précisions',
  'Choisis ton mot de passe',
] as const

function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/')) return '/dashboard/'
  if (raw.startsWith('//')) return '/dashboard/'
  return raw
}

function isValidEmail(email: string) {
  const t = email.trim()
  return t.length > 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)
}

/** Contrôles alignés sur le backend — à l’étape 2 au clic sur « Continuer » uniquement. */
function validateBirthDateOnContinue(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) {
    return 'Indique ta date de naissance.'
  }
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!m) {
    return 'Date de naissance invalide (format AAAA-MM-JJ).'
  }
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const bd = new Date(Date.UTC(y, mo, d))
  if (bd.getUTCFullYear() !== y || bd.getUTCMonth() !== mo || bd.getUTCDate() !== d) {
    return 'Cette date n’existe pas. Vérifie ta date de naissance.'
  }
  const today = new Date()
  const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const bdDay = Date.UTC(y, mo, d)
  if (bdDay > todayDay) {
    return 'La date de naissance ne peut pas être dans le futur.'
  }
  if (bdDay < Date.UTC(1900, 0, 1)) {
    return 'Date de naissance invalide.'
  }
  return null
}

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [step, setStep] = useState(1)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')

  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState<RegisterGender>('unspecified')

  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')

  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [stepBusy, setStepBusy] = useState(false)

  const birthDateMax = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const genderIds = useId()
  const genderLabelId = `${genderIds}-label`
  const genderControlId = `${genderIds}-control`

  async function goNext() {
    setError('')
    if (step === 1) {
      if (!firstName.trim() || !lastName.trim()) {
        setError('Renseigne ton prénom et ton nom.')
        return
      }
      if (!isValidEmail(email)) {
        setError("Ce n'est pas une adresse email valide.")
        return
      }
      setStepBusy(true)
      try {
        const { available } = await checkRegistrationEmail(email)
        if (!available) {
          setError('Non : cet email est déjà utilisé.')
          return
        }
        setStep(2)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Impossible de vérifier cet email.')
      } finally {
        setStepBusy(false)
      }
      return
    }
    if (step === 2) {
      const birthErr = validateBirthDateOnContinue(birthDate)
      if (birthErr) {
        setError(birthErr)
        return
      }
      setStep(3)
    }
  }

  function goBack() {
    setError('')
    if (step > 1) setStep((s) => s - 1)
  }

  /** Uniquement depuis le bouton « Créer mon compte » — pas via Entrée ou soumission implicite du formulaire. */
  async function handleCreateAccount() {
    setError('')
    if (step !== 3) return

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.')
      return
    }
    if (password !== passwordConfirm) {
      setError('Les deux mots de passe ne sont pas identiques.')
      return
    }

    setLoading(true)
    try {
      const res = await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate,
        gender,
      })
      setToken(res.token)
      router.push(safeNext(searchParams.get('next')))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }

  function blockImplicitSubmit(e: FormEvent) {
    e.preventDefault()
  }

  return (
    <AuthShell
      kicker="Onboarding"
      title="Créer ton compte"
      subtitle="En 3 étapes — tout est enregistré tant que tu restes sur cette page ; rien n’est envoyé au serveur avant la dernière validation."
      footer={
        <p className="text-center text-sm text-white/45">
          Déjà inscrit ?{' '}
          <Link href="/login/" className="font-medium text-brand-ice hover:text-white">
            Connexion
          </Link>
        </p>
      }
    >
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-center gap-2" aria-hidden>
          {([1, 2, 3] as const).map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                step === s
                  ? 'w-9 bg-brand-orange shadow-[0_0_12px_rgba(252,76,2,0.35)]'
                  : step > s
                    ? 'w-1.5 bg-brand-ice/60'
                    : 'w-1.5 bg-white/15'
              }`}
            />
          ))}
        </div>
        <p className="text-center text-xs font-medium uppercase tracking-wider text-white/40">
          Étape {step} sur 3 · {STEP_TITLES[step - 1]}
        </p>
      </div>

      <form className="space-y-5 sm:space-y-4" noValidate onSubmit={blockImplicitSubmit}>
        {step === 1 ? (
          <>
            <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-white/55 sm:mb-1.5 sm:text-xs sm:text-white/50">
                  Prénom
                </label>
                <input
                  className="field"
                  type="text"
                  name="given-name"
                  autoComplete="given-name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  maxLength={80}
                  enterKeyHint="next"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-white/55 sm:mb-1.5 sm:text-xs sm:text-white/50">
                  Nom
                </label>
                <input
                  className="field"
                  type="text"
                  name="family-name"
                  autoComplete="family-name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  maxLength={80}
                  enterKeyHint="next"
                />
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/55 sm:mb-1.5 sm:text-xs sm:text-white/50">
                Email
              </label>
              <input
                className="field"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="next"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="mt-1.5 text-xs text-white/35">Pour te connecter et sécuriser ton compte.</p>
            </div>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/55 sm:mb-1.5 sm:text-xs sm:text-white/50">
                Date de naissance
              </label>
              <input
                className="field"
                type="date"
                name="bday"
                autoComplete="bday"
                min="1900-01-01"
                max={birthDateMax}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <label
                id={genderLabelId}
                htmlFor={genderControlId}
                className="mb-2 block text-sm font-medium text-white/55 sm:mb-1.5 sm:text-xs sm:text-white/50"
              >
                Sexe
              </label>
              <GenderSelect
                id={genderControlId}
                aria-labelledby={genderLabelId}
                value={gender}
                onChange={setGender}
              />
            </div>
          </>
        ) : null}

        {step === 3 ? (
          <>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/55 sm:mb-1.5 sm:text-xs sm:text-white/50">
                Mot de passe
              </label>
              <input
                className="field"
                type="password"
                name="new-password"
                autoComplete="new-password"
                enterKeyHint="next"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-white/55 sm:mb-1.5 sm:text-xs sm:text-white/50">
                Confirmation du mot de passe
              </label>
              <input
                className="field"
                type="password"
                name="new-password-confirm"
                autoComplete="new-password"
                enterKeyHint="go"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </div>
          </>
        ) : null}

        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-sm text-red-100">{error}</div>
        ) : null}

        <div
          className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4 ${
            step > 1 ? 'sm:justify-between' : 'sm:justify-end'
          }`}
        >
          {step > 1 ? (
            <button
              type="button"
              className="btn-quiet order-2 w-full min-h-12 sm:order-1 sm:w-auto"
              disabled={loading || stepBusy}
              onClick={goBack}
            >
              Retour
            </button>
          ) : null}
          {step < 3 ? (
            <button
              type="button"
              className="btn-brand order-1 w-full min-h-12 sm:order-2 sm:w-auto sm:min-w-[9rem]"
              disabled={loading || stepBusy}
              onClick={() => void goNext()}
            >
              {step === 1 && stepBusy ? 'Vérification…' : 'Continuer'}
            </button>
          ) : (
            <button
              type="button"
              className="btn-brand order-1 w-full min-h-12 sm:order-2 sm:w-auto sm:min-w-[9rem]"
              disabled={loading}
              onClick={() => void handleCreateAccount()}
            >
              {loading ? 'Création…' : 'Créer mon compte'}
            </button>
          )}
        </div>
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
