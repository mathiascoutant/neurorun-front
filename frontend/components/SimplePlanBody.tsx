'use client'

function formatBold(text: string, keyBase: string) {
  const parts = text.split(/\*\*/)
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={`${keyBase}-b-${i}`} className="font-semibold text-white">
        {part}
      </strong>
    ) : (
      <span key={`${keyBase}-t-${i}`}>{part}</span>
    )
  )
}

/** Affichage lisible d’un texte type Markdown léger (##, ###, puces, **gras**). */
export function SimplePlanBody({ text, className = '' }: { text: string; className?: string }) {
  const lines = (text || '').split('\n')
  return (
    <div className={`space-y-1 ${className}`}>
      {lines.map((line, i) => {
        const t = line.trimEnd()
        if (t.startsWith('### ')) {
          const c = t.slice(4)
          return (
            <h5
              key={i}
              className="mt-4 font-display text-sm font-semibold tracking-tight text-brand-ice/95 [&:first-child]:mt-0"
            >
              {formatBold(c, `h5-${i}`)}
            </h5>
          )
        }
        if (t.startsWith('## ')) {
          const c = t.slice(3)
          return (
            <h4
              key={i}
              className="mt-6 border-b border-white/[0.08] pb-2 font-display text-base font-semibold text-white first:mt-0"
            >
              {formatBold(c, `h4-${i}`)}
            </h4>
          )
        }
        if (/^[-*]\s+/.test(t)) {
          const c = t.replace(/^[-*]\s+/, '')
          return (
            <div key={i} className="ml-0.5 flex gap-2.5 py-0.5">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-orange/85" aria-hidden />
              <p className="min-w-0 flex-1 text-sm leading-relaxed text-white/[0.88]">
                {formatBold(c, `li-${i}`)}
              </p>
            </div>
          )
        }
        if (t === '') {
          return <div key={i} className="h-1.5" />
        }
        return (
          <p key={i} className="text-sm leading-relaxed text-white/[0.88]">
            {formatBold(t, `p-${i}`)}
          </p>
        )
      })}
    </div>
  )
}
