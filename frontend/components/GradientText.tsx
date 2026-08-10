import type { ReactNode } from 'react'

export type GradientTone = 'fire' | 'ice'

type Props = {
  children: ReactNode
  tone: GradientTone
  className?: string
}

/**
 * Texte à dégradé animé — équivalent web de `MaskedGradientText` de l’app
 * (masque SVG animé côté natif, background-clip animé ici).
 */
export function GradientText({ children, tone, className = '' }: Props) {
  return (
    <span className={`grad-text ${tone === 'ice' ? 'grad-text--ice' : 'grad-text--fire'} ${className}`}>
      {children}
    </span>
  )
}
