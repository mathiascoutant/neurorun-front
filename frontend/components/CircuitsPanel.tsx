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
  CircuitListCard,
  DetailInfoCard,
  InfoRow,
  LeaderboardCard,
  fmtCircuitLength,
} from '@/components/circuit/CircuitPieces'
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

/** Rayons proposés, identiques à l’app mobile. */
const RADIUS_KM_OPTIONS = [3, 5, 10, 25, 50] as const

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

  return <div ref={containerRef} className="relative isolate z-0 h-[min(46vh,420px)] w-full overflow-hidden rounded-[20px] border border-white/[0.12] bg-black/20 md:h-[440px]" />
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
    <div className="member-app flex min-h-[100dvh] overflow-x-hidden md:h-[100dvh] md:min-h-0 md:overflow-hidden">
      <aside className="relative z-30 hidden min-h-0 w-[280px] shrink-0 flex-col border-r border-white/[0.06] bg-[#0a0c12] md:sticky md:top-0 md:flex md:max-h-[100dvh] md:h-screen">
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

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden md:h-[100dvh] md:overflow-y-auto">
        <MemberPageHeader
          title="Parcours"
          onMenuClick={() => setSidebarOpen((o) => !o)}
          menuOpen={sidebarOpen}
          onLogout={logout}
        />

        <main className="member-main-pad-b mx-auto w-full max-w-6xl flex-1 space-y-5 px-safe py-6 sm:space-y-6 sm:py-8">
          {posErr ? <p className="text-xs text-amber-200/90">{posErr}</p> : null}
          {leafletErr ? <p className="text-xs text-red-200/90">{leafletErr}</p> : null}
          {err ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">{err}</div>
          ) : null}

          {/* Contrôle segmenté (même repère que le sélecteur de période du tableau de bord). */}
          <div className="app-segment">
            <button
              type="button"
              aria-pressed={mode === 'explore'}
              className={`app-segment-item ${mode === 'explore' ? 'app-segment-item--on' : ''}`}
              onClick={() => {
                setMode('explore')
                setCreatePoints([])
              }}
            >
              Explorer
            </button>
            <button
              type="button"
              aria-pressed={mode === 'create'}
              className={`app-segment-item ${mode === 'create' ? 'app-segment-item--on' : ''}`}
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
              className="h-[min(46vh,420px)] w-full rounded-[20px] border border-white/[0.12] bg-black/30 md:h-[440px]"
              aria-hidden
            />
          ) : (
            <div className="flex h-[min(46vh,420px)] items-center justify-center rounded-[20px] border border-white/[0.12] bg-white/[0.03] text-sm text-white/45 md:h-[440px]">
              Chargement de la carte…
            </div>
          )}

          {mode === 'explore' ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 space-y-3">
                {/* Hauteur fixe : le titre de droite reste sur la même ligne de base. */}
                <div className="flex h-[52px] flex-col justify-start">
                  <h2 className="font-display text-[19px] font-semibold leading-tight text-white">
                    Autour de toi
                  </h2>
                  <p className="mt-1 text-[13px] leading-snug text-white/38">
                    Choisis un rayon, puis un parcours pour voir son détail.
                  </p>
                </div>

                <div className="member-scroll-x -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                  {RADIUS_KM_OPTIONS.map((km) => {
                    const sel = radiusKm === km
                    return (
                      <button
                        key={km}
                        type="button"
                        aria-pressed={sel}
                        onClick={() => setRadiusKm(km)}
                        className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[15px] transition ${
                          sel
                            ? 'border-brand-orange bg-brand-orange/15 font-medium text-brand-orange'
                            : 'border-white/[0.08] bg-white/[0.06] text-white/60 hover:border-white/20 hover:text-white/85'
                        }`}
                      >
                        {km} km
                      </button>
                    )
                  })}
                  <button
                    type="button"
                    className="btn-quiet shrink-0 px-3.5 text-[13px]"
                    style={{ minHeight: 0, paddingTop: 6, paddingBottom: 6 }}
                    onClick={() => void refreshNearby()}
                    disabled={loadingNear || !pos}
                  >
                    {loadingNear ? '…' : 'Actualiser'}
                  </button>
                </div>

                {nearby.length === 0 && !loadingNear ? (
                  <p className="py-8 text-center text-[15px] text-white/38">
                    Aucun parcours dans ce rayon.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {nearby.map((c) => {
                      const startPt = c.points[c.start_index] ?? c.points[0] ?? null
                      return (
                        <CircuitListCard
                          key={c.id}
                          circuit={c}
                          distanceToStartM={
                            pos && startPt ? haversineMeters(pos, startPt) : null
                          }
                          selected={selected?.id === c.id}
                          onOpen={() => void openDetail(c)}
                        />
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-3 lg:sticky lg:top-4">
                <div className="flex h-[52px] flex-col justify-start">
                  <h2 className="font-display text-[19px] font-semibold leading-tight text-white">
                    Détail du parcours
                  </h2>
                  <p className="mt-1 text-[13px] leading-snug text-white/38">
                    Statistiques, classement et lancement du chrono.
                  </p>
                </div>
                {!selected ? (
                  <div className="app-empty">
                    <p className="text-base font-semibold text-white/92">Aucun parcours sélectionné</p>
                    <p className="mx-auto mt-1.5 max-w-[280px] text-[13px] leading-[19px] text-white/38">
                      Choisis un parcours dans la liste ou sur la carte pour voir son détail.
                    </p>
                  </div>
                ) : detailLoading ? (
                  <div className="app-skeleton h-[288px]" />
                ) : detail ? (
                  <>
                    <DetailInfoCard title="À propos de ce parcours">
                      <InfoRow
                        label="Créé par"
                        value={
                          detail.circuit.creator_display_name?.trim() ||
                          (detail.circuit.created_by ? 'Membre NeuroRun' : '—')
                        }
                      />
                      <InfoRow
                        label="Distance totale"
                        value={fmtCircuitLength(
                          detail.circuit.length_m ??
                            pathLengthMeters(
                              orderedPathPoints(detail.circuit.points, detail.circuit.start_index),
                            ),
                        )}
                      />
                      <InfoRow
                        label="Record"
                        value={
                          detail.top_times.length > 0
                            ? `${formatDurationMs(detail.top_times[0].duration_ms)} · ${
                                detail.top_times[0].display_name || 'Anonyme'
                              }`
                            : 'Pas encore de temps'
                        }
                      />
                      <InfoRow label="Participants" value={detail.participant_count} />
                      <InfoRow label="Complétions" value={detail.completion_count_total} />
                    </DetailInfoCard>

                    {detail.top_times.length > 0 ? (
                      <LeaderboardCard
                        rows={detail.top_times.map((t) => ({
                          id: t.id,
                          name: t.display_name || 'Anonyme',
                          time: formatDurationMs(t.duration_ms),
                        }))}
                      />
                    ) : null}

                    <div className="rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-4">
                      <p className="text-[13px] leading-relaxed text-white/50">
                        Lance le chrono sur le tracé : départ au point 1, puis chaque point dans l’ordre ;
                        l’arrivée valide le temps.
                      </p>
                      {/* Chrono verrouillé sur le web : fonctionnalité annoncée comme à venir. */}
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        title="Prochainement disponible"
                        className="mt-3 inline-flex min-h-[50px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-[14px] border border-white/[0.1] bg-white/[0.05] px-5 py-3 text-sm font-medium text-white/40"
                      >
                        <svg
                          className="h-4 w-4 shrink-0"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
                          />
                        </svg>
                        Lancer le parcours
                      </button>
                      <p className="mt-2 text-center text-[11px] leading-relaxed text-white/35">
                        Prochainement disponible.
                      </p>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-center text-[13px] leading-relaxed text-white/60">
                Touche la carte pour placer tes points <strong className="font-medium text-white/85">dans l’ordre</strong>.
                Le tracé reste ouvert (pas de ligne entre le dernier et le premier point) ; le départ a un contour vert.
              </p>

              {/* Récapitulatif du tracé en cours, comme le bloc de stats de l’app. */}
              <div className="rounded-2xl border border-white/[0.12] bg-white/[0.04] px-4 py-3 text-center">
                <p className="text-[15px] font-medium text-white/92">
                  {createPoints.length} point{createPoints.length !== 1 ? 's' : ''} placé
                  {createPoints.length !== 1 ? 's' : ''}
                </p>
                {createPoints.length >= 2 ? (
                  <p className="mt-1 text-[13px] text-white/60">
                    Longueur du tracé :{' '}
                    <strong className="font-semibold text-brand-ice">
                      {formatDistanceM(pathLengthMeters(createPoints))}
                    </strong>
                  </p>
                ) : createPoints.length === 1 ? (
                  <p className="mt-1 text-[13px] text-white/38">
                    Ajoute un 2ᵉ point pour tracer la ligne et afficher la distance.
                  </p>
                ) : null}
              </div>

              <div className="rounded-[20px] border border-white/[0.08] bg-[#0d0f16] p-4">
                <div className="flex flex-wrap gap-3">
                  <label className="block min-w-[200px] flex-1">
                    <span className="text-[13px] text-white/60">Nom du parcours</span>
                    <input
                      className="field mt-1.5 w-full"
                      value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Mon parcours"
                      maxLength={48}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] text-white/60">Départ = point n°</span>
                    <select
                      className="field mt-1.5 block"
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

                <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    className="btn-quiet flex-1 text-sm"
                    onClick={() => setCreatePoints((p) => p.slice(0, -1))}
                    disabled={createPoints.length === 0}
                  >
                    Retirer le dernier point
                  </button>
                  <button
                    type="button"
                    className="btn-quiet flex-1 text-sm"
                    onClick={() => setCreatePoints([])}
                    disabled={createPoints.length === 0}
                  >
                    Tout effacer
                  </button>
                </div>
                <button
                  type="button"
                  className="btn-brand mt-2 w-full"
                  disabled={busy || createPoints.length < 2 || !createName.trim()}
                  onClick={() => void submitCreate()}
                >
                  {busy ? 'Publication…' : 'Enregistrer le parcours'}
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
