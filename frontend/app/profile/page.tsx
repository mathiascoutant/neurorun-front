'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useId, useState } from 'react'
import { GenderSelect } from '@/components/auth/GenderSelect'
import { Mark } from '@/components/Mark'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberPrimaryNav } from '@/components/MemberPrimaryNav'
import { StravaLinkBanner } from '@/components/StravaLinkBanner'
import {
  deleteMyAccount,
  fetchMe,
  patchMe,
  type MeUser,
  type RegisterGender,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { saveMeCache } from '@/lib/meCache'

function planLabel(plan?: string): { title: string; hint: string } {
  switch (plan) {
    case 'performance':
      return {
        title: 'Performance',
        hint: 'Prévision, objectifs avancés, circuit selon offre.',
      }
    case 'strava':
      return { title: 'Strava', hint: 'Tableau de bord et coach enrichi par tes sorties.' }
    default:
      return { title: 'Standard', hint: 'Offre gratuite : coach IA, sans sync Strava payante.' }
  }
}

function validateBirthDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return 'Indique ta date de naissance.'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed)
  if (!m) return 'Date invalide (AAAA-MM-JJ).'
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  const bd = new Date(Date.UTC(y, mo, d))
  if (bd.getUTCFullYear() !== y || bd.getUTCMonth() !== mo || bd.getUTCDate() !== d) {
    return 'Cette date n’existe pas.'
  }
  const today = new Date()
  const todayDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  const bdDay = Date.UTC(y, mo, d)
  if (bdDay > todayDay) return 'La date ne peut pas être dans le futur.'
  if (bdDay < Date.UTC(1900, 0, 1)) return 'Date invalide.'
  return null
}

export default function ProfilePage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [birthDate, setBirthDate] = useState('')
  const [gender, setGender] = useState<RegisterGender>('unspecified')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')

  const [saveMsg, setSaveMsg] = useState('')
  const [saveErr, setSaveErr] = useState('')
  const [saving, setSaving] = useState(false)

  const [deletePassword, setDeletePassword] = useState('')
  const [deleteErr, setDeleteErr] = useState('')
  const [deleting, setDeleting] = useState(false)

  const gid = useId()
  const genderLabelId = `${gid}-gender-label`
  const genderControlId = `${gid}-gender-control`

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
        setFirstName(u.first_name ?? '')
        setLastName(u.last_name ?? '')
        setBirthDate(u.birth_date ?? '')
        const g = u.gender
        setGender(
          g === 'female' || g === 'male' || g === 'other' || g === 'unspecified' ? g : 'unspecified',
        )
        setReady(true)
      } catch {
        router.replace('/login/')
      }
    })()
  }, [router])

  function logout() {
    clearToken()
    router.push('/login/')
  }

  async function onSave(e: FormEvent) {
    e.preventDefault()
    setSaveMsg('')
    setSaveErr('')
    const bdErr = validateBirthDate(birthDate)
    if (bdErr) {
      setSaveErr(bdErr)
      return
    }
    if (!firstName.trim() || !lastName.trim()) {
      setSaveErr('Prénom et nom requis.')
      return
    }
    const token = getToken()
    if (!token) return

    const wantPwd = newPassword.trim() !== '' || newPassword2.trim() !== ''
    if (wantPwd) {
      if (newPassword.length < 8) {
        setSaveErr('Nouveau mot de passe : 8 caractères minimum.')
        return
      }
      if (newPassword !== newPassword2) {
        setSaveErr('Les deux mots de passe ne correspondent pas.')
        return
      }
      if (!currentPassword) {
        setSaveErr('Indique ton mot de passe actuel pour le changer.')
        return
      }
    }

    setSaving(true)
    try {
      const updated = await patchMe(token, {
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        birth_date: birthDate.trim(),
        gender,
        ...(wantPwd
          ? { current_password: currentPassword, new_password: newPassword }
          : {}),
      })
      setMe(updated)
      saveMeCache(updated)
      setSaveMsg('Profil enregistré.')
      setCurrentPassword('')
      setNewPassword('')
      setNewPassword2('')
    } catch (err) {
      setSaveErr(err instanceof Error ? err.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  async function onDeleteAccount() {
    setDeleteErr('')
    if (!deletePassword) {
      setDeleteErr('Saisis ton mot de passe pour confirmer.')
      return
    }
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Supprimer définitivement ton compte ? Tout sera effacé : conversations coach, objectifs, courses enregistrées, liaison Strava. Cette action est irréversible.',
      )
    ) {
      return
    }
    const token = getToken()
    if (!token) return
    setDeleting(true)
    try {
      await deleteMyAccount(token, deletePassword)
      clearToken()
      router.replace('/login/')
    } catch (err) {
      setDeleteErr(err instanceof Error ? err.message : 'Suppression impossible.')
    } finally {
      setDeleting(false)
    }
  }

  if (!ready || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const stravaOffer = me.capabilities?.strava_dashboard !== false
  const plan = planLabel(me.plan)
  const birthMax = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:sticky md:top-0 md:flex md:h-[100dvh] md:max-h-[100dvh]">
        <div className="border-b border-white/[0.06] px-safe pt-safe pb-3">
          <Link href="/dashboard/" aria-label="NeuroRun">
            <Mark compact />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
          <MemberPrimaryNav
            active="profile"
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
            onClick={() => setSidebarOpen(false)}
            className="inline-flex"
            aria-label="NeuroRun — tableau de bord"
          >
            <Mark compact />
          </Link>
        }
      >
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
          <MemberPrimaryNav
            active="profile"
            onNavigate={() => setSidebarOpen(false)}
            capabilities={me.capabilities}
            isAdmin={me.role === 'admin'}
            profileFirstName={me.first_name}
          />
        </div>
      </MemberMobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        {!me.strava_linked && stravaOffer ? <StravaLinkBanner /> : null}
        <MemberPageHeader
          title="Profil"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
          maxWidthClass="mx-auto w-full max-w-xl"
        />

        <main className="member-main-pad-b mx-auto w-full max-w-xl flex-1 space-y-8 px-safe py-6 sm:py-8">
          <section className="panel p-5 sm:p-6">
            <h2 className="font-display text-sm font-semibold text-white">Ton offre</h2>
            <p className="mt-2 text-lg font-medium text-white/90">{plan.title}</p>
            <p className="mt-1 text-sm text-white/45">{plan.hint}</p>
            {me.plan !== 'performance' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {me.plan === 'standard' ? (
                  <>
                    <Link href="/checkout/strava/" className="btn-quiet px-4 py-2 text-xs sm:text-sm">
                      Passer à Strava
                    </Link>
                    <Link href="/checkout/performance/" className="btn-brand px-4 py-2 text-xs sm:text-sm">
                      Performance
                    </Link>
                  </>
                ) : me.plan === 'strava' ? (
                  <Link href="/checkout/performance/" className="btn-brand px-4 py-2 text-xs sm:text-sm">
                    Passer à Performance
                  </Link>
                ) : null}
              </div>
            ) : null}
            <p className="mt-4 text-[11px] text-white/35">
              Email de connexion :{' '}
              <span className="text-white/55">{me.email}</span> — non modifiable ici.{' '}
              <Link href="/" className="text-brand-ice/85 underline decoration-white/15 underline-offset-2 hover:text-white">
                Page d&apos;accueil
              </Link>
            </p>
          </section>

          {stravaOffer ? (
            <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white/55">
              {me.strava_linked ? (
                <span>
                  <span className="font-medium text-white/75">Strava</span> est associé à ce compte. Pour changer de
                  compte Strava, contacte le support ou revois la doc OAuth dans les paramètres Strava.
                </span>
              ) : (
                <span>
                  <Link href="/link-strava/" className="text-brand-ice/90 underline decoration-white/15 underline-offset-2">
                    Associer Strava
                  </Link>{' '}
                  pour les tableaux et le coach contextuel.
                </span>
              )}
            </section>
          ) : null}

          <form onSubmit={onSave} className="panel space-y-4 p-5 sm:p-6">
            <h2 className="font-display text-sm font-semibold text-white">Informations personnelles</h2>
            {saveMsg ? (
              <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
                {saveMsg}
              </p>
            ) : null}
            {saveErr ? (
              <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                {saveErr}
              </p>
            ) : null}

            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">Prénom</span>
              <input
                className="field mt-2 border-white/[0.08] bg-surface-2/80"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                autoComplete="given-name"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">Nom</span>
              <input
                className="field mt-2 border-white/[0.08] bg-surface-2/80"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                autoComplete="family-name"
              />
            </label>
            <label className="block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">Date de naissance</span>
              <input
                type="date"
                className="field mt-2 border-white/[0.08] bg-surface-2/80"
                value={birthDate}
                max={birthMax}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </label>
            <div>
              <p id={genderLabelId} className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Sexe (optionnel)
              </p>
              <div className="mt-2">
                <GenderSelect id={genderControlId} value={gender} onChange={setGender} aria-labelledby={genderLabelId} />
              </div>
            </div>

            <div className="border-t border-white/[0.06] pt-4">
              <h3 className="text-xs font-semibold text-white/80">Changer le mot de passe</h3>
              <p className="mt-1 text-[11px] text-white/40">Laisse vide pour ne pas modifier.</p>
              <label className="mt-3 block">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Mot de passe actuel
                </span>
                <input
                  type="password"
                  className="field mt-2 border-white/[0.08] bg-surface-2/80"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <label className="mt-3 block">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Nouveau mot de passe
                </span>
                <input
                  type="password"
                  className="field mt-2 border-white/[0.08] bg-surface-2/80"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
              <label className="mt-3 block">
                <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                  Confirmer le nouveau
                </span>
                <input
                  type="password"
                  className="field mt-2 border-white/[0.08] bg-surface-2/80"
                  value={newPassword2}
                  onChange={(e) => setNewPassword2(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            </div>

            <button type="submit" className="btn-brand w-full sm:w-auto" disabled={saving}>
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>

          <section className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] p-5 sm:p-6">
            <h2 className="font-display text-sm font-semibold text-red-100/95">Zone dangereuse</h2>
            <p className="mt-2 text-sm leading-relaxed text-red-100/75">
              Supprimer le compte efface tout : conversations avec le coach, objectifs et plans, historique des courses
              live, et la liaison Strava côté serveur.
            </p>
            {deleteErr ? (
              <p className="mt-3 text-sm text-red-200/95">{deleteErr}</p>
            ) : null}
            <label className="mt-4 block">
              <span className="text-[10px] font-medium uppercase tracking-wider text-red-200/70">
                Mot de passe pour confirmer
              </span>
              <input
                type="password"
                className="field mt-2 border-red-500/20 bg-surface-2/80"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button
              type="button"
              className="mt-4 w-full rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:opacity-50 sm:w-auto"
              disabled={deleting}
              onClick={() => void onDeleteAccount()}
            >
              {deleting ? 'Suppression…' : 'Supprimer mon compte définitivement'}
            </button>
          </section>
        </main>
      </div>
    </div>
  )
}
