'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  adminDeleteCircuit,
  adminDeleteCircuitTime,
  adminListCircuitTimes,
  adminListCircuits,
  adminPatchCircuit,
  adminSearchCircuitTimesByUser,
  type AdminCircuitTimeRow,
  type CircuitSummary,
} from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  Badge,
  EmptyState,
  ErrorBanner,
  SearchInput,
  Segmented,
  SkeletonRows,
  useConfirm,
  useNotify,
} from '@/components/admin/ui'
import { formatClock, formatDate, formatDateTime, formatNumber } from '@/components/admin/format'

type Mode = 'byCircuit' | 'byRunner'
type Circuit = CircuitSummary & { created_by?: string }

const LIST_LIMIT = 200
const TIMES_LIMIT = 500

/** Rang d’un chrono dans la liste (triée par durée croissante côté API). */
function rankTone(i: number) {
  return i === 0 ? 'brand' : i < 3 ? 'ice' : 'neutral'
}

export function AdminCircuits({ onTotal }: { onTotal?: (n: number) => void }) {
  const [mode, setMode] = useState<Mode>('byCircuit')

  return (
    <div className="space-y-5">
      <Segmented<Mode>
        value={mode}
        onChange={setMode}
        label="Mode de recherche"
        className="sm:max-w-md"
        options={[
          { id: 'byCircuit', label: 'Par parcours' },
          { id: 'byRunner', label: 'Par coureur' },
        ]}
      />

      {mode === 'byCircuit' ? <ByCircuit onTotal={onTotal} /> : <ByRunner />}
    </div>
  )
}

/* ——— Parcours → chronos ——— */

function ByCircuit({ onTotal }: { onTotal?: (n: number) => void }) {
  const notify = useNotify()
  const confirm = useConfirm()

  const [list, setList] = useState<Circuit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')

  const [picked, setPicked] = useState<Circuit | null>(null)
  const [name, setName] = useState('')
  const [times, setTimes] = useState<AdminCircuitTimeRow[]>([])
  const [timesTotal, setTimesTotal] = useState(0)
  const [timesLoading, setTimesLoading] = useState(false)
  const [renaming, setRenaming] = useState(false)

  const load = useCallback(async () => {
    const t = getToken()
    if (!t) return
    setLoading(true)
    setErr('')
    try {
      const r = await adminListCircuits(t, '', 0, LIST_LIMIT)
      setList(r.circuits ?? [])
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

  const loadTimes = useCallback(async (circuitId: string) => {
    const t = getToken()
    if (!t) return
    setTimesLoading(true)
    try {
      const r = await adminListCircuitTimes(t, circuitId, 0, TIMES_LIMIT)
      setTimes(r.times ?? [])
      setTimesTotal(r.total)
    } catch (e) {
      setTimes([])
      setTimesTotal(0)
      notify('error', e instanceof Error ? e.message : 'Chargement des temps impossible')
    } finally {
      setTimesLoading(false)
    }
  }, [notify])

  useEffect(() => {
    if (!picked) {
      setTimes([])
      setTimesTotal(0)
      return
    }
    void loadTimes(picked.id)
  }, [picked, loadTimes])

  /* La recherche est locale : l’API renvoie déjà la liste complète en une fois. */
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return list
    return list.filter((c) => c.name.toLowerCase().includes(needle) || c.id.includes(needle))
  }, [list, q])

  async function rename(e: FormEvent) {
    e.preventDefault()
    const t = getToken()
    if (!t || !picked || !name.trim() || name.trim() === picked.name) return
    setRenaming(true)
    try {
      await adminPatchCircuit(t, picked.id, { name: name.trim() })
      setList((l) => l.map((c) => (c.id === picked.id ? { ...c, name: name.trim() } : c)))
      setPicked((c) => (c ? { ...c, name: name.trim() } : c))
      notify('ok', 'Parcours renommé.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Renommage impossible')
    } finally {
      setRenaming(false)
    }
  }

  async function removeCircuit() {
    if (!picked) return
    const ok = await confirm({
      title: `Supprimer « ${picked.name} » ?`,
      body: `Le tracé et les ${timesTotal} chrono${timesTotal > 1 ? 's' : ''} associé${timesTotal > 1 ? 's' : ''} seront effacés pour tout le monde.`,
      confirmLabel: 'Supprimer le parcours',
      danger: true,
      requireText: 'SUPPRIMER',
    })
    if (!ok) return
    const t = getToken()
    if (!t) return
    try {
      await adminDeleteCircuit(t, picked.id)
      setList((l) => l.filter((c) => c.id !== picked.id))
      setTotal((n) => Math.max(0, n - 1))
      setPicked(null)
      notify('ok', 'Parcours supprimé.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  async function removeTime(row: AdminCircuitTimeRow) {
    const ok = await confirm({
      title: 'Supprimer ce chrono ?',
      body: `${formatClock(Math.floor(row.duration_ms / 1000))} par ${row.display_name ?? 'un coureur'}, le ${formatDate(row.created_at)}.`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const t = getToken()
    if (!t) return
    try {
      await adminDeleteCircuitTime(t, row.id)
      setTimes((l) => l.filter((x) => x.id !== row.id))
      setTimesTotal((n) => Math.max(0, n - 1))
      notify('ok', 'Chrono supprimé.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  return (
    <div className="space-y-4">
      {err ? <ErrorBanner message={err} onRetry={() => void load()} /> : null}

      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        {/* Liste maîtresse : recherche puis sélection. */}
        <div className="space-y-3">
          <SearchInput value={q} onChange={setQ} label="Rechercher un parcours" placeholder="Nom du parcours…" />
          <p className="text-[11.5px] text-white/35">
            {filtered.length} parcours affiché{filtered.length > 1 ? 's' : ''}
            {total > list.length ? ` — ${total} au total, ${list.length} chargés` : ''}
          </p>

          {loading ? (
            <SkeletonRows rows={6} height={56} />
          ) : filtered.length === 0 ? (
            <EmptyState title="Aucun parcours" body={list.length === 0 ? 'Aucun tracé n’a encore été enregistré.' : 'Aucun nom ne correspond.'} />
          ) : (
            <ul className="max-h-[min(28rem,60dvh)] space-y-1.5 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-22rem)]">
              {filtered.map((c) => {
                const on = picked?.id === c.id
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setPicked(c)
                        setName(c.name)
                      }}
                      aria-current={on ? 'true' : undefined}
                      className={`w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition ${
                        on
                          ? 'border-brand-orange/45 bg-brand-orange/[0.12]'
                          : 'border-white/[0.06] bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="block truncate text-[13.5px] font-medium text-white">{c.name}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-white/40">
                        {c.length_m ? <span>{formatNumber(c.length_m / 1000, 2)} km</span> : null}
                        {c.participant_count != null ? <span>· {c.participant_count} coureur{c.participant_count > 1 ? 's' : ''}</span> : null}
                        <span>· {formatDate(c.created_at)}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Détail : renommer, supprimer, et le classement complet. */}
        {!picked ? (
          <div className="hidden lg:block">
            <EmptyState title="Sélectionne un parcours" body="Ses chronos, son tracé et ses options de modification s’afficheront ici." />
          </div>
        ) : (
          <div className="space-y-4">
            <section className="panel p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-display text-[17px] font-semibold text-white">{picked.name}</h2>
                  <p className="mt-1 font-mono text-[11px] text-white/35">{picked.id}</p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {picked.length_m ? <Badge tone="ice">{formatNumber(picked.length_m / 1000, 2)} km</Badge> : null}
                  <Badge>{timesTotal} chrono{timesTotal > 1 ? 's' : ''}</Badge>
                </div>
              </div>

              <form className="mt-4 flex flex-wrap items-end gap-2" onSubmit={(e) => void rename(e)}>
                <div className="min-w-[12rem] flex-1">
                  <label htmlFor="circuit-name" className="text-xs text-white/45">
                    Nom du parcours
                  </label>
                  <input
                    id="circuit-name"
                    className="field mt-1 !min-h-[44px]"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  className="btn-brand !min-h-[44px] cursor-pointer px-4 text-[13.5px]"
                  disabled={renaming || !name.trim() || name.trim() === picked.name}
                >
                  {renaming ? '…' : 'Renommer'}
                </button>
                <button
                  type="button"
                  onClick={() => void removeCircuit()}
                  className="inline-flex min-h-[44px] cursor-pointer items-center justify-center rounded-[14px] border border-red-500/35 px-4 text-[13.5px] font-medium text-red-200 transition hover:bg-red-500/10"
                >
                  Supprimer
                </button>
              </form>
            </section>

            {timesLoading ? (
              <SkeletonRows rows={5} height={44} />
            ) : times.length === 0 ? (
              <EmptyState title="Aucun chrono" body="Personne n’a encore terminé ce parcours." />
            ) : (
              <div className="table-wrap max-h-[calc(100dvh-26rem)]">
                <table className="data-table min-w-[540px]">
                  <thead>
                    <tr>
                      <th scope="col" className="w-12">
                        #
                      </th>
                      <th scope="col">Temps</th>
                      <th scope="col">Coureur</th>
                      <th scope="col">Date</th>
                      <th scope="col" className="text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {times.map((row, i) => (
                      <tr key={row.id}>
                        <td>
                          <Badge tone={rankTone(i)}>{i + 1}</Badge>
                        </td>
                        <td className="num font-mono font-semibold text-white">
                          {formatClock(Math.floor(row.duration_ms / 1000))}
                        </td>
                        <td className="truncate">{row.display_name ?? <span className="font-mono text-[11.5px] text-white/40">{row.user_id}</span>}</td>
                        <td className="num text-[12.5px] text-white/55">{formatDateTime(row.created_at)}</td>
                        <td>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              className="icon-btn icon-btn--danger cursor-pointer"
                              title="Supprimer ce chrono"
                              aria-label="Supprimer ce chrono"
                              onClick={() => void removeTime(row)}
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
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* ——— Coureur → chronos ——— */

function ByRunner() {
  const notify = useNotify()
  const confirm = useConfirm()
  const [first, setFirst] = useState('')
  const [last, setLast] = useState('')
  const [rows, setRows] = useState<AdminCircuitTimeRow[] | null>(null)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)

  async function search(e: FormEvent) {
    e.preventDefault()
    const t = getToken()
    if (!t) return
    setBusy(true)
    try {
      const r = await adminSearchCircuitTimesByUser(t, first, last, 0, 100)
      setRows(r.times ?? [])
      setTotal(r.total)
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Recherche impossible')
    } finally {
      setBusy(false)
    }
  }

  async function removeTime(row: AdminCircuitTimeRow) {
    const ok = await confirm({
      title: 'Supprimer ce chrono ?',
      body: `${formatClock(Math.floor(row.duration_ms / 1000))} sur « ${row.circuit_name || row.circuit_id} ».`,
      confirmLabel: 'Supprimer',
      danger: true,
    })
    if (!ok) return
    const t = getToken()
    if (!t) return
    try {
      await adminDeleteCircuitTime(t, row.id)
      setRows((l) => (l ? l.filter((x) => x.id !== row.id) : l))
      setTotal((n) => Math.max(0, n - 1))
      notify('ok', 'Chrono supprimé.')
    } catch (e) {
      notify('error', e instanceof Error ? e.message : 'Suppression impossible')
    }
  }

  return (
    <div className="space-y-4">
      <form className="panel flex flex-wrap items-end gap-2.5 p-5" onSubmit={(e) => void search(e)}>
        <div className="min-w-[9rem] flex-1">
          <label htmlFor="runner-first" className="text-xs text-white/45">
            Prénom
          </label>
          <input
            id="runner-first"
            className="field mt-1 !min-h-[44px]"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
            placeholder="Camille"
          />
        </div>
        <div className="min-w-[9rem] flex-1">
          <label htmlFor="runner-last" className="text-xs text-white/45">
            Nom
          </label>
          <input
            id="runner-last"
            className="field mt-1 !min-h-[44px]"
            value={last}
            onChange={(e) => setLast(e.target.value)}
            placeholder="Durand"
          />
        </div>
        <button type="submit" className="btn-brand !min-h-[44px] cursor-pointer px-5 text-[13.5px]" disabled={busy}>
          {busy ? 'Recherche…' : 'Chercher'}
        </button>
        <p className="w-full text-[11.5px] text-white/35">
          Recherche « contient », insensible à la casse. Laisse un champ vide pour l’ignorer.
        </p>
      </form>

      {rows == null ? null : rows.length === 0 ? (
        <EmptyState title="Aucun chrono trouvé" body="Vérifie l’orthographe, ou cherche seulement sur le nom de famille." />
      ) : (
        <>
          <p className="text-[12.5px] text-white/45">
            {total} résultat{total > 1 ? 's' : ''}
            {rows.length < total ? ` — ${rows.length} affichés` : ''}
          </p>
          <div className="table-wrap">
            <table className="data-table min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col">Parcours</th>
                  <th scope="col">Temps</th>
                  <th scope="col">Coureur</th>
                  <th scope="col">Date</th>
                  <th scope="col" className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="truncate">{row.circuit_name || row.circuit_id}</td>
                    <td className="num font-mono font-semibold text-white">
                      {formatClock(Math.floor(row.duration_ms / 1000))}
                    </td>
                    <td>
                      <span className="block truncate">{row.display_name ?? '—'}</span>
                      {row.email ? <span className="block truncate text-[11.5px] text-white/40">{row.email}</span> : null}
                    </td>
                    <td className="num text-[12.5px] text-white/55">{formatDateTime(row.created_at)}</td>
                    <td>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          className="icon-btn icon-btn--danger cursor-pointer"
                          title="Supprimer ce chrono"
                          aria-label="Supprimer ce chrono"
                          onClick={() => void removeTime(row)}
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
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
