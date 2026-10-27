"use client";

import type { LeaderboardRow } from "@/lib/api";
import { formatKm, initials } from "@/components/boost/boostFormat";

type Props = {
  rows: LeaderboardRow[];
  weekStart: string;
};

function weekLabel(iso: string): string {
  const start = new Date(iso);
  if (Number.isNaN(start.getTime())) return "";
  const end = new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

/**
 * Kilomètres cumulés de la semaine, soi et ses amis. Le classement porte sur la
 * distance et non sur l’allure : chacun peut ajouter des kilomètres, alors qu’une
 * hiérarchie d’allure serait figée d’avance et décourageante.
 */
export function WeeklyLeaderboard({ rows, weekStart }: Readonly<Props>) {
  // Seul, il n’y a pas de classement — juste son propre total, déjà sur l’accueil.
  if (rows.length < 2) return null;

  /* Personne n’a encore couru : un podium où tout le monde est à 0,0 km annonce
     une hiérarchie qui n’existe pas. On dit ce qu’il en est. */
  const noneRan = rows.every((r) => r.distance_m <= 0);

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="app-kicker">Classement de la semaine</p>
        <span className="shrink-0 rounded-full border border-white/[0.08] bg-black/25 px-2.5 py-1 text-[11px] text-white/55">
          {weekLabel(weekStart)}
        </span>
      </div>

      {noneRan ? (
        <p className="pt-1 text-[13px] leading-[19px] text-white/40">
          Personne n’a encore couru cette semaine — la première sortie prend la tête.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {rows.map((row) => (
            <li
              key={row.user.id}
              className={`flex items-center gap-3 rounded-xl px-2.5 py-2.5 ${
                row.is_me
                  ? "border border-brand-orange/25 bg-gradient-to-r from-brand-orange/[0.16] to-brand-orange/[0.04]"
                  : ""
              }`}
            >
              <span
                className={`w-4 shrink-0 text-center font-display text-[13px] font-semibold tabular-nums ${
                  row.is_me ? "text-brand-orange" : "text-white/35"
                }`}
              >
                {row.rank}
              </span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-display text-[10px] font-semibold tracking-[0.04em] text-white/85">
                {initials(row.user.first_name, row.user.last_name)}
              </span>
              <span
                className={`min-w-0 flex-1 truncate text-[14px] ${
                  row.is_me ? "font-semibold text-white" : "text-white/80"
                }`}
              >
                {row.is_me ? "Toi" : row.user.display_name}
              </span>
              <span className="shrink-0 font-display text-[15px] font-semibold tabular-nums text-white">
                {formatKm(row.distance_m)}
                <span className="ml-1 text-[11px] font-medium text-white/35">km</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
