'use client'

import { useEffect, type ReactNode } from 'react'

/**
 * Fenêtre des écrans chaussures : feuille ancrée en bas sur mobile, carte
 * centrée au-delà. Échap ou un clic sur le voile la ferment.
 */
export function ShoeModal({
  children,
  onClose,
  labelledBy,
  width = 'max-w-lg',
}: {
  children: ReactNode
  onClose: () => void
  labelledBy: string
  width?: string
}) {
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

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`modal-panel panel w-full ${width} max-h-[92dvh] overflow-y-auto rounded-b-none pb-safe sm:rounded-b-[20px] sm:pb-0`}
      >
        {children}
      </div>
    </div>
  )
}

export function ModalClose({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="icon-btn" aria-label="Fermer">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}

/** Silhouette de chaussure, partagée par la navigation et les cartes. */
export const SHOE_ICON_PATH =
  'M3 18h18M3 18V7.5h3.75c0 1.66 1.34 3 3 3l4.5 2.25 4.6 1.2A2.4 2.4 0 0121 16.28V18M11.25 10.5l-.9 1.35M13.9 11.85l-.9 1.35'

export function ShoeIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={SHOE_ICON_PATH} />
    </svg>
  )
}
