"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  type LiveRunDetail,
  type LiveRunListItem,
  getLiveRun,
  listLiveRuns,
} from "@/lib/api";
import { getToken } from "@/lib/auth";

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

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

type Props = {
  apiUnreachableAtLoad?: boolean;
  /** Incrémente pour recharger la liste (ex. après une sortie enregistrée). */
  refreshTrigger?: number;
};

export function LiveRunHistory({
  apiUnreachableAtLoad = false,
  refreshTrigger = 0,
}: Props) {
  const [runs, setRuns] = useState<LiveRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, LiveRunDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailError, setDetailError] = useState("");

  const loadList = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      setRuns([]);
      return;
    }
    if (apiUnreachableAtLoad) {
      setLoading(false);
      setRuns([]);
      return;
    }
    setLoading(true);
    setListError("");
    try {
      const list = await listLiveRuns(token);
      setRuns(list);
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? e.message
          : "Impossible de charger l’historique.";
      setListError(msg);
      setRuns([]);
    } finally {
      setLoading(false);
    }
  }, [apiUnreachableAtLoad]);

  useEffect(() => {
    void loadList();
  }, [loadList, refreshTrigger]);

  const toggleOpen = async (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setDetailError("");
      return;
    }
    setOpenId(id);
    setDetailError("");
    if (details[id]) return;
    const token = getToken();
    if (!token) return;
    setDetailLoading(id);
    try {
      const d = await getLiveRun(token, id);
      setDetails((prev) => ({ ...prev, [id]: d }));
    } catch (e) {
      setDetailError(
        e instanceof ApiError ? e.message : "Détail indisponible.",
      );
    } finally {
      setDetailLoading(null);
    }
  };

  if (apiUnreachableAtLoad) {
    return (
      <div className="panel p-5">
        <h2 className="font-display text-sm font-semibold text-white">
          Historique
        </h2>
        <p className="mt-2 text-[11px] leading-relaxed text-white/45">
          Connecte l’API (réseau disponible) pour voir tes sorties enregistrées sur ton compte.
        </p>
      </div>
    );
  }

  return (
    <div className="panel space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="font-display text-sm font-semibold text-white">
            Historique des sorties
          </h2>
        <p className="mt-1 text-[11px] text-white/40">
          Courses enregistrées depuis cette page (splits, trace, métadonnées).
        </p>
        </div>
        <button
          type="button"
          className="btn-quiet border border-white/12 px-3 py-1.5 text-[11px]"
          onClick={() => void loadList()}
          disabled={loading}
        >
          Rafraîchir
        </button>
      </div>

      {listError ? (
        <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {listError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-xs text-white/45">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-brand-orange/30 border-t-brand-orange" />
          Chargement…
        </div>
      ) : runs.length === 0 ? (
        <p className="py-6 text-center text-[12px] text-white/40">
          Aucune sortie enregistrée pour l’instant. Termine une course pour la voir apparaître ici.
        </p>
      ) : (
        <ul className="space-y-2">
          {runs.map((r) => {
            const expanded = openId === r.id;
            const detail = details[r.id];
            const dLoading = detailLoading === r.id;
            return (
              <li
                key={r.id}
                className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.02]"
              >
                <button
                  type="button"
                  className="flex w-full items-start justify-between gap-2 px-3 py-3 text-left transition hover:bg-white/[0.04] sm:items-center sm:gap-3 sm:px-4"
                  onClick={() => void toggleOpen(r.id)}
                  aria-expanded={expanded}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-[12px] font-medium leading-snug text-white/95 sm:text-[13px]">
                      {formatWhen(r.created_at)}
                    </p>
                    <p className="mt-1 text-[10px] leading-relaxed text-white/45 sm:mt-0.5 sm:text-[11px]">
                      {(r.distance_m / 1000).toFixed(2)} km · {formatClock(r.moving_sec)} ·{' '}
                      {formatPaceMinPerKm(r.avg_pace_sec_per_km)}
                      <span className="hidden sm:inline">
                        {' '}
                        · objectif {r.target_km.toFixed(1)} km · {r.split_count} split
                        {r.split_count > 1 ? 's' : ''}
                      </span>
                    </p>
                    <p className="mt-0.5 text-[10px] text-white/35 sm:hidden">
                      Objectif {r.target_km.toFixed(1)} km · {r.split_count} split{r.split_count > 1 ? 's' : ''}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] text-white/35">
                    {expanded ? "▼" : "▶"}
                  </span>
                </button>

                {expanded ? (
                  <div className="border-t border-white/[0.06] px-3 py-4 sm:px-4">
                    {dLoading ? (
                      <p className="text-xs text-white/45">Chargement du détail…</p>
                    ) : detailError && !detail ? (
                      <p className="text-xs text-amber-200/90">{detailError}</p>
                    ) : detail ? (
                      <RunDetailBody d={detail} />
                    ) : (
                      <p className="text-xs text-white/45">—</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RunDetailBody({ d }: { d: LiveRunDetail }) {
  const distKm = d.distance_m / 1000;
  const gpsDurSec =
    d.gps_end_ts_ms > d.gps_start_ts_ms
      ? (d.gps_end_ts_ms - d.gps_start_ts_ms) / 1000
      : 0;
  const trackN = Array.isArray(d.track_points) ? d.track_points.length : 0;

  return (
    <div className="space-y-5 text-[11px] leading-relaxed">
      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="Temps en mouvement" value={formatClock(d.moving_sec)} />
        <Stat label="Temps total (horloge)" value={formatClock(d.wall_sec)} />
        <Stat label="Distance" value={`${distKm.toFixed(3)} km`} />
        <Stat
          label="Allure moyenne"
          value={formatPaceMinPerKm(d.avg_pace_sec_per_km)}
        />
        <Stat
          label="Objectif saisi"
          value={`${d.target_km.toFixed(1)} km`}
        />
        <Stat
          label="Vitesse max (segment)"
          value={
            d.max_implied_speed_kmh != null && d.max_implied_speed_kmh > 0
              ? `${d.max_implied_speed_kmh.toFixed(1)} km/h`
              : "—"
          }
        />
        <Stat
          label="Pause auto détectée"
          value={d.auto_pause_detected ? "Oui" : "Non"}
        />
        <Stat
          label="En ligne à la fin"
          value={d.online_at_end ? "Oui" : "Non"}
        />
      </div>

      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          Splits au kilomètre
        </p>
        {d.splits && d.splits.length > 0 ? (
          <div className="mt-2 overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full min-w-[280px] text-left text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.08] text-white/45">
                  <th className="px-3 py-2 font-medium">Km</th>
                  <th className="px-3 py-2 font-medium">Temps segment</th>
                  <th className="px-3 py-2 font-medium">Allure</th>
                  <th className="hidden px-3 py-2 font-medium sm:table-cell">
                    Fin (GPS ms)
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.splits.map((s) => (
                  <tr
                    key={`${s.km}-${s.end_timestamp_ms}`}
                    className="border-b border-white/[0.05] text-white/85 last:border-0"
                  >
                    <td className="px-3 py-2 tabular-nums">{s.km}</td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatClock(s.split_sec)}
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {formatPaceMinPerKm(s.pace_sec_per_km)}
                    </td>
                    <td className="hidden px-3 py-2 tabular-nums text-white/50 sm:table-cell">
                      {s.end_timestamp_ms}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-2 text-white/45">
            Aucun split (moins d&apos;un kilomètre ou pas de passage au km).
          </p>
        )}
      </div>

      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          Trace et GPS
        </p>
        <ul className="mt-2 space-y-1 text-white/70">
          <li>
            Points enregistrés : <span className="text-white/90">{trackN}</span>
          </li>
          <li>
            Fenêtre GPS (approx.) :{" "}
            <span className="text-white/90">{formatClock(gpsDurSec)}</span>
          </li>
          <li className="break-all text-white/50">
            Début / fin timestamps : {d.gps_start_ts_ms} → {d.gps_end_ts_ms}
          </li>
        </ul>
      </div>

      <div>
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
          Appareil et enregistrement
        </p>
        <ul className="mt-2 space-y-1 break-words text-white/55">
          <li>Client v{d.client_version ?? "—"}</li>
          <li>Langue : {d.navigator_language ?? "—"}</li>
          <li>
            Écran :{" "}
            {d.screen_w && d.screen_h
              ? `${d.screen_w}×${d.screen_h}`
              : "—"}
          </li>
          {d.user_agent ? (
            <li className="text-[10px] leading-snug opacity-90">
              UA : {d.user_agent}
            </li>
          ) : null}
        </ul>
      </div>

      <p className="text-[10px] text-white/35">
        ID : {d.id}
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className="mt-0.5 font-display text-sm font-semibold tabular-nums text-white/95">
        {value}
      </p>
    </div>
  );
}
