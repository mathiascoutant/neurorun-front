"use client";

import type { BoostReceived } from "@/lib/api";
import { reactionMeta } from "@/components/boost/ReactionIcons";
import { initials, shortAgo } from "@/components/boost/boostFormat";

type Props = {
  items: BoostReceived[];
};

/**
 * Réactions reçues sur ses propres courses. Sans ce bloc, « Lucas t’a boosté »
 * n’aurait aucune destination : le fil ne montre que les courses des autres.
 */
export function BoostsReceived({ items }: Readonly<Props>) {
  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4 sm:p-5">
      <p className="app-kicker mb-3">Tes boosts</p>
      <ul className="space-y-0.5">
        {items.map((item) => {
          const meta = reactionMeta(item.kind);
          return (
            <li
              key={`${item.run_id}-${item.user.id}-${item.kind}`}
              className="flex items-center gap-3 rounded-xl px-1 py-2"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-display text-[11px] font-semibold tracking-[0.04em] text-white/85">
                {initials(item.user.first_name, item.user.last_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-white/60">
                  <strong className="font-semibold text-white">{item.user.display_name}</strong>{" "}
                  {meta.received}
                </span>
                {item.distance_m != null ? (
                  <span className="mt-0.5 block text-[11px] tabular-nums text-white/35">
                    {(item.distance_m / 1000).toFixed(1).replace(".", ",")} km
                  </span>
                ) : null}
              </span>
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-brand-orange/30 bg-brand-orange/[0.12] text-brand-orange">
                <meta.Icon size={13} />
              </span>
              <span className="w-9 shrink-0 text-right text-[11px] tabular-nums text-white/35">
                {shortAgo(item.created_at)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
