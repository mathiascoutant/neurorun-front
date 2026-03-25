"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Mark } from "@/components/Mark";
import { fetchMe, getApiBase, stravaAuthorizeUrl } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth";

function LinkStravaContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const qErr = params.get("error");

  useEffect(() => {
    if (qErr === "config") {
      setError(
        "L'API n'expose pas Strava : remplis STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET et STRAVA_REDIRECT_URI dans backend/.env, puis redémarre le serveur.",
      );
      return;
    }
    if (qErr) {
      setError(
        "OAuth Strava interrompu. Vérifie que l’URL de callback côté Strava correspond exactement à celle indiquée ci-dessous.",
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
        if (me.strava_linked) router.replace("/chat/");
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
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    clearToken();
    router.push("/login/");
  }

  const callback = `${getApiBase()}/api/strava/callback`;

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
          Lier Strava
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/55">
          On demande uniquement la lecture de tes activités et de ton profil
          pour alimenter le coach IA. Les tokens sont stockés côté serveur, pas
          dans le navigateur.
        </p>

        <div className="mt-10 panel p-6 sm:p-8">
          <h2 className="font-display text-lg font-semibold">
            URL de callback à déclarer chez Strava
          </h2>
          <p className="mt-2 text-xs text-white/45">
            Console développeur Strava → Application → Authorization Callback
            Domain / redirect URI.
          </p>
          <code className="mt-4 block break-all rounded-xl border border-white/10 bg-surface-0 px-4 py-3 text-xs text-brand-ice/90">
            {callback}
          </code>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-500/35 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              className="btn-brand flex-1 sm:flex-none sm:px-8"
              disabled={loading}
              onClick={connect}
            >
              {loading ? "Redirection…" : "Ouvrir Strava"}
            </button>
            <Link
              href="/chat/"
              className="btn-quiet flex-1 text-center sm:flex-none"
            >
              J’ai déjà lié — accéder au chat
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
