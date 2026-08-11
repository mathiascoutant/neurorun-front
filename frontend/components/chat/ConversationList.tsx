'use client'

import type { ConversationListItem } from '@/lib/api'

function shortDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const today = new Date()
  const sameDay =
    d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()
  if (sameDay) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

/**
 * Historique des échanges avec le coach, dans la barre latérale.
 *
 * La suppression reste masquée jusqu'au survol ou au focus clavier : une croix
 * sur chaque ligne transformait la liste en champ de mines visuel.
 */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  disabled,
}: {
  conversations: ConversationListItem[]
  activeId: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onDelete?: (id: string) => void
  disabled: boolean
}) {
  const items = Array.isArray(conversations) ? conversations : []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 pb-1.5 pl-3 pr-1">
        <p className="nav-group-label !p-0">Conversations</p>
        <button
          type="button"
          onClick={onNew}
          disabled={disabled}
          title="Nouvelle conversation"
          aria-label="Nouvelle conversation"
          className="inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-white/[0.09] bg-white/[0.04] text-white/60 transition hover:border-brand-orange/35 hover:bg-brand-orange/[0.12] hover:text-brand-orange focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 disabled:pointer-events-none disabled:opacity-40"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain pr-0.5">
        {items.length === 0 ? (
          <p className="px-3 py-2 text-[12px] leading-relaxed text-white/35">
            Aucune conversation. Pose ta première question au coach.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((c) => {
              const on = activeId === c.id
              return (
                <li key={c.id} className="group/conv relative">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onSelect(c.id)}
                    aria-current={on ? 'true' : undefined}
                    className={`flex w-full cursor-pointer items-baseline gap-2 rounded-lg py-2 pl-3 pr-8 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 disabled:opacity-40 ${
                      on ? 'bg-white/[0.08] text-white' : 'text-white/58 hover:bg-white/[0.045] hover:text-white/90'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-tight">
                      {c.title || 'Sans titre'}
                    </span>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-white/30">
                      {shortDate(c.updated_at)}
                    </span>
                  </button>
                  {onDelete ? (
                    <button
                      type="button"
                      disabled={disabled}
                      title="Supprimer cette conversation"
                      aria-label={`Supprimer la conversation « ${c.title || 'Sans titre'} »`}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onDelete(c.id)
                      }}
                      className="absolute right-1 top-1/2 hidden h-6 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-white/35 transition hover:bg-red-500/15 hover:text-red-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400/60 group-hover/conv:flex group-focus-within/conv:flex disabled:opacity-40"
                    >
                      <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
                        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                      </svg>
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
