'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchWalkingRouteDisplay, type RoutedDisplay } from '@/lib/osrmRouting'
import { postCircuitTime, type CircuitLatLng } from '@/lib/api'
import { getToken } from '@/lib/auth'
import {
  WEB_GPS_SEED,
  WEB_GPS_WATCH,
  webGpsCreditDistanceM,
  webGpsMovingSecondsDelta,
} from '@/lib/webGpsRun'

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

/** Rayon pour valider départ / chaque point / arrivée (GPS typ. ± quelques dizaines de m). */
const CHECKPOINT_RADIUS_M = 42

const DISTANCE_UI_STEP_M = 1
const PAUSE_SPEED_KMH = 1
const RESUME_SPEED_KMH = 1.6
const PAUSE_AFTER_SLOW_SEC = 5
const SPEED_SMOOTH_WINDOW = 5

let sharedAudioContext: AudioContext | null = null
function getSharedAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (sharedAudioContext && sharedAudioContext.state !== 'closed') return sharedAudioContext
  const AC =
    window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  sharedAudioContext = new AC()
  return sharedAudioContext
}
/** Même « top départ » que la page Course. */
function playCourseStartChime(): void {
  try {
    const ctx = getSharedAudioContext()
    if (!ctx) return
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime
    const tone = (freqHz: number, start: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freqHz, t0 + start)
      const a = t0 + start
      const b = a + dur
      g.gain.setValueAtTime(0.0001, a)
      g.gain.exponentialRampToValueAtTime(peak, a + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, b)
      osc.connect(g)
      g.connect(ctx.destination)
      osc.start(a)
      osc.stop(b + 0.03)
    }
    tone(523.25, 0, 0.11, 0.14)
    tone(659.25, 0.1, 0.13, 0.11)
  } catch {
    /* */
  }
}

function pushSpeedSample(buf: number[], v: number, maxLen: number): number[] {
  const next = [...buf, v]
  if (next.length > maxLen) next.splice(0, next.length - maxLen)
  return next
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

type Phase = 'idle' | 'running' | 'ended'

type Props = {
  circuitId: string
  circuitName: string
  /** Points dans l’ordre de course (départ → … → arrivée). */
  orderedPoints: CircuitLatLng[]
  leaflet: unknown
  onClose: () => void
  /** Après enregistrement d’un temps valide. */
  onSaved: () => void
}

export function CircuitRunPanel({
  circuitId,
  circuitName,
  orderedPoints,
  leaflet,
  onClose,
  onSaved,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<{ remove: () => void; setView: (ll: [number, number], z: number) => void } | null>(null)
  const layersRef = useRef<{ clearLayers: () => void; addLayer?: (x: unknown) => unknown } | null>(null)
  const LRef = useRef<any>(null)

  const [phase, setPhase] = useState<Phase>('idle')
  const [routed, setRouted] = useState<RoutedDisplay | null>(null)
  const [userPos, setUserPos] = useState<CircuitLatLng | null>(null)
  const [geoOk, setGeoOk] = useState<boolean | null>(null)
  const [err, setErr] = useState('')

  const [elapsedSec, setElapsedSec] = useState(0)
  const [wallSec, setWallSec] = useState(0)
  const [gpsClockLive, setGpsClockLive] = useState(false)
  const [autoPaused, setAutoPaused] = useState(false)
  const [distanceM, setDistanceM] = useState(0)
  const [, setMetricsTick] = useState(0)

  /** Index du prochain point à valider (1 … n-1). Quand === n, parcours terminé. */
  const nextCheckpointRef = useRef(1)
  const [nextCheckpoint, setNextCheckpoint] = useState(1)
  const [checkpointsDone, setCheckpointsDone] = useState(0)

  const gpsStartTsMsRef = useRef(0)
  const runClockStartMsRef = useRef(0)
  const movingSecRef = useRef(0)
  const lastTickMsRef = useRef(0)
  const pausedRef = useRef(false)
  const speedBufRef = useRef<number[]>([])
  const slowSinceMsRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)
  const geoWatchRef = useRef<number | null>(null)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseRef = useRef<Phase>('idle')
  const orderedPointsRef = useRef(orderedPoints)
  orderedPointsRef.current = orderedPoints
  const lastLatRef = useRef<number | null>(null)
  const lastLonRef = useRef<number | null>(null)
  const accMRef = useRef(0)
  const lastDistanceUiBucketRef = useRef(0)
  const maxImpliedKmhRef = useRef(0)

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const nPts = orderedPoints.length
  const startPt = nPts > 0 ? orderedPoints[0]! : null
  const distToStartM =
    startPt && userPos ? haversineM(userPos.lat, userPos.lng, startPt.lat, startPt.lng) : null
  const atStart = distToStartM != null && distToStartM <= CHECKPOINT_RADIUS_M

  const cleanupTimer = useCallback(() => {
    if (tickRef.current != null) {
      clearInterval(tickRef.current)
      tickRef.current = null
    }
  }, [])

  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

  useEffect(() => {
    if (nPts < 2) return
    const ac = new AbortController()
    let cancelled = false
    void fetchWalkingRouteDisplay(orderedPoints, ac.signal).then((r) => {
      if (!cancelled) setRouted(r)
    })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [orderedPoints, nPts])

  useEffect(() => {
    const el = containerRef.current
    const L = leaflet
    if (!el || !L) return
    LRef.current = L
    const Ll = L as {
      map: (x: HTMLElement) => {
        setView: (ll: [number, number], z: number) => void
        remove: () => void
      }
      tileLayer: (url: string, o: { attribution: string; maxZoom: number }) => { addTo: (m: unknown) => unknown }
      layerGroup: () => { addTo: (m: unknown) => unknown; clearLayers: () => void }
      polyline: (latlngs: [number, number][], o: object) => { addTo: (x: unknown) => unknown }
      circleMarker: (ll: [number, number], o: object) => any
      divIcon: (o: object) => unknown
      marker: (ll: [number, number], o?: object) => { addTo: (x: unknown) => unknown; bindPopup: (s: string) => unknown }
    }
    const c0 = orderedPoints[0] ?? { lat: 46.5, lng: 2.5 }
    const map = Ll.map(el)
    map.setView([c0.lat, c0.lng], 16)
    mapRef.current = map
    Ll.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map)
    const layers = Ll.layerGroup()
    layers.addTo(map)
    layersRef.current = layers
    return () => {
      map.remove()
      mapRef.current = null
      layersRef.current = null
    }
  }, [leaflet, orderedPoints])

  useEffect(() => {
    const layers = layersRef.current
    const L = LRef.current
    if (!layers || !L) return
    layers.clearLayers()
    const Ll = L as {
      polyline: (latlngs: [number, number][], o: object) => { addTo: (x: unknown) => unknown }
      circleMarker: (ll: [number, number], o: object) => any
      divIcon: (o: object) => any
      marker: (ll: [number, number], o?: { icon?: object }) => any
    }
    const line = routed?.latlngs ?? orderedPoints.map((p) => [p.lat, p.lng] as [number, number])
    if (line.length >= 2) {
      Ll.polyline(line, { color: '#38bdf8', weight: 5, opacity: 0.9 }).addTo(layers)
    }
    orderedPoints.forEach((p, i) => {
      const isNext =
        phase === 'idle'
          ? i === 0
          : phase === 'running'
            ? i === nextCheckpoint
            : false
      const isDone = (phase === 'running' || phase === 'ended') && i < nextCheckpoint
      const col = isDone ? '#22c55e' : isNext ? '#fbbf24' : '#94a3b8'
      const html = `<div style="min-width:26px;height:26px;border-radius:9999px;background:${col};color:#0f172a;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.5)">${i + 1}</div>`
      const icon = Ll.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 13] })
      const label = i === 0 ? 'Départ' : i === nPts - 1 ? 'Arrivée' : `Point ${i + 1}`
      Ll.marker([p.lat, p.lng], { icon }).addTo(layers).bindPopup(label)
    })
    if (userPos) {
      Ll.circleMarker([userPos.lat, userPos.lng], {
        radius: 9,
        color: '#fc4c02',
        weight: 3,
        fillColor: '#fff',
        fillOpacity: 0.9,
      })
        .addTo(layers)
        .bindPopup('Ta position')
    }
  }, [routed, orderedPoints, userPos, nextCheckpoint, nPts, phase])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !userPos || phase !== 'running') return
    map.setView([userPos.lat, userPos.lng], 17)
  }, [userPos, phase])

  const finishAndSave = useCallback(() => {
    phaseRef.current = 'ended'
    cleanupTimer()
    const clock0 = runClockStartMsRef.current
    const now = Date.now()
    if (clock0 > 0 && lastTickMsRef.current > 0) {
      const dt = (now - lastTickMsRef.current) / 1000
      movingSecRef.current += webGpsMovingSecondsDelta(dt, pausedRef.current)
      setElapsedSec(movingSecRef.current)
      setWallSec(Math.max(0, (now - clock0) / 1000))
    }
    setPhase('ended')
    const ms = Math.round(movingSecRef.current * 1000)
    if (ms < 10_000) {
      setErr('Durée minimum 10 s pour enregistrer.')
      setSaveState('idle')
      return
    }
    const token = getToken()
    if (!token) {
      setErr('Session expirée.')
      setSaveState('error')
      return
    }
    setSaveState('saving')
    void postCircuitTime(token, circuitId, ms)
      .then(() => {
        setSaveState('saved')
        onSaved()
      })
      .catch(() => {
        setSaveState('error')
        setErr('Enregistrement impossible.')
      })
  }, [circuitId, cleanupTimer, onSaved])

  const tryPassCheckpoint = useCallback(
    (lat: number, lng: number) => {
      if (phaseRef.current !== 'running') return
      const pts = orderedPointsRef.current
      const n = pts.length
      const next = nextCheckpointRef.current
      if (next >= n) return
      const target = pts[next]!
      const d = haversineM(lat, lng, target.lat, target.lng)
      if (d > CHECKPOINT_RADIUS_M) return
      nextCheckpointRef.current = next + 1
      setNextCheckpoint(next + 1)
      setCheckpointsDone((c) => c + 1)
      if (next + 1 >= n) {
        finishAndSave()
      }
    },
    [finishAndSave],
  )

  useEffect(() => {
    if (!navigator.geolocation) {
      setErr("La géolocalisation n'est pas disponible.")
      return
    }

    const applyPauseFromSmoothed = (smoothedKmh: number, tsMs: number) => {
      if (speedBufRef.current.length < 2) return
      let nextPaused = pausedRef.current
      if (smoothedKmh < PAUSE_SPEED_KMH) {
        if (slowSinceMsRef.current == null) slowSinceMsRef.current = tsMs
        else if (tsMs - slowSinceMsRef.current >= PAUSE_AFTER_SLOW_SEC * 1000) nextPaused = true
      } else if (smoothedKmh > RESUME_SPEED_KMH) {
        nextPaused = false
        slowSinceMsRef.current = null
      }
      if (nextPaused !== pausedRef.current) {
        pausedRef.current = nextPaused
        setAutoPaused(nextPaused)
      }
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords
        const tsMs = pos.timestamp
        setGeoOk(true)
        setUserPos({ lat: latitude, lng: longitude })

        if (phaseRef.current !== 'running') return

        if (gpsStartTsMsRef.current <= 0) {
          gpsStartTsMsRef.current = pos.timestamp
          const clock0 = Date.now()
          runClockStartMsRef.current = clock0
          lastTickMsRef.current = clock0
          movingSecRef.current = 0
          setGpsClockLive(true)
        }

        tryPassCheckpoint(latitude, longitude)
        if (phaseRef.current !== 'running') return

        if (lastLatRef.current == null || lastLonRef.current == null) {
          lastLatRef.current = latitude
          lastLonRef.current = longitude
          if (lastTsRef.current == null) lastTsRef.current = tsMs
          return
        }
        const prevLat = lastLatRef.current
        const prevLon = lastLonRef.current
        const prevTs = lastTsRef.current
        const d = haversineM(prevLat, prevLon, latitude, longitude)
        const dtSec = prevTs != null ? Math.max(0, (tsMs - prevTs) / 1000) : 0
        if (d < 0.5) {
          lastTsRef.current = tsMs
          speedBufRef.current = pushSpeedSample(speedBufRef.current, 0, SPEED_SMOOTH_WINDOW)
          applyPauseFromSmoothed(mean(speedBufRef.current), tsMs)
          return
        }
        if (prevTs == null || dtSec < 1e-6) {
          lastTsRef.current = tsMs
          return
        }
        const credit = webGpsCreditDistanceM(d, dtSec)
        if (credit === null) {
          lastLatRef.current = latitude
          lastLonRef.current = longitude
          lastTsRef.current = tsMs
          return
        }
        const impliedKmh = (credit / 1000 / dtSec) * 3600
        if (Number.isFinite(impliedKmh) && impliedKmh > maxImpliedKmhRef.current) {
          maxImpliedKmhRef.current = impliedKmh
        }
        speedBufRef.current = pushSpeedSample(speedBufRef.current, impliedKmh, SPEED_SMOOTH_WINDOW)
        applyPauseFromSmoothed(mean(speedBufRef.current), tsMs)
        lastLatRef.current = latitude
        lastLonRef.current = longitude
        lastTsRef.current = tsMs
        accMRef.current += credit
        const bucket = Math.floor(accMRef.current / DISTANCE_UI_STEP_M)
        if (bucket > lastDistanceUiBucketRef.current) {
          lastDistanceUiBucketRef.current = bucket
          setDistanceM(bucket * DISTANCE_UI_STEP_M)
        }
      },
      () => setGeoOk(false),
      WEB_GPS_WATCH,
    )
    geoWatchRef.current = id
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      WEB_GPS_SEED,
    )
    return () => {
      navigator.geolocation.clearWatch(id)
      geoWatchRef.current = null
    }
  }, [tryPassCheckpoint])

  const startRun = useCallback(() => {
    setErr('')
    setSaveState('idle')
    if (!atStart || !navigator.geolocation) {
      setErr('Rapproche-toi du point de départ (cercle orange sur la carte).')
      return
    }
    playCourseStartChime()
    cleanupTimer()
    nextCheckpointRef.current = 1
    setNextCheckpoint(1)
    setCheckpointsDone(0)
    accMRef.current = 0
    lastDistanceUiBucketRef.current = 0
    lastLatRef.current = null
    lastLonRef.current = null
    gpsStartTsMsRef.current = 0
    runClockStartMsRef.current = 0
    movingSecRef.current = 0
    lastTickMsRef.current = 0
    pausedRef.current = false
    speedBufRef.current = []
    slowSinceMsRef.current = null
    lastTsRef.current = null
    maxImpliedKmhRef.current = 0
    setElapsedSec(0)
    setWallSec(0)
    setAutoPaused(false)
    setGpsClockLive(false)
    setDistanceM(0)
    phaseRef.current = 'running'
    setPhase('running')

    tickRef.current = setInterval(() => {
      if (phaseRef.current !== 'running') return
      const clock0 = runClockStartMsRef.current
      const now = Date.now()
      if (clock0 <= 0) {
        setElapsedSec(0)
        setWallSec(0)
      } else {
        const lastT = lastTickMsRef.current
        if (lastT > 0) {
          const dt = (now - lastT) / 1000
          movingSecRef.current += webGpsMovingSecondsDelta(dt, pausedRef.current)
        }
        lastTickMsRef.current = now
        setElapsedSec(movingSecRef.current)
        setWallSec(Math.max(0, (now - clock0) / 1000))
      }
      setMetricsTick((x) => x + 1)
    }, 200)
  }, [atStart, cleanupTimer])

  const abandonRun = useCallback(() => {
    cleanupTimer()
    phaseRef.current = 'idle'
    setPhase('idle')
    nextCheckpointRef.current = 1
    setNextCheckpoint(1)
    setCheckpointsDone(0)
    setElapsedSec(0)
    setWallSec(0)
    setGpsClockLive(false)
    setDistanceM(0)
    accMRef.current = 0
    setErr('')
  }, [cleanupTimer])

  const trueM = accMRef.current
  const distKmShown = distanceM / 1000
  const paceSecPerKm = trueM > 5 && elapsedSec > 0 ? elapsedSec / (trueM / 1000) : 0
  const paceDisplay = formatPaceMinPerKm(paceSecPerKm)
  const totalLegs = Math.max(0, nPts - 1)
  const progressCheckpoints = totalLegs > 0 ? checkpointsDone / totalLegs : 0

  if (nPts < 2) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col bg-surface-0 p-4">
        <p className="text-sm text-white/70">Parcours invalide (pas assez de points).</p>
        <button type="button" className="btn-brand mt-4" onClick={onClose}>
          Fermer
        </button>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-surface-0">
      <header className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-safe py-3 pr-safe">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wider text-white/40">Parcours GPS</p>
          <p className="truncate font-display text-sm font-semibold text-white">{circuitName}</p>
        </div>
        {phase === 'idle' ? (
          <button type="button" className="btn-quiet text-xs" onClick={onClose}>
            Fermer
          </button>
        ) : phase === 'running' ? (
          <button type="button" className="btn-quiet border-amber-500/30 text-xs text-amber-200" onClick={abandonRun}>
            Abandonner
          </button>
        ) : (
          <button type="button" className="btn-brand text-xs" onClick={onClose}>
            OK
          </button>
        )}
      </header>

      <div ref={containerRef} className="h-[min(42vh,360px)] w-full shrink-0 border-b border-white/[0.06] md:h-[45vh]" />

      <div className="min-h-0 flex-1 overflow-y-auto px-safe py-4">
        {phase === 'idle' && (
          <div className="space-y-4">
            <p className="text-xs leading-relaxed text-white/55">
              Va au <strong className="text-white/80">point 1 (départ)</strong> sur la carte. Le chrono est le même que
              pour <strong className="text-white/80">Course</strong> (temps en mouvement, pause auto). Tu dois passer
              chaque point <strong className="text-white/80">dans l’ordre</strong> ({CHECKPOINT_RADIUS_M} m). L’arrivée
              valide ton temps.
            </p>
            <div className="rounded-xl border border-white/[0.08] bg-black/25 px-4 py-3 text-sm">
              <p className="text-[10px] uppercase tracking-wider text-white/40">Distance au départ</p>
              <p className="mt-1 font-mono text-xl text-white">
                {distToStartM != null ? `${Math.round(distToStartM)} m` : '—'}
              </p>
              {!atStart && userPos ? (
                <p className="mt-2 text-xs text-amber-200/90">Rapproche-toi à moins de {CHECKPOINT_RADIUS_M} m du départ pour lancer.</p>
              ) : atStart ? (
                <p className="mt-2 text-xs text-emerald-200/90">Tu peux démarrer.</p>
              ) : (
                <p className="mt-2 text-xs text-white/45">Recherche GPS…</p>
              )}
            </div>
            {err ? <p className="text-xs text-red-200/90">{err}</p> : null}
            <button
              type="button"
              className="btn-brand w-full py-3 text-sm"
              disabled={!atStart}
              onClick={() => startRun()}
            >
              Démarrer le parcours
            </button>
          </div>
        )}

        {(phase === 'running' || phase === 'ended') && (
          <div className="panel space-y-5 border-white/[0.06] p-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Temps (en mouvement)</p>
                <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-white sm:text-5xl">
                  {phase === 'running' && !gpsClockLive ? '—' : formatClock(elapsedSec)}
                </p>
                {phase === 'running' && gpsClockLive ? (
                  <p className="mt-2 text-[11px] text-white/45">
                    Total : {formatClock(wallSec)}
                    {autoPaused ? <span className="ml-1.5 text-amber-200/90">· pause auto</span> : null}
                  </p>
                ) : phase === 'ended' ? (
                  <p className="mt-2 text-[11px] text-emerald-200/80">Chrono arrêté à l’arrivée · total {formatClock(wallSec)}</p>
                ) : null}
              </div>
              <div className="col-span-2 sm:col-span-1">
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Distance (GPS)</p>
                <p className="mt-2 font-display text-4xl font-semibold tabular-nums text-white sm:text-5xl">
                  {distKmShown.toFixed(2)} km
                </p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Allure moy.</p>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-brand-ice">{paceDisplay}</p>
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">Prochain point</p>
                <p className="mt-2 font-display text-2xl font-semibold tabular-nums text-amber-200">
                  {phase === 'running' && nextCheckpoint < nPts ? `${nextCheckpoint + 1} / ${nPts}` : '—'}
                </p>
              </div>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[10px] text-white/40">
                <span>Points validés</span>
                <span>{Math.round(progressCheckpoints * 100)} %</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.1]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-orange to-brand-ice transition-[width]"
                  style={{ width: `${Math.min(100, progressCheckpoints * 100)}%` }}
                />
              </div>
            </div>
            <p className="text-center text-[11px] text-white/45">
              {geoOk === false ? 'GPS faible — vérifie les autorisations.' : geoOk ? 'GPS actif' : '…'}
            </p>
            {phase === 'ended' && (
              <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3 py-3 text-sm">
                {saveState === 'saving' && <p className="text-white/70">Enregistrement du temps…</p>}
                {saveState === 'saved' && <p className="text-emerald-200/90">Temps enregistré au classement.</p>}
                {saveState === 'error' && <p className="text-amber-200/90">{err || 'Erreur.'}</p>}
                {saveState === 'idle' && err ? <p className="text-amber-200/90">{err}</p> : null}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
