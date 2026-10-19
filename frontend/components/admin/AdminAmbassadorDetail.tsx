'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  adminDeleteAmbassador,
  adminGetAmbassador,
  adminPatchAmbassador,
  adminSignAmbassador,
  type AmbassadorContract,
  type AmbassadorRow,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import { ContractDocument } from '@/components/ambassador/ContractDocument'
import {
  Badge,
  CopyButton,
  Drawer,
  ErrorBanner,
  SkeletonRows,
  Switch,
  useConfirm,
  useNotify,
} from '@/components/admin/ui'
import { formatDateTime, tierLabel } from '@/components/admin/format'
import {
  DiscountFields,
  ambassadorStatusMeta,
  discountInput,
  discountValid,
  newDiscountDraft,
  promoUsageLabel,
  type DiscountDraft,
} from '@/components/admin/ambassadorShared'

/**
 * Fiche d’un ambassadeur : son contrat, sa contre-signature, son code.
 *
 * Tout ce qui engage se fait d’ici — contresigner, changer la remise, mettre fin au
 * contrat — avec le contrat sous les yeux, pas dans un autre onglet.
 */

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3.5 py-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-white/35">{label}</p>
      <p className="mt-1 truncate font-display text-[15px] font-semibold text-white">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[11px] text-white/35">{hint}</p> : null}
    </div>
  )
}

export function AdminAmbassadorDetail({
  id,
  tierNames,
  onClose,
  onChanged,
}: {
  id: string
  /** Libellés marketing des paliers (config offres), pour nommer l’offre du compte. */
  tierNames?: Record<string, string>
  onClose: () => void
  /** Prévient la liste qu’une ligne a bougé (statut, remise, suppression). */
  onChanged: () => void
}) {
  const notify = useNotify()
  const confirm = useConfirm()

  const [row, setRow] = useState<AmbassadorRow | null>(null)
  const [contract, setContract] = useState<AmbassadorContract | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [mention, setMention] = useState('')
  const [signName, setSignName] = useState('NeuroRun')
  const [signing, setSigning] = useState(false)

  const [discount, setDiscount] = useState<DiscountDraft>(newDiscountDraft(null))
  const [codeActive, setCodeActive] = useState(true)
  const [instagram, setInstagram] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const apply = useCallback((next: AmbassadorRow, c: AmbassadorContract) => {
    setRow(next)
    setContract(c)
    setDiscount(newDiscountDraft(next.promo))
    setCodeActive(next.promo?.active ?? true)
    setInstagram(next.instagram ?? '')
    setNotes(next.notes ?? '')
  }, [])

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const r = await adminGetAmbassador(t, id)
      apply(r.ambassador, r.contract)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Fiche indisponible')
    } finally {
      setLoading(false)
    }
  }, [id, apply])

  useEffect(() => {
    void load()
  }, [load])

  async function countersign(e: FormEvent) {
    e.preventDefault()
    const t = getToken()
    if (!t || !row) return
    setSigning(true)
    try {
      const r = await adminSignAmbassador(t, row.id, { full_name: signName.trim(), mention })
      apply(r.ambassador, r.contract)
      onChanged()
      notify('ok', `Contrat de ${r.ambassador.display_name} contresigné.`)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Signature impossible')
    } finally {
      setSigning(false)
    }
  }

  async function save() {
    const t = getToken()
    if (!t || !row) return
    setSaving(true)
    try {
      const r = await adminPatchAmbassador(t, row.id, {
        instagram,
        notes,
        promo: row.promo ? { ...discountInput(discount), active: codeActive } : undefined,
      })
      apply(r.ambassador, r.contract)
      onChanged()
      notify('ok', 'Modifications enregistrées.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  async function setStatus(next: 'ended' | 'active') {
    const t = getToken()
    if (!t || !row) return
    if (next === 'ended') {
      const ok = await confirm({
        title: `Mettre fin au contrat de ${row.display_name} ?`,
        body: (
          <>
            Le code <strong className="font-semibold text-white/85">{row.promo?.code ?? '—'}</strong> sera désactivé
            immédiatement (article 4). Le contrat signé et le compteur d’utilisations restent consultables, et tu peux
            reprendre le partenariat plus tard.
          </>
        ),
        confirmLabel: 'Mettre fin',
        danger: true,
      })
      if (!ok) return
    }
    try {
      const r = await adminPatchAmbassador(t, row.id, { status: next })
      apply(r.ambassador, r.contract)
      onChanged()
      notify('ok', next === 'ended' ? 'Contrat terminé, code désactivé.' : 'Partenariat repris, code réactivé.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Modification impossible')
    }
  }

  async function remove() {
    const t = getToken()
    if (!t || !row) return
    const ok = await confirm({
      title: `Retirer ${row.display_name} des ambassadeurs ?`,
      body: (
        <>
          Le contrat et ses signatures seront supprimés. Le code{' '}
          <strong className="font-semibold text-white/85">{row.promo?.code ?? '—'}</strong> est conservé mais
          désactivé : son compteur d’utilisations est un historique de ventes.
        </>
      ),
      confirmLabel: 'Retirer',
      danger: true,
    })
    if (!ok) return
    try {
      await adminDeleteAmbassador(t, row.id)
      notify('ok', `${row.display_name} n’est plus ambassadeur.`)
      onChanged()
      onClose()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  const status = row ? ambassadorStatusMeta(row.status) : null
  const dirty =
    row != null &&
    (instagram !== (row.instagram ?? '') ||
      notes !== (row.notes ?? '') ||
      codeActive !== (row.promo?.active ?? true) ||
      JSON.stringify(discountInput(discount)) !== JSON.stringify(discountInput(newDiscountDraft(row.promo))))
  /* Après signature, l’identité et le compte Instagram font partie du document signé. */
  const identityLocked = row?.ambassador_signature != null

  return (
    <Drawer onClose={onClose} labelledBy="admin-ambassador-title">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4 pt-safe">
        <div className="min-w-0">
          <h2 id="admin-ambassador-title" className="truncate font-display text-base font-semibold text-white">
            {row?.display_name ?? 'Ambassadeur'}
          </h2>
          <p className="mt-0.5 truncate text-[12px] text-white/40">{row?.email ?? ''}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {status ? (
            <Badge tone={status.tone} dot>
              {status.label}
            </Badge>
          ) : null}
          <button type="button" className="icon-btn cursor-pointer" onClick={onClose} aria-label="Fermer la fiche">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-safe">
        {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

        {loading || !row || !contract ? (
          <SkeletonRows rows={5} height={56} />
        ) : (
          <>
            <p className="text-[12.5px] leading-snug text-white/45">{status?.hint}</p>

            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <Tile
                label="Code"
                value={row.promo?.code ?? '—'}
                hint={row.promo ? (row.promo.active ? 'actif' : 'désactivé') : undefined}
              />
              <Tile label="Remise" value={row.promo?.discount_label ?? '—'} />
              <Tile
                label="Utilisations"
                value={promoUsageLabel(row.promo)}
                hint={row.promo?.exhausted ? 'quota atteint' : undefined}
              />
              <Tile label="Offre du compte" value={row.plan ? tierLabel(row.plan, tierNames) : '—'} />
            </div>

            {/* Contre-signature : l’action qui met le contrat en vigueur. */}
            {row.status === 'signed' ? (
              <form className="panel p-4" onSubmit={(e) => void countersign(e)}>
                <h3 className="font-display text-[14px] font-semibold text-white">Contresigner le contrat</h3>
                <p className="mt-1 text-[12.5px] leading-snug text-white/45">
                  {row.display_name} a signé le{' '}
                  {row.ambassador_signature ? formatDateTime(row.ambassador_signature.signed_at) : '—'}. Ta signature
                  met le partenariat en vigueur.
                </p>
                <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor="amb-mention" className="text-xs text-white/45">
                      Mention « {contract.mention} »
                    </label>
                    <input
                      id="amb-mention"
                      className="field mt-1 !min-h-[46px]"
                      value={mention}
                      onChange={(e) => setMention(e.target.value)}
                      placeholder={contract.mention}
                      autoComplete="off"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="amb-signature" className="text-xs text-white/45">
                      Signature (nom saisi)
                    </label>
                    <input
                      id="amb-signature"
                      className="field mt-1 !min-h-[46px]"
                      value={signName}
                      onChange={(e) => setSignName(e.target.value)}
                      autoComplete="off"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  className="btn-brand mt-4 !min-h-[46px] cursor-pointer px-5 text-sm"
                  disabled={signing || !mention.trim() || !signName.trim()}
                >
                  {signing ? 'Signature…' : 'Contresigner'}
                </button>
              </form>
            ) : null}

            {/* Code de réduction : la remise et le quota restent modifiables à tout moment. */}
            {row.promo ? (
              <section className="panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-[14px] font-semibold text-white">Code de réduction</h3>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[13px] font-semibold tracking-wide text-white">
                      {row.promo.code}
                    </span>
                    <CopyButton value={row.promo.code} label={`Copier ${row.promo.code}`} />
                  </span>
                </div>
                <div className="mt-4">
                  <DiscountFields draft={discount} onChange={setDiscount} idPrefix="amb-edit" />
                </div>
                <div className="mt-4">
                  <Switch
                    checked={codeActive}
                    onChange={setCodeActive}
                    label="Code actif"
                    hint="Décoché, le code est refusé au paiement sans perdre son historique."
                  />
                </div>
              </section>
            ) : null}

            <section className="panel p-4">
              <h3 className="font-display text-[14px] font-semibold text-white">Suivi</h3>
              <div className="mt-3 space-y-3.5">
                <div>
                  <label htmlFor="amb-instagram" className="text-xs text-white/45">
                    Compte Instagram
                  </label>
                  <input
                    id="amb-instagram"
                    className="field mt-1 !min-h-[46px]"
                    value={instagram}
                    onChange={(e) => setInstagram(e.target.value)}
                    disabled={identityLocked}
                    placeholder="pseudo"
                  />
                  <p className="mt-1 text-[11px] text-white/35">
                    {identityLocked
                      ? 'Figé : il fait partie du contrat signé.'
                      : 'Pré-rempli dans le contrat que l’ambassadeur signera.'}
                  </p>
                </div>
                <div>
                  <label htmlFor="amb-notes" className="text-xs text-white/45">
                    Notes internes
                  </label>
                  <textarea
                    id="amb-notes"
                    rows={3}
                    className="field mt-1 !min-h-[80px] resize-y py-2.5 leading-snug"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Audience, prise de contact, publications…"
                  />
                  <p className="mt-1 text-[11px] text-white/35">Visibles seulement ici, jamais par l’ambassadeur.</p>
                </div>
              </div>
            </section>

            {dirty ? (
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  className="btn-brand !min-h-[46px] cursor-pointer px-5 text-sm"
                  disabled={saving || !discountValid(discount)}
                  onClick={() => void save()}
                >
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
                <button
                  type="button"
                  className="btn-quiet !min-h-[46px] cursor-pointer px-4 text-sm"
                  disabled={saving}
                  onClick={() => contract && apply(row, contract)}
                >
                  Annuler
                </button>
              </div>
            ) : null}

            {/* Le contrat, tel qu’il sera imprimé. */}
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-[14px] font-semibold text-white">Contrat</h3>
                <button
                  type="button"
                  className="btn-quiet !min-h-[40px] cursor-pointer px-3.5 text-[13px]"
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
              </div>
              <ContractDocument
                contract={contract}
                lastName={row.contract_last_name}
                firstName={row.contract_first_name}
                instagram={row.instagram}
                ambassadorSignature={row.ambassador_signature}
                companySignature={row.company_signature}
              />
            </section>

            <section className="panel p-4">
              <h3 className="font-display text-[14px] font-semibold text-white">Fin du partenariat</h3>
              <p className="mt-1 text-[12.5px] leading-snug text-white/45">
                {row.status === 'ended'
                  ? `Contrat terminé le ${row.ended_at ? formatDateTime(row.ended_at) : '—'}.`
                  : 'Mettre fin désactive le code de réduction et conserve le contrat signé.'}
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2.5">
                {row.status === 'ended' ? (
                  <button
                    type="button"
                    className="btn-quiet !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
                    onClick={() => void setStatus('active')}
                  >
                    Reprendre le partenariat
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-quiet !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
                    onClick={() => void setStatus('ended')}
                  >
                    Mettre fin au contrat
                  </button>
                )}
                <button
                  type="button"
                  className="btn-quiet !min-h-[44px] cursor-pointer px-4 text-[13.5px] !text-red-200"
                  onClick={() => void remove()}
                >
                  Retirer l’ambassadeur
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    </Drawer>
  )
}
