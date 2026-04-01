"use client";

import { useCallback, useEffect, useRef, useState } from "react";

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dp / 2) * Math.sin(dp / 2) +
    Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatClock(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec < 0) return "0:00";
  const s = Math.floor(totalSec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${r.toString().padStart(2, "0")}`;
  }
  return `${m}:${r.toString().padStart(2, "0")}`;
}

function formatPaceMinPerKm(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${s.toString().padStart(2, "0")}/km`;
}

/** Texte pour la synthèse vocale (français). */
function verbalDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) {
    return sec === 1 ? "1 seconde" : `${sec} secondes`;
  }
  if (sec === 0) {
    return min === 1 ? "1 minute" : `${min} minutes`;
  }
  const minPart = min === 1 ? "1 minute" : `${min} minutes`;
  const secPart = sec === 1 ? "1 seconde" : `${sec} secondes`;
  return `${minPart} et ${secPart}`;
}

function pickFrenchVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) return null;
  return (
    voices.find((v) => v.lang.toLowerCase().startsWith("fr")) ??
    voices.find((v) => v.lang.toLowerCase().includes("fr")) ??
    null
  );
}

function applyFrenchVoice(u: SpeechSynthesisUtterance): void {
  const v = pickFrenchVoice();
  if (v) u.voice = v;
}

let sharedAudioContext: AudioContext | null = null;

function getSharedAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (sharedAudioContext && sharedAudioContext.state !== "closed") {
    return sharedAudioContext;
  }
  const AC =
    window.AudioContext ??
    (
      window as typeof window & {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;
  if (!AC) return null;
  sharedAudioContext = new AC();
  return sharedAudioContext;
}

/** Deux notes courtes (« top départ ») — déclenché sur le tap, sans réseau. */
function playCourseStartChime(): void {
  try {
    const ctx = getSharedAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") {
      void ctx.resume();
    }
    const t0 = ctx.currentTime;
    const tone = (
      freqHz: number,
      start: number,
      dur: number,
      peak: number,
    ) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freqHz, t0 + start);
      const a = t0 + start;
      const b = a + dur;
      g.gain.setValueAtTime(0.0001, a);
      g.gain.exponentialRampToValueAtTime(peak, a + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, b);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(a);
      osc.stop(b + 0.03);
    };
    tone(523.25, 0, 0.11, 0.14);
    tone(659.25, 0.1, 0.13, 0.11);
  } catch {
    /* navigateur sans Web Audio, etc. */
  }
}

/**
 * iOS / Safari : la synthèse ne joue plus si aucun speak() n’a été fait dans le geste utilisateur.
 * Appeler cette fonction tout au début de « Démarrer », sans await avant.
 */
function primeSpeechOnUserGesture(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const syn = window.speechSynthesis;
  syn.cancel();
  try {
    syn.resume();
  } catch {
    /* certains navigateurs n’exposent pas resume */
  }
  void syn.getVoices();
  const warm = new SpeechSynthesisUtterance(" ");
  warm.volume = 0.02;
  warm.rate = 6;
  warm.lang = "fr-FR";
  applyFrenchVoice(warm);
  syn.speak(warm);
}

function speakKm(km: number, splitSec: number, tenKSec: number) {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  const syn = window.speechSynthesis;
  const split = verbalDuration(splitSec);
  const ten = verbalDuration(tenKSec);
  const u = new SpeechSynthesisUtterance(
    `Kilomètre ${km} en ${split}. À ce rythme, dix kilomètres en ${ten}.`,
  );
  u.lang = "fr-FR";
  u.rate = 1;
  u.volume = 1;
  applyFrenchVoice(u);
  try {
    syn.resume();
  } catch {
    /* */
  }
  syn.speak(u);
}

type RunPhase = "setup" | "running" | "ended";

/** Pas d’affichage pour la distance (m) — 1 m pour réagir vite après le fix GPS. */
const DISTANCE_UI_STEP_M = 1;

const GEO_SEED: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 30000,
};

const GEO_WATCH: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 20000,
};

function useNavigatorOnline(): boolean {
  const [online, setOnline] = useState(
    () => typeof navigator !== "undefined" && navigator.onLine,
  );
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  return online;
}

type Props = {
  /** L’API n’a pas répondu au chargement : la suite ne dépend pas du réseau. */
  apiUnreachableAtLoad?: boolean;
};

export function LiveRunPanel({ apiUnreachableAtLoad = false }: Props) {
  const netOnline = useNavigatorOnline();
  const [phase, setPhase] = useState<RunPhase>("setup");
  const [targetKm, setTargetKm] = useState("10");
  const [error, setError] = useState("");

  const [elapsedSec, setElapsedSec] = useState(0);
  /** Distance affichée (m), mise à jour par paliers de DISTANCE_UI_STEP_M pendant la course. */
  const [distanceM, setDistanceM] = useState(0);
  /** Incrémenté sur le tick chrono pour relire accMRef (allure / % objectif lissés). */
  const [, setMetricsTick] = useState(0);
  const [geoOk, setGeoOk] = useState<boolean | null>(null);
  /** Faux tant que le chrono n’a pas démarré sur le 1er point GPS (affichage « accrochage »). */
  const [gpsClockLive, setGpsClockLive] = useState(false);

  /** 0 = chrono pas encore démarré (en attente du 1er fix). Sinon timestamp ms. */
  const startRef = useRef(0);
  const watchRef = useRef<number | null>(null);
  const lastLatRef = useRef<number | null>(null);
  const lastLonRef = useRef<number | null>(null);
  const accMRef = useRef(0);
  const lastDistanceUiBucketRef = useRef(0);
  const lastKmCrossingMsRef = useRef(0);
  const lastAnnouncedKmRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);

  const cleanupWatch = useCallback(() => {
    if (
      watchRef.current != null &&
      typeof navigator !== "undefined" &&
      navigator.geolocation
    ) {
      navigator.geolocation.clearWatch(watchRef.current);
    }
    watchRef.current = null;
    if (tickRef.current != null) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    void wakeRef.current?.release?.();
    wakeRef.current = null;
  }, []);

  useEffect(() => () => cleanupWatch(), [cleanupWatch]);

  /* Charge les voix (souvent asynchrone sur iOS) pour pickFrenchVoice au 1er km. */
  useEffect(() => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    const syn = window.speechSynthesis;
    const bump = () => {
      void syn.getVoices();
    };
    syn.addEventListener("voiceschanged", bump);
    bump();
    return () => syn.removeEventListener("voiceschanged", bump);
  }, []);

  const trueM = accMRef.current;
  const distKmShown = distanceM / 1000;
  const target = Math.max(0.1, parseFloat(targetKm.replace(",", ".")) || 0);
  const paceSecPerKm =
    trueM > 5 && elapsedSec > 0 ? elapsedSec / (trueM / 1000) : 0;
  const paceDisplay = formatPaceMinPerKm(paceSecPerKm);
  const progressed = Math.min(1, (trueM / 1000) / target);

  const startRun = useCallback(async () => {
    setError("");
    /* Avant tout await : son + synthèse liés au tap (mobile / Safari). */
    playCourseStartChime();
    primeSpeechOnUserGesture();

    const t = Math.max(0.5, parseFloat(targetKm.replace(",", ".")) || 10);
    setTargetKm(String(t));

    if (!navigator.geolocation) {
      setError("La géolocalisation n’est pas disponible sur cet appareil.");
      return;
    }

    try {
      const wn = navigator as Navigator & {
        wakeLock?: {
          request: (
            type: "screen",
          ) => Promise<{ release: () => Promise<void> }>;
        };
      };
      if (wn.wakeLock?.request) {
        wakeRef.current = await wn.wakeLock.request("screen");
      }
    } catch {
      /* garde l’écran allumé est optionnel */
    }

    accMRef.current = 0;
    lastDistanceUiBucketRef.current = 0;
    setDistanceM(0);
    lastLatRef.current = null;
    lastLonRef.current = null;
    lastAnnouncedKmRef.current = 0;
    startRef.current = 0;
    lastKmCrossingMsRef.current = 0;
    setElapsedSec(0);
    setGpsClockLive(false);
    setPhase("running");
    setGeoOk(null);

    const armChronoOnFirstFix = () => {
      if (startRef.current > 0) return;
      const ts = Date.now();
      startRef.current = ts;
      lastKmCrossingMsRef.current = ts;
      setGpsClockLive(true);
    };

    tickRef.current = setInterval(() => {
      const base = startRef.current;
      if (base <= 0) {
        setElapsedSec(0);
      } else {
        setElapsedSec((Date.now() - base) / 1000);
      }
      setMetricsTick((n) => n + 1);
    }, 200);

    /* Premier fix souvent plus rapide qu’en n’écoutant que watchPosition. */
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoOk(true);
        const { latitude, longitude } = pos.coords;
        if (lastLatRef.current == null) {
          lastLatRef.current = latitude;
          lastLonRef.current = longitude;
        }
        armChronoOnFirstFix();
      },
      () => {
        /* watch ou prochaine tentative fournira la position */
      },
      GEO_SEED,
    );

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoOk(true);
        const { latitude, longitude } = pos.coords;

        if (lastLatRef.current == null || lastLonRef.current == null) {
          lastLatRef.current = latitude;
          lastLonRef.current = longitude;
          armChronoOnFirstFix();
          return;
        }

        const prevLat = lastLatRef.current;
        const prevLon = lastLonRef.current;
        lastLatRef.current = latitude;
        lastLonRef.current = longitude;

        let d = haversineM(prevLat, prevLon, latitude, longitude);
        if (d > 80) {
          /* probable saut GPS : on ignore le segment */
          return;
        }
        if (d < 0.5) return;
        accMRef.current += d;

        const bucket = Math.floor(accMRef.current / DISTANCE_UI_STEP_M);
        if (bucket > lastDistanceUiBucketRef.current) {
          lastDistanceUiBucketRef.current = bucket;
          setDistanceM(bucket * DISTANCE_UI_STEP_M);
        }

        const km = accMRef.current / 1000;
        const t = Date.now();
        const newFloor = Math.floor(km);
        const crossed = newFloor - lastAnnouncedKmRef.current;
        if (crossed > 0) {
          const totalSplitSec = (t - lastKmCrossingMsRef.current) / 1000;
          const perKmSec = Math.max(0.1, totalSplitSec / crossed);
          for (let i = 0; i < crossed; i++) {
            lastAnnouncedKmRef.current += 1;
            const k = lastAnnouncedKmRef.current;
            speakKm(k, perKmSec, perKmSec * 10);
          }
          lastKmCrossingMsRef.current = t;
        }
      },
      (err) => {
        setGeoOk(false);
        setError(err.message || "Impossible d’accéder au GPS.");
      },
      GEO_WATCH,
    );
  }, [targetKm]);

  const stopRun = useCallback(() => {
    cleanupWatch();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setDistanceM(accMRef.current);
    setPhase("ended");
  }, [cleanupWatch]);

  const resetRun = useCallback(() => {
    cleanupWatch();
    setPhase("setup");
    setElapsedSec(0);
    setDistanceM(0);
    accMRef.current = 0;
    lastDistanceUiBucketRef.current = 0;
    setError("");
    setGeoOk(null);
    setGpsClockLive(false);
  }, [cleanupWatch]);

  const showOfflineBanner = apiUnreachableAtLoad || !netOnline;

  return (
    <div className="space-y-6">
      {showOfflineBanner ? (
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-xs leading-relaxed text-cyan-100/95">
          <p className="font-medium text-cyan-50/95">Mode local / sans internet</p>
          <p className="mt-1.5 text-[11px] text-cyan-100/80">
            La distance et le chrono sont calculés sur ton appareil via le{" "}
            <strong className="font-medium text-cyan-50/95">GPS</strong> (géolocalisation navigateur / puce GNSS) — pas
            de carte en ligne ni d’envoi de points pendant la course. Les annonces vocales utilisent la synthèse
            intégrée au téléphone. Le suivi reste le même avec ou sans réseau.
          </p>
        </div>
      ) : null}

      <div className="panel p-5">
        <h2 className="font-display text-sm font-semibold text-white">
          Course en direct
        </h2>
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">
          Position côté appareil (GPS). Un premier point est demandé tout de suite pour accrocher plus vite ; le chrono
          démarre au premier signal GPS (pas pendant l’attente du fix). Distance affichée par pas d’1 m. À chaque km :
          annonce vocale. Garde l’onglet ouvert pendant la sortie.
        </p>
      </div>

      {phase === "setup" ? (
        <div className="panel p-5 space-y-4">
          <label className="block">
            <span className="text-[10px] font-medium uppercase tracking-wider text-white/40">
              Distance visée (km)
            </span>
            <input
              type="text"
              inputMode="decimal"
              className="field mt-2 w-full max-w-[200px] border-white/[0.08] bg-surface-2/80"
              value={targetKm}
              onChange={(e) => setTargetKm(e.target.value)}
              placeholder="10"
            />
          </label>
          {error ? (
            <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </p>
          ) : null}
          <button
            type="button"
            className="btn-brand px-6 py-2.5 text-sm"
            onClick={() => void startRun()}
          >
            Démarrer la course
          </button>
        </div>
      ) : null}

      {phase === "running" || phase === "ended" ? (
        <div className="panel p-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Temps
              </p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-white">
                {phase === "running" && !gpsClockLive
                  ? "—"
                  : formatClock(elapsedSec)}
              </p>
              {phase === "running" && !gpsClockLive ? (
                <p className="mt-1 text-[10px] text-white/40">
                  Accrochage GPS — le chrono démarre au premier point reçu.
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Distance
              </p>
              <p className="mt-1 font-display text-3xl font-semibold tabular-nums text-white">
                {distKmShown.toFixed(2)} km
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Allure moyenne
              </p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-brand-ice">
                {paceDisplay}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Temps au km (moy.)
              </p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums text-white/90">
                {paceSecPerKm > 0 ? formatClock(paceSecPerKm) : "—"}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[10px] text-white/40">
              <span>Objectif {target.toFixed(1)} km</span>
              <span>{Math.round(progressed * 100)} %</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-orange to-brand-ice transition-[width] duration-300"
                style={{ width: `${progressed * 100}%` }}
              />
            </div>
          </div>

          {geoOk === false ? (
            <p className="text-xs text-amber-200/90">
              Signal GPS faible ou refusé — vérifie les autorisations.
            </p>
          ) : geoOk === true ? (
            <p className="text-[11px] text-white/35">
              GPS actif — points frais (pas de position mise en cache), distance par mètres, allure en continu.
            </p>
          ) : (
            <p className="text-[11px] text-white/35">Recherche de position…</p>
          )}
          {error ? <p className="text-xs text-red-200/90">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            {phase === "running" ? (
              <button
                type="button"
                className="btn-quiet border border-white/15 px-4 py-2 text-sm"
                onClick={stopRun}
              >
                Terminer
              </button>
            ) : (
              <button
                type="button"
                className="btn-brand px-4 py-2 text-sm"
                onClick={resetRun}
              >
                Nouvelle course
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
