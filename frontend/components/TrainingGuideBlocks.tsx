type Block = {
  title: string
  lead: string
  bullets: string[]
  prompts: string[]
}

const BLOCKS: Block[] = [
  {
    title: 'Structurer l’entraînement',
    lead: 'Equilibre charge, récupération et types de séance.',
    bullets: [
      'Varie allure facile, tempo et fractionné selon ton niveau.',
      'Prévois au moins une journée légère après une séance intense.',
      'Le coach peut proposer une semaine type à partir de ton historique Strava.',
    ],
    prompts: [
      'Propose-moi une semaine d’entraînement équilibrée selon mes dernières sorties',
      'Comment intégrer du travail de côte sans trop charger la semaine ?',
    ],
  },
  {
    title: 'Fixer des objectifs',
    lead: 'Des visées claires et progressives.',
    bullets: [
      'Commencer par une distance ou un temps réaliste sur 4 à 8 semaines.',
      'Découpe en jalons (volume hebdo, sortie longue, séance qualité).',
      'Ajuste selon la fatigue : objectif ≠ rigide au détriment du corps.',
    ],
    prompts: [
      'Aide-moi à définir un objectif réaliste pour un 10 km dans 2 mois',
      'Quels indicateurs suivre pour savoir si je suis sur la bonne trajectoire ?',
    ],
  },
  {
    title: 'Comprendre tes résultats',
    lead: 'Relier les chiffres Strava à la sensation et à la forme.',
    bullets: [
      'Allure moyenne, dénivelé et fréquence : regarder la tendance sur plusieurs semaines.',
      'Une sortie plus lente peut être une bonne séance de récup ou une journée fatigue.',
      'Demande des synthèses ou des comparaisons période sur période.',
    ],
    prompts: [
      'Résume ce que mes dernières sorties disent sur ma forme actuelle',
      'Compare mon volume et mon allure moyenne sur les deux dernières semaines',
    ],
  },
]

export function TrainingGuideBlocks({
  onPrompt,
  disabled,
}: {
  onPrompt: (text: string) => void
  disabled?: boolean
}) {
  return (
    <section className="space-y-3" aria-label="Aide entraînement et objectifs">
      <div>
        <p className="kicker text-[10px] text-brand-ice/90">NeuroRun</p>
        <h2 className="mt-1 font-display text-base font-semibold tracking-tight text-white">
          Guides rapides
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-white/45">
          Pistes pour t’entraîner, fixer des objectifs et lire tes stats — clique une idée pour l’envoyer au
          coach.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BLOCKS.map((b) => (
          <article
            key={b.title}
            className="panel flex flex-col gap-3 p-4 shadow-insetline sm:p-5"
          >
            <div>
              <h3 className="font-display text-sm font-semibold text-white">{b.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-white/50">{b.lead}</p>
            </div>
            <ul className="list-inside list-disc space-y-1.5 text-[11px] leading-relaxed text-white/40 marker:text-brand-orange/70">
              {b.bullets.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="mt-auto flex flex-col gap-2 pt-1">
              {b.prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={disabled}
                  onClick={() => onPrompt(p)}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-left text-[11px] font-medium leading-snug text-white/75 transition hover:border-brand-orange/30 hover:bg-brand-orange/10 hover:text-white disabled:pointer-events-none disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
