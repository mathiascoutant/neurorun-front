import type { Metadata } from 'next'
import Link from 'next/link'
import { Mark } from '@/components/Mark'

const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || 'contact@neurorun.fr'

/**
 * Identité de l'éditeur et sous-traitants nommés dans la politique.
 * À COMPLÉTER avant mise en ligne : ces valeurs engagent juridiquement l'éditeur,
 * elles ne doivent pas rester à leur valeur d'exemple.
 */
const PUBLISHER = {
  /** Raison sociale (ou nom de l'entrepreneur individuel). */
  name: 'NeuroRun',
  /** Adresse postale du responsable de traitement. */
  address: '[adresse postale à compléter]',
  /** Hébergeur de l'application et de la base de données. */
  host: '[hébergeur à compléter]',
  /** Fournisseur du modèle de langage utilisé par le coach. */
  aiProvider: '[fournisseur du modèle IA à compléter]',
}

const LAST_UPDATED = '16 septembre 2026'

const SECTIONS = [
  { id: 'responsable', label: 'Responsable du traitement' },
  { id: 'donnees', label: 'Données collectées' },
  { id: 'finalites', label: 'Finalités et bases légales' },
  { id: 'coach', label: 'Coach IA' },
  { id: 'strava', label: 'Connexion Strava' },
  { id: 'gps', label: 'Position et parcours' },
  { id: 'destinataires', label: 'Destinataires et sous-traitants' },
  { id: 'conservation', label: 'Durées de conservation' },
  { id: 'stockage', label: 'Cookies et stockage local' },
  { id: 'securite', label: 'Sécurité' },
  { id: 'droits', label: 'Tes droits' },
  { id: 'mineurs', label: 'Mineurs' },
  { id: 'modifications', label: 'Modifications' },
]

/** Traitements, base légale RGPD et durée — une ligne par finalité réellement mise en œuvre. */
const PURPOSES: { purpose: string; basis: string; data: string }[] = [
  {
    purpose: 'Créer et gérer ton compte, t’authentifier',
    basis: 'Exécution du contrat (art. 6.1.b)',
    data: 'Email, mot de passe (haché), nom, prénom, date de naissance, genre',
  },
  {
    purpose: 'Fournir le coach conversationnel, les objectifs et les plans',
    basis: 'Exécution du contrat (art. 6.1.b)',
    data: 'Messages échangés, objectifs, séances, profil sportif',
  },
  {
    purpose: 'Afficher tes statistiques et prévisions de course',
    basis: 'Consentement pour Strava (art. 6.1.a), sinon exécution du contrat',
    data: 'Activités Strava, courses enregistrées dans l’app',
  },
  {
    purpose: 'Enregistrer une sortie en direct et les temps sur circuit',
    basis: 'Consentement (autorisation de géolocalisation du navigateur)',
    data: 'Positions GPS, allure, distance, dénivelé, durée',
  },
  {
    purpose: 'Gérer les abonnements, paiements et factures',
    basis: 'Exécution du contrat et obligation légale (art. 6.1.b et 6.1.c)',
    data: 'Offre, statut d’abonnement, identifiants de paiement du prestataire',
  },
  {
    purpose: 'Assurer le support et répondre à tes demandes',
    basis: 'Intérêt légitime (art. 6.1.f)',
    data: 'Email et contenu de ta demande',
  },
  {
    purpose: 'Sécuriser le service et prévenir les abus',
    basis: 'Intérêt légitime (art. 6.1.f)',
    data: 'Journaux techniques, adresse IP, horodatages',
  },
]

const RECIPIENTS: { name: string; role: string; where: string }[] = [
  {
    name: PUBLISHER.host,
    role: 'Hébergement de l’application, de l’API et de la base de données',
    where: 'Union européenne',
  },
  {
    name: 'Stripe',
    role: 'Paiement par carte et gestion des abonnements web (le numéro de carte est saisi chez Stripe, jamais sur NeuroRun)',
    where: 'États-Unis — clauses contractuelles types et Data Privacy Framework',
  },
  {
    name: 'Apple',
    role: 'Achats intégrés et abonnements souscrits depuis l’application iOS',
    where: 'États-Unis — clauses contractuelles types',
  },
  {
    name: 'Strava',
    role: 'Source des activités si — et seulement si — tu as lié ton compte',
    where: 'États-Unis — clauses contractuelles types',
  },
  {
    name: PUBLISHER.aiProvider,
    role: 'Génération des réponses du coach à partir du contexte transmis',
    where: 'Voir la documentation du fournisseur',
  },
  {
    name: 'OpenStreetMap et Valhalla (openstreetmap.de), unpkg',
    role: 'Fonds de carte, calcul d’itinéraire et chargement de la librairie de cartographie — ces services reçoivent ton adresse IP et la zone affichée quand une carte est ouverte',
    where: 'Union européenne et international',
  },
]

const RETENTION: { item: string; duration: string }[] = [
  { item: 'Compte et données de profil', duration: 'Jusqu’à la suppression du compte' },
  {
    item: 'Conversations avec le coach, objectifs et plans',
    duration: 'Jusqu’à leur suppression par tes soins, ou à la suppression du compte',
  },
  {
    item: 'Activités Strava importées',
    duration: 'Jusqu’à la déconnexion de Strava ou la suppression du compte',
  },
  { item: 'Sorties enregistrées et temps sur circuit', duration: 'Jusqu’à la suppression du compte' },
  {
    item: 'Pièces comptables liées aux abonnements',
    duration: '10 ans (obligation légale, art. L123-22 du Code de commerce)',
  },
  { item: 'Journaux techniques et de sécurité', duration: '12 mois au maximum' },
]

export const metadata: Metadata = {
  title: 'Politique de confidentialité — NeuroRun',
  description:
    'Quelles données NeuroRun collecte, pourquoi, avec qui elles sont partagées, combien de temps elles sont conservées et comment exercer tes droits.',
}

function Section({
  id,
  title,
  children,
}: {
  id: string
  title: string
  children: React.ReactNode
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-white/[0.06] pt-8 first:border-0 first:pt-0">
      <h2 className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-white/55">{children}</div>
    </section>
  )
}

export default function ConfidentialitePage() {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.028)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.028)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_75%_55%_at_50%_-5%,black,transparent)]" />
        <div className="absolute -left-32 top-24 h-80 w-80 rounded-full bg-brand-orange/16 blur-[100px]" />
        <div className="absolute bottom-20 right-0 h-96 w-96 rounded-full bg-brand-ice/10 blur-[120px]" />
      </div>

      <header className="sticky top-0 z-20 border-b border-white/[0.04] bg-surface-0/75 pt-safe backdrop-blur-2xl supports-[backdrop-filter]:bg-surface-0/55">
        <div className="mx-auto flex max-w-4xl flex-nowrap items-center justify-between gap-2 px-safe py-3 sm:gap-4 sm:px-8 sm:py-3.5">
          <Link href="/" className="min-w-0 shrink transition hover:opacity-90" aria-label="NeuroRun — retour à l’accueil">
            <span className="sm:hidden">
              <Mark compact />
            </span>
            <span className="hidden sm:block">
              <Mark />
            </span>
          </Link>
          <nav className="flex shrink-0 items-center gap-1.5 sm:gap-3" aria-label="Accès rapide">
            <Link
              href="/contact/"
              className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-[11px] font-medium text-white/65 transition hover:bg-white/[0.06] hover:text-white sm:px-4 sm:py-2 sm:text-sm"
            >
              Contact
            </Link>
            <Link
              href="/login/"
              className="inline-flex items-center justify-center whitespace-nowrap rounded-full border border-white/[0.14] bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-medium text-white/80 transition hover:border-white/25 hover:bg-white/[0.07] hover:text-white sm:px-4 sm:py-2 sm:text-sm"
            >
              Connexion
            </Link>
          </nav>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-4xl px-4 pb-20 pt-10 sm:px-8 sm:pb-24 sm:pt-14">
        <p className="kicker mb-3 text-[10px] tracking-[0.24em] sm:text-[11px]">Données personnelles</p>
        <h1 className="font-display text-[1.7rem] font-semibold leading-[1.12] tracking-tight text-white sm:text-4xl">
          Politique de confidentialité
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55 sm:text-base">
          NeuroRun lit tes données d’entraînement pour t’aider à progresser — rien de plus. Cette page décrit ce qui est
          collecté, pourquoi, qui y a accès, combien de temps c’est conservé, et comment tout effacer.
        </p>
        <p className="mt-3 text-xs text-white/35">Dernière mise à jour : {LAST_UPDATED}</p>

        <nav aria-label="Sommaire" className="mt-8 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-4 sm:px-6 sm:py-5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-brand-ice/80">Sommaire</p>
          <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className="flex items-baseline gap-2 text-sm text-white/55 transition hover:text-white"
                >
                  <span className="text-[11px] tabular-nums text-white/25">{String(i + 1).padStart(2, '0')}</span>
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-12 space-y-10">
          <Section id="responsable" title="1. Responsable du traitement">
            <p>
              Le responsable du traitement est {PUBLISHER.name}, {PUBLISHER.address}. Pour toute question relative à tes
              données, écris à{' '}
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Données personnelles — NeuroRun')}`}
                className="font-medium text-brand-ice/90 underline decoration-white/15 underline-offset-2 hover:text-white"
              >
                {CONTACT_EMAIL}
              </a>{' '}
              — c’est aussi l’adresse à utiliser pour exercer les droits décrits plus bas.
            </p>
            <p>
              Cette politique s’applique au site neurorun.fr, à l’application web et à l’application iOS NeuroRun. Le
              service est destiné à des coureurs adultes ; il n’a pas vocation médicale et ne remplace pas l’avis d’un
              professionnel de santé.
            </p>
          </Section>

          <Section id="donnees" title="2. Données collectées">
            <p>NeuroRun ne collecte que ce dont le service a besoin pour fonctionner :</p>
            <ul className="space-y-2.5 pl-4">
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Compte</strong> — email, mot de passe (jamais stocké en
                clair, uniquement sous forme hachée), prénom, nom, date de naissance et genre. La date de naissance et le
                genre servent à calibrer les zones d’effort et les prévisions.
              </li>
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Usage du coach</strong> — tes conversations, tes objectifs,
                les plans générés et les séances associées.
              </li>
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Activités sportives</strong> — les sorties importées depuis
                Strava si tu as lié ton compte, les sorties enregistrées dans l’app, les circuits créés et tes temps.
              </li>
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Position</strong> — uniquement pendant un enregistrement de
                sortie ou une séance sur circuit, et seulement après ton autorisation explicite dans le navigateur ou le
                téléphone.
              </li>
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Abonnement</strong> — offre choisie, statut, dates de
                renouvellement et identifiants de transaction fournis par le prestataire de paiement. Les coordonnées
                bancaires ne transitent jamais par NeuroRun.
              </li>
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Données techniques</strong> — journaux de connexion à l’API,
                adresse IP et horodatages, nécessaires au fonctionnement et à la sécurité.
              </li>
            </ul>
            <p>
              NeuroRun ne collecte pas de données de santé au sens médical, ne pratique aucun profilage publicitaire et ne
              revend aucune donnée.
            </p>
          </Section>

          <Section id="finalites" title="3. Finalités et bases légales">
            <p>Chaque traitement repose sur une base légale précise au sens du RGPD :</p>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th scope="col" className="py-2.5 pr-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Finalité
                    </th>
                    <th scope="col" className="py-2.5 pr-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Données
                    </th>
                    <th scope="col" className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Base légale
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {PURPOSES.map((row) => (
                    <tr key={row.purpose} className="border-b border-white/[0.05] align-top">
                      <td className="py-3 pr-4 text-white/75">{row.purpose}</td>
                      <td className="py-3 pr-4 text-white/45">{row.data}</td>
                      <td className="py-3 text-white/45">{row.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section id="coach" title="4. Coach IA">
            <p>
              Les réponses du coach sont générées par un modèle de langage opéré par {PUBLISHER.aiProvider}. Pour produire
              une réponse pertinente, NeuroRun lui transmet le strict contexte utile : ton message, l’historique de la
              conversation en cours, ton profil sportif et, le cas échéant, un résumé de tes dernières sorties.
            </p>
            <p>
              Ces données servent uniquement à générer ta réponse (inférence). Elles ne sont pas utilisées pour entraîner
              ou affiner des modèles d’intelligence artificielle, ni par NeuroRun, ni par ses prestataires.
            </p>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] px-4 py-4 text-sm leading-relaxed text-white/50 sm:px-5">
              Le coach produit des recommandations d’entraînement automatisées, sans effet juridique ni décision à ton
              égard. Elles restent indicatives : en cas de douleur, de blessure ou de doute sur ton état de santé,
              consulte un professionnel.
            </div>
          </Section>

          <Section id="strava" title="5. Connexion Strava">
            <p>
              Lier Strava est facultatif et ne se fait qu’à ton initiative, via le flux d’autorisation officiel de Strava
              (OAuth). Tant que tu n’as pas donné cette autorisation, NeuroRun n’accède à aucune donnée Strava.
            </p>
            <p>
              Une fois la liaison établie, NeuroRun récupère tes activités de course pour afficher tes statistiques et tes
              prévisions, et pour contextualiser les réponses du coach. Ces données ne servent que pour ton propre compte :
              elles ne sont jamais affichées à d’autres utilisateurs, ni cédées à des tiers, ni exploitées à des fins
              publicitaires, ni utilisées pour entraîner des modèles.
            </p>
            <p>
              Tu peux révoquer l’accès à tout moment, depuis ton{' '}
              <Link href="/profile/" className="font-medium text-brand-ice/90 underline decoration-white/15 underline-offset-2 hover:text-white">
                espace compte
              </Link>{' '}
              ou depuis les paramètres de ton compte Strava. Les jetons d’accès sont alors supprimés et la synchronisation
              s’arrête ; les données déjà importées sont effacées à la déconnexion ou à la suppression du compte.
            </p>
          </Section>

          <Section id="gps" title="6. Position et parcours">
            <p>
              La géolocalisation n’est activée que pendant un enregistrement de sortie ou une séance sur circuit, après ton
              autorisation explicite. Le suivi s’arrête dès que tu termines l’enregistrement ou que tu quittes l’écran.
            </p>
            <p>
              Les positions enregistrées constituent la trace de ta sortie (distance, allure, dénivelé) et restent
              attachées à ton compte. Lorsqu’une carte est affichée, ton navigateur contacte directement OpenStreetMap
              pour les fonds de carte et un service de calcul d’itinéraire pour tracer un parcours : ces services voient
              alors ton adresse IP et la zone consultée.
            </p>
          </Section>

          <Section id="destinataires" title="7. Destinataires et sous-traitants">
            <p>
              Tes données ne sont accessibles qu’à toi et, pour les besoins de l’exploitation et du support, aux personnes
              habilitées chez l’éditeur. Elles sont par ailleurs traitées par les prestataires suivants :
            </p>
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[42rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th scope="col" className="py-2.5 pr-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Prestataire
                    </th>
                    <th scope="col" className="py-2.5 pr-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Rôle
                    </th>
                    <th scope="col" className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Localisation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RECIPIENTS.map((row) => (
                    <tr key={row.name} className="border-b border-white/[0.05] align-top">
                      <td className="py-3 pr-4 text-white/75">{row.name}</td>
                      <td className="py-3 pr-4 text-white/45">{row.role}</td>
                      <td className="py-3 text-white/45">{row.where}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              Lorsqu’un transfert hors de l’Union européenne est nécessaire, il est encadré par les clauses contractuelles
              types de la Commission européenne ou par une décision d’adéquation. Aucune donnée n’est vendue ni louée.
            </p>
          </Section>

          <Section id="conservation" title="8. Durées de conservation">
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/[0.08]">
                    <th scope="col" className="py-2.5 pr-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Donnée
                    </th>
                    <th scope="col" className="py-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Durée
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {RETENTION.map((row) => (
                    <tr key={row.item} className="border-b border-white/[0.05] align-top">
                      <td className="py-3 pr-4 text-white/75">{row.item}</td>
                      <td className="py-3 text-white/45">{row.duration}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              La suppression du compte efface le compte et les données associées. Seules subsistent les pièces que la loi
              impose de conserver, notamment comptables.
            </p>
          </Section>

          <Section id="stockage" title="9. Cookies et stockage local">
            <p>
              NeuroRun n’utilise ni cookie publicitaire, ni traceur d’audience, ni outil d’analyse comportementale. Aucune
              bannière de consentement n’est donc nécessaire.
            </p>
            <p>
              L’application conserve dans le stockage local de ton navigateur un jeton de session, indispensable pour te
              maintenir connecté, ainsi que quelques préférences d’affichage. Ces éléments restent sur ton appareil et
              disparaissent à la déconnexion ou lorsque tu vides les données du site.
            </p>
          </Section>

          <Section id="securite" title="10. Sécurité">
            <p>
              Les échanges entre ton appareil et NeuroRun sont chiffrés en HTTPS. Les mots de passe sont stockés hachés,
              les jetons d’accès Strava sont conservés côté serveur, et l’accès aux données de production est restreint aux
              personnes habilitées.
            </p>
            <p>
              Aucun système n’est infaillible : en cas de violation de données susceptible d’engendrer un risque élevé pour
              tes droits, tu en seras informé conformément à l’article 34 du RGPD.
            </p>
          </Section>

          <Section id="droits" title="11. Tes droits">
            <p>
              Conformément au RGPD, tu disposes d’un droit d’accès, de rectification, d’effacement, de limitation,
              d’opposition et de portabilité, ainsi que du droit de retirer ton consentement à tout moment (notamment pour
              Strava et la géolocalisation).
            </p>
            <ul className="space-y-2.5 pl-4">
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Accès et rectification</strong> — la plupart de tes données
                sont consultables et modifiables directement dans ton espace compte.
              </li>
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Effacement</strong> — le bouton « Supprimer mon compte », dans
                ton profil, efface définitivement ton compte et les données associées.
              </li>
              <li className="list-disc marker:text-white/25">
                <strong className="font-medium text-white/80">Portabilité et autres demandes</strong> — écris à{' '}
                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Exercice de mes droits — NeuroRun')}`}
                  className="font-medium text-brand-ice/90 underline decoration-white/15 underline-offset-2 hover:text-white"
                >
                  {CONTACT_EMAIL}
                </a>
                . Une réponse te sera apportée dans un délai d’un mois.
              </li>
            </ul>
            <p>
              Si une réponse ne te satisfait pas, tu peux introduire une réclamation auprès de la CNIL (3 place de
              Fontenoy, TSA 80715, 75334 Paris Cedex 07 —{' '}
              <a
                href="https://www.cnil.fr"
                target="_blank"
                rel="noreferrer noopener"
                className="font-medium text-brand-ice/90 underline decoration-white/15 underline-offset-2 hover:text-white"
              >
                cnil.fr
              </a>
              ).
            </p>
          </Section>

          <Section id="mineurs" title="12. Mineurs">
            <p>
              NeuroRun s’adresse aux personnes majeures. Le service n’est pas destiné aux moins de 15 ans et aucune donnée
              n’est collectée sciemment les concernant. Si un compte a été créé pour un mineur sans l’accord du titulaire
              de l’autorité parentale, écris-nous : il sera supprimé.
            </p>
          </Section>

          <Section id="modifications" title="13. Modifications">
            <p>
              Cette politique peut évoluer avec le service. La date de dernière mise à jour figure en haut de page ; en cas
              de changement significatif (nouvelle finalité, nouveau sous-traitant), tu seras informé dans l’application ou
              par email avant son application.
            </p>
          </Section>
        </div>

        <div className="mt-14 rounded-3xl border border-white/[0.08] bg-white/[0.02] px-5 py-6 sm:px-7 sm:py-7">
          <h2 className="font-display text-lg font-semibold tracking-tight text-white">Une question sur tes données ?</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            Le support répond aux demandes d’accès, de suppression et de déconnexion Strava.
          </p>
          <Link href="/contact/" className="btn-brand mt-5 inline-flex px-5 text-sm font-semibold">
            Contacter le support
          </Link>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.05] bg-gradient-to-b from-transparent to-surface-0/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-4xl flex-col gap-5 px-4 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-11">
          <Link href="/" className="inline-flex w-fit items-center gap-2 text-white/40 transition hover:text-white/55">
            <Mark />
            <span className="text-xs text-white/35 sm:text-sm">© {new Date().getFullYear()}</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/45">
            <Link href="/" className="transition hover:text-white/75">
              Accueil
            </Link>
            <Link href="/contact/" className="transition hover:text-white/75">
              Contact
            </Link>
            <Link href="/login/" className="transition hover:text-white/75">
              Connexion
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
