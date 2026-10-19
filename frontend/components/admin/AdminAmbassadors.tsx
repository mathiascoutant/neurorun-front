'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  adminCreateAmbassador,
  adminListAmbassadors,
  adminListUsers,
  type AdminUserRow,
  type AmbassadorRow,
  type OfferConfigPayload,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import { AdminAmbassadorDetail } from '@/components/admin/AdminAmbassadorDetail'
import {
  Badge,
  CopyButton,
  EmptyState,
  ErrorBanner,
  Modal,
  SearchInput,
  SectionHead,
  Segmented,
  SkeletonRows,
  SortHeader,
  Switch,
  useNotify,
  useSort,
} from '@/components/admin/ui'
import { emailInitials, formatDate, timeValue } from '@/components/admin/format'
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
 * Ambassadeurs : qui porte un contrat, où en est sa signature, et ce que rapporte son code.
 *
 * Un ambassadeur n’est jamais créé de toutes pièces : on part d’un compte déjà inscrit sur
 * NeuroRun, on lui attache un code de réduction, et le contrat type l’attend sur son compte.
 */

const PAGE_SIZE = 200
type Filter = 'all' | 'todo' | 'active' | 'ended'
type SortKey = 'name' | 'code' | 'uses' | 'status' | 'created_at'

const STATUS_ORDER: Record<AmbassadorRow['status'], number> = {
  signed: 0,
  pending: 1,
  active: 2,
  ended: 3,
}

export function AdminAmbassadors({
  offerCfg,
  onTotal,
}: {
  offerCfg?: OfferConfigPayload | null
  onTotal?: (n: number) => void
}) {
  const [rows, setRows] = useState<AmbassadorRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState('')
  const { sort, onSort } = useSort<SortKey>('status', 'asc')

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const r = await adminListAmbassadors(t)
      setRows(r.ambassadors ?? [])
      onTotal?.((r.ambassadors ?? []).length)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Liste indisponible')
    } finally {
      setLoading(false)
    }
  }, [onTotal])

  useEffect(() => {
    void load()
  }, [load])

  const counts = useMemo(() => {
    const todo = rows.filter((a) => a.status === 'pending' || a.status === 'signed').length
    const active = rows.filter((a) => a.status === 'active').length
    const ended = rows.filter((a) => a.status === 'ended').length
    return { todo, active, ended }
  }, [rows])

  const totalUses = rows.reduce((acc, a) => acc + (a.promo?.uses ?? 0), 0)
  const toCountersign = rows.filter((a) => a.status === 'signed').length

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const filtered = rows.filter((a) => {
      if (filter === 'todo' && a.status !== 'pending' && a.status !== 'signed') return false
      if (filter === 'active' && a.status !== 'active') return false
      if (filter === 'ended' && a.status !== 'ended') return false
      if (!needle) return true
      return (
        a.display_name.toLowerCase().includes(needle) ||
        a.email.toLowerCase().includes(needle) ||
        (a.instagram ?? '').toLowerCase().includes(needle) ||
        (a.promo?.code ?? '').toLowerCase().includes(needle)
      )
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      switch (sort.key) {
        case 'name':
          return a.display_name.localeCompare(b.display_name, 'fr') * dir
        case 'code':
          return (a.promo?.code ?? '').localeCompare(b.promo?.code ?? '', 'fr') * dir
        case 'uses':
          return ((a.promo?.uses ?? 0) - (b.promo?.uses ?? 0)) * dir
        case 'status':
          /* Les contrats qui attendent une action passent devant : c’est la file de travail. */
          return (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) * dir
        default:
          return (timeValue(a.created_at) - timeValue(b.created_at)) * dir
      }
    })
  }, [rows, q, filter, sort])

  return (
    <div className="space-y-4">
      {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

      <SectionHead
        title={`${rows.length} ambassadeur${rows.length > 1 ? 's' : ''}`}
        subtitle={`${counts.active} contrat${counts.active > 1 ? 's' : ''} en vigueur · ${totalUses} abonnement${
          totalUses > 1 ? 's' : ''
        } via leurs codes`}
        action={
          <button
            type="button"
            className="btn-brand !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
            onClick={() => setCreating(true)}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            Nouvel ambassadeur
          </button>
        }
      />

      {toCountersign > 0 ? (
        <div className="app-note">
          <span>
            <strong>
              {toCountersign} contrat{toCountersign > 1 ? 's' : ''} signé{toCountersign > 1 ? 's' : ''}
            </strong>{' '}
            attend{toCountersign > 1 ? 'ent' : ''} ta contre-signature pour prendre effet. Ouvre la fiche pour
            contresigner.
          </span>
        </div>
      ) : null}

      {rows.length > 0 ? (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={q}
            onChange={setQ}
            label="Rechercher un ambassadeur"
            placeholder="Nom, e-mail, Instagram ou code…"
            className="lg:max-w-sm lg:flex-1"
          />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            label="Filtrer les contrats"
            className="!max-w-none"
            options={[
              { id: 'all', label: 'Tous', count: rows.length },
              { id: 'todo', label: 'À signer', count: counts.todo },
              { id: 'active', label: 'En vigueur', count: counts.active },
              { id: 'ended', label: 'Terminés', count: counts.ended },
            ]}
          />
        </div>
      ) : null}

      {loading ? (
        <SkeletonRows rows={4} height={52} />
      ) : list.length === 0 ? (
        <EmptyState
          title={rows.length === 0 ? 'Aucun ambassadeur' : 'Aucun contrat ne correspond'}
          body={
            rows.length === 0
              ? 'Choisis un compte déjà inscrit, attache-lui un code de réduction : son contrat l’attendra sur son compte NeuroRun.'
              : 'Modifie la recherche ou retire le filtre.'
          }
          action={
            rows.length === 0 ? (
              <button type="button" className="btn-brand cursor-pointer px-4 text-sm" onClick={() => setCreating(true)}>
                Désigner un ambassadeur
              </button>
            ) : null
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table min-w-[860px]">
            <thead>
              <tr>
                <SortHeader id="name" label="Ambassadeur" sort={sort} onSort={onSort} />
                <SortHeader id="code" label="Code" sort={sort} onSort={onSort} />
                <SortHeader id="uses" label="Utilisations" sort={sort} onSort={onSort} />
                <SortHeader id="status" label="Contrat" sort={sort} onSort={onSort} />
                <SortHeader id="created_at" label="Depuis" sort={sort} onSort={onSort} />
                <th scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((a) => {
                const st = ambassadorStatusMeta(a.status)
                const ratio =
                  a.promo && a.promo.max_uses > 0 ? Math.min(100, (a.promo.uses / a.promo.max_uses) * 100) : 0
                return (
                  <tr key={a.id}>
                    <td>
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="nav-avatar !h-8 !w-8 !rounded-[10px] !text-[11px]" aria-hidden>
                          {emailInitials(a.email)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-white">{a.display_name}</span>
                          <span className="block truncate text-[11px] text-white/35">
                            {a.instagram ? `@${a.instagram}` : a.email}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      {a.promo ? (
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[12.5px] font-semibold tracking-wide text-white">
                            {a.promo.code}
                          </span>
                          <Badge tone="brand">−{a.promo.discount_label}</Badge>
                          <CopyButton value={a.promo.code} label={`Copier ${a.promo.code}`} />
                        </span>
                      ) : (
                        <span className="text-white/35">—</span>
                      )}
                    </td>
                    <td className="min-w-[9rem]">
                      <span className="num text-[12.5px] text-white/70">{promoUsageLabel(a.promo)}</span>
                      {a.promo && a.promo.max_uses > 0 ? (
                        <span className="meter mt-1.5 block">
                          <span className="meter-fill block" style={{ width: `${ratio}%` }} />
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    </td>
                    <td className="num text-white/55">{formatDate(a.created_at)}</td>
                    <td>
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          className="btn-quiet !min-h-[36px] cursor-pointer px-3 text-[12.5px]"
                          onClick={() => setOpenId(a.id)}
                        >
                          {a.status === 'signed' ? 'Contresigner' : 'Ouvrir'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {creating ? (
        <CreateAmbassadorModal
          existingUserIds={rows.map((a) => a.user_id ?? '')}
          onClose={() => setCreating(false)}
          onDone={async (id) => {
            setCreating(false)
            await load()
            setOpenId(id)
          }}
        />
      ) : null}

      {openId ? (
        <AdminAmbassadorDetail
          id={openId}
          tierNames={offerCfg?.tier_display_names}
          onClose={() => setOpenId('')}
          onChanged={() => void load()}
        />
      ) : null}
    </div>
  )
}

/** Code suggéré à partir du prénom : « GAEL30 ». Modifiable, ce n’est qu’un point de départ. */
function suggestCode(user: AdminUserRow, draft: DiscountDraft): string {
  const base = (user.email.split('@')[0] ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 12)
  const suffix = draft.kind === 'percent' ? String(draft.percent) : ''
  return `${base || 'AMBASSADEUR'}${suffix}`
}

function CreateAmbassadorModal({
  existingUserIds,
  onClose,
  onDone,
}: {
  existingUserIds: string[]
  onClose: () => void
  onDone: (createdId: string) => Promise<void>
}) {
  const notify = useNotify()
  const [accounts, setAccounts] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState<AdminUserRow | null>(null)

  const [code, setCode] = useState('')
  const [discount, setDiscount] = useState<DiscountDraft>(newDiscountDraft(null))
  const [instagram, setInstagram] = useState('')
  const [notes, setNotes] = useState('')
  const [grantBenefits, setGrantBenefits] = useState(true)
  const [busy, setBusy] = useState(false)

  const taken = useMemo(() => new Set(existingUserIds.filter(Boolean)), [existingUserIds])

  const loadAccounts = useCallback(async (skip: number) => {
    const t = getToken()
    if (!t) return
    setLoadingAccounts(true)
    try {
      const r = await adminListUsers(t, skip, PAGE_SIZE)
      setAccounts((list) => (skip === 0 ? (r.users ?? []) : [...list, ...(r.users ?? [])]))
      setTotal(r.total)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Comptes indisponibles')
    } finally {
      setLoadingAccounts(false)
    }
  }, [notify])

  useEffect(() => {
    void loadAccounts(0)
  }, [loadAccounts])

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return accounts
      .filter((u) => !taken.has(u.id))
      .filter((u) => !needle || u.email.toLowerCase().includes(needle) || u.id.includes(needle))
      .slice(0, 40)
  }, [accounts, q, taken])

  function pick(u: AdminUserRow) {
    setPicked(u)
    setCode((c) => c || suggestCode(u, discount))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = getToken()
    if (!t || !picked) return
    setBusy(true)
    try {
      const r = await adminCreateAmbassador(t, {
        user_id: picked.id,
        instagram,
        notes,
        promo: { code: code.trim().toUpperCase(), ...discountInput(discount) },
        grant_benefits: grantBenefits,
      })
      notify('ok', `${r.ambassador.display_name} est ambassadeur — son contrat l’attend sur son compte.`)
      await onDone(r.ambassador.id)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Création impossible')
    } finally {
      setBusy(false)
    }
  }

  const remaining = Math.max(0, total - accounts.length)

  return (
    <Modal onClose={onClose} labelledBy="admin-new-ambassador" width="max-w-xl">
      <form className="p-5 sm:p-6" onSubmit={(e) => void submit(e)}>
        <h2 id="admin-new-ambassador" className="font-display text-base font-semibold text-white">
          Nouvel ambassadeur
        </h2>
        <p className="mt-1 text-[12.5px] leading-snug text-white/45">
          Choisis un compte inscrit sur NeuroRun et attache-lui son code de réduction. Le contrat type apparaîtra sur
          son compte, à remplir et signer.
        </p>

        {/* Étape 1 — le compte. */}
        <div className="mt-4">
          <span className="text-xs text-white/45">Compte</span>
          {picked ? (
            <div className="mt-1 flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="nav-avatar !h-9 !w-9 !rounded-xl !text-[11px]" aria-hidden>
                  {emailInitials(picked.email)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[13.5px] font-medium text-white">{picked.email}</p>
                  <p className="truncate text-[11px] text-white/35">Offre {picked.plan}</p>
                </div>
              </div>
              <button
                type="button"
                className="btn-quiet !min-h-[36px] shrink-0 cursor-pointer px-3 text-[12.5px]"
                onClick={() => setPicked(null)}
              >
                Changer
              </button>
            </div>
          ) : (
            <div className="mt-1 space-y-2">
              <SearchInput
                value={q}
                onChange={setQ}
                label="Rechercher un compte"
                placeholder="Rechercher par e-mail…"
              />
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-white/[0.07]">
                {loadingAccounts && accounts.length === 0 ? (
                  <div className="p-3">
                    <SkeletonRows rows={3} height={40} />
                  </div>
                ) : matches.length === 0 ? (
                  <p className="px-3.5 py-6 text-center text-[12.5px] text-white/40">
                    Aucun compte disponible ne correspond
                    {remaining > 0 ? ` parmi les ${accounts.length} chargés sur ${total}.` : '.'}
                  </p>
                ) : (
                  <ul className="divide-y divide-white/[0.05]">
                    {matches.map((u) => (
                      <li key={u.id}>
                        <button
                          type="button"
                          className="flex w-full cursor-pointer items-center gap-2.5 px-3.5 py-2.5 text-left transition hover:bg-white/[0.05]"
                          onClick={() => pick(u)}
                        >
                          <span className="nav-avatar !h-8 !w-8 !rounded-[10px] !text-[10.5px]" aria-hidden>
                            {emailInitials(u.email)}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] text-white/90">{u.email}</span>
                            <span className="block truncate text-[11px] text-white/35">Offre {u.plan}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {remaining > 0 ? (
                <button
                  type="button"
                  className="btn-quiet !min-h-[38px] cursor-pointer px-3 text-[12.5px]"
                  disabled={loadingAccounts}
                  onClick={() => void loadAccounts(accounts.length)}
                >
                  {loadingAccounts ? 'Chargement…' : `Charger ${Math.min(PAGE_SIZE, remaining)} comptes de plus`}
                </button>
              ) : null}
            </div>
          )}
        </div>

        {/* Étape 2 — le code et le contrat. */}
        {picked ? (
          <div className="mt-4 space-y-3.5 border-t border-white/[0.06] pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-amb-code" className="text-xs text-white/45">
                  Code de réduction
                </label>
                <input
                  id="new-amb-code"
                  className="field mt-1 !min-h-[46px] font-mono tracking-wide"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
                  placeholder="GAEL30"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label htmlFor="new-amb-instagram" className="text-xs text-white/45">
                  Compte Instagram (optionnel)
                </label>
                <input
                  id="new-amb-instagram"
                  className="field mt-1 !min-h-[46px]"
                  value={instagram}
                  onChange={(e) => setInstagram(e.target.value)}
                  placeholder="pseudo"
                />
                <p className="mt-1 text-[11px] text-white/35">L’ambassadeur le confirmera en signant.</p>
              </div>
            </div>

            <DiscountFields draft={discount} onChange={setDiscount} idPrefix="new-amb" />

            <Switch
              checked={grantBenefits}
              onChange={setGrantBenefits}
              label="Appliquer les avantages du contrat"
              hint="Passe le compte en offre Performance et ouvre l’accès avant-première (article 2)."
            />

            <div>
              <label htmlFor="new-amb-notes" className="text-xs text-white/45">
                Notes internes (optionnel)
              </label>
              <textarea
                id="new-amb-notes"
                rows={2}
                className="field mt-1 !min-h-[64px] resize-y py-2.5 leading-snug"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Audience, prise de contact…"
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-quiet !min-h-[46px] cursor-pointer px-4 text-sm" onClick={onClose}>
            Annuler
          </button>
          <button
            type="submit"
            className="btn-brand !min-h-[46px] cursor-pointer px-5 text-sm"
            disabled={busy || !picked || !code.trim() || !discountValid(discount)}
          >
            {busy ? 'Création…' : 'Créer l’ambassadeur'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
