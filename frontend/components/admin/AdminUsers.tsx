'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  adminDeleteUser,
  adminGetUser,
  adminListUsers,
  adminPatchUser,
  type AdminStats,
  type AdminUserRow,
  type LiveRunListItem,
  type OfferConfigPayload,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  Badge,
  Drawer,
  EmptyState,
  ErrorBanner,
  Pagination,
  SearchInput,
  Segmented,
  SkeletonRows,
  SortHeader,
  usePagedList,
  useConfirm,
  useNotify,
  useSort,
} from '@/components/admin/ui'
import {
  emailInitials,
  formatClock,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPace,
  formatRelative,
  tierLabel,
  timeValue,
} from '@/components/admin/format'

const PAGE_SIZE = 25
const FETCH_CHUNK = 200

type SortKey = 'email' | 'plan' | 'created_at' | 'last_seen_at'
type RoleFilter = 'all' | 'admin' | 'user'

/** Ids de paliers connus, config offres d’abord, agrégat stats en repli. */
function planIds(offer: OfferConfigPayload | null, stats: AdminStats | null): string[] {
  if (offer?.tiers && Object.keys(offer.tiers).length > 0) return Object.keys(offer.tiers).sort()
  if (stats?.tier_order?.length) return stats.tier_order
  if (stats?.users_by_plan) return Object.keys(stats.users_by_plan).sort()
  return []
}

function planTone(id: string, offer: OfferConfigPayload | null, stats: AdminStats | null) {
  const price = offer?.prices_eur?.[id] ?? stats?.prices_eur?.[id] ?? 0
  return price > 0 ? ('brand' as const) : ('neutral' as const)
}

export function AdminUsers({
  meId,
  offerCfg,
  stats,
  onTotal,
}: {
  meId: string
  offerCfg: OfferConfigPayload | null
  stats: AdminStats | null
  /** Remonte l’effectif pour le compteur de la barre latérale. */
  onTotal?: (n: number) => void
}) {
  const notify = useNotify()
  const confirm = useConfirm()

  const [rows, setRows] = useState<AdminUserRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [err, setErr] = useState('')

  const [q, setQ] = useState('')
  const [role, setRole] = useState<RoleFilter>('all')
  const [plan, setPlan] = useState<string>('all')
  const { sort, onSort } = useSort<SortKey>('created_at', 'desc')

  const [openUser, setOpenUser] = useState<AdminUserRow | null>(null)

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const r = await adminListUsers(t, 0, FETCH_CHUNK)
      setRows(r.users ?? [])
      setTotal(r.total)
      onTotal?.(r.total)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [onTotal])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * L’API ne sait pas filtrer : on charge par tranches et on cherche côté client.
   * Tant que tout n’est pas chargé, la recherche ne porte que sur le chargé — le
   * pied de tableau le dit explicitement plutôt que de laisser croire à un vide.
   */
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

  const plans = planIds(offerCfg, stats)

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const out = rows.filter((u) => {
      if (role !== 'all' && u.role !== role) return false
      if (plan !== 'all' && u.plan !== plan) return false
      if (needle && !u.email.toLowerCase().includes(needle) && !u.id.includes(needle)) return false
      return true
    })
    const dir = sort.dir === 'asc' ? 1 : -1
    return out.sort((a, b) => {
      switch (sort.key) {
        case 'email':
          return a.email.localeCompare(b.email, 'fr') * dir
        case 'plan':
          return a.plan.localeCompare(b.plan, 'fr') * dir
        case 'last_seen_at':
          return (timeValue(a.last_seen_at) - timeValue(b.last_seen_at)) * dir
        default:
          return (timeValue(a.created_at) - timeValue(b.created_at)) * dir
      }
    })
  }, [rows, q, role, plan, sort])

  const { page, pageCount, setPage, slice, shown } = usePagedList(filtered, PAGE_SIZE)

  const adminCount = rows.filter((u) => u.role === 'admin').length

  function applyPatch(id: string, patch: Partial<AdminUserRow>) {
    setRows((list) => list.map((u) => (u.id === id ? { ...u, ...patch } : u)))
    setOpenUser((cur) => (cur && cur.id === id ? { ...cur, ...patch } : cur))
  }

  async function removeUser(u: AdminUserRow) {
    const ok = await confirm({
      title: `Supprimer ${u.email} ?`,
      body: (
        <>
          Le compte, le lien Strava, les objectifs et toutes les courses enregistrées seront effacés.{' '}
          <strong className="font-semibold text-white/85">Cette action est définitive.</strong>
        </>
      ),
      confirmLabel: 'Supprimer le compte',
      danger: true,
      requireText: 'SUPPRIMER',
    })
    if (!ok) return
    const t = getToken()
    if (!t) return
    try {
      await adminDeleteUser(t, u.id)
      setRows((list) => list.filter((x) => x.id !== u.id))
      setTotal((n) => Math.max(0, n - 1))
      setOpenUser(null)
      notify('ok', `${u.email} a été supprimé.`)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  return (
    <div className="space-y-4">
      {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput
          value={q}
          onChange={setQ}
          label="Rechercher un utilisateur"
          placeholder="Rechercher par e-mail ou identifiant…"
          className="lg:max-w-sm lg:flex-1"
        />
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<RoleFilter>
            value={role}
            onChange={setRole}
            label="Filtrer par rôle"
            className="!max-w-none"
            options={[
              { id: 'all', label: 'Tous', count: rows.length },
              { id: 'admin', label: 'Admin', count: adminCount },
              { id: 'user', label: 'Membres', count: rows.length - adminCount },
            ]}
          />
          {plans.length > 0 ? (
            <>
              <label htmlFor="admin-plan-filter" className="sr-only">
                Filtrer par offre
              </label>
              <select
                id="admin-plan-filter"
                className="field !min-h-[44px] !w-auto min-w-[9rem] py-2 text-[13px]"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              >
                <option value="all">Toutes les offres</option>
                {plans.map((p) => (
                  <option key={p} value={p}>
                    {tierLabel(p, offerCfg?.tier_display_names ?? stats?.tier_display_names)}
                  </option>
                ))}
              </select>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <SkeletonRows rows={8} height={48} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Aucun compte ne correspond"
          body={
            rows.length < total
              ? `La recherche porte sur les ${rows.length} comptes chargés sur ${total}. Charge la suite pour élargir.`
              : 'Modifie la recherche ou retire les filtres.'
          }
          action={
            rows.length < total ? (
              <button type="button" className="btn-quiet cursor-pointer px-4 text-sm" onClick={() => void loadMore()}>
                Charger {Math.min(FETCH_CHUNK, total - rows.length)} comptes de plus
              </button>
            ) : null
          }
        />
      ) : (
        <>
          <div className="table-wrap max-h-[calc(100dvh-19rem)]">
            <table className="data-table min-w-[900px]">
              <thead>
                <tr>
                  <SortHeader id="email" label="Compte" sort={sort} onSort={onSort} />
                  <th scope="col">Rôle</th>
                  <SortHeader id="plan" label="Offre" sort={sort} onSort={onSort} />
                  <th scope="col">Strava</th>
                  <SortHeader id="created_at" label="Inscrit le" sort={sort} onSort={onSort} />
                  <SortHeader id="last_seen_at" label="Vu" sort={sort} onSort={onSort} />
                  <th scope="col" className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {slice.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <button
                        type="button"
                        className="flex min-w-0 max-w-full cursor-pointer items-center gap-2.5 text-left"
                        onClick={() => setOpenUser(u)}
                      >
                        <span className="nav-avatar !h-8 !w-8 !rounded-[10px] !text-[11px]" aria-hidden>
                          {emailInitials(u.email)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-white hover:underline">{u.email}</span>
                          {u.id === meId ? <span className="text-[11px] text-white/35">c’est toi</span> : null}
                        </span>
                      </button>
                    </td>
                    <td>
                      {u.role === 'admin' ? (
                        <Badge tone="ice" dot>
                          Admin
                        </Badge>
                      ) : (
                        <span className="text-white/45">Membre</span>
                      )}
                    </td>
                    <td>
                      <Badge tone={planTone(u.plan, offerCfg, stats)}>
                        {tierLabel(u.plan, offerCfg?.tier_display_names ?? stats?.tier_display_names)}
                      </Badge>
                    </td>
                    <td>
                      {u.strava_linked ? (
                        <Badge tone="ok" dot>
                          Lié
                        </Badge>
                      ) : (
                        <span className="text-white/30">—</span>
                      )}
                    </td>
                    <td className="num text-white/55">{formatDate(u.created_at)}</td>
                    <td className="num text-white/55" title={u.last_seen_at ? formatDateTime(u.last_seen_at) : undefined}>
                      {formatRelative(u.last_seen_at)}
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          className="icon-btn cursor-pointer"
                          title="Ouvrir la fiche"
                          aria-label={`Ouvrir la fiche de ${u.email}`}
                          onClick={() => setOpenUser(u)}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger cursor-pointer disabled:pointer-events-none disabled:opacity-25"
                          title={u.id === meId ? 'Impossible de supprimer son propre compte' : 'Supprimer le compte'}
                          aria-label={`Supprimer ${u.email}`}
                          disabled={u.id === meId}
                          onClick={() => void removeUser(u)}
                        >
                          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.1 48.1 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.1 48.1 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} shown={shown} />
            {rows.length < total ? (
              <button
                type="button"
                className="btn-quiet cursor-pointer px-3 py-2 text-[13px]"
                onClick={() => void loadMore()}
                disabled={loadingMore}
              >
                {loadingMore ? 'Chargement…' : `Charger la suite (${rows.length} / ${total})`}
              </button>
            ) : null}
          </div>
        </>
      )}

      {openUser ? (
        <UserDrawer
          user={openUser}
          isSelf={openUser.id === meId}
          offerCfg={offerCfg}
          stats={stats}
          onClose={() => setOpenUser(null)}
          onPatched={applyPatch}
          onDelete={() => void removeUser(openUser)}
        />
      ) : null}
    </div>
  )
}

/* ——— Fiche utilisateur ——— */

function UserDrawer({
  user,
  isSelf,
  offerCfg,
  stats,
  onClose,
  onPatched,
  onDelete,
}: {
  user: AdminUserRow
  isSelf: boolean
  offerCfg: OfferConfigPayload | null
  stats: AdminStats | null
  onClose: () => void
  onPatched: (id: string, patch: Partial<AdminUserRow>) => void
  onDelete: () => void
}) {
  const notify = useNotify()
  const [runs, setRuns] = useState<LiveRunListItem[] | null>(null)
  const [runsTotal, setRunsTotal] = useState<number | null>(null)
  const [goalsCount, setGoalsCount] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')

  const [role, setRole] = useState(user.role)
  const [plan, setPlan] = useState(user.plan)
  const [saving, setSaving] = useState(false)

  const dirty = role !== user.role || plan !== user.plan
  const plans = planIds(offerCfg, stats)
  const planOptions = plans.length > 0 ? plans : [user.plan].filter(Boolean)

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const d = await adminGetUser(t, user.id)
      setRuns(d.live_runs ?? [])
      setRunsTotal(d.runs_count ?? 0)
      setGoalsCount(d.goals_count ?? 0)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoading(false)
    }
  }, [user.id])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    setRole(user.role)
    setPlan(user.plan)
  }, [user.id, user.role, user.plan])

  async function save() {
    const t = getToken()
    if (!t) return
    setSaving(true)
    try {
      const body: { role?: string; plan?: string } = {}
      if (role !== user.role) body.role = role
      if (plan !== user.plan) body.plan = plan
      const { user: updated } = await adminPatchUser(t, user.id, body)
      onPatched(user.id, {
        role: (updated.role as string) || role,
        plan: (updated.plan as string) || plan,
      })
      notify('ok', 'Compte mis à jour.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Enregistrement impossible')
    } finally {
      setSaving(false)
    }
  }

  const totalKm = (runs ?? []).reduce((acc, r) => acc + r.distance_m, 0) / 1000

  return (
    <Drawer onClose={onClose} labelledBy="admin-user-title">
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-white/[0.07] px-5 py-4 pt-safe">
        <div className="flex min-w-0 items-center gap-3">
          <span className="nav-avatar !h-11 !w-11 !rounded-2xl !text-sm" aria-hidden>
            {emailInitials(user.email)}
          </span>
          <div className="min-w-0">
            <h2 id="admin-user-title" className="truncate font-display text-base font-semibold text-white">
              {user.email}
            </h2>
            <p className="mt-0.5 truncate font-mono text-[11px] text-white/35">{user.id}</p>
          </div>
        </div>
        <button type="button" className="icon-btn cursor-pointer" onClick={onClose} aria-label="Fermer la fiche">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-safe">
        {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <FactTile label="Courses" value={runsTotal != null ? formatNumber(runsTotal) : '—'} />
          <FactTile label="Objectifs" value={goalsCount != null ? formatNumber(goalsCount) : '—'} />
          <FactTile label="Volume listé" value={runs ? `${formatNumber(totalKm, 1)} km` : '—'} />
          <FactTile label="Strava" value={user.strava_linked ? 'Lié' : 'Non lié'} />
        </div>

        {/* Droits et offre : le seul endroit d’où l’on modifie un compte. */}
        <section className="panel p-4">
          <h3 className="font-display text-[14px] font-semibold text-white">Droits & offre</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="admin-user-role" className="text-xs text-white/45">
                Rôle
              </label>
              <select
                id="admin-user-role"
                className="field mt-1 !min-h-[44px] py-2 text-[13.5px]"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                disabled={isSelf}
              >
                <option value="user">Membre</option>
                <option value="admin">Administrateur</option>
              </select>
              {isSelf ? <p className="mt-1 text-[11px] text-white/35">Tu ne peux pas modifier ton propre rôle.</p> : null}
            </div>
            <div>
              <label htmlFor="admin-user-plan" className="text-xs text-white/45">
                Offre
              </label>
              <select
                id="admin-user-plan"
                className="field mt-1 !min-h-[44px] py-2 text-[13.5px]"
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
              >
                {planOptions.map((p) => (
                  <option key={p} value={p}>
                    {tierLabel(p, offerCfg?.tier_display_names ?? stats?.tier_display_names)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              className="btn-brand !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
              disabled={!dirty || saving}
              onClick={() => void save()}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
            {dirty ? (
              <button
                type="button"
                className="btn-quiet !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
                onClick={() => {
                  setRole(user.role)
                  setPlan(user.plan)
                }}
              >
                Annuler
              </button>
            ) : null}
          </div>
        </section>

        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-[14px] font-semibold text-white">Courses GPS enregistrées</h3>
            <p className="text-[11.5px] text-white/35">
              Inscrit {formatDate(user.created_at)} · vu {formatRelative(user.last_seen_at)}
            </p>
          </div>

          {loading ? (
            <div className="mt-3">
              <SkeletonRows rows={4} height={40} />
            </div>
          ) : runs && runs.length > 0 ? (
            <>
              <div className="table-wrap mt-3">
                <table className="data-table min-w-[560px]">
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Distance</th>
                      <th scope="col">Mouvement</th>
                      <th scope="col">Allure</th>
                      <th scope="col">Splits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id}>
                        <td className="text-[12.5px] text-white/60">{formatDateTime(r.created_at)}</td>
                        <td className="num">{formatNumber(r.distance_m / 1000, 2)} km</td>
                        <td className="num" title={`Horloge totale : ${formatClock(r.wall_sec)}`}>
                          {formatClock(r.moving_sec)}
                        </td>
                        <td className="num">{formatPace(r.avg_pace_sec_per_km)}</td>
                        <td className="num text-white/55">{r.split_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11.5px] leading-snug text-white/38">
                Allure = temps en mouvement ÷ distance GPS. Sur les sorties très courtes, la mesure du téléphone reste
                approximative.
                {runsTotal != null && runs.length < runsTotal
                  ? ` Affichage des ${runs.length} dernières courses sur ${runsTotal}.`
                  : ''}
              </p>
            </>
          ) : (
            <div className="mt-3">
              <EmptyState title="Aucune course enregistrée" body="Ce compte n’a pas encore lancé de course GPS depuis l’app." />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-red-500/20 bg-red-500/[0.05] p-4">
          <h3 className="text-[13.5px] font-semibold text-red-100">Zone sensible</h3>
          <p className="mt-1 text-[12.5px] leading-snug text-red-100/60">
            La suppression efface le compte et toutes ses données associées. Elle ne peut pas être annulée.
          </p>
          <button
            type="button"
            disabled={isSelf}
            onClick={onDelete}
            className="mt-3 inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[14px] border border-red-500/40 bg-red-500/10 px-4 text-[13.5px] font-semibold text-red-100 transition hover:bg-red-500/20 disabled:pointer-events-none disabled:opacity-40"
          >
            Supprimer ce compte
          </button>
        </section>
      </div>
    </Drawer>
  )
}

function FactTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.13em] text-white/40">{label}</p>
      <p className="mt-1 font-display text-[17px] font-semibold tabular-nums text-white">{value}</p>
    </div>
  )
}
