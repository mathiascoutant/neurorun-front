"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mark } from "@/components/Mark";
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
        if (me.strava_linked) router.replace("/dashboard/");
      } catch {
        router.replace("/login/");
      }
    })();
  }, [router]);

  async function connect() {
    const token = getToken();
    if (!token) return;
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
    <main className="min-h-screen">
      <header className="border-b border-white/[0.06] bg-surface-1/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
          <Mark />
          <button type="button" className="btn-quiet text-xs" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-12">
        <p className="kicker text-brand-orange">Étape 2 sur 2</p>
        <h1 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Strava
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55">
          Lecture seule de tes activités et de ton profil pour le coach IA. Les jetons restent sur le
          serveur.
        </p>

        <div className="mt-10 panel p-6 sm:p-8">
          {error ? (
            <div className="mb-6 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          {mobile ? (
            <p className="mb-6 text-xs leading-relaxed text-white/45">
              Sur téléphone, tu seras envoyé vers Strava : utilise de préférence <strong className="text-white/60">Safari</strong> ou <strong className="text-white/60">Chrome</strong>. Si Strava propose d’ouvrir <strong className="text-white/60">l’application</strong>, tu peux accepter pour te connecter plus facilement.
            </p>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="button"
              className="btn-brand flex-1 sm:flex-none sm:px-10"
              disabled={loading}
              onClick={connect}
            >
              {loading ? "Redirection…" : "Associer mon compte Strava"}
            </button>
            <Link href="/dashboard/" className="btn-quiet flex-1 text-center sm:flex-none">
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
