'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { RegisterGender } from '@/lib/api'

const OPTIONS: { value: RegisterGender; label: string }[] = [
  { value: 'female', label: 'Femme' },
  { value: 'male', label: 'Homme' },
  { value: 'other', label: 'Autre' },
  { value: 'unspecified', label: 'Je préfère ne pas le dire' },
]

type MenuPos = { top: number; left: number; width: number }

export function GenderSelect({
  id,
  value,
  onChange,
  'aria-labelledby': ariaLabelledBy,
}: {
  id: string
  value: RegisterGender
  onChange: (v: RegisterGender) => void
  'aria-labelledby'?: string
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null)
  const menuRef = useRef<HTMLUListElement>(null)

  const updatePosition = useCallback(() => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const margin = 6
    const estHeight = Math.min(OPTIONS.length * 48 + 16, window.innerHeight * 0.45)
    let top = r.bottom + margin
    if (top + estHeight > window.innerHeight - margin) {
      top = Math.max(margin, r.top - estHeight - margin)
    }
    setMenuPos({
      top,
      left: r.left,
      width: Math.max(r.width, 200),
    })
  }, [])

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    const ro = new ResizeObserver(() => updatePosition())
    const el = btnRef.current
    if (el) ro.observe(el)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, value, updatePosition])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (btnRef.current?.contains(t)) return
      if (menuRef.current?.contains(t)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const label = OPTIONS.find((o) => o.value === value)?.label ?? ''

  const menu =
    open && menuPos && typeof document !== 'undefined'
      ? createPortal(
          <ul
            ref={menuRef}
            role="listbox"
            {...(ariaLabelledBy ? { 'aria-labelledby': ariaLabelledBy } : {})}
            className="fixed z-[9999] max-h-[min(45vh,280px)] overflow-y-auto rounded-xl border border-white/15 bg-[rgba(12,14,22,0.98)] py-1 shadow-[0_16px_48px_rgba(0,0,0,0.65)] backdrop-blur-md"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
            }}
          >
            {OPTIONS.map((opt) => (
              <li key={opt.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={value === opt.value}
                  className={`w-full px-4 py-3 text-left text-base transition-colors sm:text-sm ${
                    value === opt.value
                      ? 'bg-white/12 text-white'
                      : 'text-white/90 hover:bg-white/[0.08]'
                  }`}
                  onClick={() => {
                    onChange(opt.value)
                    setOpen(false)
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )
      : null

  return (
    <div className="relative">
      <button
        ref={btnRef}
        id={id}
        type="button"
        className="field flex min-h-12 w-full touch-manipulation items-center justify-between gap-2 text-left"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="min-w-0 truncate">{label}</span>
        <svg
          className={`h-4 w-4 shrink-0 text-white/45 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden
        >
          <path
            fillRule="evenodd"
            d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {menu}
    </div>
  )
}
