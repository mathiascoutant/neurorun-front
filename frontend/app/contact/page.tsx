import type { Metadata } from 'next'
import Link from 'next/link'
import { AuthShell } from '@/components/auth/AuthShell'

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || 'contact@neurorun.fr'

const mailtoHref = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Support NeuroRun')}`

export const metadata: Metadata = {
  title: 'Contact — NeuroRun',
  description:
    'Contacter le support NeuroRun : compte, connexion Strava, abonnement ou retour sur l’application.',
}

export default function ContactPage() {
  return (
    <AuthShell
      kicker="Support"
      title="Contact"
      subtitle="Nous répondons par email. Indique ton adresse de compte NeuroRun si ta demande concerne l’accès ou les données."
      footer={
        <p className="text-center text-sm text-white/45">
          <Link href="/" className="font-medium text-brand-ice hover:text-white">
            Retour à l’accueil
          </Link>
          {' · '}
          <Link href="/login/" className="font-medium text-brand-ice hover:text-white">
            Connexion
          </Link>
        </p>
      }
    >
      <div className="space-y-6">
        <a
          href={mailtoHref}
          className="btn-brand flex w-full items-center justify-center gap-2 py-3.5 text-sm font-semibold"
        >
          <svg className="h-4 w-4 opacity-90" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} aria-hidden>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
          Écrire à {CONTACT_EMAIL}
        </a>

        <p className="text-center text-xs text-white/38">
          Si le bouton n’ouvre pas ton messagerie, copie l’adresse ci-dessus dans ton client mail.
        </p>

        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-4 sm:px-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand-ice/80">On peut t’aider pour</p>
          <ul className="mt-3 space-y-2.5 text-sm leading-relaxed text-white/55">
            <li>Compte, mot de passe ou suppression de données</li>
            <li>Liaison Strava, autorisations ou déconnexion</li>
            <li>Abonnement, facturation ou changement d’offre</li>
            <li>Bug, idée ou question sur le coach et les écrans</li>
          </ul>
        </div>

        <p className="text-center text-sm text-white/45">
          Réponses en général sous quelques jours ouvrés. Pour les questions courantes, voir la{' '}
          <Link href="/#faq" className="font-medium text-brand-ice/90 underline decoration-white/15 underline-offset-2 hover:text-white">
            FAQ
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  )
}
