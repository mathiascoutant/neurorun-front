import type { AmbassadorContract, ContractSignature } from '@/lib/api'

/**
 * Le contrat d’ambassadeur, tel qu’il se lit et s’imprime.
 *
 * Un seul rendu pour les deux côtés : l’ambassadeur depuis son compte, NeuroRun depuis la
 * console. C’est la même feuille — si elle divergeait, chacun signerait un autre document.
 * Le texte vient de l’API ; ce composant ne décide que de la mise en page.
 */

function formatSignedAt(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function Field({ label, value, placeholder }: { label: string; value?: string; placeholder: string }) {
  const filled = (value ?? '').trim() !== ''
  return (
    <div>
      <p className="contract-field-label">{label}</p>
      <p className={`contract-field-value ${filled ? '' : 'contract-field-value--blank'}`}>
        {filled ? value : placeholder}
      </p>
    </div>
  )
}

/** Bloc de signature : la signature posée, ou la place qui l’attend. */
function SignBlock({
  party,
  mention,
  signature,
  waiting,
}: {
  party: string
  mention: string
  signature?: ContractSignature | null
  waiting: string
}) {
  return (
    <div className="contract-sign">
      <p className="contract-sign-party">{party}</p>
      <p className="contract-sign-party mt-1.5 !tracking-[0.1em] !text-white/30">Signature</p>
      <div className="contract-sign-body">
        {signature ? (
          <>
            <p className="contract-sign-mention">{signature.mention || mention}</p>
            <p className="contract-sign-name">{signature.full_name}</p>
            <p className="contract-sign-date">Le {formatSignedAt(signature.signed_at)}</p>
          </>
        ) : (
          <p className="contract-sign-waiting">{waiting}</p>
        )}
      </div>
    </div>
  )
}

export type ContractDocumentProps = {
  contract: AmbassadorContract
  /** Identité du contrat. Vide = champ encore à remplir, affiché en pointillé. */
  lastName?: string
  firstName?: string
  instagram?: string
  ambassadorSignature?: ContractSignature | null
  companySignature?: ContractSignature | null
}

export function ContractDocument({
  contract,
  lastName,
  firstName,
  instagram,
  ambassadorSignature,
  companySignature,
}: ContractDocumentProps) {
  const name = [firstName?.trim(), lastName?.trim().toUpperCase()].filter(Boolean).join(' ')
  const handle = (instagram ?? '').trim()

  return (
    <article className="contract-doc" aria-label={contract.title}>
      <header className="contract-head">
        <p className="contract-kicker">NeuroRun — neurorun.fr</p>
        <p className="contract-kicker">{contract.title}</p>
      </header>

      <h2 className="contract-title font-display">{contract.title}</h2>
      <p className="contract-lede">{contract.subtitle}</p>

      <section className="contract-parties">
        <p className="contract-kicker">{contract.parties_title}</p>
        <p className="contract-p">{contract.parties_intro}</p>
        <div className="contract-parties-grid">
          <Field label="Nom" value={lastName?.toUpperCase()} placeholder="À compléter" />
          <Field label="Prénom" value={firstName} placeholder="À compléter" />
          <Field label="Compte Instagram" value={handle ? `@${handle}` : ''} placeholder="À compléter" />
        </div>
      </section>

      {contract.articles.map((article) => (
        <section key={article.number} className="contract-article">
          <h3 className="contract-article-head">
            <span className="contract-article-number">Article {article.number}</span>
            <span>{article.title}</span>
          </h3>
          {article.blocks.map((block, i) => (
            <div key={i}>
              {block.text ? <p className="contract-p">{block.text}</p> : null}
              {block.bullets && block.bullets.length > 0 ? (
                <ul className="contract-list">
                  {block.bullets.map((bullet, j) => (
                    <li key={j} className="contract-li">
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </section>
      ))}

      {contract.closing.map((line, i) => (
        <p key={i} className="contract-closing">
          {line}
        </p>
      ))}

      <div className="contract-signatures">
        <SignBlock
          party={`Pour ${contract.company_name}`}
          mention={contract.mention}
          signature={companySignature}
          waiting="En attente de la signature de NeuroRun"
        />
        <SignBlock
          party={name ? `L’ambassadeur — ${name}` : 'L’ambassadeur'}
          mention={contract.mention}
          signature={ambassadorSignature}
          waiting={`Signature précédée de la mention « ${contract.mention} »`}
        />
      </div>

      <p className="contract-footer">{contract.footer}</p>
    </article>
  )
}
