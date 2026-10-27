import type { JSX } from "react";
import type { BoostKind } from "@/lib/api";

export type ReactionIconProps = Readonly<{ className?: string; size?: number }>;

/** Éclair : envoyer de l’énergie. Distinct de la flamme, qui dit la forme du coureur. */
export function BoltIcon({ className = "", size = 15 }: ReactionIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        d="M13 2L4.5 13.5H11l-1 8.5 8.5-11.5H12l1-8.5z"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlameIcon({ className = "", size = 15 }: ReactionIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      className={className}
      aria-hidden
    >
      <path
        d="M12 2.5c3 4 5 6.2 5 9.3a5 5 0 01-10 0c0-1.5.5-2.7 1.4-3.9.6 1.1 1.3 1.7 2.1 2C10.1 7.4 10.7 4.7 12 2.5z"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 21.5a7.5 7.5 0 007.5-7.5" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M12 21.5A7.5 7.5 0 014.5 14" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

/** Poing fermé : le « respect » du coureur, plus juste qu’une médaille. */
export function FistIcon({ className = "", size = 15 }: ReactionIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M7.5 12.5v-2a1.6 1.6 0 013.2 0v1.2" />
      <path d="M10.7 11.7V9.4a1.6 1.6 0 013.2 0v2.1" />
      <path d="M13.9 11.5v-1.3a1.6 1.6 0 013.2 0v5.1a5 5 0 01-5 5h-1.4a5 5 0 01-5-5v-1.9a1.6 1.6 0 013.2 0" />
    </svg>
  );
}

export type ReactionMeta = {
  kind: BoostKind;
  label: string;
  /** Formulation à la deuxième personne, pour les réactions reçues. */
  received: string;
  Icon: (p: ReactionIconProps) => JSX.Element;
};

/** Les trois réactions, dans leur ordre d’affichage. */
export const REACTIONS: ReactionMeta[] = [
  { kind: "boost", label: "Booster", received: "t’a boosté", Icon: BoltIcon },
  { kind: "fire", label: "En feu", received: "te trouve en feu", Icon: FlameIcon },
  { kind: "respect", label: "Respect", received: "t’envoie du Respect", Icon: FistIcon },
];

export function reactionMeta(kind: BoostKind): ReactionMeta {
  return REACTIONS.find((r) => r.kind === kind) ?? REACTIONS[0];
}
