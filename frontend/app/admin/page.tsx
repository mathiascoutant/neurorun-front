'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import { Mark } from '@/components/Mark'
import {
  adminCreatePromo,
  adminDeletePromo,
  adminDeleteUser,
  adminDeleteCircuit,
  adminDeleteCircuitTime,
  adminGetOfferConfig,
  adminGetUser,
  adminListCircuitTimes,
  adminListCircuits,
  adminListPromos,
  adminListUsers,
  adminPatchCircuit,
  adminPatchPromo,
  adminPatchUser,
  adminPutOfferConfig,
  adminSearchCircuitTimesByUser,
  adminStats,
  ApiError,
  type AdminStats,
  type AdminUserRow,
  type LiveRunListItem,
  type AdminCircuitTimeRow,
  type CircuitSummary,
  type OfferConfigPayload,
  type PromoCodeRow,
  fetchMe,
  type MeUser,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

type Tab = 'stats' | 'users' | 'promos' | 'offers' | 'circuits'

const PLANS = ['standard', 'strava', 'performance'] as const
const ROLES = ['user', 'admin'] as const

function formatRunClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return '0:00'
  const s = Math.floor(totalSec)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${r.toString().padStart(2, '0')}`
  }
  return `${m}:${r.toString().padStart(2, '0')}`
}

function formatRunPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

function formatRunWhen(iso: string): string {
  try {
    const d = new Date(iso)
    return d.toLocaleString('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export default function AdminPage() {
  const router = useRouter()
  const [me, setMe] = useState<MeUser | null>(null)
  const [tab, setTab] = useState<Tab>('stats')
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [usersTotal, setUsersTotal] = useState(0)
  const [promos, setPromos] = useState<PromoCodeRow[]>([])
  const [offerCfg, setOfferCfg] = useState<OfferConfigPayload | null>(null)
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null)
  const [editRole, setEditRole] = useState('')
  const [editPlan, setEditPlan] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [inspectUser, setInspectUser] = useState<AdminUserRow | null>(null)
  const [inspectRuns, setInspectRuns] = useState<LiveRunListItem[] | null>(null)
  const [inspectRunsTotal, setInspectRunsTotal] = useState<number | null>(null)
  const [inspectGoalsCount, setInspectGoalsCount] = useState<number | null>(null)
  const [inspectLoading, setInspectLoading] = useState(false)
  const [circuitQ, setCircuitQ] = useState('')
  const [circuitList, setCircuitList] = useState<(CircuitSummary & { created_by?: string })[]>([])
  const [circuitTotal, setCircuitTotal] = useState(0)
  const [circuitPick, setCircuitPick] = useState<string | null>(null)
  const [circuitTimes, setCircuitTimes] = useState<AdminCircuitTimeRow[]>([])
  const [circuitTimesTotal, setCircuitTimesTotal] = useState(0)
  const [searchFn, setSearchFn] = useState('')
  const [searchLn, setSearchLn] = useState('')
  const [searchTimes, setSearchTimes] = useState<AdminCircuitTimeRow[]>([])
  const [searchTotal, setSearchTotal] = useState(0)
  const [editCircuitName, setEditCircuitName] = useState('')

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.replace('/login/?next=/admin/')
      return
    }
    ;(async () => {
      try {
        const u = await fetchMe(t)
        if (u.role !== 'admin') {
          router.replace('/dashboard/')
          return
        }
        setMe(u)
      } catch {
        clearToken()
        router.replace('/login/?next=/admin/')
      } finally {
        setLoading(false)
      }
    })()
  }, [router])

  useEffect(() => {
    if (!me || me.role !== 'admin') return
    const t = getToken()
    if (!t) return
    setErr('')
    ;(async () => {
      try {
        if (tab === 'stats') {
          const s = await adminStats(t)
          setStats(s)
        } else if (tab === 'users') {
          const r = await adminListUsers(t, 0, 80)
          setUsers(r.users ?? [])
          setUsersTotal(r.total)
        } else if (tab === 'promos') {
          const r = await adminListPromos(t)
          setPromos(r.promo_codes ?? [])
        } else if (tab === 'offers') {
          const c = await adminGetOfferConfig(t)
          setOfferCfg(c)
        } else if (tab === 'circuits') {
          const r = await adminListCircuits(t, '', 0, 120)
          setCircuitList(r.circuits ?? [])
          setCircuitTotal(r.total)
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur')
      }
    })()
  }, [me, tab])

  useEffect(() => {
    if (!me || tab !== 'circuits' || !circuitPick) {
      setCircuitTimes([])
      setCircuitTimesTotal(0)
      return
    }
    const t = getToken()
    if (!t) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await adminListCircuitTimes(t, circuitPick, 0, 500)
        if (!cancelled) {
          setCircuitTimes(r.times ?? [])
          setCircuitTimesTotal(r.total)
        }
      } catch {
        if (!cancelled) setCircuitTimes([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [me, tab, circuitPick])

  async function refreshCircuitList() {
    const t = getToken()
    if (!t) return
    setErr('')
    try {
      const r = await adminListCircuits(t, circuitQ, 0, 120)
      setCircuitList(r.circuits ?? [])
      setCircuitTotal(r.total)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function runUserTimeSearch() {
    const t = getToken()
    if (!t) return
    setErr('')
    try {
      const r = await adminSearchCircuitTimesByUser(t, searchFn, searchLn, 0, 100)
      setSearchTimes(r.times ?? [])
      setSearchTotal(r.total)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    }
  }

  async function saveOffers(e: FormEvent) {
    e.preventDefault()
    if (!offerCfg) return
    const t = getToken()
    if (!t) return
    setErr('')
    try {
      const out = await adminPutOfferConfig(t, offerCfg)
      setOfferCfg(out)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    }
  }

  function toggleTier(
    tier: string,
    key: keyof OfferConfigPayload['tiers'][string],
    value: boolean,
  ) {
    setOfferCfg((prev) => {
      if (!prev) return prev
      const tiers = { ...prev.tiers }
      const cur = tiers[tier] ?? {
        coach_chat: false,
        strava_dashboard: false,
        goals: false,
        live_runs: false,
        forecast: false,
        circuit: false,
        circuit_tracks: false,
      }
      tiers[tier] = { ...cur, [key]: value }
      return { ...prev, tiers }
    })
  }

  function openEditUser(u: AdminUserRow) {
    setEditUser(u)
    setEditRole(u.role)
    setEditPlan(u.plan)
  }

  function closeInspectUser() {
    setInspectUser(null)
    setInspectRuns(null)
    setInspectRunsTotal(null)
    setInspectGoalsCount(null)
    setInspectLoading(false)
  }

  async function openInspectUser(u: AdminUserRow) {
    const t = getToken()
    if (!t) return
    setInspectUser(u)
    setInspectRuns(null)
    setInspectRunsTotal(null)
    setInspectGoalsCount(null)
    setInspectLoading(true)
    setErr('')
    try {
      const d = await adminGetUser(t, u.id)
      setInspectRuns(d.live_runs ?? [])
      setInspectRunsTotal(d.runs_count ?? 0)
      setInspectGoalsCount(d.goals_count ?? 0)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
      closeInspectUser()
    } finally {
      setInspectLoading(false)
    }
  }

  async function submitEditUser(e: FormEvent) {
    e.preventDefault()
    if (!editUser) return
    const t = getToken()
    if (!t) return
    setEditBusy(true)
    setErr('')
    try {
      const body: { role?: string; plan?: string } = {}
      if (editRole !== editUser.role) body.role = editRole
      if (editPlan !== editUser.plan) body.plan = editPlan
      if (Object.keys(body).length === 0) {
        setEditUser(null)
        return
      }
      const { user } = await adminPatchUser(t, editUser.id, body)
      setUsers((list) =>
        list.map((x) =>
          x.id === user.id
            ? {
                ...x,
                role: (user.role as string) || x.role,
                plan: (user.plan as string) || x.plan,
              }
            : x,
        ),
      )
      setEditUser(null)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setEditBusy(false)
    }
  }

  async function deleteUser(u: AdminUserRow) {
    if (u.id === me?.id) return
    if (!window.confirm(`Supprimer définitivement ${u.email} ? Données Strava/objectifs/courses associées seront effacées.`)) return
    const t = getToken()
    if (!t) return
    try {
      await adminDeleteUser(t, u.id)
      setUsers((list) => list.filter((x) => x.id !== u.id))
      setUsersTotal((n) => Math.max(0, n - 1))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Erreur')
    }
  }

  if (loading || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  const maxSignup = Math.max(1, ...(stats?.signups_by_day?.map((d) => d.count) ?? [1]))

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06] bg-surface-0/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link href="/dashboard/">
            <Mark />
          </Link>
          <nav className="flex flex-wrap gap-2">
            {(['stats', 'users', 'promos', 'offers', 'circuits'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium ${
                  tab === id ? 'bg-brand-orange/25 text-white ring-1 ring-brand-orange/40' : 'btn-quiet'
                }`}
              >
                {id === 'stats' && 'Stats'}
                {id === 'users' && 'Utilisateurs'}
                {id === 'promos' && 'Codes promo'}
                {id === 'offers' && 'Offres'}
                {id === 'circuits' && 'Parcours'}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-5 py-10">
        {err ? (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {err}
          </div>
        ) : null}

        {tab === 'stats' && stats ? (
          <div className="space-y-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="panel p-5">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Utilisateurs</p>
                <p className="mt-2 font-display text-3xl font-semibold text-white">{stats.users_total}</p>
              </div>
              <div className="panel p-5">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Inscriptions 7 j.</p>
                <p className="mt-2 font-display text-3xl font-semibold text-white">{stats.users_last_7d}</p>
              </div>
              <div className="panel p-5">
                <p className="text-[10px] uppercase tracking-wider text-white/40">MRR estimé (€/mois)</p>
                <p className="mt-2 font-display text-3xl font-semibold text-brand-ice">
                  {stats.mrr_estimated_eur != null ? stats.mrr_estimated_eur.toFixed(2) : '—'}
                </p>
                <p className="mt-1 text-[10px] text-white/35">
                  Strava × {stats.subscribers_strava ?? stats.users_plan_strava} + Perf. ×{' '}
                  {stats.subscribers_performance ?? stats.users_plan_performance}
                </p>
              </div>
              <div className="panel p-5">
                <p className="text-[10px] uppercase tracking-wider text-white/40">Par offre</p>
                <ul className="mt-3 space-y-1 text-sm text-white/70">
                  <li>Standard : {stats.users_plan_standard}</li>
                  <li>Strava : {stats.users_plan_strava}</li>
                  <li>Performance : {stats.users_plan_performance}</li>
                </ul>
              </div>
            </div>

            {stats.signups_by_day && stats.signups_by_day.length > 0 ? (
              <div className="panel p-6">
                <h2 className="font-display text-lg font-semibold text-white">Inscriptions par jour (30 j., UTC)</h2>
                <div className="mt-4 flex h-36 items-end gap-0.5 overflow-x-auto pb-1">
                  {stats.signups_by_day.map((d) => (
                    <div
                      key={d.day}
                      className="group flex min-w-[10px] flex-1 flex-col items-center justify-end"
                      title={`${d.day} : ${d.count}`}
                    >
                      <div
                        className="w-full min-w-[6px] rounded-t bg-brand-orange/70 transition-colors group-hover:bg-brand-orange"
                        style={{ height: `${Math.max(4, (d.count / maxSignup) * 100)}%` }}
                      />
                    </div>
                  ))}
                </div>
                <p className="mt-2 text-[10px] text-white/35">
                  Début : {stats.signups_by_day[0]?.day} — fin :{' '}
                  {stats.signups_by_day[stats.signups_by_day.length - 1]?.day}
                </p>
              </div>
            ) : null}

            {stats.top_active_users && stats.top_active_users.length > 0 ? (
              <div className="panel overflow-x-auto p-6">
                <h2 className="font-display text-lg font-semibold text-white">Utilisateurs les plus actifs</h2>
                <p className="mt-1 text-xs text-white/45">
                  Score = courses live + objectifs + conversations (indicateur d’usage du produit).
                </p>
                <table className="mt-4 w-full min-w-[520px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
                      <th className="py-2 pr-4">Email</th>
                      <th className="py-2 pr-4">Score</th>
                      <th className="py-2 pr-4">Live</th>
                      <th className="py-2 pr-4">Objectifs</th>
                      <th className="py-2">Chat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.top_active_users.map((u) => (
                      <tr key={u.user_id} className="border-b border-white/[0.04] text-white/80">
                        <td className="py-2.5 pr-4">{u.email || u.user_id}</td>
                        <td className="py-2.5 pr-4 font-medium text-white">{u.activity}</td>
                        <td className="py-2.5 pr-4">{u.live_runs}</td>
                        <td className="py-2.5 pr-4">{u.goals}</td>
                        <td className="py-2.5">{u.conversations}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-white/45">Pas encore assez d’activité pour un classement.</p>
            )}
          </div>
        ) : null}

        {tab === 'users' ? (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Offre</th>
                  <th className="px-4 py-3">Strava</th>
                  <th className="px-4 py-3">Créé</th>
                  <th className="px-4 py-3">Dernière connexion</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.04] text-white/80">
                    <td className="px-4 py-2.5">
                      <button
                        type="button"
                        className="text-left text-brand-ice hover:underline"
                        onClick={() => void openInspectUser(u)}
                      >
                        {u.email}
                      </button>
                    </td>
                    <td className="px-4 py-2.5">{u.role}</td>
                    <td className="px-4 py-2.5">{u.plan}</td>
                    <td className="px-4 py-2.5">{u.strava_linked ? 'oui' : 'non'}</td>
                    <td className="px-4 py-2.5 text-xs text-white/45">
                      {new Date(u.created_at).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-white/45">
                      {u.last_seen_at
                        ? new Date(u.last_seen_at).toLocaleString('fr-FR', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button type="button" className="text-xs text-brand-ice hover:underline" onClick={() => openEditUser(u)}>
                        Modifier
                      </button>
                      {u.id !== me.id ? (
                        <button
                          type="button"
                          className="ml-3 text-xs text-red-300/90 hover:underline"
                          onClick={() => void deleteUser(u)}
                        >
                          Supprimer
                        </button>
                      ) : (
                        <span className="ml-3 text-[10px] text-white/30">(toi)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-white/[0.06] px-4 py-3 text-xs text-white/40">
              Total affiché : {users.length} / {usersTotal}
            </p>
          </div>
        ) : null}

        {tab === 'promos' ? (
          <div className="space-y-8">
            <PromoCreateForm
              onCreated={async () => {
                const t = getToken()
                if (!t) return
                const r = await adminListPromos(t)
                setPromos(r.promo_codes ?? [])
              }}
            />
            <div className="panel overflow-x-auto p-4">
              <PromoTable
                promos={promos}
                onRefresh={async () => {
                  const t = getToken()
                  if (!t) return
                  const r = await adminListPromos(t)
                  setPromos(r.promo_codes ?? [])
                }}
              />
            </div>
          </div>
        ) : null}

        {tab === 'offers' && offerCfg ? (
          <form className="space-y-8" onSubmit={saveOffers}>
            <p className="text-sm text-white/55">
              Ajuste les <strong className="text-white/80">fonctionnalités</strong> par palier ci-dessous. Les{' '}
              <strong className="text-white/80">prix</strong> ne concernent que les offres payantes (Strava et Performance) — le
              plan Standard reste gratuit ; ils sont saisis une seule fois en bas de page.
            </p>
            {PLANS.map((tier) => (
              <div key={tier} className="panel p-6">
                <h2 className="font-display text-lg font-semibold capitalize text-white">{tier}</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(
                    [
                      ['coach_chat', 'Coach IA (chat)'],
                      ['strava_dashboard', 'Strava / tableaux'],
                      ['goals', 'Objectifs & plans'],
                      ['live_runs', 'Course GPS (live)'],
                      ['forecast', 'Prévision course'],
                      ['circuit', 'Calendrier (objectif)'],
                      ['circuit_tracks', 'Parcours GPS + classements'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex cursor-pointer items-center gap-3 text-sm text-white/80">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-white/20 bg-surface-2"
                        checked={offerCfg.tiers[tier]?.[key] ?? false}
                        onChange={(e) => toggleTier(tier, key, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold text-white">Tarification mensuelle (€)</h2>
              <p className="mt-1 text-xs text-white/45">
                S’applique aux abonnements <span className="text-white/70">strava</span> et{' '}
                <span className="text-white/70">performance</span>. Le plan standard est à 0 €.
              </p>
              <div className="mt-4 flex flex-wrap gap-6">
                <div>
                  <label className="text-xs text-white/45">Offre Strava (€ / mois)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="field mt-1 max-w-[160px]"
                    value={offerCfg.prices_eur?.strava ?? ''}
                    onChange={(e) =>
                      setOfferCfg((prev) =>
                        prev
                          ? {
                              ...prev,
                              prices_eur: {
                                ...prev.prices_eur,
                                strava: parseFloat(e.target.value) || 0,
                              },
                            }
                          : prev,
                      )
                    }
                  />
                </div>
                <div>
                  <label className="text-xs text-white/45">Offre Performance (€ / mois)</label>
                  <input
                    type="number"
                    step="0.01"
                    className="field mt-1 max-w-[160px]"
                    value={offerCfg.prices_eur?.performance ?? ''}
                    onChange={(e) =>
                      setOfferCfg((prev) =>
                        prev
                          ? {
                              ...prev,
                              prices_eur: {
                                ...prev.prices_eur,
                                performance: parseFloat(e.target.value) || 0,
                              },
                            }
                          : prev,
                      )
                    }
                  />
                </div>
              </div>
            </div>

            <button type="submit" className="btn-brand">
              Enregistrer la configuration
            </button>
          </form>
        ) : null}

        {tab === 'circuits' ? (
          <div className="space-y-8">
            <div className="panel p-6">
              <h2 className="font-display text-lg font-semibold text-white">Parcours enregistrés</h2>
              <p className="mt-1 text-xs text-white/45">
                Recherche par nom, liste des temps, suppression d’un chrono douteux, renommage ou suppression d’un
                parcours.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <input
                  className="field max-w-xs flex-1"
                  placeholder="Filtrer par nom de parcours"
                  value={circuitQ}
                  onChange={(e) => setCircuitQ(e.target.value)}
                />
                <button type="button" className="btn-brand px-4 py-2 text-xs" onClick={() => void refreshCircuitList()}>
                  Rechercher
                </button>
              </div>
              <p className="mt-2 text-[10px] text-white/35">{circuitTotal} parcours</p>
              <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto text-sm">
                {circuitList.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        circuitPick === c.id ? 'border-brand-orange/45 bg-brand-orange/10' : 'border-white/10 bg-white/[0.03]'
                      }`}
                      onClick={() => {
                        setCircuitPick(c.id)
                        setEditCircuitName(c.name)
                      }}
                    >
                      <span className="font-medium text-white">{c.name}</span>
                      <span className="mt-0.5 block text-[10px] text-white/40">{c.id}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {circuitPick ? (
              <div className="panel p-6">
                <h3 className="font-display text-base font-semibold text-white">Modifier le parcours</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input
                    className="field max-w-md flex-1"
                    value={editCircuitName}
                    onChange={(e) => setEditCircuitName(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-brand px-4 py-2 text-xs"
                    onClick={async () => {
                      const t = getToken()
                      if (!t || !circuitPick) return
                      setErr('')
                      try {
                        await adminPatchCircuit(t, circuitPick, { name: editCircuitName })
                        await refreshCircuitList()
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : 'Erreur')
                      }
                    }}
                  >
                    Enregistrer le nom
                  </button>
                  <button
                    type="button"
                    className="rounded-xl border border-red-500/35 px-4 py-2 text-xs text-red-200/95 hover:bg-red-500/10"
                    onClick={async () => {
                      if (!circuitPick || !confirm('Supprimer ce parcours et tous les temps associés ?')) return
                      const t = getToken()
                      if (!t) return
                      setErr('')
                      try {
                        await adminDeleteCircuit(t, circuitPick)
                        setCircuitPick(null)
                        await refreshCircuitList()
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : 'Erreur')
                      }
                    }}
                  >
                    Supprimer le parcours
                  </button>
                </div>
                <h4 className="mt-6 text-sm font-semibold text-white/90">Tous les temps ({circuitTimesTotal})</h4>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] text-[11px] uppercase text-white/40">
                        <th className="py-2 pr-3">Temps</th>
                        <th className="py-2 pr-3">Coureur</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {circuitTimes.map((row) => (
                        <tr key={row.id} className="border-b border-white/[0.04] text-white/80">
                          <td className="py-2 pr-3 font-mono">{formatRunClock(Math.floor(row.duration_ms / 1000))}</td>
                          <td className="py-2 pr-3">{row.display_name ?? row.user_id}</td>
                          <td className="py-2 pr-3 text-xs text-white/50">{formatRunWhen(row.created_at)}</td>
                          <td className="py-2">
                            <button
                              type="button"
                              className="text-xs text-red-300/95 hover:underline"
                              onClick={async () => {
                                if (!confirm('Supprimer ce temps ?')) return
                                const t = getToken()
                                if (!t) return
                                try {
                                  await adminDeleteCircuitTime(t, row.id)
                                  const r = await adminListCircuitTimes(t, circuitPick!, 0, 500)
                                  setCircuitTimes(r.times ?? [])
                                  setCircuitTimesTotal(r.total)
                                } catch (e) {
                                  setErr(e instanceof Error ? e.message : 'Erreur')
                                }
                              }}
                            >
                              Supprimer
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="panel p-6">
              <h3 className="font-display text-base font-semibold text-white">Recherche par coureur</h3>
              <p className="mt-1 text-xs text-white/45">Prénom et/ou nom (contient, insensible à la casse).</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input
                  className="field w-40"
                  placeholder="Prénom"
                  value={searchFn}
                  onChange={(e) => setSearchFn(e.target.value)}
                />
                <input
                  className="field w-40"
                  placeholder="Nom"
                  value={searchLn}
                  onChange={(e) => setSearchLn(e.target.value)}
                />
                <button type="button" className="btn-brand px-4 py-2 text-xs" onClick={() => void runUserTimeSearch()}>
                  Chercher les temps
                </button>
              </div>
              <p className="mt-2 text-[10px] text-white/35">{searchTotal} résultat(s)</p>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[11px] uppercase text-white/40">
                      <th className="py-2 pr-3">Parcours</th>
                      <th className="py-2 pr-3">Temps</th>
                      <th className="py-2 pr-3">Personne</th>
                      <th className="py-2 pr-3">Date</th>
                      <th className="py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {searchTimes.map((row) => (
                      <tr key={row.id} className="border-b border-white/[0.04] text-white/80">
                        <td className="py-2 pr-3">{row.circuit_name || row.circuit_id}</td>
                        <td className="py-2 pr-3 font-mono">{formatRunClock(Math.floor(row.duration_ms / 1000))}</td>
                        <td className="py-2 pr-3 text-xs">
                          {row.display_name ?? '—'}
                          {row.email ? <span className="block text-white/40">{row.email}</span> : null}
                        </td>
                        <td className="py-2 pr-3 text-xs text-white/50">{formatRunWhen(row.created_at)}</td>
                        <td className="py-2">
                          <button
                            type="button"
                            className="text-xs text-red-300/95 hover:underline"
                            onClick={async () => {
                              if (!confirm('Supprimer ce temps ?')) return
                              const t = getToken()
                              if (!t) return
                              try {
                                await adminDeleteCircuitTime(t, row.id)
                                await runUserTimeSearch()
                                if (circuitPick === row.circuit_id) {
                                  const r = await adminListCircuitTimes(t, circuitPick, 0, 500)
                                  setCircuitTimes(r.times ?? [])
                                  setCircuitTimesTotal(r.total)
                                }
                              } catch (e) {
                                setErr(e instanceof Error ? e.message : 'Erreur')
                              }
                            }}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      {inspectUser ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-labelledby="admin-inspect-title"
        >
          <div className="panel flex max-h-[90vh] w-full max-w-3xl flex-col p-6">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.08] pb-4">
              <div>
                <h3 id="admin-inspect-title" className="font-display text-lg font-semibold text-white">
                  {inspectUser.email}
                </h3>
                <p className="mt-1 text-xs text-white/45">
                  Courses GPS enregistrées dans l’app (live) —{' '}
                  {inspectGoalsCount != null && inspectRunsTotal != null ? (
                    <>
                      {inspectRunsTotal} course{inspectRunsTotal !== 1 ? 's' : ''} au total · {inspectGoalsCount} objectif
                      {inspectGoalsCount !== 1 ? 's' : ''}
                    </>
                  ) : (
                    'chargement…'
                  )}
                </p>
              </div>
              <button type="button" className="btn-quiet shrink-0 text-sm" onClick={closeInspectUser}>
                Fermer
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto pt-4">
              {inspectLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-10 w-10 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
                </div>
              ) : inspectRuns && inspectRuns.length === 0 ? (
                <p className="text-sm text-white/50">Aucune course enregistrée pour cet utilisateur.</p>
              ) : inspectRuns && inspectRuns.length > 0 ? (
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Distance</th>
                      <th className="py-2 pr-4">En mouvement</th>
                      <th className="py-2 pr-4">Total</th>
                      <th className="py-2 pr-4">Allure moy.</th>
                      <th className="py-2 pr-4">Objectif</th>
                      <th className="py-2">Splits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspectRuns.map((r) => (
                      <tr key={r.id} className="border-b border-white/[0.04] text-white/80">
                        <td className="py-2.5 pr-4 text-xs text-white/65">{formatRunWhen(r.created_at)}</td>
                        <td className="py-2.5 pr-4">{(r.distance_m / 1000).toFixed(2)} km</td>
                        <td className="py-2.5 pr-4">{formatRunClock(r.moving_sec)}</td>
                        <td className="py-2.5 pr-4 text-white/65" title="Depuis le 1er fix GPS jusqu’à la fin (horloge)">
                          {formatRunClock(r.wall_sec)}
                        </td>
                        <td className="py-2.5 pr-4">{formatRunPace(r.avg_pace_sec_per_km)}</td>
                        <td className="py-2.5 pr-4 text-white/60">
                          {r.target_km > 0 ? `${r.target_km} km` : '—'}
                        </td>
                        <td className="py-2.5 text-white/60">{r.split_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {inspectRuns && inspectRuns.length > 0 ? (
                <p className="mt-3 text-[11px] text-white/40">
                  L’allure moyenne = temps <strong className="font-medium text-white/55">en mouvement</strong> ÷ distance
                  GPS. Très courtes sorties : forte sensibilité aux erreurs du téléphone ; ce n’est pas un podomètre
                  certifié.
                </p>
              ) : null}
              {inspectRuns && inspectRunsTotal != null && inspectRuns.length < inspectRunsTotal ? (
                <p className="mt-3 text-xs text-white/40">
                  Affichage des {inspectRuns.length} dernières courses sur {inspectRunsTotal} (limite API).
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {editUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog">
          <div className="panel w-full max-w-md p-6">
            <h3 className="font-display text-lg font-semibold text-white">Modifier {editUser.email}</h3>
            <form className="mt-4 space-y-4" onSubmit={(e) => void submitEditUser(e)}>
              <div>
                <label className="text-xs text-white/45">Rôle</label>
                <select className="field mt-1 w-full" value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/45">Offre</label>
                <select className="field mt-1 w-full" value={editPlan} onChange={(e) => setEditPlan(e.target.value)}>
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="btn-brand flex-1" disabled={editBusy}>
                  {editBusy ? '…' : 'Enregistrer'}
                </button>
                <button type="button" className="btn-quiet flex-1" onClick={() => setEditUser(null)}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PromoTable({
  promos,
  onRefresh,
}: {
  promos: PromoCodeRow[]
  onRefresh: () => Promise<void>
}) {
  const [editing, setEditing] = useState<PromoCodeRow | null>(null)
  const [pct, setPct] = useState(0)
  const [maxUses, setMaxUses] = useState(0)
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)

  function startEdit(p: PromoCodeRow) {
    setEditing(p)
    setPct(p.percent_off)
    setMaxUses(p.max_uses)
    setActive(p.active)
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault()
    if (!editing) return
    const t = getToken()
    if (!t) return
    setBusy(true)
    try {
      await adminPatchPromo(t, editing.id, {
        percent_off: pct,
        max_uses: maxUses,
        active,
      })
      setEditing(null)
      await onRefresh()
    } catch (err) {
      alert(err instanceof ApiError ? err.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <table className="w-full min-w-[640px] text-left text-sm">
      <thead>
        <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
          <th className="px-4 py-3">Code</th>
          <th className="px-4 py-3">%</th>
          <th className="px-4 py-3">Utilisations</th>
          <th className="px-4 py-3">Actif</th>
          <th className="px-4 py-3 text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {promos.map((p) => (
          <tr key={p.id} className="border-b border-white/[0.04] align-top">
            <td className="px-4 py-2.5 font-mono text-xs text-white/90">{p.code}</td>
            <td className="px-4 py-2.5">{p.percent_off}</td>
            <td className="px-4 py-2.5 text-xs">
              {p.uses} / {p.max_uses === 0 ? '∞' : p.max_uses}
            </td>
            <td className="px-4 py-2.5">{p.active ? 'oui' : 'non'}</td>
            <td className="px-4 py-2.5 text-right">
              <button type="button" className="text-xs text-brand-ice hover:underline" onClick={() => startEdit(p)}>
                Modifier
              </button>
              <button
                type="button"
                className="ml-3 text-xs text-red-300/90 hover:underline"
                onClick={async () => {
                  if (!window.confirm('Supprimer ce code ?')) return
                  const t = getToken()
                  if (!t) return
                  try {
                    await adminDeletePromo(t, p.id)
                    await onRefresh()
                  } catch (e) {
                    alert(e instanceof Error ? e.message : 'Erreur')
                  }
                }}
              >
                Supprimer
              </button>
            </td>
          </tr>
        ))}
      </tbody>
      {editing ? (
        <tfoot>
          <tr>
            <td colSpan={5} className="px-4 py-4">
              <form className="rounded-xl border border-white/[0.08] bg-surface-2/40 p-4" onSubmit={(e) => void saveEdit(e)}>
                <p className="text-xs font-medium text-white/80">Édition : {editing.code}</p>
                <div className="mt-3 flex flex-wrap gap-4">
                  <div>
                    <label className="text-[10px] text-white/45">Réduction %</label>
                    <input
                      className="field mt-1 w-24"
                      type="number"
                      min={0}
                      max={100}
                      value={pct}
                      onChange={(e) => setPct(Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-white/45">Max utilisations (0 = ∞)</label>
                    <input
                      className="field mt-1 w-28"
                      type="number"
                      min={0}
                      value={maxUses}
                      onChange={(e) => setMaxUses(Number(e.target.value))}
                    />
                  </div>
                  <label className="flex items-end gap-2 pb-1 text-sm text-white/70">
                    <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
                    Actif
                  </label>
                </div>
                <div className="mt-3 flex gap-2">
                  <button type="submit" className="btn-brand text-xs" disabled={busy}>
                    {busy ? '…' : 'Enregistrer'}
                  </button>
                  <button type="button" className="btn-quiet text-xs" onClick={() => setEditing(null)}>
                    Annuler
                  </button>
                </div>
              </form>
            </td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  )
}

function PromoCreateForm({
  onCreated,
}: {
  onCreated: () => Promise<void>
}) {
  const [code, setCode] = useState('')
  const [pct, setPct] = useState(10)
  const [maxUses, setMaxUses] = useState(0)
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    const token = getToken()
    if (!token) return
    setBusy(true)
    try {
      await adminCreatePromo(token, {
        code,
        percent_off: pct,
        max_uses: maxUses,
        active,
        applicable_plans: [],
      })
      setCode('')
      await onCreated()
    } catch (e) {
      alert(e instanceof ApiError ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel p-6" onSubmit={onSubmit}>
      <h2 className="font-display text-lg font-semibold text-white">Nouveau code promo</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-xs text-white/45">Code</label>
          <input className="field mt-1" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required />
        </div>
        <div>
          <label className="text-xs text-white/45">Réduction %</label>
          <input
            className="field mt-1"
            type="number"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setPct(Number(e.target.value))}
          />
        </div>
        <div>
          <label className="text-xs text-white/45">Max utilisations (0 = illimité)</label>
          <input
            className="field mt-1"
            type="number"
            min={0}
            value={maxUses}
            onChange={(e) => setMaxUses(Number(e.target.value))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Actif
        </label>
      </div>
      <button type="submit" className="btn-brand mt-4" disabled={busy}>
        Créer
      </button>
    </form>
  )
}
