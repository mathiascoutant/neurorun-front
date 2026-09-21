'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminGetBetaConfig,
  adminListUsers,
  adminPatchUser,
  adminPutBetaConfig,
  type AdminUserRow,
  type BetaConfigPayload,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  Badge,
  EmptyState,
  ErrorBanner,
  Pagination,
  SearchInput,
  SectionHead,
  Segmented,
  SkeletonRows,
  Switch,
  usePagedList,
  useConfirm,
  useNotify,
} from '@/components/admin/ui'
import { emailInitials, formatRelative } from '@/components/admin/format'

const PAGE_SIZE = 25
const FETCH_CHUNK = 200

type Filter = 'all' | 'allowed' | 'blocked'

/**
 * Avant-première : qui peut entrer dans NeuroRun pendant que l’app reste publiée.
 *
 * L’app iOS n’a rien à savoir de tout ça. Le serveur refuse la connexion des comptes non
 * invités en renvoyant le message écrit ici, et l’app l’affiche tel quel dans son bandeau
 * d’erreur — c’est ce qui permet d’ouvrir et de fermer l’accès sans repasser par Apple.
 */
export function AdminBeta({ meId, onTotal }: { meId: string; onTotal?: (n: number) => void }) {
  const notify = useNotify()
  const confirm = useConfirm()

  const [cfg, setCfg] = useState<BetaConfigPayload | null>(null)
  const [draft, setDraft] = useState<{ enabled: boolean; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [err, setErr] = useState('')

  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    const [c, u] = await Promise.allSettled([adminGetBetaConfig(t), adminListUsers(t, 0, FETCH_CHUNK)])
    if (c.status === 'fulfilled') {
      setCfg(c.value)
      setDraft({ enabled: c.value.enabled, message: c.value.message })
    } else {
      setErr(c.reason instanceof Error ? c.reason.message : 'Configuration indisponible')
    }
    if (u.status === 'fulfilled') {
      setRows(u.value.users ?? [])
      setTotal(u.value.total)
    } else if (c.status === 'fulfilled') {
      setErr(u.reason instanceof Error ? u.reason.message : 'Comptes indisponibles')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const allowedCount = useMemo(
    () => rows.filter((u) => u.beta_access || u.role === 'admin').length,
    [rows],
  )

  useEffect(() => {
    onTotal?.(allowedCount)
  }, [allowedCount, onTotal])

  /* Même logique que l’onglet Utilisateurs : l’API ne filtre pas, on charge par tranches. */
  async function loadMore() {
    const t = getToken()
    if (!t) return
    setLoadingMore(true)
    try {
      const r = await adminListUsers(t, rows.length, FETCH_CHUNK)
      setRows((list) => [...list, ...(r.users ?? [])])
      setTotal(r.total)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Chargement impossible')
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows
      .filter((u) => {
        const allowed = Boolean(u.beta_access) || u.role === 'admin'
        if (filter === 'allowed' && !allowed) return false
        if (filter === 'blocked' && allowed) return false
        if (needle && !u.email.toLowerCase().includes(needle) && !u.id.includes(needle)) return false
        return true
      })
      .sort((a, b) => {
        /* Les invités d’abord : c’est la liste qu’on vient vérifier. */
        const aOn = Number(Boolean(a.beta_access) || a.role === 'admin')
        const bOn = Number(Boolean(b.beta_access) || b.role === 'admin')
        if (aOn !== bOn) return bOn - aOn
        return a.email.localeCompare(b.email, 'fr')
      })
  }, [rows, q, filter])

  const { page, pageCount, setPage, slice, shown } = usePagedList(filtered, PAGE_SIZE)

  const dirty =
    cfg != null && draft != null && (draft.enabled !== cfg.enabled || draft.message !== cfg.message)

  async function saveConfig() {
    const t = getToken()
    if (!t || !draft) return
    /* Fermer l’accès met tout le monde dehors, y compris les sessions ouvertes : on le dit. */
    if (draft.enabled && !cfg?.enabled) {
      const ok = await confirm({
        title: 'Activer l’avant-première ?',
        body: (
          <>
            Seuls les <strong className="font-semibold text-white/85">{allowedCount} comptes invités</strong> et les
            administrateurs pourront se connecter. Les sessions déjà ouvertes dans l’app seront fermées au prochain
            appel, et les nouvelles inscriptions seront refusées.
          </>
        ),
        confirmLabel: 'Activer',
      })
      if (!ok) return
    }
    setSaving(true)
    try {
      const out = await adminPutBetaConfig(t, draft)
      setCfg(out)
      setDraft({ enabled: out.enabled, message: out.message })
      notify('ok', out.enabled ? 'Avant-première activée.' : 'Accès rouvert à tout le monde.')
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur'
      setErr(message)
      notify('error', message)
    } finally {
      setSaving(false)
    }
  }

  async function toggleUser(u: AdminUserRow, allowed: boolean) {
    const t = getToken()
    if (!t) return
    setBusyId(u.id)
    try {
      await adminPatchUser(t, u.id, { beta_access: allowed })
      setRows((list) => list.map((x) => (x.id === u.id ? { ...x, beta_access: allowed } : x)))
      notify('ok', allowed ? `${u.email} est invité.` : `${u.email} n’a plus accès.`)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Modification impossible')
    } finally {
      setBusyId('')
    }
  }

  if (loading && !cfg) {
    return <SkeletonRows rows={5} height={64} />
  }

  const remaining = Math.max(0, total - rows.length)
  const maxLen = cfg?.message_max_len ?? 280

  return (
    <div className="space-y-5">
      {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

      <section className="panel p-5">
        <SectionHead
          title="Accès à l’application"
          subtitle="Ferme NeuroRun à tout le monde sauf aux comptes invités — sans nouvelle version sur l’App Store."
          action={
            <Badge tone={draft?.enabled ? 'warn' : 'ok'} dot>
              {draft?.enabled ? 'Accès restreint' : 'Ouvert à tous'}
            </Badge>
          }
        />

        <div className="mt-5">
          <Switch
            checked={draft?.enabled ?? false}
            onChange={(v) => setDraft((d) => (d ? { ...d, enabled: v } : d))}
            label="Activer l’avant-première"
            hint="Les administrateurs gardent toujours accès à cette console."
          />
        </div>

        <div className="mt-5">
          <label htmlFor="beta-message" className="text-xs text-white/45">
            Message affiché aux comptes non invités
          </label>
          <textarea
            id="beta-message"
            rows={3}
            maxLength={maxLen}
            className="field mt-1 !min-h-[92px] resize-y py-2.5 leading-snug"
            value={draft?.message ?? ''}
            onChange={(e) => setDraft((d) => (d ? { ...d, message: e.target.value } : d))}
          />
          <p className="mt-1.5 text-[12px] text-white/35">
            Repris tel quel par l’app et par le site sur l’écran de connexion.{' '}
            <span className="tabular-nums">
              {(draft?.message ?? '').length} / {maxLen}
            </span>
          </p>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="btn-brand !min-h-[44px] cursor-pointer px-5 text-[13.5px] disabled:pointer-events-none disabled:opacity-40"
            disabled={!dirty || saving}
            onClick={() => void saveConfig()}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          {dirty ? (
            <button
              type="button"
              className="btn-quiet !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
              disabled={saving}
              onClick={() => cfg && setDraft({ enabled: cfg.enabled, message: cfg.message })}
            >
              Annuler
            </button>
          ) : (
            <p className="text-[12.5px] text-white/35">Effet immédiat, à quelques secondes de cache près.</p>
          )}
        </div>

        {draft?.enabled ? (
          <div className="app-note mt-5">
            <span>
              Pense à inviter le compte de démonstration déclaré dans App Store Connect : si Apple réexamine
              l’application avec un compte bloqué, la soumission est refusée.
            </span>
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        <SectionHead
          title="Invités"
          subtitle="Coche les comptes qui peuvent entrer pendant l’avant-première."
        />

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchInput
            value={q}
            onChange={setQ}
            label="Rechercher un compte à inviter"
            placeholder="Rechercher par e-mail ou identifiant…"
            className="lg:max-w-sm lg:flex-1"
          />
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            label="Filtrer l’accès"
            className="!max-w-none"
            options={[
              { id: 'all', label: 'Tous', count: rows.length },
              { id: 'allowed', label: 'Invités', count: allowedCount },
              { id: 'blocked', label: 'Bloqués', count: rows.length - allowedCount },
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title="Aucun compte ne correspond"
            body={
              remaining > 0
                ? `La recherche porte sur les ${rows.length} comptes chargés sur ${total}. Charge la suite pour élargir.`
                : 'Modifie la recherche ou retire le filtre.'
            }
            action={
              remaining > 0 ? (
                <button type="button" className="btn-quiet cursor-pointer px-4 text-sm" onClick={() => void loadMore()}>
                  Charger {Math.min(FETCH_CHUNK, remaining)} comptes de plus
                </button>
              ) : null
            }
          />
        ) : (
          <>
            <div className="table-wrap max-h-[calc(100dvh-26rem)]">
              <table className="data-table min-w-[640px]">
                <thead>
                  <tr>
                    <th scope="col">Compte</th>
                    <th scope="col">Vu</th>
                    <th scope="col" className="text-right">
                      Accès
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((u) => {
                    const isAdmin = u.role === 'admin'
                    return (
                      <tr key={u.id}>
                        <td>
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span className="nav-avatar !h-8 !w-8 !rounded-[10px] !text-[11px]" aria-hidden>
                              {emailInitials(u.email)}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-white">{u.email}</span>
                              {isAdmin ? (
                                <span className="text-[11px] text-white/35">
                                  Admin{u.id === meId ? ' — c’est toi' : ''} · accès permanent
                                </span>
                              ) : null}
                            </span>
                          </div>
                        </td>
                        <td className="text-white/45">{formatRelative(u.last_seen_at)}</td>
                        <td className="text-right">
                          {isAdmin ? (
                            <Badge tone="ice">Toujours autorisé</Badge>
                          ) : (
                            <label className="inline-flex cursor-pointer items-center justify-end gap-2.5">
                              <span className="text-[12.5px] text-white/45">
                                {u.beta_access ? 'Invité' : 'Bloqué'}
                              </span>
                              <input
                                type="checkbox"
                                className="switch-input sr-only"
                                checked={Boolean(u.beta_access)}
                                disabled={busyId === u.id}
                                onChange={(e) => void toggleUser(u, e.target.checked)}
                              />
                              <span className="switch" aria-hidden />
                            </label>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} shown={shown} />
              {remaining > 0 ? (
                <button
                  type="button"
                  className="btn-quiet cursor-pointer px-4 text-[13px]"
                  disabled={loadingMore}
                  onClick={() => void loadMore()}
                >
                  {loadingMore ? 'Chargement…' : `Charger ${Math.min(FETCH_CHUNK, remaining)} comptes de plus`}
                </button>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
