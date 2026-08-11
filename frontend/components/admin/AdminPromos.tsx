'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { adminCreatePromo, adminDeletePromo, adminListPromos, adminPatchPromo, type PromoCodeRow } from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  Badge,
  CopyButton,
  EmptyState,
  ErrorBanner,
  Modal,
  SearchInput,
  SectionHead,
  SkeletonRows,
  SortHeader,
  useConfirm,
  useNotify,
  useSort,
} from '@/components/admin/ui'
import { formatDate, formatNumber, timeValue } from '@/components/admin/format'

type SortKey = 'code' | 'percent_off' | 'uses' | 'created_at'

/** Un code épuisé reste « actif » en base mais ne s’applique plus : à distinguer. */
function status(p: PromoCodeRow): { tone: 'ok' | 'warn' | 'danger'; label: string } {
  if (!p.active) return { tone: 'danger', label: 'Désactivé' }
  if (p.max_uses > 0 && p.uses >= p.max_uses) return { tone: 'warn', label: 'Épuisé' }
  return { tone: 'ok', label: 'Actif' }
}

export function AdminPromos({ onTotal }: { onTotal?: (n: number) => void }) {
  const notify = useNotify()
  const confirm = useConfirm()

  const [promos, setPromos] = useState<PromoCodeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<PromoCodeRow | null>(null)
  const [creating, setCreating] = useState(false)
  const { sort, onSort } = useSort<SortKey>('created_at', 'desc')

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const r = await adminListPromos(t)
      setPromos(r.promo_codes ?? [])
      onTotal?.((r.promo_codes ?? []).length)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [onTotal])

  useEffect(() => {
    void load()
  }, [load])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = promos.filter((p) => !needle || p.code.toLowerCase().includes(needle))
    const dir = sort.dir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      switch (sort.key) {
        case 'code':
          return a.code.localeCompare(b.code, 'fr') * dir
        case 'percent_off':
          return (a.percent_off - b.percent_off) * dir
        case 'uses':
          return (a.uses - b.uses) * dir
        default:
          return (timeValue(a.created_at) - timeValue(b.created_at)) * dir
      }
    })
  }, [promos, q, sort])

  const activeCount = promos.filter((p) => status(p).label === 'Actif').length
  const totalUses = promos.reduce((acc, p) => acc + p.uses, 0)

  async function toggleActive(p: PromoCodeRow) {
    const t = getToken()
    if (!t) return
    try {
      await adminPatchPromo(t, p.id, { active: !p.active })
      setPromos((list) => list.map((x) => (x.id === p.id ? { ...x, active: !p.active } : x)))
      notify('ok', `${p.code} ${p.active ? 'désactivé' : 'réactivé'}.`)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Modification impossible')
    }
  }

  async function remove(p: PromoCodeRow) {
    const ok = await confirm({
      title: `Supprimer le code ${p.code} ?`,
      body:
        p.uses > 0
          ? `Ce code a déjà servi ${p.uses} fois. Le désactiver conserve l’historique ; le supprimer l’efface.`
          : 'Ce code n’a jamais été utilisé.',
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const t = getToken()
    if (!t) return
    try {
      await adminDeletePromo(t, p.id)
      setPromos((list) => list.filter((x) => x.id !== p.id))
      notify('ok', `${p.code} supprimé.`)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  return (
    <div className="space-y-4">
      {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

      <SectionHead
        title={`${promos.length} code${promos.length > 1 ? 's' : ''} promo`}
        subtitle={`${activeCount} actif${activeCount > 1 ? 's' : ''} · ${formatNumber(totalUses)} utilisation${totalUses > 1 ? 's' : ''} cumulée${totalUses > 1 ? 's' : ''}`}
        action={
          <button type="button" className="btn-brand !min-h-[44px] cursor-pointer px-4 text-[13.5px]" onClick={() => setCreating(true)}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            Nouveau code
          </button>
        }
      />

      {promos.length > 6 ? (
        <SearchInput value={q} onChange={setQ} label="Rechercher un code" placeholder="Rechercher un code…" className="sm:max-w-xs" />
      ) : null}

      {loading ? (
        <SkeletonRows rows={5} height={48} />
      ) : rows.length === 0 ? (
        <EmptyState
          title={promos.length === 0 ? 'Aucun code promo' : 'Aucun code ne correspond'}
          body={
            promos.length === 0
              ? 'Crée un code pour offrir une réduction au moment du paiement.'
              : 'Modifie ta recherche.'
          }
          action={
            promos.length === 0 ? (
              <button type="button" className="btn-brand cursor-pointer px-4 text-sm" onClick={() => setCreating(true)}>
                Créer un code
              </button>
            ) : null
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table min-w-[760px]">
            <thead>
              <tr>
                <SortHeader id="code" label="Code" sort={sort} onSort={onSort} />
                <SortHeader id="percent_off" label="Réduction" sort={sort} onSort={onSort} />
                <SortHeader id="uses" label="Utilisations" sort={sort} onSort={onSort} />
                <th scope="col">Statut</th>
                <SortHeader id="created_at" label="Créé le" sort={sort} onSort={onSort} />
                <th scope="col" className="text-right">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = status(p)
                const ratio = p.max_uses > 0 ? Math.min(100, (p.uses / p.max_uses) * 100) : 0
                return (
                  <tr key={p.id}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[13px] font-semibold tracking-wide text-white">{p.code}</span>
                        <CopyButton value={p.code} label={`Copier ${p.code}`} />
                      </span>
                    </td>
                    <td>
                      <Badge tone="brand">−{p.percent_off} %</Badge>
                    </td>
                    <td className="min-w-[9rem]">
                      <span className="num text-[12.5px] text-white/70">
                        {p.uses} / {p.max_uses === 0 ? '∞' : p.max_uses}
                      </span>
                      {p.max_uses > 0 ? (
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
                    <td className="num text-white/55">{formatDate(p.created_at)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="icon-btn cursor-pointer"
                          title={p.active ? 'Désactiver' : 'Réactiver'}
                          aria-label={`${p.active ? 'Désactiver' : 'Réactiver'} ${p.code}`}
                          onClick={() => void toggleActive(p)}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d={
                                p.active
                                  ? 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636'
                                  : 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
                              }
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn cursor-pointer"
                          title="Modifier"
                          aria-label={`Modifier ${p.code}`}
                          onClick={() => setEditing(p)}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"
                            />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger cursor-pointer"
                          title="Supprimer"
                          aria-label={`Supprimer ${p.code}`}
                          onClick={() => void remove(p)}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14.74 9l-.346 9m-4.788 0L9.26 9M18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.1 48.1 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.1 48.1 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            />
                          </svg>
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
        <PromoForm
          onClose={() => setCreating(false)}
          onDone={async () => {
            setCreating(false)
            await load()
          }}
        />
      ) : null}

      {editing ? (
        <PromoForm
          promo={editing}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null)
            await load()
          }}
        />
      ) : null}
    </div>
  )
}

/** Création et édition partagent le même formulaire : mêmes règles, un seul endroit à corriger. */
function PromoForm({
  promo,
  onClose,
  onDone,
}: {
  promo?: PromoCodeRow
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const notify = useNotify()
  const isEdit = promo != null
  const [code, setCode] = useState(promo?.code ?? '')
  const [pct, setPct] = useState(promo?.percent_off ?? 10)
  const [maxUses, setMaxUses] = useState(promo?.max_uses ?? 0)
  const [active, setActive] = useState(promo?.active ?? true)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    const t = getToken()
    if (!t) return
    setBusy(true)
    try {
      if (isEdit) {
        await adminPatchPromo(t, promo.id, { percent_off: pct, max_uses: maxUses, active })
        notify('ok', `${promo.code} mis à jour.`)
      } else {
        await adminCreatePromo(t, {
          code: code.trim(),
          percent_off: pct,
          max_uses: maxUses,
          active,
          applicable_plans: [],
        })
        notify('ok', `Code ${code.trim()} créé.`)
      }
      await onDone()
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="admin-promo-title" width="max-w-md">
      <form className="p-5 sm:p-6" onSubmit={(e) => void submit(e)}>
        <h2 id="admin-promo-title" className="font-display text-base font-semibold text-white">
          {isEdit ? `Modifier ${promo.code}` : 'Nouveau code promo'}
        </h2>
        <p className="mt-1 text-[12.5px] text-white/45">
          {isEdit
            ? 'Le code lui-même ne peut pas être renommé : crée-en un nouveau si besoin.'
            : 'La réduction s’applique au paiement, sur tous les paliers payants.'}
        </p>

        <div className="mt-4 space-y-3.5">
          <div>
            <label htmlFor="promo-code" className="text-xs text-white/45">
              Code
            </label>
            <input
              id="promo-code"
              className="field mt-1 !min-h-[46px] font-mono tracking-wide"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s+/g, ''))}
              disabled={isEdit}
              required
              autoFocus={!isEdit}
              placeholder="BIENVENUE20"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="promo-pct" className="text-xs text-white/45">
                Réduction (%)
              </label>
              <input
                id="promo-pct"
                className="field mt-1 !min-h-[46px] tabular-nums"
                type="number"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => setPct(Number(e.target.value))}
              />
            </div>
            <div>
              <label htmlFor="promo-max" className="text-xs text-white/45">
                Utilisations max.
              </label>
              <input
                id="promo-max"
                className="field mt-1 !min-h-[46px] tabular-nums"
                type="number"
                min={0}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
              />
              <p className="mt-1 text-[11px] text-white/35">0 = illimité</p>
            </div>
          </div>

          <label className="switch-row">
            <input
              type="checkbox"
              className="switch-input sr-only"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            <span className="switch" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium text-white/88">Code actif</span>
              <span className="mt-0.5 block text-[11.5px] text-white/40">Utilisable immédiatement au paiement</span>
            </span>
          </label>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-quiet !min-h-[46px] cursor-pointer px-4 text-sm" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn-brand !min-h-[46px] cursor-pointer px-5 text-sm" disabled={busy || (!isEdit && !code.trim())}>
            {busy ? 'Envoi…' : isEdit ? 'Enregistrer' : 'Créer le code'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
