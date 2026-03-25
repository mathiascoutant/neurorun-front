import type { ConversationListItem } from '@/lib/api'

export type AppSection = 'chat' | 'goals'

type Props = {
  section: AppSection
  onSection: (s: AppSection) => void
  conversations: ConversationListItem[]
  activeConversationId: string | null
  onSelectConversation: (id: string) => void
  onNewConversation: () => void
  suggestions: string[]
  onSuggestion: (text: string) => void
  disabled: boolean
  onCloseMobile?: () => void
}

export function NeuroRunSidebar({
  section,
  onSection,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  suggestions,
  onSuggestion,
  disabled,
  onCloseMobile,
}: Props) {
  function navBtn(s: AppSection, label: string) {
    const on = section === s
    return (
      <button
        type="button"
        onClick={() => {
          onSection(s)
          onCloseMobile?.()
        }}
        className={`w-full rounded-xl px-3 py-2.5 text-left text-sm font-medium transition ${
          on
            ? 'bg-brand-orange/20 text-white ring-1 ring-brand-orange/40'
            : 'text-white/55 hover:bg-white/[0.06] hover:text-white'
        }`}
      >
        {label}
      </button>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 p-4">
      <div className="space-y-2">
        <p className="kicker pl-1 text-[10px] text-brand-ice/80">Menu</p>
        {navBtn('chat', 'Coach')}
        {navBtn('goals', 'Objectifs')}
      </div>

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
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onSelectConversation(c.id)
                      onCloseMobile?.()
                    }}
                    className={`flex w-full flex-col rounded-lg px-2 py-2 text-left text-xs transition disabled:opacity-40 ${
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
                </li>
              ))}
            </ul>
            {conversations.length === 0 ? (
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
              {suggestions.map((s) => (
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
          Définis une distance, un délai et ta disponibilité : le plan s’appuie sur ton historique Strava (activités
          récentes).
        </p>
      ) : null}
    </div>
  )
}
