"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  type LiveRunPayload,
  type LiveRunSplit,
  type LiveRunTrackPoint,
  postLiveRun,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import {
  WEB_GPS_SEED,
  WEB_GPS_WATCH,
  webGpsCreditDistanceM,
  webGpsMovingSecondsDelta,
} from "@/lib/webGpsRun";
import pkg from "../package.json";

/** Distances proposées en un clic ; la valeur alimente le champ km telle quelle. */
const DISTANCE_PRESETS: { label: string; value: string }[] = [
  { label: "5 km", value: "5" },
  { label: "10 km", value: "10" },
  { label: "Semi", value: "21.1" },
  { label: "Marathon", value: "42.2" },
];

/** Chiffres et un seul séparateur décimal : évite « 10..5 » ou « 10,5,2 ». */
function sanitizeTargetKm(raw: string): string {
  const cleaned = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  const [head, ...rest] = cleaned.split(".");
  return rest.length > 0 ? `${head}.${rest.join("").slice(0, 2)}` : head;
}

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

/** Pause auto : vitesse lissée sous ce seuil → compteur « temps en mouvement » figé. */
const PAUSE_SPEED_KMH = 1;
const RESUME_SPEED_KMH = 1.6;
const PAUSE_AFTER_SLOW_SEC = 5;
const SPEED_SMOOTH_WINDOW = 5;
/** Limite alignée sur le backend (échantillonnage si dépassé). */
const MAX_TRACK_POINTS = 3400;

function positionToTrackPoint(pos: GeolocationPosition): LiveRunTrackPoint {
  const c = pos.coords;
  const p: LiveRunTrackPoint = {
    lat: c.latitude,
    lng: c.longitude,
    t_ms: pos.timestamp,
  };
  if (typeof c.accuracy === "number" && Number.isFinite(c.accuracy)) {
    p.accuracy_m = c.accuracy;
  }
  if (typeof c.altitude === "number" && Number.isFinite(c.altitude)) {
    p.alt_m = c.altitude;
  }
  if (typeof c.heading === "number" && Number.isFinite(c.heading)) {
    p.heading_deg = c.heading;
  }
  if (typeof c.speed === "number" && Number.isFinite(c.speed) && c.speed >= 0) {
    p.speed_mps = c.speed;
  }
  return p;
}

function downsampleTrackPoints(pts: LiveRunTrackPoint[]): LiveRunTrackPoint[] {
  if (pts.length <= MAX_TRACK_POINTS) return pts;
  const stride = Math.ceil(pts.length / MAX_TRACK_POINTS);
  const out: LiveRunTrackPoint[] = [];
  for (let i = 0; i < pts.length; i += stride) {
    out.push(pts[i]);
  }
  const last = pts[pts.length - 1];
  if (out.length > 0 && out[out.length - 1].t_ms !== last.t_ms) {
    out.push(last);
  }
  return out.slice(0, MAX_TRACK_POINTS);
}

function pushSpeedSample(
  buf: number[],
  v: number,
  maxLen: number,
): number[] {
  const next = [...buf, v];
  if (next.length > maxLen) next.splice(0, next.length - maxLen);
  return next;
}

function mean(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

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
  /** Appelé quand la sortie est enregistrée côté serveur (rafraîchir l’historique). */
  onRunSaved?: () => void;
  /** `true` pendant la course : masquer header / menu (géré par la page Course). */
  onRunFocusModeChange?: (focused: boolean) => void;
};

export function LiveRunPanel({
  apiUnreachableAtLoad = false,
  onRunSaved,
  onRunFocusModeChange,
}: Props) {
  const netOnline = useNavigatorOnline();
  const fullscreenTargetRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<RunPhase>("setup");
  const [targetKm, setTargetKm] = useState("10");
  /** Champ libre ouvert : la distance n’est pas un des raccourcis proposés. */
  const [customGoalOpen, setCustomGoalOpen] = useState(false);
  const [error, setError] = useState("");

  /** Temps en mouvement (pause auto), précision delta réel entre ticks. */
  const [elapsedSec, setElapsedSec] = useState(0);
  /** Temps écoulé (horloge) depuis le premier timestamp GPS — comme « temps total » Strava. */
  const [wallSec, setWallSec] = useState(0);
  /** Distance affichée (m), mise à jour par paliers de DISTANCE_UI_STEP_M pendant la course. */
  const [distanceM, setDistanceM] = useState(0);
  /** Incrémenté sur le tick chrono pour relire accMRef (allure / % objectif lissés). */
  const [, setMetricsTick] = useState(0);
  const [geoOk, setGeoOk] = useState<boolean | null>(null);
  /** Faux tant que le chrono n’a pas démarré sur le 1er point GPS (affichage « accrochage »). */
  const [gpsClockLive, setGpsClockLive] = useState(false);
  const [autoPaused, setAutoPaused] = useState(false);

  /** 0 = pas encore démarré. Sinon = `position.timestamp` du 1er fix (payload / points GPS). */
  const gpsStartTsMsRef = useRef(0);
  /** Base horloge murale au 1er fix (`Date.now()`), alignée sur le temps « en mouvement ». */
  const runClockStartMsRef = useRef(0);
  const movingSecRef = useRef(0);
  const lastTickMsRef = useRef(0);
  const pausedRef = useRef(false);
  const speedBufRef = useRef<number[]>([]);
  const slowSinceMsRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const watchRef = useRef<number | null>(null);
  const lastLatRef = useRef<number | null>(null);
  const lastLonRef = useRef<number | null>(null);
  const accMRef = useRef(0);
  const lastDistanceUiBucketRef = useRef(0);
  const lastKmCrossingMsRef = useRef(0);
  const lastAnnouncedKmRef = useRef(0);
  const splitsRef = useRef<LiveRunSplit[]>([]);
  const trackPointsRef = useRef<LiveRunTrackPoint[]>([]);
  const maxImpliedKmhRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
  const [serverSave, setServerSave] = useState<
    "idle" | "saving" | "saved" | "error" | "skipped"
  >("idle");

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

  useEffect(() => {
    onRunFocusModeChange?.(phase === "running");
  }, [phase, onRunFocusModeChange]);

  useEffect(() => {
    return () => {
      onRunFocusModeChange?.(false);
    };
  }, [onRunFocusModeChange]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (phase !== "running") {
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
      return;
    }
    const el = fullscreenTargetRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      const anyEl = el as HTMLElement & {
        webkitRequestFullscreen?: () => void;
      };
      const fn =
        el.requestFullscreen?.bind(el) ?? anyEl.webkitRequestFullscreen?.bind(el);
      if (fn) void Promise.resolve(fn()).catch(() => {});
    });
    return () => window.cancelAnimationFrame(id);
  }, [phase]);

  useEffect(
    () => () => {
      if (typeof document !== "undefined" && document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {});
      }
    },
    [],
  );

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
    gpsStartTsMsRef.current = 0;
    runClockStartMsRef.current = 0;
    movingSecRef.current = 0;
    lastTickMsRef.current = 0;
    pausedRef.current = false;
    speedBufRef.current = [];
    slowSinceMsRef.current = null;
    lastTsRef.current = null;
    lastKmCrossingMsRef.current = 0;
    splitsRef.current = [];
    trackPointsRef.current = [];
    maxImpliedKmhRef.current = 0;
    setServerSave("idle");
    setElapsedSec(0);
    setWallSec(0);
    setAutoPaused(false);
    setGpsClockLive(false);
    setPhase("running");
    setGeoOk(null);

    const armChronoOnFirstFix = (pos: GeolocationPosition) => {
      if (gpsStartTsMsRef.current > 0) return;
      const ts = pos.timestamp;
      const clock0 = Date.now();
      gpsStartTsMsRef.current = ts;
      runClockStartMsRef.current = clock0;
      lastKmCrossingMsRef.current = ts;
      lastTickMsRef.current = clock0;
      movingSecRef.current = 0;
      trackPointsRef.current = [positionToTrackPoint(pos)];
      setGpsClockLive(true);
    };

    const applyPauseFromSmoothed = (smoothedKmh: number, tsMs: number) => {
      if (speedBufRef.current.length < 2) return;
      let nextPaused = pausedRef.current;
      if (smoothedKmh < PAUSE_SPEED_KMH) {
        if (slowSinceMsRef.current == null) slowSinceMsRef.current = tsMs;
        else if (tsMs - slowSinceMsRef.current >= PAUSE_AFTER_SLOW_SEC * 1000) {
          nextPaused = true;
        }
      } else if (smoothedKmh > RESUME_SPEED_KMH) {
        nextPaused = false;
        slowSinceMsRef.current = null;
      }
      if (nextPaused !== pausedRef.current) {
        pausedRef.current = nextPaused;
        setAutoPaused(nextPaused);
      }
    };

    tickRef.current = setInterval(() => {
      const clock0 = runClockStartMsRef.current;
      const now = Date.now();
      if (clock0 <= 0) {
        setElapsedSec(0);
        setWallSec(0);
      } else {
        const lastT = lastTickMsRef.current;
        if (lastT > 0) {
          const dt = (now - lastT) / 1000;
          movingSecRef.current += webGpsMovingSecondsDelta(
            dt,
            pausedRef.current,
          );
        }
        lastTickMsRef.current = now;
        setElapsedSec(movingSecRef.current);
        setWallSec(Math.max(0, (now - clock0) / 1000));
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
        armChronoOnFirstFix(pos);
        if (lastTsRef.current == null) lastTsRef.current = pos.timestamp;
      },
      () => {
        /* watch ou prochaine tentative fournira la position */
      },
      WEB_GPS_SEED,
    );

    watchRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoOk(true);
        const { latitude, longitude } = pos.coords;
        const tsMs = pos.timestamp;

        if (lastLatRef.current == null || lastLonRef.current == null) {
          lastLatRef.current = latitude;
          lastLonRef.current = longitude;
          armChronoOnFirstFix(pos);
          if (lastTsRef.current == null) lastTsRef.current = tsMs;
          return;
        }

        const prevLat = lastLatRef.current;
        const prevLon = lastLonRef.current;
        const prevTs = lastTsRef.current;

        const d = haversineM(prevLat, prevLon, latitude, longitude);

        const dtSec =
          prevTs != null ? Math.max(0, (tsMs - prevTs) / 1000) : 0;

        if (d < 0.5) {
          lastTsRef.current = tsMs;
          speedBufRef.current = pushSpeedSample(
            speedBufRef.current,
            0,
            SPEED_SMOOTH_WINDOW,
          );
          applyPauseFromSmoothed(mean(speedBufRef.current), tsMs);
          return;
        }

        if (prevTs == null || dtSec < 1e-6) {
          lastTsRef.current = tsMs;
          return;
        }

        const credit = webGpsCreditDistanceM(d, dtSec);
        if (credit === null) {
          lastLatRef.current = latitude;
          lastLonRef.current = longitude;
          lastTsRef.current = tsMs;
          return;
        }

        const impliedKmh = (credit / 1000 / dtSec) * 3600;
        if (
          Number.isFinite(impliedKmh) &&
          impliedKmh > maxImpliedKmhRef.current
        ) {
          maxImpliedKmhRef.current = impliedKmh;
        }

        speedBufRef.current = pushSpeedSample(
          speedBufRef.current,
          impliedKmh,
          SPEED_SMOOTH_WINDOW,
        );
        applyPauseFromSmoothed(mean(speedBufRef.current), tsMs);

        lastLatRef.current = latitude;
        lastLonRef.current = longitude;
        lastTsRef.current = tsMs;

        accMRef.current += credit;
        trackPointsRef.current.push(positionToTrackPoint(pos));

        const bucket = Math.floor(accMRef.current / DISTANCE_UI_STEP_M);
        if (bucket > lastDistanceUiBucketRef.current) {
          lastDistanceUiBucketRef.current = bucket;
          setDistanceM(bucket * DISTANCE_UI_STEP_M);
        }

        const km = accMRef.current / 1000;
        const newFloor = Math.floor(km);
        const crossed = newFloor - lastAnnouncedKmRef.current;
        if (crossed > 0) {
          const totalSplitSec =
            (tsMs - lastKmCrossingMsRef.current) / 1000;
          const perKmSec = Math.max(0.1, totalSplitSec / crossed);
          for (let i = 0; i < crossed; i++) {
            lastAnnouncedKmRef.current += 1;
            const k = lastAnnouncedKmRef.current;
            splitsRef.current.push({
              km: k,
              split_sec: perKmSec,
              pace_sec_per_km: perKmSec,
              end_timestamp_ms: tsMs,
            });
            speakKm(k, perKmSec, perKmSec * 10);
          }
          lastKmCrossingMsRef.current = tsMs;
        }
      },
      (err) => {
        setGeoOk(false);
        setError(err.message || "Impossible d’accéder au GPS.");
      },
      WEB_GPS_WATCH,
    );
  }, [targetKm]);

  const stopRun = useCallback(() => {
    const gpsStart = gpsStartTsMsRef.current;
    const clock0 = runClockStartMsRef.current;
    const now = Date.now();
    let wallFinal = 0;
    if (clock0 > 0 && lastTickMsRef.current > 0) {
      const dt = (now - lastTickMsRef.current) / 1000;
      movingSecRef.current += webGpsMovingSecondsDelta(
        dt,
        pausedRef.current,
      );
      setElapsedSec(movingSecRef.current);
      wallFinal = Math.max(0, (now - clock0) / 1000);
      setWallSec(wallFinal);
    }
    const movingFinal = movingSecRef.current;
    const distM = accMRef.current;
    const gpsEndMs = lastTsRef.current ?? now;
    const targetNum = Math.max(0.1, parseFloat(targetKm.replace(",", ".")) || 0);

    cleanupWatch();
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setDistanceM(distM);
    setPhase("ended");

    const token = getToken();
    if (
      !token ||
      gpsStart <= 0 ||
      (distM < 1 && movingFinal < 3)
    ) {
      setServerSave("skipped");
      return;
    }

    const distKm = distM / 1000;
    const avgPace =
      distKm > 0.001 && movingFinal > 0 ? movingFinal / distKm : 0;

    const payload: LiveRunPayload = {
      target_km: targetNum,
      distance_m: distM,
      moving_sec: movingFinal,
      wall_sec: wallFinal,
      gps_start_ts_ms: gpsStart,
      gps_end_ts_ms: gpsEndMs,
      avg_pace_sec_per_km: avgPace,
      max_implied_speed_kmh: maxImpliedKmhRef.current,
      splits: [...splitsRef.current],
      track_points: downsampleTrackPoints([...trackPointsRef.current]),
      client_version: pkg.version,
      user_agent:
        typeof navigator !== "undefined" ? navigator.userAgent : "",
      navigator_language:
        typeof navigator !== "undefined" ? navigator.language : "",
      screen_w: typeof window !== "undefined" ? window.screen.width : 0,
      screen_h: typeof window !== "undefined" ? window.screen.height : 0,
      online_at_end: typeof navigator !== "undefined" && navigator.onLine,
      auto_pause_detected: wallFinal > movingFinal + 2,
    };

    setServerSave("saving");
    void postLiveRun(token, payload)
      .then(() => {
        setServerSave("saved");
        onRunSaved?.();
      })
      .catch(() => setServerSave("error"));
  }, [cleanupWatch, targetKm, onRunSaved]);

  const resetRun = useCallback(() => {
    cleanupWatch();
    setPhase("setup");
    setElapsedSec(0);
    setWallSec(0);
    setDistanceM(0);
    accMRef.current = 0;
    lastDistanceUiBucketRef.current = 0;
    gpsStartTsMsRef.current = 0;
    runClockStartMsRef.current = 0;
    movingSecRef.current = 0;
    pausedRef.current = false;
    speedBufRef.current = [];
    setAutoPaused(false);
    setError("");
    setGeoOk(null);
    setGpsClockLive(false);
    setServerSave("idle");
  }, [cleanupWatch]);

  const showOfflineBanner =
    phase !== "running" && (apiUnreachableAtLoad || !netOnline);

  return (
    <div
      className={
        phase === "running"
          ? "flex min-h-0 flex-1 flex-col gap-0"
          : "space-y-6"
      }
    >
      {showOfflineBanner ? (
        <div className="rounded-xl border border-cyan-400/25 bg-cyan-500/10 px-4 py-3 text-xs leading-relaxed text-cyan-100/95">
          <p className="font-medium text-cyan-50/95">Mode local / sans internet</p>
          <p className="mt-1.5 text-[11px] text-cyan-100/80">
            La distance et le chrono sont calculés sur ton appareil via le{" "}
            <strong className="font-medium text-cyan-50/95">GPS</strong> (géolocalisation navigateur / puce GNSS) — pas
            de carte en ligne ni d’envoi de points pendant la course. Les annonces vocales utilisent la synthèse
            intégrée au téléphone. Le suivi reste le même avec ou sans réseau.
          </p>
          <p className="mt-2 text-[11px] text-cyan-100/70">
            Précision : pas de podomètre — distance = somme des segments GPS (haversine), avec plafond sur les trous
            d’échantillonnage Safari / iOS pour se rapprocher d’une app native. L’écran allumé et la page au premier plan
            restent recommandés.
          </p>
        </div>
      ) : null}

      {phase === "setup" ? (
        <div className="app-hero p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="app-kicker">Nouvelle sortie</p>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/25 px-2.5 py-1 text-[10px] text-white/60">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              GPS · chrono · annonces
            </span>
          </div>

          <div className="mt-5">
            <p className="flex items-baseline gap-2">
              <span className="font-display text-[3rem] font-bold leading-none tracking-tight text-white sm:text-[3.5rem]">
                {targetKm.trim() === "" ? "—" : targetKm.replace(".", ",")}
              </span>
              <span className="font-display text-xl font-semibold text-brand-orange">km</span>
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-white/45">
              Distance parcourue et reliquat mis en avant pendant la course.
            </p>
          </div>

          {/* Raccourcis de distance, comme sur l’app : un tap suffit dans la plupart des cas. */}
          <div className="-mx-1 member-scroll-x mt-4 flex gap-2 overflow-x-auto px-1 pb-1">
            {DISTANCE_PRESETS.map((p) => {
              const selected = !customGoalOpen && targetKm === p.value;
              return (
                <button
                  key={p.value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setTargetKm(p.value);
                    setCustomGoalOpen(false);
                  }}
                  className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                    selected
                      ? "bg-white text-[#0d0f16]"
                      : "border border-white/[0.12] bg-white/[0.05] text-white/65 hover:border-white/25 hover:text-white"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={customGoalOpen}
              onClick={() => setCustomGoalOpen(true)}
              className={`shrink-0 rounded-full px-4 py-2 text-[13px] font-semibold transition ${
                customGoalOpen
                  ? "bg-white text-[#0d0f16]"
                  : "border border-white/[0.12] bg-white/[0.05] text-white/65 hover:border-white/25 hover:text-white"
              }`}
            >
              Perso
            </button>
          </div>

          {customGoalOpen ? (
            <label className="mt-3 flex items-center gap-2 rounded-xl border border-white/[0.12] bg-black/25 px-4 py-2.5">
              <span className="sr-only">Distance visée en kilomètres</span>
              <input
                type="text"
                inputMode="decimal"
                autoFocus
                maxLength={8}
                className="w-full min-w-0 flex-1 border-0 bg-transparent p-0 font-display text-xl font-semibold text-white outline-none placeholder:text-white/25"
                value={targetKm}
                onChange={(e) => setTargetKm(sanitizeTargetKm(e.target.value))}
                placeholder="0"
              />
              <span className="shrink-0 text-sm text-white/45">km</span>
            </label>
          ) : null}

          {error ? (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
              {error}
            </p>
          ) : null}

          {/* Départ verrouillé sur le web : fonctionnalité annoncée comme à venir. */}
          <button
            type="button"
            disabled
            aria-disabled="true"
            title="Prochainement disponible"
            className="mt-5 inline-flex min-h-[50px] w-full cursor-not-allowed items-center justify-center gap-2 rounded-[14px] border border-white/[0.1] bg-white/[0.05] px-5 py-3 text-[15px] font-medium text-white/40"
          >
            <svg
              className="h-4 w-4 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
              />
            </svg>
            Démarrer la course
          </button>
          <p className="mt-2 text-center text-[11px] leading-relaxed text-white/35">
            Prochainement disponible.
          </p>
        </div>
      ) : null}

      {phase === "running" || phase === "ended" ? (
        <div
          ref={fullscreenTargetRef}
          className={
            phase === "running"
              ? "panel flex min-h-0 flex-1 flex-col justify-between gap-6 rounded-none border-0 border-white/[0.06] bg-surface-0 px-safe pb-safe pt-4 shadow-none sm:rounded-2xl sm:border sm:bg-[rgba(18,21,31,0.92)] sm:shadow-lift md:min-h-0 md:flex-none md:justify-center md:gap-8 md:p-6"
              : "panel space-y-5 p-4 sm:p-5"
          }
        >
          <div
            className={
              phase === "running"
                ? "grid flex-1 grid-cols-2 content-center gap-x-4 gap-y-6 sm:gap-6"
                : "grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-2"
            }
          >
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Temps (en mouvement)
              </p>
              <p
                className={
                  phase === "running"
                    ? "mt-2 font-display text-4xl font-semibold tabular-nums leading-none text-white sm:text-5xl"
                    : "mt-1 font-display text-2xl font-semibold tabular-nums text-white sm:text-3xl"
                }
              >
                {phase === "running" && !gpsClockLive
                  ? "—"
                  : formatClock(elapsedSec)}
              </p>
              {phase === "running" && !gpsClockLive ? (
                <p className="mt-2 text-[11px] text-white/45">
                  Accrochage GPS — chrono au 1er point.
                </p>
              ) : phase === "running" && gpsClockLive ? (
                <p className="mt-2 text-[11px] text-white/45">
                  Total : {formatClock(wallSec)}
                  {autoPaused ? (
                    <span className="ml-1.5 text-amber-200/90">· pause auto</span>
                  ) : null}
                </p>
              ) : (
                <p className="mt-1 text-[10px] text-white/40">
                  Total horloge : {formatClock(wallSec)}
                </p>
              )}
            </div>
            <div className="col-span-2 sm:col-span-1">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Distance
              </p>
              <p
                className={
                  phase === "running"
                    ? "mt-2 font-display text-4xl font-semibold tabular-nums leading-none text-white sm:text-5xl"
                    : "mt-1 font-display text-2xl font-semibold tabular-nums text-white sm:text-3xl"
                }
              >
                {distKmShown.toFixed(2)} km
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Allure moyenne
              </p>
              <p
                className={
                  phase === "running"
                    ? "mt-2 font-display text-2xl font-semibold tabular-nums text-brand-ice sm:text-3xl"
                    : "mt-1 font-display text-xl font-semibold tabular-nums text-brand-ice sm:text-2xl"
                }
              >
                {paceDisplay}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
                Temps au km (moy.)
              </p>
              <p
                className={
                  phase === "running"
                    ? "mt-2 font-display text-2xl font-semibold tabular-nums text-white/90 sm:text-3xl"
                    : "mt-1 font-display text-xl font-semibold tabular-nums text-white/90 sm:text-2xl"
                }
              >
                {paceSecPerKm > 0 ? formatClock(paceSecPerKm) : "—"}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[10px] text-white/40">
              <span>Objectif {target.toFixed(1)} km</span>
              <span>{Math.round(progressed * 100)} %</span>
            </div>
            <div
              className={
                phase === "running"
                  ? "h-2.5 overflow-hidden rounded-full bg-white/[0.1]"
                  : "h-2 overflow-hidden rounded-full bg-white/[0.08]"
              }
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-brand-orange to-brand-ice transition-[width] duration-300"
                style={{ width: `${progressed * 100}%` }}
              />
            </div>
          </div>

          {phase === "running" ? (
            <p className="text-center text-[11px] text-white/45">
              {geoOk === false
                ? "GPS faible — vérifie les autorisations."
                : geoOk === true
                  ? "GPS actif"
                  : "Recherche position…"}
            </p>
          ) : geoOk === false ? (
            <p className="text-xs text-amber-200/90">
              Signal GPS faible ou refusé — vérifie les autorisations.
            </p>
          ) : geoOk === true ? (
            <p className="text-[11px] text-white/35">
              GPS actif — timestamps des points pour les splits, vitesse lissée (moyenne glissante) pour la pause auto,
              chrono avec deltas réels entre ticks.
            </p>
          ) : (
            <p className="text-[11px] text-white/35">Recherche de position…</p>
          )}
          {error ? <p className="text-xs text-red-200/90">{error}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {phase === "running" ? (
              <button
                type="button"
                className="btn-quiet min-h-[3rem] w-full touch-manipulation border-white/20 px-4 py-3 text-sm sm:min-h-12 sm:w-auto sm:py-2.5"
                onClick={stopRun}
              >
                Terminer
              </button>
            ) : (
              <button
                type="button"
                className="btn-brand w-full px-4 py-2 text-sm sm:w-auto"
                onClick={resetRun}
              >
                Nouvelle course
              </button>
            )}
          </div>

          {phase === "ended" ? (
            <p className="text-[11px] leading-relaxed text-white/45">
              {serverSave === "saving" ? (
                <>Enregistrement de la sortie sur le serveur…</>
              ) : serverSave === "saved" ? (
                <span className="text-emerald-200/90">
                  Sortie enregistrée (splits au km, trace et métadonnées).
                </span>
              ) : serverSave === "error" ? (
                <span className="text-amber-200/90">
                  Impossible d’enregistrer la sortie — réessaie plus tard ou vérifie la connexion.
                </span>
              ) : serverSave === "skipped" ? (
                <>
                  Enregistrement non envoyé (session trop courte, pas de fix GPS, ou non connecté).
                </>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
