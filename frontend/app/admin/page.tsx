'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FormEvent, useEffect, useState } from 'react'
import { Mark } from '@/components/Mark'
import {
  adminCreatePromo,
  adminDeletePromo,
  adminGetOfferConfig,
  adminListPromos,
  adminListUsers,
  adminPutOfferConfig,
  adminStats,
  ApiError,
  type AdminStats,
  type AdminUserRow,
  type OfferConfigPayload,
  type PromoCodeRow,
  fetchMe,
  type MeUser,
} from '@/lib/api'
import { clearToken, getToken } from '@/lib/auth'

type Tab = 'stats' | 'users' | 'promos' | 'offers'

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
        }
      } catch (e) {
        setErr(e instanceof Error ? e.message : 'Erreur')
      }
    })()
  }, [me, tab])

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
      }
      tiers[tier] = { ...cur, [key]: value }
      return { ...prev, tiers }
    })
  }

  if (loading || !me) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
      </main>
    )
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/[0.06] bg-surface-0/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <Link href="/dashboard/">
            <Mark />
          </Link>
          <nav className="flex flex-wrap gap-2">
            {(['stats', 'users', 'promos', 'offers'] as const).map((id) => (
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="panel p-5">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Utilisateurs</p>
              <p className="mt-2 font-display text-3xl font-semibold text-white">{stats.users_total}</p>
            </div>
            <div className="panel p-5">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Inscriptions 7 j.</p>
              <p className="mt-2 font-display text-3xl font-semibold text-white">{stats.users_last_7d}</p>
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
        ) : null}

        {tab === 'users' ? (
          <div className="panel overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Rôle</th>
                  <th className="px-4 py-3">Offre</th>
                  <th className="px-4 py-3">Strava</th>
                  <th className="px-4 py-3">Créé</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/[0.04] text-white/80">
                    <td className="px-4 py-2.5">{u.email}</td>
                    <td className="px-4 py-2.5">{u.role}</td>
                    <td className="px-4 py-2.5">{u.plan}</td>
                    <td className="px-4 py-2.5">{u.strava_linked ? 'oui' : 'non'}</td>
                    <td className="px-4 py-2.5 text-xs text-white/45">
                      {new Date(u.created_at).toLocaleDateString('fr-FR')}
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
            <div className="panel overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.06] text-[11px] uppercase tracking-wider text-white/40">
                    <th className="px-4 py-3">Code</th>
                    <th className="px-4 py-3">%</th>
                    <th className="px-4 py-3">Utilisations</th>
                    <th className="px-4 py-3">Actif</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.id} className="border-b border-white/[0.04]">
                      <td className="px-4 py-2.5 font-mono text-xs text-white/90">{p.code}</td>
                      <td className="px-4 py-2.5">{p.percent_off}</td>
                      <td className="px-4 py-2.5 text-xs">
                        {p.uses} / {p.max_uses === 0 ? '∞' : p.max_uses}
                      </td>
                      <td className="px-4 py-2.5">{p.active ? 'oui' : 'non'}</td>
                      <td className="px-4 py-2.5">
                        <button
                          type="button"
                          className="text-xs text-red-300/90 hover:underline"
                          onClick={async () => {
                            if (!window.confirm('Supprimer ce code ?')) return
                            const t = getToken()
                            if (!t) return
                            try {
                              await adminDeletePromo(t, p.id)
                              setPromos((prev) => prev.filter((x) => x.id !== p.id))
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
              </table>
            </div>
          </div>
        ) : null}

        {tab === 'offers' && offerCfg ? (
          <form className="space-y-8" onSubmit={saveOffers}>
            {(['standard', 'strava', 'performance'] as const).map((tier) => (
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
                      ['circuit', 'Calendrier / circuit'],
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
                <div className="mt-4">
                  <label className="text-xs text-white/45">Prix mensuel (€) — strava / performance</label>
                  <div className="mt-2 flex flex-wrap gap-4">
                    <input
                      type="number"
                      step="0.01"
                      className="field max-w-[140px]"
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
                    <input
                      type="number"
                      step="0.01"
                      className="field max-w-[140px]"
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
            ))}
            <button type="submit" className="btn-brand">
              Enregistrer la configuration
            </button>
          </form>
        ) : null}
      </main>
    </div>
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
