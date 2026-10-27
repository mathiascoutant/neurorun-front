'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchPendingShoeRun, setLiveRunShoe, type PendingShoeRun, type Shoe } from '@/lib/api'
import { getToken } from '@/lib/auth'
import { formatDuration, formatKm, formatPace } from '@/components/boost/boostFormat'
import { ModalClose, ShoeModal } from '@/components/shoes/ShoeModal'
import { WEAR_STATUS, formatShoeKm, notifyShoesChanged, shoeTitle } from '@/lib/shoes'

/** Pas plus d’une relecture toutes les 30 s, même si l’onglet clignote. */
const MIN_INTERVAL_MS = 30_000
/** Courses repoussées (« plus tard ») : on ne les redemande pas avant le prochain lancement. */
const SNOOZE_KEY = 'neurorun_shoe_prompt_snoozed'

function snoozed(): string[] {
  try {
    return JSON.parse(window.sessionStorage.getItem(SNOOZE_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

function snooze(runId: string) {
  try {
    window.sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...snoozed(), runId]))
  } catch {
    /* stockage indisponible : la question reviendra, rien de grave */
  }
}

const SESSION_LABELS: Record<string, string> = {
  endurance: 'Endurance',
  interval: 'Fractionné',
  free: 'Course libre',
}

function runTitle(run: PendingShoeRun): string {
  if (run.name) return run.name
  const h = new Date(run.started_at).getHours()
  if (h < 11) return 'Course du matin'
  if (h < 14) return 'Course du midi'
  if (h < 18) return 'Course de l’après-midi'
  return 'Course du soir'
}

function Metric({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <p className="font-display text-[19px] font-semibold leading-6 tabular-nums text-white/92">
        {value}
        {unit ? <span className="ml-0.5 text-[12px] font-medium text-white/35">{unit}</span> : null}
      </p>
      <p className="text-[10px] uppercase tracking-[0.06em] text-white/35">{label}</p>
    </div>
  )
}

/**
 * À chaque retour dans l’app (chargement, onglet qui redevient visible), on
 * regarde si une course vient d’arriver — typiquement depuis la montre — sans
 * paire rattachée. Si le coureur a plusieurs paires actives, on lui montre le
 * récap de la course et on lui demande laquelle il portait.
 */
export function NewRunShoePrompt() {
  const [run, setRun] = useState<PendingShoeRun | null>(null)
  const [shoes, setShoes] = useState<Shoe[]>([])
  const [remaining, setRemaining] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastCheck = useRef(0)
  const open = useRef(false)

  const check = useCallback(async (force = false) => {
    const token = getToken()
    if (!token || open.current) return
    if (!force && Date.now() - lastCheck.current < MIN_INTERVAL_MS) return
    lastCheck.current = Date.now()
    try {
      const d = await fetchPendingShoeRun(token)
      if (!d.run || d.shoes.length < 2 || snoozed().includes(d.run.id)) return
      open.current = true
      setRun(d.run)
      setShoes(d.shoes)
      setRemaining(d.remaining)
      setSelected(null)
      setError(null)
    } catch {
      /* API injoignable : on retentera au prochain retour */
    }
  }, [])

  useEffect(() => {
    void check(true)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [check])

  const close = useCallback(() => {
    open.current = false
    setRun(null)
  }, [])

  const later = useCallback(() => {
    if (run) snooze(run.id)
    close()
  }, [run, close])

  async function answer(shoeId: string | null) {
    const token = getToken()
    if (!token || !run) return
    setSaving(true)
    setError(null)
    try {
      await setLiveRunShoe(token, run.id, shoeId)
      notifyShoesChanged()
      close()
      // D’autres courses attendent encore : on enchaîne sur la suivante.
      if (remaining > 1) void check(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Enregistrement impossible.')
    } finally {
      setSaving(false)
    }
  }

  if (!run) return null

  const day = new Date(run.started_at)
  const weekday = day.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })
  const hour = day.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  const when = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} à ${hour}`

  return (
    <ShoeModal onClose={later} labelledBy="new-run-shoe-title">
      <div
        className="border-b border-white/[0.06] px-5 pb-5 pt-5"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(252, 76, 2, 0.16) 0%, rgba(252, 76, 2, 0.04) 55%, transparent 100%)',
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="app-kicker text-brand-orange/90">Nouvelle course terminée</p>
            <h2 id="new-run-shoe-title" className="mt-1 truncate font-display text-lg font-semibold text-white">
              {runTitle(run)}
            </h2>
            <p className="mt-0.5 text-[12.5px] text-white/50">
              {when} · {SESSION_LABELS[run.session_type] ?? 'Course'}
            </p>
          </div>
          <ModalClose onClick={later} />
        </div>
        <div className="mt-5 flex gap-2">
          <Metric value={formatKm(run.distance_m)} unit="km" label="Distance" />
          <Metric value={formatDuration(run.moving_sec)} label="Durée" />
          <Metric value={formatPace(run.avg_pace_sec_per_km)} unit="/km" label="Allure" />
          {run.score_total != null ? (
            <Metric value={String(run.score_total)} unit="/100" label="Note" />
          ) : run.elevation_gain_m ? (
            <Metric value={String(Math.round(run.elevation_gain_m))} unit="m" label="D+" />
          ) : null}
        </div>
      </div>

      <div className="space-y-3 px-5 py-5">
        <p className="text-[14px] font-semibold text-white">Avec quelle paire as-tu couru ?</p>
        <ul className="space-y-2" role="radiogroup" aria-label="Paire portée">
          {shoes.map((s) => {
            const on = selected === s.id
            const st = WEAR_STATUS[s.wear.status]
            const after = s.wear.used_km + run.distance_m / 1000
            return (
              <li key={s.id}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSelected(s.id)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${
                    on
                      ? 'border-brand-orange/55 bg-brand-orange/[0.12]'
                      : 'border-white/[0.08] bg-white/[0.03] hover:border-white/15'
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      on ? 'border-brand-orange' : 'border-white/25'
                    }`}
                    aria-hidden
                  >
                    {on ? <span className="h-2.5 w-2.5 rounded-full bg-brand-orange" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-white/92">{shoeTitle(s)}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-white/45">
                      {s.nickname ? `« ${s.nickname} » · ` : ''}
                      {on
                        ? `${formatShoeKm(s.wear.used_km)} → ${formatShoeKm(after)} sur ${formatShoeKm(s.wear.lifespan_km)}`
                        : `${formatShoeKm(s.wear.used_km)} sur ${formatShoeKm(s.wear.lifespan_km)}`}
                    </span>
                  </span>
                  <span className={`badge ${st.badge} shrink-0`}>{Math.round(s.wear.wear_pct)} %</span>
                </button>
              </li>
            )
          })}
        </ul>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="button"
          className="btn-brand w-full"
          disabled={!selected || saving}
          onClick={() => void answer(selected)}
        >
          {saving ? 'Enregistrement…' : 'Valider'}
        </button>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={saving}
            className="text-[12.5px] text-white/50 hover:text-white/80"
            onClick={() => void answer(null)}
          >
            Aucune de ces paires
          </button>
          {remaining > 1 ? (
            <span className="text-[12px] text-white/40">
              Encore {remaining - 1} course{remaining > 2 ? 's' : ''} ensuite
            </span>
          ) : null}
        </div>
      </div>
    </ShoeModal>
  )
}
