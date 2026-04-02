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
    <main className="min-h-[100dvh] overflow-x-hidden">
      <MemberPageHeader
        onLogout={logout}
        maxWidthClass="mx-auto w-full max-w-3xl"
        leading={
          <Link
            href="/dashboard/"
            className="text-xs font-medium text-white/40 underline decoration-white/15 underline-offset-4 transition hover:text-white/85 hover:decoration-white/30"
          >
            Tableau de bord
          </Link>
        }
      />

      <div className="member-main-pad-b mx-auto max-w-3xl px-safe py-8 sm:py-12">
        <p className="kicker text-brand-orange">Étape 2 sur 2</p>
        <h1 className="mt-3 font-display text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
          Strava
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55">
          Lecture seule de tes activités et de ton profil pour le coach IA. Les jetons restent sur le
          serveur.
        </p>

        <div className="mt-8 panel p-5 sm:mt-10 sm:p-8">
          {error ? (
            <div className="mb-6 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {!stravaAllowed ? (
            <p className="text-sm leading-relaxed text-white/60">
              La synchronisation Strava n’est pas activée pour ton offre. Choisis une offre incluant Strava sur la page
              d’accueil ou demande à un administrateur.
            </p>
          ) : null}

          {stravaAllowed && mobile ? (
            <p className="mb-6 text-xs leading-relaxed text-white/45">
              Sur téléphone, tu seras envoyé vers Strava : utilise de préférence <strong className="text-white/60">Safari</strong> ou <strong className="text-white/60">Chrome</strong>. Si Strava propose d’ouvrir <strong className="text-white/60">l’application</strong>, tu peux accepter pour te connecter plus facilement.
            </p>
          ) : null}

          <div className={`flex flex-col gap-3 sm:flex-row sm:items-stretch ${!stravaAllowed ? "hidden" : ""}`}>
            <button
              type="button"
              className="btn-brand w-full sm:w-auto sm:flex-1 sm:px-8 md:px-10"
              disabled={loading}
              onClick={connect}
            >
              {loading ? "Redirection…" : "Associer mon compte Strava"}
            </button>
            <Link href="/dashboard/" className="btn-quiet w-full text-center sm:w-auto sm:shrink-0">
              Déjà lié — tableau de bord
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function LinkStravaPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-2xl border-2 border-brand-orange/30 border-t-brand-orange" />
        </main>
      }
    >
      <LinkStravaContent />
    </Suspense>
  );
}
