'use client'

import { useState } from 'react'
import { SimplePlanBody } from '@/components/SimplePlanBody'

/** Pastille du coach — même repère visuel que l’app mobile. */
export function CoachAvatar() {
  return (
    <span
      className="mt-0.5 flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border border-brand-orange/30 bg-brand-orange/[0.12] font-display text-[10px] font-bold tracking-wide text-brand-orange"
      aria-hidden
    >
      NR
    </span>
  )
}

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setDone(true)
      window.setTimeout(() => setDone(false), 1800)
    } catch {
      /* Presse-papiers refusé (contexte non sécurisé) : on n'affiche rien. */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={done ? 'Réponse copiée' : 'Copier la réponse'}
      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-white/30 opacity-0 transition hover:bg-white/[0.07] hover:text-white/75 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-orange/60 group-hover/msg:opacity-100"
    >
      {done ? (
        <svg className="h-4 w-4 text-brand-ice" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.25 7.5V6.75A2.25 2.25 0 0110.5 4.5h6.75A2.25 2.25 0 0119.5 6.75v6.75a2.25 2.25 0 01-2.25 2.25h-.75M4.5 10.5A2.25 2.25 0 016.75 8.25h6.75a2.25 2.25 0 012.25 2.25v6.75a2.25 2.25 0 01-2.25 2.25H6.75a2.25 2.25 0 01-2.25-2.25v-6.75z"
          />
        </svg>
      )}
    </button>
  )
}

export function ChatMessage({ role, text }: { role: 'user' | 'assistant'; text: string }) {
  const body = text ?? ''

  if (role === 'user') {
    return (
      <div className="flex animate-fade-up justify-end">
        <div
          className="max-w-[min(100%,520px)] whitespace-pre-wrap rounded-[20px] rounded-br-md px-4 py-2.5 text-[15px] leading-relaxed text-white shadow-insetline"
          style={{ backgroundImage: 'linear-gradient(135deg, #fc4c02 0%, #c73d00 100%)' }}
        >
          {body}
        </div>
      </div>
    )
  }

  return (
    <div className="group/msg flex animate-fade-up items-start gap-2.5">
      <CoachAvatar />
      <div className="min-w-0 flex-1">
        <div className="min-w-0 max-w-[min(100%,620px)] rounded-[20px] rounded-tl-md border border-white/[0.08] bg-[#13161f] px-4 py-3">
          {/* Le coach répond en Markdown léger : sans rendu, les retours à la ligne sautent. */}
          <SimplePlanBody text={body} className="[&_p]:text-[15px] [&_p]:text-white/90" />
        </div>
        <div className="mt-0.5 h-7">
          <CopyButton text={body} />
        </div>
      </div>
    </div>
  )
}

export function CoachTyping() {
  return (
    <div className="flex items-start gap-2.5">
      <CoachAvatar />
      <div
        className="flex items-center gap-1.5 rounded-[20px] rounded-tl-md border border-white/[0.08] bg-[#13161f] px-4 py-4"
        aria-live="polite"
        aria-label="Le coach réfléchit"
      >
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-orange [animation-delay:0ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-orange [animation-delay:150ms]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-orange [animation-delay:300ms]" />
      </div>
    </div>
  )
}
