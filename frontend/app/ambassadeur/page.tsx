'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberSidebar } from '@/components/MemberSidebar'
import { ContractDocument } from '@/components/ambassador/ContractDocument'
import {
  fetchMe,
  fetchMyAmbassador,
  signMyAmbassadorContract,
  type AmbassadorContract,
  type AmbassadorPromo,
  type AmbassadorRow,
  type MeUser,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'
import { saveMeCache } from '@/lib/meCache'

/**
 * Espace ambassadeur.
 *
 * Le parcours tient en trois temps, et la page n’en montre qu’un à la fois : remplir et
 * signer son contrat, attendre la contre-signature de NeuroRun, puis vivre avec son code.
 * Le code n’apparaît qu’une fois le contrat en vigueur — avant, il n’y a rien à partager.
 */

function formatDay(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function PrintButton() {
  return (
    <button
      type="button"
      className="btn-quiet !min-h-[42px] cursor-pointer px-3.5 text-[13px]"
      onClick={() => window.print()}
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6.72 13.829A48.4 48.4 0 0112 13.5c1.82 0 3.608.113 5.36.33m-10.64 0a2.1 2.1 0 00-1.87 2.088v2.333c0 .98.713 1.83 1.68 1.98 1.096.17 2.2.3 3.32.39m-3.13-6.79V5.25A2.25 2.25 0 018.97 3h6.06a2.25 2.25 0 012.25 2.25v8.58m-10.64 0h10.64m0 0a2.1 2.1 0 011.87 2.088v2.333c0 .98-.713 1.83-1.68 1.98-1.096.17-2.2.3-3.32.39"
        />
      </svg>
      Imprimer / PDF
    </button>
  )
}

/** Le code personnel : ce que l’ambassadeur vient voir, et ce qu’il partage. */
function PromoCard({ promo, ended }: { promo: AmbassadorPromo; ended: boolean }) {
  const [copied, setCopied] = useState(false)
  const ratio = promo.max_uses > 0 ? Math.min(100, (promo.uses / promo.max_uses) * 100) : 0

  function copy() {
    void navigator.clipboard?.writeText(promo.code).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    })
  }

  return (
    <section className="overflow-hidden rounded-[20px] border border-white/[0.08] bg-gradient-to-br from-[#13161f] to-[#0d0f16] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Ton code de réduction
          </p>
          <p className="mt-2 font-mono text-[26px] font-bold tracking-[0.08em] text-white sm:text-[30px]">
            {promo.code}
          </p>
          <p className="mt-1.5 text-[13px] text-white/55">
            {promo.discount_label} de remise pour les personnes qui s’abonnent avec ton code.
          </p>
        </div>
        <button
          type="button"
          className="btn-quiet !min-h-[42px] shrink-0 cursor-pointer px-3.5 text-[13px]"
          onClick={copy}
        >
          {copied ? 'Copié' : 'Copier le code'}
        </button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-white/[0.08] pt-4 sm:grid-cols-3">
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">Utilisations</dt>
          <dd className="mt-1 font-display text-lg font-semibold tabular-nums text-white">
            {promo.uses} <span className="text-[13px] font-normal text-white/40">/ {promo.max_uses === 0 ? '∞' : promo.max_uses}</span>
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">Restantes</dt>
          <dd className="mt-1 font-display text-lg font-semibold tabular-nums text-white">
            {promo.uses_left == null ? 'Illimité' : promo.uses_left}
          </dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">État</dt>
          <dd className="mt-1 text-[13.5px] font-medium">
            {ended || !promo.active ? (
              <span className="text-white/45">Désactivé</span>
            ) : promo.exhausted ? (
              <span className="text-amber-200/80">Quota atteint</span>
            ) : (
              <span className="text-emerald-300/85">Actif</span>
            )}
          </dd>
        </div>
      </dl>

      {promo.max_uses > 0 ? (
        <span className="meter mt-4 block">
          <span className="meter-fill block" style={{ width: `${ratio}%` }} />
        </span>
      ) : null}
    </section>
  )
}

/** Bandeau d’état : où en est le contrat, et ce qu’il reste à faire. */
function StatusBanner({ row }: { row: AmbassadorRow }) {
  const signedAt = row.ambassador_signature?.signed_at
  switch (row.status) {
    case 'signed':
      return (
        <div className="app-note">
          <span>
            <strong>Contrat signé le {formatDay(signedAt)}.</strong> NeuroRun doit maintenant le contresigner : ton
            code de réduction apparaîtra ici dès que ce sera fait.
          </span>
        </div>
      )
    case 'active':
      return (
        <div className="app-note">
          <span>
            <strong>Contrat en vigueur</strong> depuis le {formatDay(row.company_signature?.signed_at)}. Merci de
            faire courir NeuroRun avec toi.
          </span>
        </div>
      )
    case 'ended':
      return (
        <div className="app-note">
          <span>
            <strong>Contrat terminé le {formatDay(row.ended_at)}.</strong> Ton code de réduction est désactivé ; tes
            données d’entraînement, elles, restent intactes.
          </span>
        </div>
      )
    default:
      return (
        <div className="app-note">
          <span>
            <strong>Ton contrat t’attend.</strong> Complète ton nom, ton prénom et ton compte Instagram, recopie la
            mention puis signe. NeuroRun contresignera ensuite.
          </span>
        </div>
      )
  }
}

export default function AmbassadorPage() {
  const router = useRouter()
  const [ready, setReady] = useState(false)
  const [me, setMe] = useState<MeUser | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const [row, setRow] = useState<AmbassadorRow | null>(null)
  const [contract, setContract] = useState<AmbassadorContract | null>(null)
  const [loadErr, setLoadErr] = useState('')

  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [instagram, setInstagram] = useState('')
  const [mention, setMention] = useState('')
  const [signName, setSignName] = useState('')
  const [signNameEdited, setSignNameEdited] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signErr, setSignErr] = useState('')

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) {
      router.replace('/login/?next=/ambassadeur/')
      return
    }
    try {
      const [u, amb] = await Promise.all([fetchMe(token), fetchMyAmbassador(token)])
      setMe(u)
      saveMeCache(u)
      setRow(amb.ambassador)
      setContract(amb.contract ?? null)
      /* Pré-remplissage depuis le compte : l’ambassadeur corrige si son état civil diffère. */
      setLastName(amb.ambassador?.contract_last_name ?? u.last_name ?? '')
      setFirstName(amb.ambassador?.contract_first_name ?? u.first_name ?? '')
      setInstagram(amb.ambassador?.instagram ?? '')
      setReady(true)
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : 'Espace indisponible')
      setReady(true)
    }
  }, [router])

  useEffect(() => {
    void load()
  }, [load])

  function logout() {
    clearToken()
    router.push('/login/')
  }

  const derivedSignName = [firstName.trim(), lastName.trim().toUpperCase()].filter(Boolean).join(' ')
  const signatureValue = signNameEdited ? signName : derivedSignName

  async function sign(e: FormEvent) {
    e.preventDefault()
    setSignErr('')
    const token = getToken()
    if (!token) return
    setSigning(true)
    try {
      const r = await signMyAmbassadorContract(token, {
        last_name: lastName.trim(),
        first_name: firstName.trim(),
        instagram: instagram.trim(),
        mention,
        full_name: signatureValue,
      })
      setRow(r.ambassador)
      setContract(r.contract ?? contract)
    } catch (err) {
      setSignErr(err instanceof Error ? err.message : 'Signature impossible')
    } finally {
      setSigning(false)
    }
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const canSign = row?.status === 'pending'
  const showPromo = row?.promo != null && (row.status === 'active' || row.status === 'ended')

  return (
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <MemberSidebar
        active="ambassador"
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        capabilities={me?.capabilities}
        isAdmin={me?.role === 'admin'}
        isAmbassador={me?.is_ambassador}
        firstName={me?.first_name}
        lastName={me?.last_name}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
        <MemberPageHeader
          title="Ambassadeur"
          subtitle="Ton contrat et ton code de réduction"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
          maxWidthClass="mx-auto w-full max-w-4xl"
        />

        <main className="member-main-pad-b mx-auto w-full max-w-4xl flex-1 space-y-5 px-safe py-6 sm:py-8">
          {loadErr ? (
            <div role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/[0.09] px-4 py-3.5">
              <p className="text-sm font-medium text-red-50">Impossible de charger ton espace</p>
              <p className="mt-0.5 text-[13px] text-red-100/70">{loadErr}</p>
            </div>
          ) : null}

          {!row ? (
            <section className="panel p-6 text-center">
              <h2 className="font-display text-lg font-semibold text-white">Espace réservé aux ambassadeurs</h2>
              <p className="mx-auto mt-2 max-w-md text-[13.5px] leading-relaxed text-white/50">
                Les ambassadeurs NeuroRun utilisent l’application, en parlent sur leurs réseaux et font profiter leur
                communauté d’un code de réduction. Si tu veux en faire partie, écris-nous.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <Link href="/dashboard/" className="btn-brand cursor-pointer px-4 text-sm">
                  Retour au tableau de bord
                </Link>
                <Link href="/contact/" className="btn-quiet cursor-pointer px-4 text-sm">
                  Nous contacter
                </Link>
              </div>
            </section>
          ) : (
            <>
              <StatusBanner row={row} />

              {showPromo && row.promo ? <PromoCard promo={row.promo} ended={row.status === 'ended'} /> : null}

              {/* Remplir et signer : le seul moment où la page demande quelque chose. */}
              {canSign && contract ? (
                <form className="panel p-5" onSubmit={(e) => void sign(e)}>
                  <h2 className="font-display text-base font-semibold text-white">Remplir et signer</h2>
                  <p className="mt-1 text-[12.5px] leading-snug text-white/45">
                    Ces informations complètent le contrat affiché plus bas. Une fois signé, il n’est plus modifiable.
                  </p>

                  <div className="mt-4 grid gap-3.5 sm:grid-cols-3">
                    <div>
                      <label htmlFor="amb-lastname" className="text-xs text-white/45">
                        Nom
                      </label>
                      <input
                        id="amb-lastname"
                        className="field mt-1"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        autoComplete="family-name"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="amb-firstname" className="text-xs text-white/45">
                        Prénom
                      </label>
                      <input
                        id="amb-firstname"
                        className="field mt-1"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        autoComplete="given-name"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="amb-instagram" className="text-xs text-white/45">
                        Compte Instagram
                      </label>
                      <input
                        id="amb-instagram"
                        className="field mt-1"
                        value={instagram}
                        onChange={(e) => setInstagram(e.target.value)}
                        placeholder="pseudo"
                        required
                      />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="amb-mention" className="text-xs text-white/45">
                        Recopie la mention « {contract.mention} »
                      </label>
                      <input
                        id="amb-mention"
                        className="field mt-1"
                        value={mention}
                        onChange={(e) => setMention(e.target.value)}
                        placeholder={contract.mention}
                        autoComplete="off"
                        required
                      />
                    </div>
                    <div>
                      <label htmlFor="amb-signature" className="text-xs text-white/45">
                        Signature
                      </label>
                      <input
                        id="amb-signature"
                        className="field mt-1 italic"
                        value={signatureValue}
                        onChange={(e) => {
                          setSignNameEdited(true)
                          setSignName(e.target.value)
                        }}
                        autoComplete="off"
                        required
                      />
                      <p className="mt-1 text-[11px] text-white/35">Ton nom saisi vaut signature.</p>
                    </div>
                  </div>

                  {signErr ? (
                    <p role="alert" className="mt-3 text-[13px] text-red-200">
                      {signErr}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="btn-brand mt-5 cursor-pointer px-5 text-sm"
                    disabled={
                      signing ||
                      !lastName.trim() ||
                      !firstName.trim() ||
                      !instagram.trim() ||
                      !mention.trim() ||
                      !signatureValue.trim()
                    }
                  >
                    {signing ? 'Signature…' : 'Signer le contrat'}
                  </button>
                </form>
              ) : null}

              {contract ? (
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-base font-semibold text-white">
                      {canSign ? 'Contrat à signer' : 'Ton contrat'}
                    </h2>
                    {canSign ? null : <PrintButton />}
                  </div>
                  <ContractDocument
                    contract={contract}
                    lastName={canSign ? lastName : row.contract_last_name}
                    firstName={canSign ? firstName : row.contract_first_name}
                    instagram={canSign ? instagram : row.instagram}
                    ambassadorSignature={row.ambassador_signature}
                    companySignature={row.company_signature}
                  />
                </section>
              ) : null}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
