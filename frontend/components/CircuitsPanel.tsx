'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchWalkingRouteDisplay, type RoutedDisplay } from '@/lib/osrmRouting'
import { CircuitRunPanel } from '@/components/CircuitRunPanel'
import { Mark } from '@/components/Mark'
import { MemberMobileDrawer } from '@/components/MemberMobileDrawer'
import { MemberPageHeader } from '@/components/MemberPageHeader'
import { MemberPrimaryNav } from '@/components/MemberPrimaryNav'
import {
  ApiError,
  createCircuit,
  fetchCircuitDetail,
  fetchCircuitsNear,
  fetchMe,
  type CircuitDetailResponse,
  type CircuitLatLng,
  type CircuitSummary,
  type MeUser,
} from '@/lib/api'
import { loadLeaflet } from '@/lib/leafletLoader'
import { clearToken, getToken } from '@/lib/auth'

/** Ordre de visite à partir du départ, sans dupliquer le 1er point à la fin (tracé ouvert sur la carte). */
function orderedPathPoints(pts: CircuitLatLng[], start: number): CircuitLatLng[] {
  const n = pts.length
  if (n === 0) return []
  const out: CircuitLatLng[] = []
  for (let i = 0; i < n; i++) {
    out.push(pts[(start + i) % n]!)
  }
  return out
}

const EARTH_R_M = 6_371_000

function haversineMeters(a: CircuitLatLng, b: CircuitLatLng): number {
  const toR = (d: number) => (d * Math.PI) / 180
  const dLat = toR(b.lat - a.lat)
  const dLng = toR(b.lng - a.lng)
  const la = toR(a.lat)
  const lb = toR(b.lat)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la) * Math.cos(lb) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_R_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

function pathLengthMeters(pts: CircuitLatLng[]): number {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += haversineMeters(pts[i - 1]!, pts[i]!)
  return s
}

function formatDistanceM(m: number): string {
  if (!Number.isFinite(m) || m < 0) return '—'
  if (m < 1000) return `${Math.round(m)} m`
  return `${(m / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km`
}

function formatDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
  return `${m}:${String(r).padStart(2, '0')}`
}

type MapInnerProps = {
  leaflet: unknown
  center: CircuitLatLng
  zoom: number
  /** Parcours existants (aperçu) */
  nearby: CircuitSummary[]
  selectedId: string | null
  /** Mode création : clic = nouveau point */
  createMode: boolean
  createPoints: CircuitLatLng[]
  createStartIndex: number
  userPos: CircuitLatLng | null
  detailPoints: CircuitLatLng[] | null
  detailStart: number
  onMapClick?: (ll: CircuitLatLng) => void
  /** Clic sur le marqueur d’un parcours « autour de moi » → ouvrir le détail */
  onSelectNearbyCircuit?: (c: CircuitSummary) => void
  /** Clic sur le fond de carte (mode Explorer) → retirer la sélection */
  onMapBackgroundClick?: () => void
}

function MapInner({
  leaflet,
  center,
  zoom,
  nearby,
  selectedId,
  createMode,
  createPoints,
  createStartIndex,
  userPos,
  detailPoints,
  detailStart,
  onMapClick,
  onSelectNearbyCircuit,
  onMapBackgroundClick,
}: MapInnerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<{
    setView: (ll: [number, number], z: number) => void
    remove: () => void
    on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void
    off: (ev: string, fn?: (e: { latlng: { lat: number; lng: number } }) => void) => void
  } | null>(null)
  const layersRef = useRef<{ clearLayers: () => void } | null>(null)
  const LRef = useRef<any>(null)
  const clickRef = useRef(onMapClick)
  clickRef.current = onMapClick
  const nearbySelectRef = useRef(onSelectNearbyCircuit)
  nearbySelectRef.current = onSelectNearbyCircuit
  const mapBgRef = useRef(onMapBackgroundClick)
  mapBgRef.current = onMapBackgroundClick

  const [detailRouted, setDetailRouted] = useState<RoutedDisplay | null>(null)
  const [createRouted, setCreateRouted] = useState<RoutedDisplay | null>(null)
  const [nearbySelRouted, setNearbySelRouted] = useState<RoutedDisplay | null>(null)

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    if (!detailPoints || detailPoints.length < 2) {
      setDetailRouted(null)
      return () => {
        cancelled = true
        ac.abort()
      }
    }
    const path = orderedPathPoints(detailPoints, detailStart)
    setDetailRouted(null)
    void fetchWalkingRouteDisplay(path, ac.signal)
      .then((r) => {
        if (!cancelled) setDetailRouted(r)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!cancelled) setDetailRouted(null)
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [detailPoints, detailStart])

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    if (createPoints.length < 2) {
      setCreateRouted(null)
      return () => {
        cancelled = true
        ac.abort()
      }
    }
    setCreateRouted(null)
    void fetchWalkingRouteDisplay(createPoints, ac.signal)
      .then((r) => {
        if (!cancelled) setCreateRouted(r)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!cancelled) setCreateRouted(null)
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [createPoints])

  useEffect(() => {
    let cancelled = false
    const ac = new AbortController()
    if (detailPoints && detailPoints.length >= 2) {
      setNearbySelRouted(null)
      return () => {
        cancelled = true
        ac.abort()
      }
    }
    if (!selectedId) {
      setNearbySelRouted(null)
      return () => {
        cancelled = true
        ac.abort()
      }
    }
    const c = nearby.find((x) => x.id === selectedId)
    if (!c || c.points.length < 2) {
      setNearbySelRouted(null)
      return () => {
        cancelled = true
        ac.abort()
      }
    }
    const path = orderedPathPoints(c.points, c.start_index)
    setNearbySelRouted(null)
    void fetchWalkingRouteDisplay(path, ac.signal)
      .then((r) => {
        if (!cancelled) setNearbySelRouted(r)
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        if (!cancelled) setNearbySelRouted(null)
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [detailPoints, selectedId, nearby])

  useEffect(() => {
    const el = containerRef.current
    if (!el || !leaflet) return
    const L = leaflet
    LRef.current = L
    type LL = {
      map: (x: HTMLElement) => {
        setView: (ll: [number, number], z: number) => unknown
        remove: () => void
        on: (ev: string, fn: (e: { latlng: { lat: number; lng: number } }) => void) => void
        off: (ev: string, fn?: (e: { latlng: { lat: number; lng: number } }) => void) => void
      }
      tileLayer: (url: string, o: { attribution: string; maxZoom: number }) => { addTo: (m: unknown) => unknown }
      layerGroup: () => { addTo: (m: unknown) => unknown; clearLayers: () => void }
    }
    const Ll = L as LL
    const map = Ll.map(el)
    map.setView([center.lat, center.lng], zoom)
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
  }, [leaflet, center.lat, center.lng, zoom])

  useEffect(() => {
    const map = mapRef.current
    const layers = layersRef.current
    const leafletApi = LRef.current
    if (!map || !layers || !leafletApi) return

    const onMapClickUnified = (e: { latlng: { lat: number; lng: number } }) => {
      if (createMode) {
        if (clickRef.current) clickRef.current({ lat: e.latlng.lat, lng: e.latlng.lng })
      } else if (mapBgRef.current) {
        mapBgRef.current()
      }
    }
    map.off('click')
    map.on('click', onMapClickUnified)

    layers.clearLayers()
    function escapeHtml(s: string) {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')
    }
    if (userPos) {
      leafletApi
        .circleMarker([userPos.lat, userPos.lng], { radius: 8, color: '#fc4c02', fillOpacity: 0.35, interactive: false })
        .addTo(layers)
    }
    if (detailPoints && detailPoints.length >= 2) {
      const path = orderedPathPoints(detailPoints, detailStart)
      const straight: [number, number][] = path.map((p) => [p.lat, p.lng])
      const latlngs = detailRouted?.latlngs ?? straight
      leafletApi.polyline(latlngs, { color: '#38bdf8', weight: 4, interactive: false }).addTo(layers)
      const dep = detailRouted?.snappedPoints[0] ?? path[0]
      if (dep) {
        leafletApi
          .circleMarker([dep.lat, dep.lng], {
            radius: 11,
            color: '#fff',
            weight: 3,
            fillColor: '#38bdf8',
            fillOpacity: 1,
          })
          .addTo(layers)
          .bindPopup('Départ')
      }
    } else if (createPoints.length >= 2) {
      const straight: [number, number][] = createPoints.map((p) => [p.lat, p.lng])
      const latlngs = createRouted?.latlngs ?? straight
      leafletApi.polyline(latlngs, { color: '#a3e635', weight: 4, dashArray: '6 8', interactive: false }).addTo(layers)
    }
    nearby.forEach((c) => {
      if (detailPoints && detailPoints.length >= 2 && c.id === selectedId) return
      const isSel = c.id === selectedId
      const col = isSel ? '#fc4c02' : '#94a3b8'
      if (c.points.length >= 2) {
        const path = orderedPathPoints(c.points, c.start_index)
        const straight: [number, number][] = path.map((p) => [p.lat, p.lng])
        const latlngs = isSel && nearbySelRouted ? nearbySelRouted.latlngs : straight
        leafletApi.polyline(latlngs, { color: col, weight: isSel ? 5 : 3, interactive: false }).addTo(layers)
      }
      const pts = c.points
      const si = c.start_index
      const startPtRaw = pts.length > 0 && si >= 0 && si < pts.length ? pts[si] : undefined
      const startPtSnap = isSel ? nearbySelRouted?.snappedPoints[0] : undefined
      const startPt = startPtSnap ?? startPtRaw
      const cen = c.center?.coordinates as number[] | undefined
      const pinLatLng: [number, number] | null =
        startPt != null
          ? [startPt.lat, startPt.lng]
          : cen != null && cen.length >= 2
            ? [cen[1]!, cen[0]!]
            : null
      if (pinLatLng) {
        const mk = leafletApi
          .marker(pinLatLng)
          .addTo(layers)
          .bindPopup(
            `<strong>${escapeHtml(c.name)}</strong><br/><span style="font-size:11px;opacity:.85">Départ (point ${si + 1})</span><br/><span style="font-size:11px;color:#94a3b8">Clic pour les détails</span>`,
          )
        mk.on('click', (ev: { originalEvent?: Event }) => {
          ev.originalEvent?.stopPropagation?.()
          if (nearbySelectRef.current) nearbySelectRef.current(c)
        })
      }
    })
    createPoints.forEach((p, i) => {
      const n = i + 1
      const isStart = i === createStartIndex
      const pos = createRouted?.snappedPoints[i] ?? p
      const html = `<div style="width:28px;height:28px;border-radius:9999px;background:#fc4c02;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid ${
        isStart ? '#a3e635' : '#fff'
      };box-shadow:0 1px 4px rgba(0,0,0,.45);font-family:system-ui,sans-serif">${n}</div>`
      const icon = leafletApi.divIcon({
        className: '',
        html,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      })
      leafletApi.marker([pos.lat, pos.lng], { icon }).addTo(layers)
    })
  }, [
    nearby,
    selectedId,
    createMode,
    createPoints,
    createStartIndex,
    userPos,
    detailPoints,
    detailStart,
    detailRouted,
    createRouted,
    nearbySelRouted,
  ])

  useEffect(() => {
    const m = mapRef.current
    if (m) m.setView([center.lat, center.lng], zoom)
  }, [center.lat, center.lng, zoom])

  return <div ref={containerRef} className="h-[min(52vh,520px)] w-full rounded-xl border border-white/10 bg-black/20 md:h-[420px]" />
}

export function CircuitsPanel() {
  const router = useRouter()
  const [me, setMe] = useState<MeUser | null>(null)
  const [Lmod, setLmod] = useState<unknown>(null)
  const [leafletErr, setLeafletErr] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [pos, setPos] = useState<CircuitLatLng | null>(null)
  const [posErr, setPosErr] = useState('')
  const [radiusKm, setRadiusKm] = useState(25)
  const [nearby, setNearby] = useState<CircuitSummary[]>([])
  const [loadingNear, setLoadingNear] = useState(false)
  const [selected, setSelected] = useState<CircuitSummary | null>(null)
  const [detail, setDetail] = useState<CircuitDetailResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [mode, setMode] = useState<'explore' | 'create'>('explore')
  const [createPoints, setCreatePoints] = useState<CircuitLatLng[]>([])
  const [createName, setCreateName] = useState('')
  const [createStart, setCreateStart] = useState(0)
  const [circuitRunOpen, setCircuitRunOpen] = useState(false)
  const [circuitRunPortal, setCircuitRunPortal] = useState<HTMLElement | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setCircuitRunPortal(document.body)
  }, [])
  const [err, setErr] = useState('')

  const ct = me?.capabilities?.circuit_tracks
  const hasCap = ct === true || (ct === undefined && me?.plan === 'performance')

  useEffect(() => {
    loadLeaflet().then(setLmod).catch(() => setLeafletErr('Impossible de charger la carte (réseau).'))
  }, [])

  useEffect(() => {
    const t = getToken()
    if (!t) {
      router.replace('/login/?next=/circuit/')
      return
    }
    fetchMe(t)
      .then(setMe)
      .catch(() => {
        clearToken()
        router.replace('/login/?next=/circuit/')
      })
  }, [router])

  const refreshNearby = useCallback(async () => {
    const t = getToken()
    if (!t || !pos) return
    setLoadingNear(true)
    setErr('')
    try {
      const r = await fetchCircuitsNear(t, pos.lat, pos.lng, radiusKm)
      setNearby(r.circuits ?? [])
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setLoadingNear(false)
    }
  }, [pos, radiusKm])

  useEffect(() => {
    if (pos) void refreshNearby()
  }, [pos, refreshNearby])

  useEffect(() => {
    if (!navigator.geolocation) {
      setPosErr('Géolocalisation non disponible')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude })
        setPosErr('')
      },
      () => {
        setPosErr('Active la localisation ou entre une position manuellement (voir ci-dessous).')
        setPos({ lat: 48.8566, lng: 2.3522 })
      },
      { enableHighAccuracy: true, maximumAge: 60_000, timeout: 15_000 },
    )
  }, [])

  const openDetail = async (c: CircuitSummary) => {
    const t = getToken()
    if (!t) return
    setSelected(c)
    setDetail(null)
    setDetailLoading(true)
    setErr('')
    setMode('explore')
    setCircuitRunOpen(false)
    try {
      const d = await fetchCircuitDetail(t, c.id)
      setDetail(d)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setDetailLoading(false)
    }
  }

  const mapCenter = pos ?? { lat: 46.5, lng: 2.5 }

  const submitCreate = async () => {
    const t = getToken()
    if (!t) return
    if (createPoints.length < 3) {
      setErr('Place au moins 3 points sur la carte.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const c = await createCircuit(t, {
        name: createName,
        points: createPoints,
        start_index: createStart,
      })
      setCreatePoints([])
      setCreateName('')
      setCreateStart(0)
      setMode('explore')
      await refreshNearby()
      await openDetail(c)
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Erreur'
      setErr(msg)
    } finally {
      setBusy(false)
    }
  }

  const logout = () => {
    clearToken()
    window.location.href = '/login/'
  }

  if (!me) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center text-white/60">
        Chargement…
      </div>
    )
  }

  if (!hasCap) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-white/75">Les parcours chronométrés sont réservés à l’offre Performance.</p>
        <Link href="/profile/" className="btn-brand px-5 py-2.5 text-sm">
          Voir mon offre
        </Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-[100dvh] overflow-x-hidden">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-surface-1/95 backdrop-blur-xl md:sticky md:top-0 md:flex md:max-h-[100dvh] md:h-screen">
        <div className="border-b border-white/[0.06] px-safe pt-safe pb-3">
          <Link href="/dashboard/" aria-label="NeuroRun">
            <Mark compact />
          </Link>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
          <MemberPrimaryNav
            active="circuit"
            capabilities={me.capabilities}
            isAdmin={me.role === 'admin'}
            profileFirstName={me.first_name}
          />
        </div>
      </aside>

      <MemberMobileDrawer
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        headerLeading={
          <Link href="/dashboard/" onClick={() => setSidebarOpen(false)} className="inline-flex" aria-label="NeuroRun">
            <Mark compact />
          </Link>
        }
      >
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden p-2 px-safe pb-safe">
          <MemberPrimaryNav
            active="circuit"
            onNavigate={() => setSidebarOpen(false)}
            capabilities={me.capabilities}
            isAdmin={me.role === 'admin'}
            profileFirstName={me.first_name}
          />
        </div>
      </MemberMobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <MemberPageHeader
          title="Parcours"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
        />

        <main className="member-main-pad-b mx-auto w-full max-w-6xl flex-1 space-y-5 px-safe py-6 sm:space-y-6 sm:py-8">
          <p className="text-sm text-white/55">
            Carte des parcours autour de toi, création point par point, classement des 10 meilleurs temps. Les noms sont
            filtrés automatiquement (caractères et mots interdits).
          </p>

          {posErr ? <p className="text-xs text-amber-200/90">{posErr}</p> : null}
          {leafletErr ? <p className="text-xs text-red-200/90">{leafletErr}</p> : null}
          {err ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{err}</div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-xs font-medium ${
                mode === 'explore' ? 'bg-brand-orange/25 text-white ring-1 ring-brand-orange/45' : 'border border-white/10 bg-white/[0.04] text-white/65'
              }`}
              onClick={() => {
                setMode('explore')
                setCreatePoints([])
              }}
            >
              Explorer
            </button>
            <button
              type="button"
              className={`rounded-xl px-3 py-2 text-xs font-medium ${
                mode === 'create' ? 'bg-brand-orange/25 text-white ring-1 ring-brand-orange/45' : 'border border-white/10 bg-white/[0.04] text-white/65'
              }`}
              onClick={() => {
                setMode('create')
                setSelected(null)
                setDetail(null)
                setCircuitRunOpen(false)
              }}
            >
              Créer un parcours
            </button>
          </div>

          {Lmod && !leafletErr && !circuitRunOpen ? (
            <MapInner
              leaflet={Lmod}
              center={mapCenter}
              zoom={pos ? 14 : 6}
              nearby={mode === 'explore' ? nearby : []}
              selectedId={selected?.id ?? null}
              createMode={mode === 'create'}
              createPoints={createPoints}
              createStartIndex={createStart}
              userPos={pos}
              detailPoints={detail?.circuit.points ?? null}
              detailStart={detail?.circuit.start_index ?? 0}
              onMapClick={(ll) => setCreatePoints((prev) => [...prev, ll])}
              onSelectNearbyCircuit={(c) => void openDetail(c)}
              onMapBackgroundClick={() => {
                setSelected(null)
                setDetail(null)
              }}
            />
          ) : Lmod && !leafletErr && circuitRunOpen ? (
            <div
              className="h-[min(52vh,520px)] w-full rounded-xl border border-white/10 bg-black/30 md:h-[420px]"
              aria-hidden
            />
          ) : (
            <div className="flex h-[320px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-sm text-white/45">
              Chargement de la carte…
            </div>
          )}

          {mode === 'explore' ? (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="panel p-4">
                <h2 className="font-display text-sm font-semibold text-white">Rayon de recherche</h2>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <label className="text-xs text-white/50">
                    km
                    <input
                      type="number"
                      className="field ml-2 mt-1 max-w-[100px]"
                      min={1}
                      max={200}
                      value={radiusKm}
                      onChange={(e) => setRadiusKm(Math.min(200, Math.max(1, parseInt(e.target.value, 10) || 25)))}
                    />
                  </label>
                  <button type="button" className="btn-quiet px-3 py-2 text-xs" onClick={() => void refreshNearby()} disabled={loadingNear || !pos}>
                    {loadingNear ? '…' : 'Actualiser'}
                  </button>
                </div>
                <ul className="mt-4 max-h-56 space-y-2 overflow-y-auto text-sm">
                  {nearby.length === 0 ? (
                    <li className="text-white/45">Aucun parcours dans ce rayon.</li>
                  ) : (
                    nearby.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                            selected?.id === c.id ? 'border-brand-orange/45 bg-brand-orange/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
                          }`}
                          onClick={() => void openDetail(c)}
                        >
                          <span className="font-medium text-white">{c.name}</span>
                          <span className="mt-0.5 block text-[10px] text-white/40">
                            {formatDistanceM(pathLengthMeters(orderedPathPoints(c.points, c.start_index)))}
                          </span>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </div>
              <div className="panel p-4">
                <h2 className="font-display text-sm font-semibold text-white">Détail</h2>
                {!selected ? (
                  <p className="mt-3 text-sm text-white/45">Sélectionne un parcours.</p>
                ) : detailLoading ? (
                  <p className="mt-3 text-sm text-white/45">Chargement…</p>
                ) : detail ? (
                  <div className="mt-3 space-y-4 text-sm">
                    <div>
                      <p className="text-white/85">{detail.circuit.name}</p>
                      <p className="mt-1 text-xs text-white/45">
                        Participants distincts : <strong className="text-white/70">{detail.participant_count}</strong> ·
                        Passages enregistrés :{' '}
                        <strong className="text-white/70">{detail.completion_count_total}</strong>
                      </p>
                      {detail.circuit.points.length >= 2 ? (
                        <p className="mt-1 text-xs text-white/45">
                          Longueur du tracé affiché :{' '}
                          <strong className="text-white/70">
                            {formatDistanceM(
                              pathLengthMeters(orderedPathPoints(detail.circuit.points, detail.circuit.start_index)),
                            )}
                          </strong>
                        </p>
                      ) : null}
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-white/40">Top 10</p>
                      <ol className="mt-2 space-y-1.5">
                        {detail.top_times.length === 0 ? (
                          <li className="text-white/45">Pas encore de temps.</li>
                        ) : (
                          detail.top_times.map((t, i) => (
                            <li key={t.id} className="flex justify-between gap-2 text-white/80">
                              <span>
                                {i + 1}. {t.display_name ?? 'Coureur'}
                              </span>
                              <span className="shrink-0 font-mono text-brand-ice/90">{formatDurationMs(t.duration_ms)}</span>
                            </li>
                          ))
                        )}
                      </ol>
                    </div>
                    <div className="border-t border-white/[0.06] pt-3">
                      <p className="text-xs text-white/50">
                        Lance le chrono sur le tracé : départ au point 1, puis chaque point dans l’ordre ; l’arrivée valide
                        le temps.
                      </p>
                      <button
                        type="button"
                        className="btn-brand mt-3 w-full px-4 py-2.5 text-sm sm:w-auto"
                        disabled={busy || detail.circuit.points.length < 2}
                        onClick={() => setCircuitRunOpen(true)}
                      >
                        Faire le circuit
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-white/45">—</p>
                )}
              </div>
            </div>
          ) : (
            <div className="panel space-y-4 p-4">
              <p className="text-sm text-white/65">
                Clique sur la carte pour placer les points <strong className="text-white/80">dans l’ordre</strong>. Le tracé
                reste <strong className="text-white/80">ouvert</strong> (pas de ligne entre le dernier et le premier point).
                Les pastilles numérotées sont visibles sur la carte ; le point de départ a un contour vert.
              </p>
              {createPoints.length >= 2 ? (
                <div className="rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3">
                  <p className="text-sm text-white/85">
                    Distance totale :{' '}
                    <strong className="font-mono text-brand-ice">{formatDistanceM(pathLengthMeters(createPoints))}</strong>
                  </p>
                </div>
              ) : createPoints.length === 1 ? (
                <p className="text-xs text-white/45">Ajoute au moins un 2ᵉ point pour tracer la ligne et afficher la distance.</p>
              ) : null}
              <div className="flex flex-wrap gap-3">
                <label className="block min-w-[200px] flex-1 text-xs text-white/45">
                  Nom du parcours
                  <input
                    className="field mt-1 w-full"
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="ex. : Lac nord"
                    maxLength={48}
                  />
                </label>
                <label className="text-xs text-white/45">
                  Départ = point n°
                  <select
                    className="field mt-1 block"
                    value={createStart}
                    onChange={(e) => setCreateStart(parseInt(e.target.value, 10))}
                    disabled={createPoints.length === 0}
                  >
                    {createPoints.map((_, i) => (
                      <option key={i} value={i}>
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-quiet px-3 py-2 text-xs" onClick={() => setCreatePoints((p) => p.slice(0, -1))} disabled={createPoints.length === 0}>
                  Retirer dernier point
                </button>
                <button type="button" className="btn-quiet px-3 py-2 text-xs" onClick={() => setCreatePoints([])}>
                  Tout effacer
                </button>
                <button type="button" className="btn-brand px-4 py-2 text-xs" disabled={busy} onClick={() => void submitCreate()}>
                  Publier le parcours
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
      {circuitRunOpen && detail && Lmod && selected && circuitRunPortal
        ? createPortal(
            <CircuitRunPanel
              circuitId={selected.id}
              circuitName={detail.circuit.name}
              orderedPoints={orderedPathPoints(detail.circuit.points, detail.circuit.start_index)}
              leaflet={Lmod}
              onClose={() => setCircuitRunOpen(false)}
              onSaved={async () => {
                const t = getToken()
                if (!t) return
                try {
                  const d = await fetchCircuitDetail(t, selected.id)
                  setDetail(d)
                } catch {
                  /* ignore */
                }
                setCircuitRunOpen(false)
              }}
            />,
            circuitRunPortal,
          )
        : null}
    </div>
  )
}
