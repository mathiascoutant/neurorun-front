import type { CircuitLatLng } from '@/lib/api'

/**
 * Routage piéton via Valhalla (instance publique OSM.de).
 * `ignore_oneways` + `ignore_restrictions` : pas de détours imposés par les sens uniques véhicule
 * ou restrictions de virage — adapté à un tracé course à pied sur la voirie.
 */

type ValhallaRouteResponse = {
  error_code?: number
  error?: string
  trip?: {
    status?: number
    locations?: { lat: number; lon: number }[]
    legs?: { shape: string }[]
  }
}

export type RoutedDisplay = {
  /** Leaflet [lat, lng][] */
  latlngs: [number, number][]
  /** Ancres d’itinéraire (positions corrigées sur le graphe quand disponibles). */
  snappedPoints: CircuitLatLng[]
}

const VALHALLA_ROUTE = 'https://valhalla1.openstreetmap.de/route'

/** Polyline précision 6 (Valhalla / Mapbox). */
function decodePolyline6(encoded: string): [number, number][] {
  const coordinates: [number, number][] = []
  let index = 0
  let lat = 0
  let lng = 0
  const factor = 1e6

  while (index < encoded.length) {
    let b = 0
    let shift = 0
    let result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlat = result & 1 ? ~(result >> 1) : result >> 1
    lat += dlat

    shift = 0
    result = 0
    do {
      b = encoded.charCodeAt(index++) - 63
      result |= (b & 0x1f) << shift
      shift += 5
    } while (b >= 0x20)
    const dlng = result & 1 ? ~(result >> 1) : result >> 1
    lng += dlng

    coordinates.push([lat / factor, lng / factor])
  }

  return coordinates
}

function concatLatlngs(parts: [number, number][][]): [number, number][] {
  const out: [number, number][] = []
  const eps = 1e-7
  for (const part of parts) {
    for (const pt of part) {
      const last = out[out.length - 1]
      if (!last || Math.abs(last[0] - pt[0]) > eps || Math.abs(last[1] - pt[1]) > eps) {
        out.push(pt)
      }
    }
  }
  return out
}

/**
 * Itinéraire piéton entre waypoints : suit la voirie sans imposer les contraintes automobile
 * (sens uniques, restrictions) qui provoquent des détours artificiels.
 */
export async function fetchWalkingRouteDisplay(
  points: CircuitLatLng[],
  signal?: AbortSignal,
): Promise<RoutedDisplay | null> {
  if (points.length < 2) return null

  const body = {
    locations: points.map((p) => ({ lat: p.lat, lon: p.lng })),
    costing: 'pedestrian',
    costing_options: {
      pedestrian: {
        ignore_oneways: true,
        ignore_restrictions: true,
      },
    },
    units: 'kilometers',
  }

  try {
    const res = await fetch(VALHALLA_ROUTE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as ValhallaRouteResponse
    if (data.error_code != null) return null
    const trip = data.trip
    if (!trip || trip.status !== 0 || !trip.legs?.length) return null

    const segmentCoords = trip.legs.map((leg) => decodePolyline6(leg.shape))
    const latlngs = concatLatlngs(segmentCoords)
    if (latlngs.length < 2) return null

    const locs = trip.locations
    const snappedPoints: CircuitLatLng[] =
      locs && locs.length === points.length
        ? locs.map((l) => ({ lat: l.lat, lng: l.lon }))
        : [...points]

    return { latlngs, snappedPoints }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return null
    return null
  }
}
