'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const p1 = (lat1 * Math.PI) / 180
  const p2 = (lat2 * Math.PI) / 180
  const dp = ((lat2 - lat1) * Math.PI) / 180
  const dl = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

function formatClock(totalSec: number): string {
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

function formatPaceMinPerKm(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${s.toString().padStart(2, '0')}/km`
}

/** Texte pour la synthèse vocale (français). */
function verbalDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const min = Math.floor(s / 60)
  const sec = s % 60
  if (min === 0) {
    return sec === 1 ? '1 seconde' : `${sec} secondes`
  }
  if (sec === 0) {
    return min === 1 ? '1 minute' : `${min} minutes`
  }
  const minPart = min === 1 ? '1 minute' : `${min} minutes`
  const secPart = sec === 1 ? '1 seconde' : `${sec} secondes`
  return `${minPart} et ${secPart}`
}

function speakKm(km: number, splitSec: number, tenKSec: number) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  const split = verbalDuration(splitSec)
  const ten = verbalDuration(tenKSec)
  const u = new SpeechSynthesisUtterance(
    `Kilomètre ${km} en ${split}. À ce rythme, dix kilomètres en ${ten}.`,
  )
  u.lang = 'fr-FR'
  u.rate = 1
  window.speechSynthesis.speak(u)
}

type RunPhase = 'setup' | 'running' | 'ended'

export function LiveRunPanel() {
  const [phase, setPhase] = useState<RunPhase>('setup')
  const [targetKm, setTargetKm] = useState('10')
  const [error, setError] = useState('')

  const [elapsedSec, setElapsedSec] = useState(0)
  const [distanceM, setDistanceM] = useState(0)
  const [geoOk, setGeoOk] = useState<boolean | null>(null)

  const startRef = useRef<number>(0)
  const watchRef = useRef<number | null>(null)
  const lastLatRef = useRef<number | null>(null)
  const lastLonRef = useRef<number | null>(null)
  const accMRef = useRef(0)
  const lastKmCrossingMsRef = useRef(0)
  const lastAnnouncedKmRef = useRef(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null)

  const cleanupWatch = useCallback(() => {
    if (watchRef.current != null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchRef.current)
    }
    watchRef.current = null
    if (tickRef.current != null) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
    void wakeRef.current?.release?.()
    wakeRef.current = null
  }, [])

  useEffect(() => () => cleanupWatch(), [cleanupWatch])

  const distKm = distanceM / 1000
  const target = Math.max(0.1, parseFloat(targetKm.replace(',', '.')) || 0)
  const paceSecPerKm =
    distanceM > 5 && elapsedSec > 0 ? elapsedSec / (distanceM / 1000) : 0
  const paceDisplay = formatPaceMinPerKm(paceSecPerKm)
  const progressed = Math.min(1, distKm / target)

  const startRun = useCallback(async () => {
    setError('')
    const t = Math.max(0.5, parseFloat(targetKm.replace(',', '.')) || 10)
    setTargetKm(String(t))

    if (!navigator.geolocation) {
      setError('La géolocalisation n’est pas disponible sur cet appareil.')
      return
    }

    try {
      const wn = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } }
      if (wn.wakeLock?.request) {
        wakeRef.current = await wn.wakeLock.request('screen')
      }
    } catch {
      /* garde l’écran allumé est optionnel */
    }

    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    accMRef.current = 0
    setDistanceM(0)
    lastLatRef.current = null
    lastLonRef.current = null
    lastAnnouncedKmRef.current = 0
    const now = Date.now()
    startRef.current = now
    lastKmCrossingMsRef.current = now
    setElapsedSec(0)
    setPhase('running')
    setGeoOk(null)

    tickRef.current = setInterval(() => {
      setElapsedSec((Date.now() - startRef.current) / 1000)
    }, 200)

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoOk(true)
        const { latitude, longitude } = pos.coords
        const prevLat = lastLatRef.current
        const prevLon = lastLonRef.current
        lastLatRef.current = latitude
        lastLonRef.current = longitude
        if (prevLat == null || prevLon == null) return

        let d = haversineM(prevLat, prevLon, latitude, longitude)
        if (d > 80) {
          /* probable saut GPS : on ignore le segment */
          return
        }
        if (d < 0.5) return
        accMRef.current += d
        setDistanceM(accMRef.current)

        const km = accMRef.current / 1000
        const t = Date.now()
        const newFloor = Math.floor(km)
        const crossed = newFloor - lastAnnouncedKmRef.current
        if (crossed > 0) {
          const totalSplitSec = (t - lastKmCrossingMsRef.current) / 1000
          const perKmSec = Math.max(0.1, totalSplitSec / crossed)
          for (let i = 0; i < crossed; i++) {
            lastAnnouncedKmRef.current += 1
            const k = lastAnnouncedKmRef.current
            speakKm(k, perKmSec, perKmSec * 10)
          }
          lastKmCrossingMsRef.current = t
        }
      },
      (err) => {
        setGeoOk(false)
        setError(err.message || 'Impossible d’accéder au GPS.')
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    )
  }, [targetKm])

  const stopRun = useCallback(() => {
    cleanupWatch()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    setPhase('ended')
  }, [cleanupWatch])

  const resetRun = useCallback(() => {
    cleanupWatch()
    setPhase('setup')
    setElapsedSec(0)
    setDistanceM(0)
    accMRef.current = 0
    setError('')
    setGeoOk(null)
  }, [cleanupWatch])

  return (
    <div className="space-y-6">
      <div className="panel p-5">
        <h2 className="font-display text-sm font-semibold text-white">Course en direct</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          GPS du téléphone ou de l’ordinateur. À chaque kilomètre, une voix annonce ton temps sur ce kilomètre et une
          estimation pour 10 km au même rythme. Garde l’app ouverte pendant la sortie.
        </p>
      </div>

      {phase === 'setup' ? (
        <div className="panel p-5 space-y-4">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">Distance visée (km)</span>
            <input
              type="text"
              inputMode="decimal"
              className="field mt-2 w-full max-w-[200px] border-white/[0.08] bg-surface-2/80"
              value={targetKm}
              onChange={(e) => setTargetKm(e.target.value)}
              placeholder="10"
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">{error}</p>
          ) : null}
          <button type="button" className="btn-brand px-6 py-2.5 text-sm" onClick={() => void startRun()}>
            Démarrer la course
          </button>
        </div>
      ) : null}

      {phase === 'running' || phase === 'ended' ? (
        <div className="panel p-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Temps</p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-white">{formatClock(elapsedSec)}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Distance</p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-white">
                {(distanceM / 1000).toFixed(2)} km
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Allure moyenne</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-brand-ice">{paceDisplay}</p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Temps au km (moy.)</p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-white/90">
                {paceSecPerKm > 0 ? formatClock(paceSecPerKm) : '—'}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[10px] text-white/40">
              <span>Objectif {target.toFixed(1)} km</span>
              <span>{Math.round(progressed * 100)} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-orange to-brand-ice transition-[width] duration-300"
                style={{ width: `${progressed * 100}%` }}
              />
            </div>
          </div>

          {geoOk === false ? (
            <p className="text-xs text-amber-200/90">Signal GPS faible ou refusé — vérifie les autorisations.</p>
          ) : geoOk === true ? (
            <p className="text-[11px] text-white/35">GPS actif — le suivi se met à jour en courant.</p>
          ) : (
            <p className="text-[11px] text-white/35">Recherche de position…</p>
          )}
          {error ? <p className="text-xs text-red-200/90">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            {phase === 'running' ? (
              <button type="button" className="btn-quiet border border-white/15 px-4 py-2 text-sm" onClick={stopRun}>
                Terminer
              </button>
            ) : (
              <button type="button" className="btn-brand px-4 py-2 text-sm" onClick={resetRun}>
                Nouvelle course
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
