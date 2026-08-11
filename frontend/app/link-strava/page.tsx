"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { MemberPageHeader } from "@/components/MemberPageHeader";
import { fetchMe, stravaAuthorizeUrl } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

function isMobileUA() {
  if (typeof navigator === "undefined") return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent,
  );
}

/** Marque Strava, pour l’action de liaison (chevrons superposés). */
function StravaMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
    </svg>
  );
}

function Icon({ d, className = "h-4 w-4" }: { d: string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
  );
}

/* Ce que la liaison apporte concrètement — pas des promesses, des écrans qui existent. */
const BENEFITS: { icon: string; title: string; body: string }[] = [
  {
    icon: "M3.75 19.5h16.5M6.75 19.5V11.25m5.25 8.25V6.75m5.25 12.75v-5.25",
    title: "Ton historique analysé",
    body: "Volume, allure et fréquence cardiaque de tes sorties passées, mis en graphiques.",
  },
  {
    icon: "M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm3.75 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM4.5 4.5h15a1.5 1.5 0 011.5 1.5v8.25a1.5 1.5 0 01-1.5 1.5h-5.69l-3.87 3.53a.75.75 0 01-1.26-.55v-2.98H4.5A1.5 1.5 0 013 14.25V6a1.5 1.5 0 011.5-1.5z",
    title: "Un coach qui te connaît",
    body: "Les réponses s’appuient sur ce que tu cours vraiment, pas sur un profil type.",
  },
  {
    icon: "M4.5 16.5l4.5-5.25 3.75 3 6.75-8.25M3.75 19.5h16.5",
    title: "Objectifs et prévisions",
    body: "Estimation de chrono et plans calés sur ta charge d’entraînement réelle.",
  },
];

/* Le périmètre exact de l’autorisation demandée : lisible avant de cliquer, pas après. */
const PERMISSIONS: { icon: string; label: string }[] = [
  {
    icon: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z",
    label: "Lecture seule de tes activités et de ton profil",
  },
  {
    icon: "M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728L5.636 5.636m12.728 12.728A9 9 0 015.636 5.636",
    label: "Aucune publication sur ton compte Strava",
  },
  {
    icon: "M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z",
    label: "Jetons conservés côté serveur, jamais dans le navigateur",
  },
  {
    icon: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
    label: "Révocable à tout moment depuis Strava ou ton profil",
  },
];

function LinkStravaContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [stravaAllowed, setStravaAllowed] = useState(true);
  const qErr = params.get("error");

  useEffect(() => {
    setMobile(isMobileUA());
  }, []);

  useEffect(() => {
    if (qErr === "config") {
      setError(
        "L'API n'expose pas Strava : remplis STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET et STRAVA_REDIRECT_URI côté serveur, puis redémarre.",
      );
      return;
    }
    if (qErr === "forbidden") {
      setError(
        "Strava n’est pas inclus dans ton offre actuelle. Mets à niveau ton abonnement depuis l’accueil ou contacte un administrateur.",
      );
      return;
    }
    if (qErr) {
      setError(
        "La liaison Strava a été interrompue. Réessaie ; si ça bloque, ouvre ce site dans Safari ou Chrome (pas dans un navigateur intégré type Instagram ou Facebook).",
      );
    }
  }, [qErr]);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.replace("/login/");
      return;
    }
    (async () => {
      try {
        const me = await fetchMe(token);
        if (me.capabilities?.strava_dashboard === false) {
          setStravaAllowed(false);
          return;
        }
        if (me.strava_linked) router.replace("/dashboard/");
      } catch {
        router.replace("/login/");
      }
    })();
  }, [router]);

  async function connect() {
    const token = getToken();
    if (!token) return;
    if (!stravaAllowed) return;
    setError("");
    setLoading(true);
    try {
      const { url } = await stravaAuthorizeUrl(token);
      // Navigation pleine page : meilleure prise en charge mobile (Safari/Chrome, bannière « Ouvrir dans Strava »).
      window.location.replace(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    router.push("/login/");
  }

  return (
    <main className="member-app flex min-h-[100dvh] flex-col overflow-x-hidden">
      <MemberPageHeader
        onLogout={logout}
        maxWidthClass="mx-auto w-full max-w-5xl"
        leading={
          <Link
            href="/dashboard/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-white/40 transition hover:text-white/85"
          >
            <Icon d="M15 19l-7-7 7-7" className="h-3.5 w-3.5" />
            Tableau de bord
          </Link>
        }
      />

      {/* Contenu centré verticalement : la page ne retombe plus dans un grand vide sous la carte. */}
      <div className="member-main-pad-b mx-auto flex w-full max-w-5xl flex-1 items-center px-safe py-8 sm:py-12">
        {/*
          Trois blocs, deux mises en page. Sur grand écran : le discours à gauche,
          l’action à droite. Sur téléphone : titre, puis bouton, puis arguments —
          on ne fait pas défiler trois paragraphes avant de pouvoir agir.
        */}
        <div className="grid w-full items-center gap-8 lg:grid-cols-[1.02fr_minmax(0,1fr)] lg:gap-x-14 lg:gap-y-8">
          <div className="order-1 min-w-0 lg:col-start-1 lg:row-start-1 lg:self-end">
            <div className="flex items-center gap-3">
              <p className="kicker text-brand-orange">Étape 2 sur 2</p>
              <span className="flex items-center gap-1" aria-hidden>
                <span className="h-1 w-6 rounded-full bg-brand-orange/45" />
                <span className="h-1 w-6 rounded-full bg-brand-orange" />
              </span>
            </div>

            <h1 className="mt-4 font-display text-[1.9rem] font-bold leading-[1.1] tracking-[-0.025em] text-white sm:text-[2.4rem]">
              Connecte ton compte{" "}
              <span className="whitespace-nowrap text-brand-orange">Strava</span>
            </h1>
            <p className="mt-4 max-w-lg text-[14.5px] leading-relaxed text-white/55">
              NeuroRun lit tes sorties passées pour construire tes tableaux, tes objectifs et les réponses du coach.
              Sans liaison, le coach fonctionne — il devine simplement beaucoup moins.
            </p>
          </div>

          <ul className="order-3 min-w-0 space-y-4 lg:order-none lg:col-start-1 lg:row-start-2 lg:self-start">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-3.5">
                <span className="app-icon-tile !h-9 !w-9 text-brand-orange" aria-hidden>
                  <Icon d={b.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-semibold leading-tight text-white/90">{b.title}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-white/45">{b.body}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* L’action et son périmètre. */}
          <div className="order-2 min-w-0 lg:order-none lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            {error ? (
              <div
                role="alert"
                className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/30 bg-red-500/[0.09] px-4 py-3.5"
              >
                <Icon
                  d="M12 9v3.75m0 3.75h.008M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  className="mt-px h-5 w-5 shrink-0 text-red-300"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-red-50">La liaison n’a pas abouti</p>
                  <p className="mt-0.5 text-[13px] leading-snug text-red-100/70">{error}</p>
                </div>
              </div>
            ) : null}

            {!stravaAllowed ? (
              <LockedCard />
            ) : (
              <section className="panel overflow-hidden">
                {/* Schéma de la liaison : deux comptes, un lien. */}
                <div className="relative border-b border-white/[0.06] bg-[radial-gradient(ellipse_120%_100%_at_50%_-40%,rgba(252,76,2,0.16),transparent_70%)] px-5 py-7">
                  <div className="flex items-center justify-center gap-3 sm:gap-4">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/[0.08] bg-[#0d0f16] shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
                      <span className="font-display text-lg font-bold tracking-tight text-white">N</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-white/25" aria-hidden>
                      <span className="h-px w-4 bg-current sm:w-6" />
                      <Icon d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" className="h-4 w-4" />
                      <span className="h-px w-4 bg-current sm:w-6" />
                    </span>
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-orange/25 bg-brand-orange/[0.12] text-brand-orange shadow-[0_8px_24px_rgba(252,76,2,0.18)]">
                      <StravaMark className="h-7 w-7" />
                    </span>
                  </div>
                  <p className="mt-4 text-center text-[12.5px] leading-snug text-white/45">
                    Tu seras redirigé vers Strava pour autoriser NeuroRun, puis ramené ici automatiquement.
                  </p>
                </div>

                <div className="p-5 sm:p-6">
                  <button
                    type="button"
                    className="btn-brand w-full cursor-pointer text-[15px]"
                    disabled={loading}
                    onClick={connect}
                  >
                    {loading ? (
                      "Redirection vers Strava…"
                    ) : (
                      <>
                        <StravaMark className="h-[18px] w-[18px]" />
                        Associer mon compte Strava
                      </>
                    )}
                  </button>

                  <ul className="mt-5 space-y-2.5">
                    {PERMISSIONS.map((p) => (
                      <li key={p.label} className="flex items-start gap-2.5">
                        <Icon d={p.icon} className="mt-px h-4 w-4 shrink-0 text-brand-ice/70" />
                        <span className="text-[12.5px] leading-snug text-white/55">{p.label}</span>
                      </li>
                    ))}
                  </ul>

                  {mobile ? (
                    <p className="app-note mt-5 text-[12.5px]">
                      <span>
                        Sur téléphone, ouvre ce site dans <strong>Safari</strong> ou <strong>Chrome</strong> plutôt que
                        dans un navigateur intégré (Instagram, Facebook). Si Strava propose d’ouvrir{" "}
                        <strong>l’application</strong>, accepte : la connexion est plus simple.
                      </span>
                    </p>
                  ) : null}

                  <div className="mt-5 border-t border-white/[0.06] pt-4 text-center">
                    <Link
                      href="/dashboard/"
                      className="text-[13px] font-medium text-white/45 underline decoration-white/15 underline-offset-4 transition hover:text-white/85 hover:decoration-white/30"
                    >
                      Continuer sans Strava
                    </Link>
                    <p className="mt-1.5 text-[11.5px] text-white/30">Tu pourras lier ton compte plus tard, depuis ton profil.</p>
                  </div>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Offre sans Strava : dire ce qui manque et où aller, plutôt qu’un simple refus. */
function LockedCard() {
  return (
    <section className="panel p-6">
      <span className="app-icon-tile text-white/50" aria-hidden>
        <Icon d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" className="h-5 w-5" />
      </span>
      <h2 className="mt-3.5 font-display text-lg font-semibold text-white">Strava n’est pas inclus dans ton offre</h2>
      <p className="mt-2 text-[13.5px] leading-relaxed text-white/55">
        La synchronisation Strava fait partie des offres supérieures. Le coach, les objectifs et la course GPS restent
        disponibles avec ton offre actuelle.
      </p>
      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        <Link href="/#offres" className="btn-brand w-full text-center sm:w-auto">
          Voir les offres
        </Link>
        <Link href="/dashboard/" className="btn-quiet w-full text-center sm:w-auto">
          Retour au tableau de bord
        </Link>
      </div>
    </section>
  );
}

export default function LinkStravaPage() {
  return (
    <Suspense
      fallback={
        <main className="member-app flex min-h-[100dvh] items-center justify-center">
          <div
            className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange"
            role="status"
            aria-label="Chargement"
          />
        </main>
      }
    >
      <LinkStravaContent />
    </Suspense>
  );
}
