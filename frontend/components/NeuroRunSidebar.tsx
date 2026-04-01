import type { ConversationListItem } from '@/lib/api'
import { MemberPrimaryNav } from '@/components/MemberPrimaryNav'

export type AppSection = 'chat' | 'goals'

type Props = {
  section: AppSection
  conversations: ConversationListItem[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  /** Supprime une conversation (historique coach). */
  onDeleteConversation?: (id: string) => void
  suggestions: string[]
  onSuggestion: (text: string) => void
  disabled: boolean
  onCloseMobile?: () => void
}

export function NeuroRunSidebar({
  section,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  suggestions,
  onSuggestion,
  disabled,
  onCloseMobile,
}: Props) {
  const conv = Array.isArray(conversations) ? conversations : []
  const sugg = Array.isArray(suggestions) ? suggestions : []
  const navActive = section === 'goals' ? 'goals' : 'coach'

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <MemberPrimaryNav active={navActive} onNavigate={onCloseMobile} />

      {section === 'chat' ? (
        <div className="flex min-h-0 flex-1 flex-col gap-3 border-t border-white/[0.06] pt-4">
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onNewConversation()
              onCloseMobile?.()
            }}
            className="btn-brand w-full py-2.5 text-xs disabled:opacity-40"
          >
            Nouvelle conversation
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <p className="mb-2 pl-1 text-[10px] font-medium uppercase tracking-wider text-white/35">
              Historique
            </p>
            <ul className="space-y-1">
              {conv.map((c) => (
                <li key={c.id} className="flex items-stretch gap-0.5 rounded-lg">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onSelectConversation(c.id)
                      onCloseMobile?.()
                    }}
                    className={`flex min-w-0 flex-1 flex-col rounded-lg px-2 py-2 text-left text-xs transition disabled:opacity-40 ${
                      activeConversationId === c.id
                        ? 'bg-white/[0.08] text-white'
                        : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'
                    }`}
                  >
                    <span className="line-clamp-2 font-medium">{c.title || 'Sans titre'}</span>
                    <span className="mt-0.5 text-[10px] text-white/30">
                      {new Date(c.updated_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                  </button>
                  {onDeleteConversation ? (
                    <button
                      type="button"
                      disabled={disabled}
                      title="Supprimer cette conversation"
                      aria-label="Supprimer cette conversation"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        onDeleteConversation(c.id)
                      }}
                      className="shrink-0 self-center rounded-md px-1.5 py-2 text-[11px] text-white/30 transition hover:bg-red-500/15 hover:text-red-200/95 disabled:opacity-40"
                    >
                      ×
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
            {conv.length === 0 ? (
              <p className="px-1 text-xs text-white/35">
                Aucune conversation pour l’instant — écris au coach ou crée un fil dédié.
              </p>
            ) : null}
          </div>
          <div>
            <p className="mb-2 pl-1 text-[10px] font-medium uppercase tracking-wider text-white/35">
              Idées
            </p>
            <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto pr-1">
              {sugg.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onSuggestion(s)
                    onCloseMobile?.()
                  }}
                  className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 text-left text-[11px] leading-snug text-white/65 transition hover:border-brand-orange/25 hover:bg-brand-orange/10 hover:text-white disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {section === 'goals' ? (
        <p className="border-t border-white/[0.06] pt-4 text-xs leading-relaxed text-white/45">
          Plan, avis de faisabilité, et fil de discussion pour ton ressenti — tu peux ajuster ton objectif avec le
          coach au fil des messages.
        </p>
      ) : null}
    </div>
  )
}
