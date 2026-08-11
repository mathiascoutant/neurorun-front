'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

/* ————————————————————————————————————————————————————————————————
 * Briques communes de la console admin.
 *
 * Les actions destructrices et les retours d’erreur passaient par `confirm()` et
 * `alert()` : bloquants, hors charte, et impossibles à nuancer (on ne distingue
 * pas « supprimer un chrono » de « supprimer un compte »). On les remplace par
 * une file de notifications et une boîte de confirmation qui sait exiger la
 * saisie d’un mot avant d’armer le bouton.
 * ———————————————————————————————————————————————————————————————— */

/* ——— Notifications ——— */

type ToastKind = 'ok' | 'error' | 'info'
type ToastItem = { id: number; kind: ToastKind; text: string }

const ToastCtx = createContext<(kind: ToastKind, text: string) => void>(() => {})

/** `notify('ok', 'Offre enregistrée')` depuis n’importe quel panneau. */
export function useNotify() {
  return useContext(ToastCtx)
}

function ToastIcon({ kind }: { kind: ToastKind }) {
  const path =
    kind === 'ok'
      ? 'M4.5 12.75l6 6 9-13.5'
      : kind === 'error'
        ? 'M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
        : 'M11.25 11.25h1.5v5.25m-.75-9h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z'
  const tone = kind === 'ok' ? 'text-emerald-300' : kind === 'error' ? 'text-red-300' : 'text-brand-ice'
  return (
    <svg
      className={`mt-px h-4 w-4 shrink-0 ${tone}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  )
}

/* ——— Confirmation ——— */

type ConfirmSpec = {
  title: string
  body?: ReactNode
  confirmLabel?: string
  danger?: boolean
  /** Mot à recopier pour armer le bouton (suppressions irréversibles). */
  requireText?: string
}

const ConfirmCtx = createContext<(spec: ConfirmSpec) => Promise<boolean>>(async () => false)

/** `if (!(await confirm({ … }))) return` — même usage que `window.confirm`. */
export function useConfirm() {
  return useContext(ConfirmCtx)
}

/**
 * Fournit notifications et confirmations à tout l’arbre admin.
 */
export function AdminUiProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmSpec | null>(null)
  const [typed, setTyped] = useState('')
  const resolver = useRef<((ok: boolean) => void) | null>(null)
  const nextId = useRef(1)

  const notify = useCallback((kind: ToastKind, text: string) => {
    const id = nextId.current++
    setToasts((list) => [...list, { id, kind, text }])
    window.setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 7000 : 4000)
  }, [])

  const confirm = useCallback((spec: ConfirmSpec) => {
    setTyped('')
    setConfirmState(spec)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = useCallback((ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setConfirmState(null)
    setTyped('')
  }, [])

  const armed = !confirmState?.requireText || typed.trim().toUpperCase() === confirmState.requireText.toUpperCase()

  return (
    <ToastCtx.Provider value={notify}>
      <ConfirmCtx.Provider value={confirm}>
        {children}

        <div
          className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
          role="status"
          aria-live="polite"
        >
          {toasts.map((t) => (
            <div key={t.id} className={`toast pointer-events-auto toast--${t.kind}`}>
              <ToastIcon kind={t.kind} />
              <p className="min-w-0 flex-1">{t.text}</p>
              <button
                type="button"
                className="shrink-0 text-white/35 transition hover:text-white"
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
                aria-label="Fermer"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
                  <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>

        {confirmState ? (
          <Modal onClose={() => settle(false)} labelledBy="admin-confirm-title" width="max-w-md">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <span
                  className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${
                    confirmState.danger
                      ? 'border-red-500/30 bg-red-500/10 text-red-300'
                      : 'border-white/10 bg-white/[0.05] text-brand-ice'
                  }`}
                  aria-hidden
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m0 3.75h.008M10.34 3.94l-7.6 13.15A1.5 1.5 0 004.04 19.5h15.92a1.5 1.5 0 001.3-2.25l-7.6-13.15a1.5 1.5 0 00-2.6 0z"
                    />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <h2 id="admin-confirm-title" className="font-display text-base font-semibold text-white">
                    {confirmState.title}
                  </h2>
                  {confirmState.body ? (
                    <div className="mt-1.5 text-[13px] leading-relaxed text-white/60">{confirmState.body}</div>
                  ) : null}
                </div>
              </div>

              {confirmState.requireText ? (
                <div className="mt-4">
                  <label htmlFor="admin-confirm-input" className="text-xs text-white/45">
                    Tape <span className="font-mono font-semibold text-white/85">{confirmState.requireText}</span> pour
                    confirmer
                  </label>
                  <input
                    id="admin-confirm-input"
                    autoFocus
                    className="field mt-1.5 font-mono"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && armed) settle(true)
                    }}
                  />
                </div>
              ) : null}

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" className="btn-quiet px-4 text-sm" onClick={() => settle(false)}>
                  Annuler
                </button>
                <button
                  type="button"
                  autoFocus={!confirmState.requireText}
                  disabled={!armed}
                  className={
                    confirmState.danger
                      ? 'inline-flex min-h-[50px] items-center justify-center rounded-[14px] border border-red-500/40 bg-red-500/15 px-5 text-sm font-semibold text-red-100 transition hover:bg-red-500/25 disabled:pointer-events-none disabled:opacity-40'
                      : 'btn-brand px-5 text-sm'
                  }
                  onClick={() => settle(true)}
                >
                  {confirmState.confirmLabel ?? 'Confirmer'}
                </button>
              </div>
            </div>
          </Modal>
        ) : null}
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  )
}

/* ——— Conteneurs ——— */

/** Ferme la couche au clavier (Échap) et bloque le défilement du fond. */
function useOverlay(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])
}

export function Modal({
  children,
  onClose,
  labelledBy,
  width = 'max-w-lg',
}: {
  children: ReactNode
  onClose: () => void
  labelledBy?: string
  width?: string
}) {
  useOverlay(onClose)
  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`modal-panel panel w-full ${width} max-h-[92dvh] overflow-y-auto rounded-b-none sm:rounded-b-[20px]`}
      >
        {children}
      </div>
    </div>
  )
}

/** Panneau latéral : pour consulter une fiche sans quitter la liste. */
export function Drawer({
  children,
  onClose,
  labelledBy,
}: {
  children: ReactNode
  onClose: () => void
  labelledBy?: string
}) {
  useOverlay(onClose)
  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/65 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy} className="drawer-panel h-[100dvh]">
        {children}
      </div>
    </div>
  )
}

/* ——— Éléments d’interface ——— */

export type BadgeTone = 'neutral' | 'brand' | 'ice' | 'ok' | 'warn' | 'danger'

export function Badge({
  children,
  tone = 'neutral',
  dot = false,
  title,
}: {
  children: ReactNode
  tone?: BadgeTone
  dot?: boolean
  title?: string
}) {
  return (
    <span className={`badge ${tone === 'neutral' ? '' : `badge--${tone}`}`} title={title}>
      {dot ? <span className="badge-dot" aria-hidden /> : null}
      {children}
    </span>
  )
}

/** Champ de recherche : l’icône n’est pas décorative, elle situe le champ dans la barre d’outils. */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  className?: string
}) {
  const id = useId()
  return (
    <div className={`relative min-w-0 ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <svg
        className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 10.5a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
      </svg>
      <input
        id={id}
        type="search"
        className="field !min-h-[44px] pl-10 pr-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Effacer la recherche"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/35 transition hover:bg-white/10 hover:text-white"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      ) : null}
    </div>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string; count?: number }[]
  label: string
  className?: string
}) {
  return (
    <div className={`app-segment ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          onClick={() => onChange(o.id)}
          className={`app-segment-item cursor-pointer ${value === o.id ? 'app-segment-item--on' : ''}`}
        >
          {o.label}
          {o.count != null ? <span className="ml-1.5 opacity-60">{o.count}</span> : null}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body?: string
  action?: ReactNode
}) {
  return (
    <div className="app-empty">
      <p className="font-display text-[15px] font-semibold text-white/85">{title}</p>
      {body ? <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-white/45">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  )
}

export function Spinner({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <div
      className={`${className} animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange`}
      role="status"
      aria-label="Chargement"
    />
  )
}

export function SkeletonRows({ rows = 6, height = 44 }: { rows?: number; height?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="app-skeleton" style={{ height }} />
      ))}
    </div>
  )
}

/** En-tête de colonne triable : trois états (inactif, ↑, ↓). */
export function SortHeader<K extends string>({
  id,
  label,
  sort,
  onSort,
  align = 'left',
}: {
  id: K
  label: string
  sort: { key: K; dir: 'asc' | 'desc' }
  onSort: (key: K) => void
  align?: 'left' | 'right'
}) {
  const on = sort.key === id
  return (
    <th scope="col" style={{ textAlign: align }}>
      <button type="button" className="sort-btn cursor-pointer" onClick={() => onSort(id)}>
        {label}
        <svg
          className={`h-3 w-3 transition-opacity ${on ? 'opacity-100 text-brand-ice' : 'opacity-0'}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={on && sort.dir === 'asc' ? 'M12 19V5m0 0l-6 6m6-6l6 6' : 'M12 5v14m0 0l6-6m-6 6l-6-6'} />
        </svg>
        <span className="sr-only">{on ? (sort.dir === 'asc' ? '(tri croissant)' : '(tri décroissant)') : '(trier)'}</span>
      </button>
    </th>
  )
}

/** État de tri réutilisable : re-cliquer sur la même colonne inverse le sens. */
export function useSort<K extends string>(initial: K, initialDir: 'asc' | 'desc' = 'asc') {
  const [sort, setSort] = useState<{ key: K; dir: 'asc' | 'desc' }>({ key: initial, dir: initialDir })
  const onSort = useCallback((key: K) => {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  }, [])
  return { sort, onSort }
}

export function Pagination({
  page,
  pageCount,
  onPage,
  total,
  shown,
}: {
  page: number
  pageCount: number
  onPage: (p: number) => void
  total: number
  shown: string
}) {
  if (pageCount <= 1) {
    return <p className="text-xs text-white/40">{total} résultat{total > 1 ? 's' : ''}</p>
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-white/40">
        {shown} sur {total}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="icon-btn cursor-pointer disabled:pointer-events-none disabled:opacity-35"
          onClick={() => onPage(page - 1)}
          disabled={page === 0}
          aria-label="Page précédente"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="px-1 text-xs tabular-nums text-white/55">
          {page + 1} / {pageCount}
        </span>
        <button
          type="button"
          className="icon-btn cursor-pointer disabled:pointer-events-none disabled:opacity-35"
          onClick={() => onPage(page + 1)}
          disabled={page >= pageCount - 1}
          aria-label="Page suivante"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** Ramène une page hors bornes après un filtrage qui a réduit la liste. */
export function usePagedList<T>(items: T[], perPage: number) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / perPage))
  const safePage = Math.min(page, pageCount - 1)
  useEffect(() => {
    setPage(0)
  }, [items.length])
  const slice = useMemo(
    () => items.slice(safePage * perPage, safePage * perPage + perPage),
    [items, safePage, perPage],
  )
  const from = items.length === 0 ? 0 : safePage * perPage + 1
  const to = Math.min(items.length, (safePage + 1) * perPage)
  return { page: safePage, pageCount, setPage, slice, shown: `${from}–${to}` }
}

/** Copie dans le presse-papiers avec accusé visuel de 1,5 s. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="icon-btn h-7 w-7 cursor-pointer"
      title={label}
      aria-label={label}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(() => {
          setDone(true)
          window.setTimeout(() => setDone(false), 1500)
        })
      }}
    >
      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        {done ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        ) : (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 17.25v3a1.5 1.5 0 01-1.5 1.5h-9a1.5 1.5 0 01-1.5-1.5v-12a1.5 1.5 0 011.5-1.5h3m3.75-3h6a1.5 1.5 0 011.5 1.5v9a1.5 1.5 0 01-1.5 1.5h-6a1.5 1.5 0 01-1.5-1.5v-9a1.5 1.5 0 011.5-1.5z"
          />
        )}
      </svg>
    </button>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  hint?: string
}) {
  return (
    <label className="switch-row">
      <input
        type="checkbox"
        className="switch-input sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium leading-tight text-white/88">{label}</span>
        {hint ? <span className="mt-0.5 block text-[11.5px] leading-tight text-white/40">{hint}</span> : null}
      </span>
    </label>
  )
}

/** Bandeau d’erreur avec action de reprise — jamais un cul-de-sac. */
export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.09] px-4 py-3.5">
      <svg className="mt-px h-5 w-5 shrink-0 text-red-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-red-50">Une requête a échoué</p>
        <p className="mt-0.5 break-words text-[13px] leading-snug text-red-100/70">{message}</p>
      </div>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn-quiet shrink-0 cursor-pointer px-3 py-2 text-[13px]">
          Réessayer
        </button>
      ) : null}
    </div>
  )
}

/** Titre de section avec action à droite — répété dans tous les panneaux. */
export function SectionHead({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-white">{title}</h2>
        {subtitle ? <p className="mt-1 text-[13px] leading-snug text-white/45">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
