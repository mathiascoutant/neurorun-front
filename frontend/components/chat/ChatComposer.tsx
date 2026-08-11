'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

const MAX_ROWS_PX = 168

/**
 * Champ de saisie du coach.
 *
 * Un `<textarea>` qui grandit avec le texte remplace l'ancien `<input>` d'une
 * seule ligne : une question au coach dépasse souvent la largeur du champ, et
 * on ne relisait pas ce qu'on venait d'écrire.
 *
 * Entrée envoie, Maj+Entrée passe à la ligne — mais seulement au clavier
 * physique. Sur écran tactile, la touche « entrée » sert à aller à la ligne et
 * l'envoi passe par le bouton, sinon un message part à chaque paragraphe.
 */
export function ChatComposer({
  value,
  onChange,
  onSend,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  onSend: (text: string) => void
  disabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [enterSends, setEnterSends] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    setEnterSends(window.matchMedia('(pointer: fine)').matches)
  }, [])

  // Hauteur suivant le contenu, plafonnée : au-delà, le champ défile.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS_PX)}px`
  }, [value])

  const canSend = value.trim().length > 0 && !disabled

  function submit(e: FormEvent) {
    e.preventDefault()
    if (canSend) onSend(value)
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!enterSends || e.key !== 'Enter' || e.shiftKey) return
    e.preventDefault()
    if (canSend) onSend(value)
  }

  return (
    <form onSubmit={submit} className="mx-auto w-full max-w-3xl">
      <div className="flex items-end gap-2 rounded-[20px] border border-white/[0.09] bg-[#12151f] p-2 transition focus-within:border-brand-orange/40 focus-within:ring-2 focus-within:ring-brand-orange/15">
        <label htmlFor="chat-input" className="sr-only">
          Ta question au coach
        </label>
        <textarea
          id="chat-input"
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          placeholder="Pose ta question au coach…"
          autoComplete="off"
          className="max-h-[168px] min-h-[40px] w-full flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-relaxed text-white outline-none placeholder:text-white/32 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Envoyer le message"
          className="mb-0.5 inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-[14px] text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-white/25"
          style={
            canSend
              ? { backgroundImage: 'linear-gradient(135deg, #fc4c02 0%, #c73d00 100%)' }
              : undefined
          }
        >
          <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
          </svg>
        </button>
      </div>
      {enterSends ? (
        <p className="mt-1.5 text-center text-[11px] text-white/28">
          <kbd className="font-body">Entrée</kbd> pour envoyer ·{' '}
          <kbd className="font-body">Maj</kbd> + <kbd className="font-body">Entrée</kbd> pour un retour à la ligne
        </p>
      ) : null}
    </form>
  )
}
