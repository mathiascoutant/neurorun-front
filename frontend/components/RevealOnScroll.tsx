'use client'

import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

export type RevealVariant = 'fade-up' | 'fade-left' | 'fade-right' | 'zoom'

type Props = {
  children: ReactNode
  className?: string
  variant?: RevealVariant
  delayMs?: number
  rootMargin?: string
  threshold?: number
}

const variantClass: Record<RevealVariant, string> = {
  'fade-up': 'reveal-scroll--up',
  'fade-left': 'reveal-scroll--from-left',
  'fade-right': 'reveal-scroll--from-right',
  zoom: 'reveal-scroll--zoom',
}

export const RevealOnScroll = forwardRef<HTMLDivElement, Props>(function RevealOnScroll(
  { children, className = '', variant = 'fade-up', delayMs = 0, rootMargin = '0px 0px -8% 0px', threshold = 0.08 },
  ref
) {
  const innerRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduceMotion(mq.matches)
    const onChange = () => setReduceMotion(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (reduceMotion) {
      setVisible(true)
      return
    }
    const el = innerRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setVisible(true)
          obs.unobserve(el)
        }
      },
      { rootMargin, threshold }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [reduceMotion, rootMargin, threshold])

  const setRefs = useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref]
  )

  const show = reduceMotion || visible

  return (
    <div
      ref={setRefs}
      className={`reveal-scroll ${variantClass[variant]} ${show ? 'reveal-scroll--visible' : ''} ${className}`.trim()}
      style={{ transitionDelay: show && delayMs ? `${delayMs}ms` : undefined }}
    >
      {children}
    </div>
  )
})
