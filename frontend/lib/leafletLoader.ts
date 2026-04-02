/** Charge Leaflet depuis unpkg (tiles OSM). */

let leafletPromise: Promise<unknown> | null = null

export function loadLeaflet(): Promise<unknown> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('leaflet: window'))
  }
  const w = window as unknown as { L?: unknown }
  if (w.L) return Promise.resolve(w.L)
  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
      if (!document.querySelector(`link[href="${href}"]`)) {
        const css = document.createElement('link')
        css.rel = 'stylesheet'
        css.href = href
        document.head.appendChild(css)
      }
      const s = document.createElement('script')
      s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
      s.async = true
      s.onload = () => {
        const L = (window as unknown as { L?: { Icon: { Default: { prototype: unknown; mergeOptions: (o: unknown) => void } } } })
          .L
        if (!L) {
          reject(new Error('leaflet'))
          return
        }
        delete (L.Icon.Default.prototype as { _getIconUrl?: unknown })._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        })
        resolve(L)
      }
      s.onerror = () => reject(new Error('leaflet script'))
      document.body.appendChild(s)
    })
  }
  return leafletPromise
}
