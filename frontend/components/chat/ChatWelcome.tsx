'use client'

/**
 * Écran d'accueil du coach, affiché tant qu'aucun échange n'a eu lieu.
 *
 * Les suggestions étaient reléguées en bas de la barre latérale, là où on ne
 * les voyait pas. Elles sont ici au centre, au moment précis où l'on ne sait pas
 * quoi demander — et elles s'effacent dès le premier message.
 */
export function ChatWelcome({
  stravaLinked,
  suggestions,
  onPick,
  disabled,
}: {
  stravaLinked: boolean
  suggestions: string[]
  onPick: (text: string) => void
  disabled: boolean
}) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-1 py-8 text-center sm:py-12">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-brand-orange/30 bg-brand-orange/[0.12] font-display text-sm font-bold tracking-wide text-brand-orange">
        NR
      </span>

      <h2 className="mt-4 font-display text-[1.35rem] font-bold tracking-[-0.02em] text-white sm:text-[1.5rem]">
        Ton coach NeuroRun
      </h2>
      <p className="mt-2 max-w-md text-[14px] leading-relaxed text-white/50">
        Pose une question sur l’entraînement, l’allure ou la récupération.
        {stravaLinked
          ? ' Il s’appuie sur ton historique Strava pour des repères chiffrés.'
          : ' Strava n’est pas relié : les conseils resteront généraux, sans repères tirés de tes sorties.'}
      </p>

      <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/30">
        Pour démarrer
      </p>
      <div className="mt-3 grid w-full gap-2 sm:grid-cols-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            disabled={disabled}
            onClick={() => onPick(s)}
            className="cursor-pointer rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-3 text-left text-[13.5px] leading-snug text-white/70 transition hover:border-brand-orange/30 hover:bg-brand-orange/[0.08] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/60 disabled:pointer-events-none disabled:opacity-40"
          >
            {s}
          </button>
        ))}
      </div>

      <p className="mt-8 max-w-md text-[11.5px] leading-relaxed text-white/28">
        Le coach ne remplace pas un professionnel de santé. Tes messages sont enregistrés dans cette conversation.
      </p>
    </div>
  )
}
