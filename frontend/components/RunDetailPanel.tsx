"use client";

import { useMemo, type ReactNode } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  IntervalSegment,
  LiveRunDetail,
  LiveRunSplit,
  LiveRunTrackPoint,
} from "@/lib/api";
import {
  MIN_FULL_SPLIT_KM,
  buildRunMetrics,
  readHrBpm,
  splitLengthsKm,
  type HrZone,
  type RunMetrics,
  type SplitRow,
} from "@/lib/runMetrics";

/* ------------------------------------------------------------------ formats */

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return "—";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  if (s === 60) return `${m + 1}:00`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function fmtNum(v: number, decimals = 1): string {
  return v.toFixed(decimals).replace(".", ",");
}

function fmtSignedSec(sec: number): string {
  const abs = Math.abs(sec);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);
  const body = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `${s} s`;
  return `${sec < 0 ? "−" : "+"}${body}`;
}

/**
 * Ponctuation française : espace insécable avant les signes doubles, sinon le
 * navigateur peut renvoyer un « : » ou un « % » seul en début de ligne.
 */
function frenchSpacing(text: string): string {
  return text.replace(/ ([:;!?%])/g, "\u00a0$1");
}

function fmtClockShort(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const ZONE_COLORS: Record<number, string> = {
  1: "#60a5fa",
  2: "#22c55e",
  3: "#eab308",
  4: "#fb923c",
  5: "#ef4444",
};

/* ----------------------------------------------------------- synthèse texte */

/**
 * Lecture d'une sortie : ce qui s'est passé, et ce que ça dit.
 *
 * Chaque phrase associe un fait mesuré à son interprétation — un chiffre seul
 * (« 4 % de découplage ») n'apprend rien à qui ne connaît pas l'indicateur. Les
 * seuils viennent de la pratique courante de l'entraînement en endurance ; quand
 * une mesure n'est pas fiable (trop peu de kilomètres, pas de cardio), la phrase
 * correspondante disparaît plutôt que de meubler.
 */

/** Nature de la séance, déduite de l'intensité et de la régularité. */
function sessionVerdict(m: RunMetrics): { title: string; detail: string } | null {
  if (m.isInterval) {
    return {
      title: "Séance de fractionné",
      detail:
        "Alternance d'efforts et de récupérations : c'est l'allure des efforts qui compte, pas la moyenne.",
    };
  }
  const pct = m.effortPctOfMax;
  if (pct == null) {
    if (m.paceVariationPct != null && m.paceVariationPct < 3) {
      return {
        title: "Sortie à allure tenue",
        detail: "Allure très régulière d'un bout à l'autre.",
      };
    }
    return null;
  }
  if (pct < 68) {
    return {
      title: "Footing en endurance",
      detail: `Cœur à ${pct} % de ta FC max en moyenne : le travail de fond, celui qui construit la caisse sans coûter cher en récupération.`,
    };
  }
  if (pct < 78) {
    return {
      title: "Sortie en endurance active",
      detail: `${pct} % de ta FC max : soutenu mais conversationnel, la zone où le volume paie.`,
    };
  }
  if (pct < 86) {
    return {
      title: "Séance tempo",
      detail: `${pct} % de ta FC max : allure exigeante, tenable une heure environ. Elle demande un jour facile derrière.`,
    };
  }
  return {
    title: "Séance au seuil ou au-delà",
    detail: `${pct} % de ta FC max en moyenne : c'est une séance dure, à ne pas enchaîner sans récupération.`,
  };
}

function buildHighlights(m: RunMetrics): string[] {
  const out: string[] = [];

  // --- Ce qu'était la séance ------------------------------------------------
  if (m.isInterval) {
    if (m.intervals != null) {
      const i = m.intervals;
      out.push(
        `${i.effort_count} efforts tenus à ${fmtPace(i.effort_pace_sec_per_km)} /km en moyenne, récupérations à ${fmtPace(i.recovery_pace_sec_per_km)} /km : la moyenne de ${fmtPace(m.avgPaceSecPerKm)} /km additionne les deux et ne décrit aucune des deux.`,
      );
      const effortKm = i.effort_distance_m / 1000;
      if (effortKm > 0.3) {
        // Part du temps total en mouvement : échauffement et retour au calme
        // compris, puisque c'est bien le temps de la sortie entière.
        const share = m.movingSec > 0 ? Math.round((i.effort_sec / m.movingSec) * 100) : null;
        out.push(
          `${fmtNum(effortKm, 1)} km courus à l'effort sur ${fmtNum(m.distanceKm, 1)} km au total${share != null ? `, soit ${share} % de ton temps en mouvement passé à intensité` : ""}.`,
        );
      }
    } else {
      out.push(
        `L'allure moyenne de ${fmtPace(m.avgPaceSecPerKm)} /km inclut les récupérations — sur ce type de séance, l'écart entre les kilomètres est voulu.`,
      );
    }
  }

  // --- Régularité -----------------------------------------------------------
  if (!m.isInterval && m.paceVariationPct != null) {
    const v = m.paceVariationPct;
    const range =
      m.bestKmPaceSecPerKm != null && m.worstKmPaceSecPerKm != null
        ? ` (de ${fmtPace(m.bestKmPaceSecPerKm)} à ${fmtPace(m.worstKmPaceSecPerKm)} /km)`
        : "";
    if (v < 2.5) {
      out.push(
        `Allure remarquablement régulière : ${fmtNum(v, 1)} % d'écart entre tes kilomètres${range}. C'est le signe d'une course maîtrisée, pas subie.`,
      );
    } else if (v < 5) {
      out.push(
        `Régularité correcte : ${fmtNum(v, 1)} % d'écart entre tes kilomètres${range} — les variations restent dans le bruit normal du terrain.`,
      );
    } else {
      out.push(
        `Allure en dents de scie : ${fmtNum(v, 1)} % d'écart entre tes kilomètres${range}. Départ trop rapide, relief ou fatigue — c'est là qu'il y a du temps à gagner.`,
      );
    }
  }

  // --- Gestion de l'effort dans la durée ------------------------------------
  if (!m.isInterval && m.negativeSplitSec != null && Math.abs(m.negativeSplitSec) >= 4) {
    out.push(
      m.negativeSplitSec < 0
        ? `Seconde moitié ${fmtSignedSec(m.negativeSplitSec).replace("−", "")} /km plus rapide que la première : le negative split, la façon la plus efficace de courir une distance.`
        : `Tu as ralenti de ${fmtSignedSec(m.negativeSplitSec).replace("+", "")} /km sur la seconde moitié : le départ était un cran trop rapide pour la forme du jour.`,
    );
  }

  if (!m.isInterval && m.finishDeltaSec != null && Math.abs(m.finishDeltaSec) >= 8) {
    out.push(
      m.finishDeltaSec < 0
        ? `Ton dernier kilomètre est ${Math.abs(m.finishDeltaSec)} s /km plus rapide que les autres : il te restait de la réserve.`
        : `Ton dernier kilomètre est ${m.finishDeltaSec} s /km plus lent que les autres : la fin a coûté cher.`,
    );
  }

  // La place du meilleur kilomètre dans la course en dit plus que sa valeur : ouvrir
  // sur son km le plus rapide et finir sur le plus lent, c'est un départ mal dosé.
  if (!m.isInterval && m.fastestKm != null && m.slowestKm != null && m.splits.length >= 5) {
    const total = m.splits.filter((sp) => !sp.isPartial).length;
    const ord = (n: number) => `${n}${n === 1 ? "er" : "e"}`;
    const openedFast = m.fastestKm <= Math.max(1, Math.round(total * 0.2));
    const endedSlow = m.slowestKm >= total - Math.max(1, Math.round(total * 0.2)) + 1;
    if (openedFast && endedSlow) {
      out.push(
        `Ton kilomètre le plus rapide est le ${ord(m.fastestKm)} et le plus lent le ${ord(m.slowestKm)} : la course s'est jouée sur les premières minutes, parties trop vite.`,
      );
    } else if (m.fastestKm >= total - Math.max(1, Math.round(total * 0.3)) + 1) {
      out.push(
        `Ton kilomètre le plus rapide est le ${ord(m.fastestKm)}, en fin de course : tu as gardé de quoi finir, c'est exactement ce qu'on cherche.`,
      );
    } else {
      out.push(
        `Ton kilomètre le plus rapide est le ${ord(m.fastestKm)}, le plus lent le ${ord(m.slowestKm)}.`,
      );
    }
  }

  // --- Cardio ---------------------------------------------------------------
  if (m.dominantZone != null && m.dominantZone.share >= 0.35) {
    const z = m.dominantZone;
    out.push(
      `${Math.round(z.share * 100)} % du temps en zone ${z.index} (${z.label.toLowerCase()}, ${z.lowBpm}–${z.highBpm} bpm) — ${z.description.toLowerCase()}.`,
    );
  }

  if (m.decouplingPct != null && m.distanceKm >= 4) {
    const d = m.decouplingPct;
    if (d >= 8) {
      out.push(
        `Découplage cardiaque de ${fmtNum(d, 1)} % : en seconde moitié, ton cœur a dû monter nettement pour tenir la même allure. Sortie au-delà de ton endurance actuelle, ou chaleur et déshydratation.`,
      );
    } else if (d >= 5) {
      out.push(
        `Découplage cardiaque de ${fmtNum(d, 1)} % : légère dérive du rapport allure / cœur sur la seconde moitié — la limite de ton endurance du jour n'est pas loin.`,
      );
    } else if (d >= -3) {
      out.push(
        `Découplage cardiaque de ${fmtNum(d, 1)} % : ton cœur et ton allure sont restés couplés du début à la fin. C'est la marque d'un effort parfaitement dans tes moyens.`,
      );
    }
  } else if (m.hrDriftBpm != null && Math.abs(m.hrDriftBpm) >= 5) {
    out.push(
      m.hrDriftBpm > 0
        ? `Ton cœur est monté de ${m.hrDriftBpm} bpm entre le début et la fin : signe classique de fatigue, de chaleur ou d'un départ trop rapide.`
        : `Ta FC a baissé de ${Math.abs(m.hrDriftBpm)} bpm en seconde moitié : bonne récupération en cours d'effort.`,
    );
  }

  if (m.maxBpm != null && m.hrMaxRef != null && m.maxBpm >= m.hrMaxRef * 0.95) {
    out.push(
      `Pointe à ${m.maxBpm} bpm, soit ${Math.round((m.maxBpm / m.hrMaxRef) * 100)} % de ta FC max de référence : tu es allé chercher très haut au moins une fois.`,
    );
  }

  // --- Terrain --------------------------------------------------------------
  if (m.elevGainM != null && m.elevGainM >= 30 && m.distanceKm > 0) {
    const perKm = m.elevGainM / m.distanceKm;
    // ~6 s/km par 10 m/km de dénivelé : l'ordre de grandeur communément admis
    // pour comparer une sortie vallonnée à la même sortie sur le plat.
    const costSecPerKm = Math.round((perKm / 10) * 6);
    const equivalent =
      costSecPerKm >= 4
        ? ` À plat, la même dépense t'aurait fait tourner autour de ${fmtPace(Math.max(120, m.avgPaceSecPerKm - costSecPerKm))} /km.`
        : "";
    out.push(
      `${Math.round(m.elevGainM)} m de dénivelé positif, soit ${Math.round(perKm)} m/km — ${perKm < 10 ? "terrain roulant" : perKm < 25 ? "parcours vallonné" : "parcours exigeant"}.${equivalent}`,
    );
  }

  // --- Contexte -------------------------------------------------------------
  if (m.stoppedSec >= 30) {
    const share = m.wallSec > 0 ? Math.round((m.stoppedSec / m.wallSec) * 100) : 0;
    out.push(
      `${fmtDuration(m.stoppedSec)} d'arrêt total (pauses, feux, attentes), soit ${share} % de ton temps à l'horloge — ${fmtDuration(m.wallSec)} du départ à l'arrivée.`,
    );
  }

  return out;
}

/* ------------------------------------------------------------ séries graphes */

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Profil altimétrique : distance le long du tracé (km) → altitude (m).
 * Ignoré si la variation d’altitude est quasi nulle (bruit GPS).
 */
function buildElevationProfile(points: LiveRunTrackPoint[]): { x: string; y: number }[] {
  const withAlt = points.filter(
    (p) => p.alt_m != null && Number.isFinite(p.alt_m) && Math.abs(p.alt_m) <= 9000,
  );
  if (withAlt.length < 3) return [];

  let distM = 0;
  let lastPushM = 0;
  const stepM = 220;
  const data: { x: string; y: number }[] = [];
  let prev = withAlt[0];
  data.push({ x: "0", y: prev.alt_m as number });

  for (let i = 1; i < withAlt.length; i++) {
    const p = withAlt[i];
    distM += haversineM(prev.lat, prev.lng, p.lat, p.lng);
    prev = p;
    if (distM - lastPushM >= stepM || i === withAlt.length - 1) {
      const km = distM / 1000;
      data.push({
        x: (km < 10 ? km.toFixed(1) : Math.round(km).toString()).replace(".", ","),
        y: p.alt_m as number,
      });
      lastPushM = distM;
    }
  }

  if (data.length < 2) return [];
  const alts = data.map((d) => d.y);
  if (Math.max(...alts) - Math.min(...alts) < 6) return [];
  return data;
}

/**
 * Vitesse moyenne sur chaque kilomètre (km/h), dérivée de l’allure du segment.
 * On n’utilise pas la durée du segment : le dernier est presque toujours partiel,
 * la vitesse exploserait sur le dernier point.
 */
function buildSpeedPerKm(sorted: LiveRunSplit[]): { x: string; y: number }[] {
  if (sorted.length < 2) return [];
  const out: { x: string; y: number }[] = [];
  for (const sp of sorted) {
    const pace = sp.pace_sec_per_km;
    if (!Number.isFinite(pace) || pace < 90 || pace > 7200) continue;
    out.push({ x: String(sp.km), y: Math.round((3600 / pace) * 10) / 10 });
  }
  return out.length >= 2 ? out : [];
}

/** FC (bpm) le long du temps si les points portent `hr_bpm`. */
function buildHrSeries(points: LiveRunTrackPoint[]): { x: string; y: number }[] {
  if (points.length < 2) return [];
  const t0 = points[0].t_ms;
  const step = Math.max(1, Math.floor(points.length / 55));
  const raw: { x: string; y: number }[] = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    const hr = readHrBpm(p);
    if (hr != null && hr >= 30 && hr <= 235) {
      raw.push({ x: fmtClockShort((p.t_ms - t0) / 1000), y: Math.round(hr) });
    }
  }
  return raw.length >= 2 ? raw : [];
}

/** Vitesse GPS (km/h) au fil du temps — repli quand il n’y a pas de découpage au km. */
function buildSpeedFromTrack(points: LiveRunTrackPoint[]): { x: string; y: number }[] {
  if (points.length < 3) return [];
  const t0 = points[0].t_ms;
  const step = Math.max(1, Math.floor(points.length / 40));
  const raw: { x: string; y: number }[] = [];
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    if (p.speed_mps != null && p.speed_mps > 0.35 && p.speed_mps < 25) {
      raw.push({
        x: fmtClockShort((p.t_ms - t0) / 1000),
        y: Math.round(p.speed_mps * 3.6 * 10) / 10,
      });
    }
  }
  return raw.length >= 2 ? raw : [];
}

/* -------------------------------------------------------------------- blocs */

function MetricTile({
  label,
  value,
  unit,
  hint,
  color,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase leading-tight tracking-wider text-white/40">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1">
        <span
          className="font-display text-lg font-semibold leading-tight tabular-nums"
          style={{ color: color ?? "#f0f0f5" }}
        >
          {value}
        </span>
        {unit ? <span className="text-[11px] text-white/38">{unit}</span> : null}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] leading-snug text-white/35">{hint}</p> : null}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  accent,
  children,
}: {
  title: string;
  subtitle?: string;
  accent?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4">
      <h4
        className="font-display text-[13px] font-semibold"
        style={{ color: accent ?? "#ffffff" }}
      >
        {title}
      </h4>
      {subtitle ? (
        <p className="mt-1 text-[11px] leading-relaxed text-white/40">{subtitle}</p>
      ) : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function ChartFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <SectionCard title={title} subtitle={subtitle}>
      <div className="h-[200px] w-full min-w-0 sm:h-[230px]">
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </SectionCard>
  );
}

const axisTick = { fill: "rgba(255,255,255,0.45)", fontSize: 9 };
/**
 * `itemStyle` est indispensable : sans lui, Recharts colore la valeur avec la couleur
 * de la série — donc en orange sombre sur fond sombre, illisible.
 */
const tooltipProps = {
  contentStyle: {
    background: "#12151f",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    fontSize: 12,
    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
  },
  labelStyle: { color: "rgba(255,255,255,0.55)", fontSize: 11, marginBottom: 2 },
  itemStyle: { color: "#f0f0f5", fontWeight: 600 },
  cursor: { fill: "rgba(255,255,255,0.06)", stroke: "rgba(255,255,255,0.18)" },
};

function HrZoneBars({
  zones,
  hrMaxRef,
  estimated,
}: {
  zones: HrZone[];
  hrMaxRef: number;
  estimated: boolean;
}) {
  return (
    <div className="space-y-3">
      {zones.map((z) => (
        <div key={z.index}>
          <div className="flex items-center gap-2">
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: ZONE_COLORS[z.index] }}
            />
            <span className="flex-1 text-[11px] font-medium text-white/80">
              Z{z.index} · {z.label}
            </span>
            <span className="text-[11px] tabular-nums text-white/60">
              {Math.round(z.share * 100)} %
            </span>
          </div>
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(z.share * 100, z.share > 0 ? 2 : 0)}%`,
                backgroundColor: ZONE_COLORS[z.index],
              }}
            />
          </div>
          <p className="mt-1 text-[10px] text-white/35">
            {z.lowBpm}–{z.highBpm} bpm · {fmtDuration(z.seconds)} · {z.description}
          </p>
        </div>
      ))}
      <p className="text-[10px] leading-relaxed text-white/35">
        {estimated
          ? `Zones calculées sur une FC max estimée à ${hrMaxRef} bpm d’après ton âge (208 − 0,7 × âge).`
          : `Zones calculées sur ta FC max observée pendant cette course : ${hrMaxRef} bpm.`}
      </p>
    </div>
  );
}

function SplitsTable({
  rows,
  hasHr,
  hasElev,
}: {
  rows: SplitRow[];
  hasHr: boolean;
  hasElev: boolean;
}) {
  let cumulative = 0;
  const withCumulative = rows.map((r) => {
    cumulative += r.lapSec;
    return { row: r, cumulativeSec: cumulative };
  });

  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-[320px] text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.08] text-white/45">
              <th className="px-3 py-2 font-medium">Km</th>
              <th className="px-3 py-2 font-medium">Temps</th>
              <th className="px-3 py-2 font-medium">Allure</th>
              {hasHr ? <th className="px-3 py-2 font-medium">FC</th> : null}
              {hasElev ? <th className="px-3 py-2 font-medium">D+</th> : null}
              <th className="px-3 py-2 font-medium">Cumulé</th>
            </tr>
          </thead>
          <tbody>
            {withCumulative.map(({ row: r, cumulativeSec }) => (
              <tr
                key={r.km}
                className="border-b border-white/[0.05] text-white/85 last:border-0"
              >
                <td className="px-3 py-2 font-medium tabular-nums">
                  {r.isPartial ? "fin" : r.km}
                </td>
                <td className="px-3 py-2 tabular-nums">{fmtDuration(r.lapSec)}</td>
                <td
                  className="px-3 py-2 tabular-nums"
                  style={{
                    color: r.isPartial
                      ? "rgba(255,255,255,0.4)"
                      : r.isFastest
                        ? "#22c55e"
                        : r.isSlowest
                          ? "#eab308"
                          : undefined,
                  }}
                >
                  {/* Reliquat de fin : son allure ramenée au km est une extrapolation. */}
                  {r.isPartial ? `${Math.round(r.lengthKm * 1000)} m` : fmtPace(r.paceSecPerKm)}
                </td>
                {hasHr ? (
                  <td className="px-3 py-2 tabular-nums">{r.avgBpm ?? "—"}</td>
                ) : null}
                {hasElev ? (
                  <td className="px-3 py-2 tabular-nums">
                    {r.elevGainM != null && r.elevGainM > 0 ? `+${r.elevGainM}` : "—"}
                  </td>
                ) : null}
                <td className="px-3 py-2 tabular-nums text-white/70">
                  {fmtDuration(cumulativeSec)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[10px] leading-relaxed text-white/35">
        Vert : ton meilleur km. Jaune : le plus lent.
        {rows.some((r) => r.isPartial)
          ? " La ligne « fin » est le reliquat après le dernier kilomètre complet : trop court pour être classé."
          : ""}
      </p>
    </div>
  );
}

const SEGMENT_LABELS: Record<IntervalSegment["kind"], string> = {
  warmup: "Échauffement",
  work: "Travail",
  recovery: "Récupération",
  cooldown: "Retour au calme",
};

function fmtSegmentDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${fmtNum(m / 1000, 2)} km`;
}

const SEGMENT_COLORS: Record<IntervalSegment["kind"], string> = {
  warmup: "rgba(255,255,255,0.14)",
  work: "#22c55e",
  recovery: "rgba(255,255,255,0.22)",
  cooldown: "rgba(255,255,255,0.14)",
};

/**
 * La séance vue d’un coup d’œil : chaque bloc occupe la largeur de sa durée, les
 * efforts en vert. L’alternance travail / repos se lit d’un regard, avant même
 * d’entrer dans le détail chiffré.
 */
function IntervalTimeline({ segments }: { segments: IntervalSegment[] }) {
  const total = segments.reduce((a, s) => a + s.sec, 0);
  if (total <= 0) return null;
  return (
    <div className="mb-3">
      <div className="flex h-2.5 w-full gap-px overflow-hidden rounded-full bg-white/[0.04]">
        {segments.map((s) => (
          <div
            key={s.index}
            /* Plancher de largeur : une récup de 30 s sur une séance d’une heure
               vaut 0,8 % et disparaîtrait sans lui. */
            style={{
              flex: `${Math.max(s.sec / total, 0.004)} 0 0`,
              backgroundColor: SEGMENT_COLORS[s.kind],
            }}
            title={`${SEGMENT_LABELS[s.kind]}${s.rep ? ` ${s.rep}` : ""} · ${fmtDuration(s.sec)}`}
          />
        ))}
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/35">
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full" style={{ background: SEGMENT_COLORS.work }} />
          travail
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-3 rounded-full"
            style={{ background: SEGMENT_COLORS.recovery }}
          />
          récupération
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-3 rounded-full" style={{ background: SEGMENT_COLORS.warmup }} />
          échauffement / retour au calme
        </span>
        <span>Largeur = durée réelle du bloc.</span>
      </p>
    </div>
  );
}

/**
 * Le déroulé de la séance, répétition par répétition — le seul découpage où
 * chaque allure affichée correspond à une portion réellement courue à cette
 * allure. Le tableau des kilomètres, lui, moyenne effort et récupération dans la
 * même ligne dès que les répétitions ne tombent pas sur des bornes kilométriques.
 */
function IntervalTable({ segments }: { segments: IntervalSegment[] }) {
  const hasHr = segments.some((s) => s.avg_heartrate != null && s.avg_heartrate > 0);
  const workPaces = segments
    .filter((s) => s.kind === "work" && s.pace_sec_per_km > 0)
    .map((s) => s.pace_sec_per_km);
  const bestWork = workPaces.length >= 2 ? Math.min(...workPaces) : null;
  const worstWork = workPaces.length >= 2 ? Math.max(...workPaces) : null;

  /* Instant de départ de chaque bloc depuis le début de la sortie : c’est lui qui
     situe la répétition dans la séance, et qui permet de la retrouver sur la
     courbe de FC juste en dessous. */
  let elapsed = 0;
  const startedAt = segments.map((s) => {
    const at = elapsed;
    elapsed += s.sec;
    return at;
  });

  return (
    <div>
      <IntervalTimeline segments={segments} />
      <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
        <table className="w-full min-w-[300px] text-left text-[11px]">
          <thead>
            <tr className="border-b border-white/[0.08] text-white/45">
              <th className="px-2 py-2 font-medium">Bloc</th>
              <th className="px-2 py-2 font-medium">Distance</th>
              <th className="px-2 py-2 font-medium">Durée</th>
              <th className="px-2 py-2 font-medium">Allure</th>
              {hasHr ? <th className="px-2 py-2 font-medium">FC</th> : null}
            </tr>
          </thead>
          <tbody>
            {segments.map((seg, i) => {
              const isWork = seg.kind === "work";
              return (
                <tr
                  key={seg.index}
                  className={`border-b border-white/[0.05] last:border-0 ${
                    isWork ? "bg-emerald-400/[0.04] text-white/90" : "text-white/60"
                  }`}
                >
                  <td className="whitespace-nowrap px-2 py-2">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-3 w-[3px] shrink-0 rounded-full"
                        style={{ backgroundColor: SEGMENT_COLORS[seg.kind] }}
                      />
                      <span className={isWork ? "font-medium text-white" : undefined}>
                        {SEGMENT_LABELS[seg.kind]}
                      </span>
                      {seg.rep ? (
                        <span className="tabular-nums text-white/30">{seg.rep}</span>
                      ) : null}
                    </span>
                    <span className="ml-[10px] block text-[10px] tabular-nums text-white/30">
                      à {fmtDuration(startedAt[i])}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                    {fmtSegmentDistance(seg.distance_m)}
                  </td>
                  <td className="px-2 py-2 tabular-nums">{fmtDuration(seg.sec)}</td>
                  <td
                    className="px-2 py-2 font-medium tabular-nums"
                    style={{
                      color: !isWork
                        ? undefined
                        : bestWork != null && seg.pace_sec_per_km === bestWork
                          ? "#22c55e"
                          : worstWork != null && seg.pace_sec_per_km === worstWork
                            ? "#eab308"
                            : undefined,
                    }}
                  >
                    {fmtPace(seg.pace_sec_per_km)}
                  </td>
                  {hasHr ? (
                    <td className="px-2 py-2 tabular-nums">
                      {seg.avg_heartrate != null && seg.avg_heartrate > 0
                        ? Math.round(seg.avg_heartrate)
                        : "—"}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {bestWork != null && worstWork != null && worstWork > bestWork ? (
        <p className="mt-2 text-[10px] leading-relaxed text-white/35">
          Vert : ta répétition la plus rapide. Jaune : la plus lente. L’écart entre les deux dit
          si la séance a été tenue jusqu’au bout.
        </p>
      ) : null}
    </div>
  );
}

function TechDetails({ run, m }: { run: LiveRunDetail; m: RunMetrics }) {
  const rows: { label: string; value: string }[] = [];
  rows.push({ label: "Temps à l’horloge", value: fmtDuration(m.wallSec) });
  rows.push({ label: "Temps en mouvement", value: fmtDuration(m.movingSec) });
  if (m.stoppedSec > 1) rows.push({ label: "Temps d’arrêt", value: fmtDuration(m.stoppedSec) });
  if (run.target_km > 0) {
    rows.push({ label: "Objectif fixé", value: `${fmtNum(run.target_km, 2)} km` });
  }
  if (run.activity_type) rows.push({ label: "Type d’activité", value: run.activity_type });
  if (m.trackPointCount > 0) {
    rows.push({ label: "Points GPS", value: String(m.trackPointCount) });
  }
  if (m.hrMaxRef != null) {
    rows.push({
      label: "FC max de référence",
      value: `${m.hrMaxRef} bpm${m.hrMaxRefEstimated ? " (estimée)" : " (mesurée)"}`,
    });
  }
  if (run.auto_pause_detected) rows.push({ label: "Pause automatique", value: "détectée" });
  if (run.client_version) rows.push({ label: "Version client", value: run.client_version });
  if (run.navigator_language) rows.push({ label: "Langue", value: run.navigator_language });
  if (run.screen_w && run.screen_h) {
    rows.push({ label: "Écran", value: `${run.screen_w}×${run.screen_h}` });
  }
  rows.push({ label: run.strava_activity_id != null ? "Activité Strava" : "ID", value: run.id });

  return (
    <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02]">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-display text-[13px] font-semibold text-white">
        Détails techniques
        <span className="text-white/38 transition group-open:rotate-180">⌄</span>
      </summary>
      <div className="border-t border-white/[0.06] px-4 py-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b border-white/[0.04] py-1.5 last:border-0"
          >
            <span className="text-[11px] text-white/45">{r.label}</span>
            <span className="break-all text-right text-[11px] text-white/85">{r.value}</span>
          </div>
        ))}
        {run.user_agent ? (
          <p className="mt-2 break-all text-[10px] leading-snug text-white/30">
            UA : {run.user_agent}
          </p>
        ) : null}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ panneau */

type Props = {
  run: LiveRunDetail;
  source: "live" | "strava";
  /** Date de naissance du profil : sert à estimer la FC max pour les zones. */
  birthDate?: string;
};

/**
 * Détail complet d’une course, aligné sur `RunDetailScreen` de l’app mobile :
 * synthèse, allure/vitesse, cardio + zones, relief, graphiques, splits, technique.
 */
export function RunDetailPanel({ run, source, birthDate }: Props) {
  const m = useMemo(() => buildRunMetrics(run, { birthDate }), [run, birthDate]);
  const highlights = useMemo(() => buildHighlights(m), [m]);
  const verdict = useMemo(() => sessionVerdict(m), [m]);

  /** Le reliquat final fausserait les graphiques : on le retire des séries. */
  const fullSplits = useMemo(() => {
    const all = (run.splits ?? []).slice().sort((a, b) => a.km - b.km);
    const lens = splitLengthsKm(all.length, run.distance_m / 1000);
    return all.filter((_, i) => lens[i] >= MIN_FULL_SPLIT_KM);
  }, [run.splits, run.distance_m]);

  /* Référence stable : sans ça, `?? []` recrée un tableau à chaque rendu et relance les useMemo. */
  const track = useMemo(() => run.track_points ?? [], [run.track_points]);
  const elevSeries = useMemo(() => buildElevationProfile(track), [track]);
  const speedKmSeries = useMemo(() => buildSpeedPerKm(fullSplits), [fullSplits]);
  const hrSeries = useMemo(() => buildHrSeries(track), [track]);
  const speedFallback = useMemo(() => buildSpeedFromTrack(track), [track]);

  const paceBars = useMemo(
    () =>
      fullSplits.map((sp) => ({
        x: String(sp.km),
        y: Math.max(sp.pace_sec_per_km / 60, 0.1),
        fastest: m.bestKmPaceSecPerKm != null && sp.pace_sec_per_km === m.bestKmPaceSecPerKm,
        slowest: m.worstKmPaceSecPerKm != null && sp.pace_sec_per_km === m.worstKmPaceSecPerKm,
      })),
    [fullSplits, m.bestKmPaceSecPerKm, m.worstKmPaceSecPerKm],
  );

  const showSpeedPerKm = speedKmSeries.length >= 2;
  const isStrava = source === "strava";
  /* Référence stable pour le rendu : l’API omet le détail quand elle n’a su
     découper la séance que sur les kilomètres. */
  const intervalSegments = useMemo(() => m.intervals?.segments ?? [], [m.intervals]);

  return (
    <div className="space-y-3">
      {/* Héro : distance, temps, allure, FC */}
      <div className="rounded-2xl border border-white/[0.12] bg-gradient-to-br from-brand-orange/[0.18] via-brand-ice/[0.05] to-[#0d0f16] p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full border px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${
              isStrava
                ? "border-brand-ice/35 bg-brand-ice/15 text-brand-ice"
                : "border-brand-orange/35 bg-brand-orange/[0.08] text-brand-orange"
            }`}
          >
            {isStrava ? "Strava" : "NeuroRun"}
          </span>
          {m.isInterval ? (
            <span className="rounded-full border border-emerald-300/35 bg-emerald-300/[0.12] px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-emerald-200">
              Fractionné
            </span>
          ) : null}
          {isStrava && run.activity_name ? (
            <span className="truncate text-[11px] text-white/70">{run.activity_name}</span>
          ) : null}
        </div>
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-[2.5rem] font-bold leading-none tracking-tight text-white">
            {fmtNum(m.distanceKm, 2)}
          </span>
          <span className="font-display text-base font-semibold text-brand-orange">km</span>
        </p>
        <div className="mt-4 flex items-center border-t border-white/[0.1] pt-3">
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <span className="font-display text-base font-semibold tabular-nums text-white/95">
              {fmtDuration(m.movingSec)}
            </span>
            <span className="text-[10px] text-white/38">temps en mouvement</span>
          </div>
          <div className="h-7 w-px bg-white/[0.08]" />
          {/* Sur un fractionné, la moyenne mélange efforts et récupérations :
              c’est l’allure des efforts qui dit ce que vaut la séance. */}
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <span className="font-display text-base font-semibold tabular-nums text-white/95">
              {fmtPace(m.intervals ? m.intervals.effort_pace_sec_per_km : m.avgPaceSecPerKm)}
            </span>
            <span className="text-center text-[10px] text-white/38">
              {m.intervals ? "allure des efforts /km" : "allure moyenne /km"}
            </span>
          </div>
          <div className="h-7 w-px bg-white/[0.08]" />
          <div className="flex flex-1 flex-col items-center gap-0.5">
            <span className="font-display text-base font-semibold tabular-nums text-white/95">
              {m.avgBpm ?? "—"}
            </span>
            <span className="text-[10px] text-white/38">FC moyenne bpm</span>
          </div>
        </div>
      </div>

      {highlights.length > 0 || verdict != null ? (
        <SectionCard title="Ce que dit cette sortie" accent="#67e8f9">
          {/* La nature de la séance d'abord : elle donne le cadre de lecture de
              tout ce qui suit. */}
          {verdict != null ? (
            <div className="mb-3.5 rounded-xl border border-brand-ice/20 bg-brand-ice/[0.06] px-3.5 py-3">
              <p className="font-display text-[14px] font-semibold text-white">{verdict.title}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-white/65">
                {frenchSpacing(verdict.detail)}
              </p>
            </div>
          ) : null}
          <ul className="space-y-2.5">
            {highlights.map((h) => (
              <li key={h} className="flex gap-2 text-[12px] leading-relaxed text-white/70">
                <span className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-brand-ice" />
                <span>{frenchSpacing(h)}</span>
              </li>
            ))}
          </ul>
          {m.hrMaxRefEstimated && m.hrMaxRef != null ? (
            <p className="mt-3.5 border-t border-white/[0.06] pt-3 text-[11px] leading-relaxed text-white/30">
              Lecture cardiaque basée sur une FC max estimée à {m.hrMaxRef} bpm d’après ton âge
              (formule de Tanaka). Une FC max mesurée en test rendrait ces repères plus justes.
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Allure & vitesse"
        subtitle={
          m.isInterval
            ? "Séance en fractionné : lis l’allure des efforts, la moyenne inclut les récupérations."
            : "L’allure se lit en minutes par kilomètre : plus c’est bas, plus tu vas vite."
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {m.intervals ? (
            <MetricTile
              label="Allure des efforts"
              value={fmtPace(m.intervals.effort_pace_sec_per_km)}
              unit="/km"
              hint={`${m.intervals.effort_count} efforts · ${fmtNum(m.intervals.effort_distance_m / 1000, 2)} km`}
              color="#22c55e"
            />
          ) : null}
          <MetricTile
            label="Allure moyenne"
            value={fmtPace(m.avgPaceSecPerKm)}
            unit="/km"
            hint={m.isInterval ? "Récupérations comprises" : undefined}
          />
          {m.intervals ? (
            <MetricTile
              label="Allure de récup"
              value={fmtPace(m.intervals.recovery_pace_sec_per_km)}
              unit="/km"
              hint={`${fmtDuration(m.intervals.recovery_sec)} au total`}
            />
          ) : null}
          <MetricTile label="Vitesse moyenne" value={fmtNum(m.avgSpeedKmh, 1)} unit="km/h" />
          {m.maxSpeedKmh != null ? (
            <MetricTile
              label="Vitesse max"
              value={fmtNum(m.maxSpeedKmh, 1)}
              unit="km/h"
              hint="Pointe GPS"
            />
          ) : null}
          {m.bestKmPaceSecPerKm != null ? (
            <MetricTile
              label="Meilleur km"
              value={fmtPace(m.bestKmPaceSecPerKm)}
              unit="/km"
              color="#22c55e"
            />
          ) : null}
          {m.worstKmPaceSecPerKm != null ? (
            <MetricTile
              label="Km le plus lent"
              value={fmtPace(m.worstKmPaceSecPerKm)}
              unit="/km"
              color="#eab308"
            />
          ) : null}
          {/* Le negative split compare deux moitiés supposées courues pareil :
              sur un fractionné, il ne mesure que l’ordre des répétitions. */}
          {m.negativeSplitSec != null && !m.isInterval ? (
            <MetricTile
              label="2e moitié"
              value={fmtSignedSec(m.negativeSplitSec)}
              unit="/km"
              hint={m.negativeSplitSec < 0 ? "Tu as accéléré" : "Tu as ralenti"}
              color={m.negativeSplitSec < 0 ? "#22c55e" : undefined}
            />
          ) : null}
        </div>
      </SectionCard>

      {/* Le déroulé réel de la séance : c’est lui, et pas le tableau des km, qui
          donne l’allure de chaque répétition. */}
      {intervalSegments.length > 0 ? (
        <SectionCard
          title="Travail et récupération"
          subtitle={`Le déroulé de la séance bloc par bloc : quand tu es à l’effort, quand tu récupères, et à quelle allure — ${
            m.intervals?.source === "laps"
              ? "d’après les tours de ta montre"
              : "reconstitué à partir de ta vitesse"
          }.`}
          accent="#22c55e"
        >
          <IntervalTable segments={intervalSegments} />
        </SectionCard>
      ) : null}

      {m.avgBpm != null || m.hrZones.length > 0 ? (
        <SectionCard
          title="Fréquence cardiaque"
          subtitle="Le temps passé dans chaque zone dit à quoi a servi la séance."
          accent="#fb7185"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {m.avgBpm != null ? (
              <MetricTile label="FC moyenne" value={String(m.avgBpm)} unit="bpm" />
            ) : null}
            {m.maxBpm != null ? (
              <MetricTile label="FC max" value={String(m.maxBpm)} unit="bpm" color="#ef4444" />
            ) : null}
            {m.minBpm != null ? (
              <MetricTile label="FC min" value={String(m.minBpm)} unit="bpm" />
            ) : null}
            {m.hrDriftBpm != null ? (
              <MetricTile
                label="Dérive cardiaque"
                value={`${m.hrDriftBpm > 0 ? "+" : ""}${m.hrDriftBpm}`}
                unit="bpm"
                hint="2e vs 1re moitié"
              />
            ) : null}
          </div>
          {m.hrZones.length > 0 && m.hrMaxRef != null ? (
            <div className="mt-4">
              <HrZoneBars
                zones={m.hrZones}
                hrMaxRef={m.hrMaxRef}
                estimated={m.hrMaxRefEstimated}
              />
            </div>
          ) : null}
        </SectionCard>
      ) : null}

      {m.elevGainM != null || m.maxAltitudeM != null ? (
        <SectionCard
          title="Relief"
          subtitle="Le dénivelé explique souvent une allure plus lente qu’attendu."
          accent="#67e8f9"
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {m.elevGainM != null ? (
              <MetricTile
                label="Dénivelé positif"
                value={`+${Math.round(m.elevGainM)}`}
                unit="m"
                color="#22c55e"
              />
            ) : null}
            {m.elevLossM != null ? (
              <MetricTile
                label="Dénivelé négatif"
                value={`−${Math.round(m.elevLossM)}`}
                unit="m"
              />
            ) : null}
            {m.elevGainM != null && m.distanceKm > 0 ? (
              <MetricTile
                label="Dénivelé par km"
                value={String(Math.round(m.elevGainM / m.distanceKm))}
                unit="m/km"
                hint="< 10 plat · > 25 exigeant"
              />
            ) : null}
            {m.minAltitudeM != null ? (
              <MetricTile label="Altitude min" value={String(Math.round(m.minAltitudeM))} unit="m" />
            ) : null}
            {m.maxAltitudeM != null ? (
              <MetricTile label="Altitude max" value={String(Math.round(m.maxAltitudeM))} unit="m" />
            ) : null}
            {m.minAltitudeM != null && m.maxAltitudeM != null ? (
              <MetricTile
                label="Amplitude"
                value={String(Math.round(m.maxAltitudeM - m.minAltitudeM))}
                unit="m"
                hint="Du plus bas au plus haut"
              />
            ) : null}
          </div>
        </SectionCard>
      ) : null}

      {elevSeries.length >= 2 ? (
        <ChartFrame
          title="Profil d’altitude"
          subtitle="Altitude au fil de la distance parcourue (en km)."
        >
          <LineChart data={elevSeries} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${Math.round(Number(v))} m`, "Altitude"]}
              labelFormatter={(l) => `km ${l}`}
            />
            <Line type="monotone" dataKey="y" stroke="#67e8f9" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      ) : null}

      {showSpeedPerKm ? (
        <ChartFrame
          title="Vitesse par kilomètre"
          subtitle="Vitesse moyenne sur chaque kilomètre parcouru."
        >
          <LineChart data={speedKmSeries} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${v} km/h`, "Vitesse"]}
              labelFormatter={(l) => `km ${l}`}
            />
            <Line
              type="monotone"
              dataKey="y"
              stroke="#67e8f9"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "#67e8f9" }}
            />
          </LineChart>
        </ChartFrame>
      ) : null}

      {paceBars.length > 0 ? (
        <ChartFrame
          title="Allure par kilomètre"
          subtitle="Plus la barre est haute, plus le kilomètre était lent."
        >
          <BarChart data={paceBars} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} />
            <YAxis
              tick={axisTick}
              width={44}
              domain={["auto", "auto"]}
              tickFormatter={(v) => fmtPace(Number(v) * 60)}
            />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${fmtPace(Number(v) * 60)} /km`, "Allure"]}
              labelFormatter={(l) => `km ${l}`}
            />
            <Bar dataKey="y" radius={[4, 4, 0, 0]}>
              {paceBars.map((b) => (
                <Cell
                  key={b.x}
                  fill={b.fastest ? "#22c55e" : b.slowest ? "#eab308" : "#fc4c02"}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartFrame>
      ) : null}

      {hrSeries.length >= 2 ? (
        <ChartFrame
          title="Fréquence cardiaque"
          subtitle="FC au fil du temps écoulé depuis le départ."
        >
          <LineChart data={hrSeries} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip
              {...tooltipProps}
              formatter={(v: number | string) => [`${v} bpm`, "FC"]}
            />
            <Line type="monotone" dataKey="y" stroke="#fb7185" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      ) : null}

      {/* La vitesse GPS n’apporte rien de plus quand la vitesse par km est déjà tracée. */}
      {!showSpeedPerKm && speedFallback.length >= 2 ? (
        <ChartFrame
          title="Vitesse GPS estimée"
          subtitle="Vitesse relevée par le GPS au fil du temps (pas de découpage au km sur cette sortie)."
        >
          <LineChart data={speedFallback} margin={{ top: 8, right: 8, left: -4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="x" tick={axisTick} interval="preserveStartEnd" />
            <YAxis tick={axisTick} width={44} domain={["auto", "auto"]} />
            <Tooltip {...tooltipProps} formatter={(v: number | string) => [`${v} km/h`, "Vitesse"]} />
            <Line type="monotone" dataKey="y" stroke="#fc4c02" strokeWidth={2} dot={false} />
          </LineChart>
        </ChartFrame>
      ) : null}

      {m.splits.length > 0 ? (
        <SectionCard
          title="Kilomètre par kilomètre"
          subtitle={
            m.isInterval
              ? "Sur un fractionné, un même kilomètre contient de l’effort et de la récupération : ces allures sont des moyennes, pas des allures courues."
              : "Temps réel de chaque km, avec sa FC moyenne et son dénivelé."
          }
        >
          <SplitsTable
            rows={m.splits}
            hasHr={m.splits.some((r) => r.avgBpm != null)}
            hasElev={m.splits.some((r) => r.elevGainM != null && r.elevGainM > 0)}
          />
        </SectionCard>
      ) : null}

      <TechDetails run={run} m={m} />

      {run.strava_activity_id != null ? (
        <a
          href={`https://www.strava.com/activities/${run.strava_activity_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-quiet w-full px-4 text-xs"
        >
          Ouvrir sur Strava
        </a>
      ) : null}
    </div>
  );
}
