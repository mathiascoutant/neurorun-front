'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useId, useState } from 'react'
import { BillingPanel } from '@/components/BillingPanel'
import { GenderSelect } from '@/components/auth/GenderSelect'
import { GradientText } from '@/components/GradientText'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberSidebar } from '@/components/MemberSidebar'
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
import { useTierLabel } from '@/lib/useOfferConfig'

/** Accroche par palier — le nom, lui, vient de la config serveur (`useTierLabel`). */
function planHint(plan?: string): string {
  switch (plan) {
    case 'performance':
      return 'Prévision, objectifs avancés, circuit selon offre.'
    case 'strava':
      return 'Tableau de bord et coach enrichi par tes sorties.'
    default:
      return 'Offre gratuite : coach IA, sans sync Strava payante.'
  }
}

function userInitials(first?: string | null, last?: string | null): string {
  const a = (first?.trim()?.[0] ?? '').toUpperCase()
  const b = (last?.trim()?.[0] ?? '').toUpperCase()
  return `${a}${b}` || '?'
}

function memberSince(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
  } catch {
    return iso
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
  const planTitle = useTierLabel(me?.plan)
  const stravaTitle = useTierLabel('strava')
  const performanceTitle = useTierLabel('performance')

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

  /** Après résiliation ou reprise : le plan effectif a pu changer côté API. */
  async function refreshMe() {
    const token = getToken()
    if (!token) return
    try {
      const u = await fetchMe(token)
      setMe(u)
      saveMeCache(u)
    } catch {
      /* Non bloquant : l’état affiché par le panneau abonnement fait foi. */
    }
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
  const planHintText = planHint(me.plan)
  const birthMax = new Date().toISOString().slice(0, 10)

  return (
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <MemberSidebar
        active="profile"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        capabilities={me.capabilities}
        isAdmin={me.role === 'admin'}
        firstName={me.first_name}
        lastName={me.last_name}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
        {!me.strava_linked && stravaOffer ? <StravaLinkBanner /> : null}
        <MemberPageHeader
          title="Profil"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
          maxWidthClass="mx-auto w-full max-w-3xl"
        />

        <main className="member-main-pad-b mx-auto w-full max-w-3xl flex-1 space-y-5 px-safe py-6 sm:py-8">
          {/*
            Identité : avatar, nom, email, puis les faits du compte en puces —
            ancienneté, offre, état Strava. Ces trois informations vivaient
            auparavant dans trois blocs séparés, dont deux répétaient l’email.
          */}
          <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[#13161f] to-[#0d0f16] p-5">
            <div className="flex items-center gap-4">
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-bold tracking-wide text-white sm:h-16 sm:w-16 sm:text-xl"
                style={{ backgroundImage: 'linear-gradient(135deg, #fc4c02 0%, #c73d00 100%)' }}
              >
                {userInitials(me.first_name, me.last_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-xl font-bold tracking-[-0.02em] text-white sm:text-[1.4rem]">
                  {[me.first_name, me.last_name].filter(Boolean).join(' ') || 'Runner'}
                </p>
                <p className="mt-1 truncate text-[13.5px] text-white/45">{me.email}</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11.5px] text-white/50">
                <svg className="h-3.5 w-3.5 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                </svg>
                Membre depuis {memberSince(me.created_at)}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium ${
                  me.plan === 'performance'
                    ? 'border-brand-orange/30 bg-brand-orange/[0.1] text-brand-orange'
                    : me.plan === 'strava'
                      ? 'border-brand-ice/30 bg-brand-ice/[0.08] text-brand-ice'
                      : 'border-white/[0.08] bg-white/[0.04] text-white/55'
                }`}
              >
                Offre {planTitle}
              </span>
              {stravaOffer ? (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${
                    me.strava_linked
                      ? 'border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-300/90'
                      : 'border-white/[0.08] bg-white/[0.04] text-white/45'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`h-1.5 w-1.5 rounded-full ${me.strava_linked ? 'bg-emerald-400' : 'bg-white/30'}`}
                  />
                  Strava {me.strava_linked ? 'connecté' : 'non connecté'}
                </span>
              ) : null}
            </div>
          </section>

          {/* Carte offre — libellé à dégradé animé (fire / ice) comme sur l’app */}
          <section
            className={`rounded-[20px] border p-5 ${
              me.plan === 'strava'
                ? 'border-brand-ice/25 bg-brand-ice/[0.05]'
                : me.plan === 'performance'
                  ? 'border-brand-orange/25 bg-brand-orange/[0.06]'
                  : 'border-white/[0.08] bg-[#0d0f16]'
            }`}
          >
            <p className="app-kicker text-white/38">Offre actuelle</p>
            {me.plan === 'strava' || me.plan === 'performance' ? (
              <p className="mt-1.5 font-display text-[26px] font-bold leading-8">
                <GradientText tone={me.plan === 'strava' ? 'ice' : 'fire'}>{planTitle}</GradientText>
              </p>
            ) : (
              <p className="mt-1.5 font-display text-[26px] font-bold leading-8 text-white">{planTitle}</p>
            )}
            <p className="mt-1.5 text-sm leading-relaxed text-white/45">{planHintText}</p>
            {me.plan !== 'performance' ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {me.plan === 'standard' ? (
                  <>
                    <Link href="/checkout/strava/" className="btn-quiet px-4 text-sm">
                      Passer à {stravaTitle}
                    </Link>
                    <Link href="/checkout/performance/" className="btn-brand px-4 text-sm">
                      {performanceTitle}
                    </Link>
                  </>
                ) : me.plan === 'strava' ? (
                  <Link href="/checkout/performance/" className="btn-brand px-4 text-sm">
                    Passer à {performanceTitle}
                  </Link>
                ) : null}
              </div>
            ) : null}
          </section>

          <BillingPanel onPlanChange={refreshMe} />

          {stravaOffer && !me.strava_linked ? (
            <section className="flex flex-wrap items-center gap-4 rounded-[20px] border border-brand-ice/20 bg-brand-ice/[0.04] p-4">
              <span className="app-icon-tile border-brand-ice/25 bg-brand-ice/[0.12] text-brand-ice">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
                  />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-white/92">Associer Strava</p>
                <p className="mt-0.5 text-[12.5px] leading-snug text-white/45">
                  Débloque les tableaux de bord et un coach qui s’appuie sur tes sorties.
                </p>
              </div>
              <Link href="/link-strava/" className="btn-brand shrink-0 cursor-pointer px-4 py-2.5 text-sm">
                Associer
              </Link>
            </section>
          ) : null}

          <form onSubmit={onSave} className="space-y-5">
            {saveMsg ? (
              <p
                role="status"
                className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-[13.5px] text-emerald-100"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                {saveMsg}
              </p>
            ) : null}
            {saveErr ? (
              <p
                role="alert"
                className="flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-[13.5px] text-red-100"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {saveErr}
              </p>
            ) : null}

            <section className="rounded-[20px] border border-white/[0.07] bg-[#0d0f16] p-5">
              <h2 className="font-display text-[15px] font-semibold text-white">Informations personnelles</h2>
              <p className="mt-1 text-[12.5px] text-white/42">
                Ton prénom sert au coach et à l’affichage dans les classements.
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-[12.5px] font-medium text-white/60">Prénom</span>
                  <input
                    className="field mt-1.5 border-white/[0.08] bg-surface-2/80"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-medium text-white/60">Nom</span>
                  <input
                    className="field mt-1.5 border-white/[0.08] bg-surface-2/80"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-medium text-white/60">Date de naissance</span>
                  <input
                    type="date"
                    className="field mt-1.5 border-white/[0.08] bg-surface-2/80"
                    value={birthDate}
                    max={birthMax}
                    onChange={(e) => setBirthDate(e.target.value)}
                  />
                  <span className="mt-1.5 block text-[11.5px] text-white/32">
                    Sert à estimer tes zones cardiaques.
                  </span>
                </label>
                <div>
                  <p id={genderLabelId} className="text-[12.5px] font-medium text-white/60">
                    Sexe <span className="text-white/32">(optionnel)</span>
                  </p>
                  <div className="mt-1.5">
                    <GenderSelect
                      id={genderControlId}
                      value={gender}
                      onChange={setGender}
                      aria-labelledby={genderLabelId}
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[20px] border border-white/[0.07] bg-[#0d0f16] p-5">
              <h2 className="font-display text-[15px] font-semibold text-white">Mot de passe</h2>
              <p className="mt-1 text-[12.5px] text-white/42">
                Laisse ces trois champs vides pour conserver ton mot de passe actuel.
              </p>

              <div className="mt-4 space-y-4">
                <label className="block">
                  <span className="text-[12.5px] font-medium text-white/60">Mot de passe actuel</span>
                  <input
                    type="password"
                    className="field mt-1.5 border-white/[0.08] bg-surface-2/80"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[12.5px] font-medium text-white/60">Nouveau mot de passe</span>
                    <input
                      type="password"
                      className="field mt-1.5 border-white/[0.08] bg-surface-2/80"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                    />
                    <span className="mt-1.5 block text-[11.5px] text-white/32">8 caractères minimum.</span>
                  </label>
                  <label className="block">
                    <span className="text-[12.5px] font-medium text-white/60">Confirmer le nouveau</span>
                    <input
                      type="password"
                      className="field mt-1.5 border-white/[0.08] bg-surface-2/80"
                      value={newPassword2}
                      onChange={(e) => setNewPassword2(e.target.value)}
                      autoComplete="new-password"
                    />
                  </label>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button type="submit" className="btn-brand w-full cursor-pointer sm:w-auto sm:px-8" disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer les modifications'}
              </button>
            </div>
          </form>

          {/*
            Repliée par défaut : une action irréversible n'a pas à occuper le bas
            de l'écran à chaque visite. Il faut un geste délibéré pour l'ouvrir,
            puis le mot de passe, puis une confirmation — trois barrières.
          */}
          <details className="group rounded-[20px] border border-white/[0.07] bg-white/[0.015] open:border-red-500/25 open:bg-red-500/[0.04]">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 p-4 text-[13.5px] font-medium text-white/45 transition hover:text-white/75">
              <svg
                className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-90"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Supprimer mon compte
            </summary>

            <div className="border-t border-red-500/15 p-5">
              <p className="text-[13.5px] leading-relaxed text-red-100/75">
                Tout est effacé : conversations avec le coach, objectifs et plans, historique des courses, et la liaison
                Strava côté serveur. <strong className="font-semibold text-red-100/95">C’est irréversible.</strong>
              </p>
              {me.plan !== 'standard' ? (
                <p className="mt-2.5 text-[13.5px] leading-relaxed text-red-100/75">
                  Ton abonnement sera résilié immédiatement : plus aucun prélèvement, mais le temps restant du mois déjà
                  payé est perdu. Pour en profiter jusqu’au bout, résilie d’abord depuis la section Abonnement et
                  supprime ton compte à l’échéance.
                </p>
              ) : null}
              {deleteErr ? (
                <p role="alert" className="mt-3 text-[13.5px] text-red-200/95">
                  {deleteErr}
                </p>
              ) : null}
              <label className="mt-4 block max-w-sm">
                <span className="text-[12.5px] font-medium text-red-200/70">Mot de passe pour confirmer</span>
                <input
                  type="password"
                  className="field mt-1.5 border-red-500/20 bg-surface-2/80"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  autoComplete="current-password"
                />
              </label>
              <button
                type="button"
                className="mt-4 w-full cursor-pointer rounded-xl border border-red-400/40 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                disabled={deleting}
                onClick={() => void onDeleteAccount()}
              >
                {deleting ? 'Suppression…' : 'Supprimer mon compte définitivement'}
              </button>
            </div>
          </details>
        </main>

      </div>
    </div>
  )
}
