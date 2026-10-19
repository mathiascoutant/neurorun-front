'use client'

import { Segmented, type BadgeTone } from '@/components/admin/ui'
import type { AmbassadorPromo, AmbassadorPromoInput, AmbassadorStatus, PromoKind } from '@/lib/api'

/**
 * Pièces communes aux deux écrans ambassadeurs de la console (liste et fiche) : l’état d’un
 * contrat, et la saisie d’une remise. La remise se saisit au même endroit à la création et
 * à la modification — une règle de validation ne doit exister qu’une fois.
 */

export function ambassadorStatusMeta(status: AmbassadorStatus): {
  tone: BadgeTone
  label: string
  hint: string
} {
  switch (status) {
    case 'signed':
      return {
        tone: 'ice',
        label: 'À contresigner',
        hint: 'L’ambassadeur a signé. Le contrat prend effet dès ta contre-signature.',
      }
    case 'active':
      return { tone: 'ok', label: 'En vigueur', hint: 'Contrat signé des deux côtés.' }
    case 'ended':
      return { tone: 'danger', label: 'Terminé', hint: 'Contrat terminé : le code de réduction est désactivé.' }
    default:
      return {
        tone: 'warn',
        label: 'À signer',
        hint: 'En attente de la signature de l’ambassadeur depuis son compte.',
      }
  }
}

/** Utilisations consommées sur le quota, « 7 / 100 » ou « 7 / ∞ ». */
export function promoUsageLabel(promo: AmbassadorPromo | null): string {
  if (!promo) return '—'
  return `${promo.uses} / ${promo.max_uses === 0 ? '∞' : promo.max_uses}`
}

/** Remise en cours de saisie. Le montant reste une chaîne tant qu’on tape (« 4, »). */
export type DiscountDraft = {
  kind: PromoKind
  percent: number
  amountEur: string
  maxUses: number
}

export function newDiscountDraft(promo?: AmbassadorPromo | null): DiscountDraft {
  return {
    kind: promo?.kind === 'amount' ? 'amount' : 'percent',
    percent: promo?.percent_off ? promo.percent_off : 30,
    amountEur: promo?.amount_off_cents ? String(promo.amount_off_cents / 100) : '5',
    maxUses: promo?.max_uses ?? 0,
  }
}

export function discountAmountCents(draft: DiscountDraft): number {
  return Math.round((Number(draft.amountEur.replace(',', '.')) || 0) * 100)
}

export function discountValid(draft: DiscountDraft): boolean {
  if (draft.maxUses < 0) return false
  return draft.kind === 'amount'
    ? discountAmountCents(draft) > 0
    : draft.percent > 0 && draft.percent <= 100
}

/** Corps envoyé à l’API : un seul des deux champs de remise est renseigné. */
export function discountInput(draft: DiscountDraft): AmbassadorPromoInput {
  return {
    kind: draft.kind,
    percent_off: draft.kind === 'percent' ? draft.percent : 0,
    amount_off_cents: draft.kind === 'amount' ? discountAmountCents(draft) : 0,
    max_uses: draft.maxUses,
  }
}

/** Aperçu de la remise telle qu’elle sera écrite à l’article 2 du contrat. */
export function discountPreview(draft: DiscountDraft): string {
  if (draft.kind === 'amount') {
    const eur = discountAmountCents(draft) / 100
    return `${eur.toFixed(2).replace('.', ',').replace(',00', '')} €`
  }
  return `${draft.percent} %`
}

export function DiscountFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: DiscountDraft
  onChange: (next: DiscountDraft) => void
  idPrefix: string
}) {
  const set = (patch: Partial<DiscountDraft>) => onChange({ ...draft, ...patch })
  return (
    <div className="space-y-3.5">
      <div>
        <span className="text-xs text-white/45">Nature de la remise</span>
        <Segmented<PromoKind>
          value={draft.kind}
          onChange={(kind) => set({ kind })}
          label="Nature de la remise"
          className="mt-1 !max-w-none"
          options={[
            { id: 'percent', label: 'Pourcentage' },
            { id: 'amount', label: 'Montant en €' },
          ]}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {draft.kind === 'percent' ? (
          <div>
            <label htmlFor={`${idPrefix}-pct`} className="text-xs text-white/45">
              Remise (%)
            </label>
            <input
              id={`${idPrefix}-pct`}
              className="field mt-1 !min-h-[46px] tabular-nums"
              type="number"
              min={1}
              max={100}
              value={draft.percent}
              onChange={(e) => set({ percent: Number(e.target.value) })}
            />
          </div>
        ) : (
          <div>
            <label htmlFor={`${idPrefix}-amount`} className="text-xs text-white/45">
              Remise (€)
            </label>
            <input
              id={`${idPrefix}-amount`}
              className="field mt-1 !min-h-[46px] tabular-nums"
              type="text"
              inputMode="decimal"
              value={draft.amountEur}
              onChange={(e) => set({ amountEur: e.target.value.replace(/[^\d.,]/g, '') })}
              placeholder="5"
            />
          </div>
        )}
        <div>
          <label htmlFor={`${idPrefix}-max`} className="text-xs text-white/45">
            Utilisations max.
          </label>
          <input
            id={`${idPrefix}-max`}
            className="field mt-1 !min-h-[46px] tabular-nums"
            type="number"
            min={0}
            value={draft.maxUses}
            onChange={(e) => set({ maxUses: Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-white/35">0 = illimité</p>
        </div>
      </div>

      <p className="text-[12px] text-white/40">
        Le contrat annoncera <strong className="font-semibold text-white/75">{discountPreview(draft)}</strong> de
        remise à l’article 2.
        {draft.kind === 'amount'
          ? ' Un reste à payer entre 0 et 0,50 € est refusé par Stripe.'
          : ''}
      </p>
    </div>
  )
}
