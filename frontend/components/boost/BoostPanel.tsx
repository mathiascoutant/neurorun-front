"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  boostRun,
  fetchBoostFeed,
  fetchBoostLeaderboard,
  fetchBoostsReceived,
  fetchFriendRequests,
  removeBoost,
  type BoostFeedItem,
  type BoostKind,
  type BoostReceived,
  type LeaderboardRow,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { BoltIcon, REACTIONS } from "@/components/boost/ReactionIcons";
import { BoostsReceived } from "@/components/boost/BoostsReceived";
import { FriendsPanel } from "@/components/boost/FriendsPanel";
import { WeeklyLeaderboard } from "@/components/boost/WeeklyLeaderboard";
import {
  formatDuration,
  formatKm,
  formatPace,
  initials,
  timeAgo,
} from "@/components/boost/boostFormat";

const PAGE_SIZE = 15;

/** Une course de moins d’un jour garde le halo orange plein ; le fil s’apaise en descendant. */
const FRESH_MS = 24 * 60 * 60 * 1000;

function Metric({
  value,
  unit,
  label,
}: Readonly<{ value: string; unit?: string; label: string }>) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <p className="font-display text-[18px] font-semibold leading-6 tracking-[-0.01em] tabular-nums text-white/92">
        {value}
        {unit ? <span className="ml-0.5 text-[12px] font-medium text-white/35">{unit}</span> : null}
      </p>
      <p className="text-[10px] uppercase tracking-[0.06em] text-white/35">{label}</p>
    </div>
  );
}

/** Contrôle segmenté des trois réactions ; l’actif prend le dégradé brand. */
function ReactionSegment({
  item,
  onReact,
}: Readonly<{ item: BoostFeedItem; onReact: (kind: BoostKind) => void }>) {
  return (
    <div className="mt-5 flex gap-1 rounded-full border border-white/[0.08] bg-white/[0.05] p-1">
      {REACTIONS.map(({ kind, label, Icon }) => {
        const active = item.my_boost === kind;
        const count = item.boosts?.[kind] ?? 0;
        return (
          <button
            key={kind}
            type="button"
            aria-pressed={active}
            onClick={() => onReact(kind)}
            className={`relative flex flex-1 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-full py-2.5 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-orange/50 ${
              active
                ? "bg-gradient-to-br from-brand-orange to-brand-deep text-white"
                : "text-white/60 hover:bg-white/[0.06] hover:text-white/85"
            }`}
          >
            <Icon size={15} />
            <span className="text-[12.5px] font-semibold tracking-[0.02em]">{label}</span>
            {count > 0 ? (
              <span
                className={`text-[12px] font-bold tabular-nums ${active ? "text-white" : "text-white/35"}`}
              >
                {count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function RunCard({
  item,
  onReact,
}: Readonly<{ item: BoostFeedItem; onReact: (kind: BoostKind) => void }>) {
  const fresh = Date.now() - new Date(item.created_at).getTime() < FRESH_MS;

  return (
    <li
      className={`overflow-hidden rounded-2xl border p-4 shadow-[0_10px_20px_rgba(0,0,0,0.4)] sm:p-5 ${
        fresh ? "border-brand-orange/25" : "border-white/[0.08]"
      }`}
      style={{
        backgroundImage: fresh
          ? "linear-gradient(135deg, rgba(252, 76, 2, 0.16) 0%, rgba(252, 76, 2, 0.04) 50%, rgba(13, 15, 22, 0.9) 100%)"
          : "linear-gradient(135deg, rgba(252, 76, 2, 0.09) 0%, rgba(252, 76, 2, 0.02) 50%, rgba(13, 15, 22, 0.9) 100%)",
      }}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-brand-orange/45">
          <span className="flex h-[33px] w-[33px] items-center justify-center rounded-full bg-white/[0.06] font-display text-[12px] font-semibold tracking-[0.04em] text-white/90">
            {initials(item.user.first_name, item.user.last_name)}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <p className="app-kicker">Course NeuroRun</p>
          <p className="mt-0.5 truncate font-display text-[16px] font-semibold leading-[21px] text-white">
            {item.user.display_name}
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-white/[0.08] bg-black/25 px-2.5 py-1 text-[11px] text-white/55">
          {timeAgo(item.created_at)}
        </span>
      </div>

      <p className="mt-3 flex items-baseline gap-2 font-display text-[46px] font-bold leading-[50px] tracking-[-0.03em] tabular-nums text-white">
        {formatKm(item.distance_m)}
        <span className="text-[19px] font-semibold text-brand-orange">km</span>
      </p>

      <div className="my-4 h-px bg-white/[0.07]" />

      <div className="flex items-center">
        <Metric value={formatPace(item.avg_pace_sec_per_km)} unit="/km" label="Allure" />
        <span className="h-7 w-px bg-white/[0.08]" />
        <Metric value={formatDuration(item.moving_sec)} label="Durée" />
        <span className="h-7 w-px bg-white/[0.08]" />
        <Metric value={String(Math.round(item.elevation_gain_m ?? 0))} unit="m" label="D+" />
      </div>

      <ReactionSegment item={item} onReact={onReact} />
    </li>
  );
}

/**
 * Le fil Boost : les courses des amis, leurs réactions, le classement de la
 * semaine et les boosts reçus. Portage web de `BoostScreen`.
 */
export function BoostPanel() {
  const [items, setItems] = useState<BoostFeedItem[]>([]);
  const [nextBefore, setNextBefore] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [pendingCount, setPendingCount] = useState(0);
  const [received, setReceived] = useState<BoostReceived[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [weekStart, setWeekStart] = useState("");
  const [friendsOpen, setFriendsOpen] = useState(false);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      /* Le fil conditionne la page ; le classement et les boosts reçus sont des
         compléments, leur échec ne doit pas la vider. */
      const [feed, requests, mine, board] = await Promise.all([
        fetchBoostFeed(token, { limit: PAGE_SIZE }),
        fetchFriendRequests(token).catch(() => ({ incoming: [], outgoing: [] })),
        fetchBoostsReceived(token, 5).catch(() => [] as BoostReceived[]),
        fetchBoostLeaderboard(token).catch(() => ({ week_start: "", rows: [] })),
      ]);
      setItems(feed.items);
      setNextBefore(feed.next_before);
      setPendingCount(requests.incoming.length);
      setReceived(mine);
      setLeaderboard(board.rows);
      setWeekStart(board.week_start);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Chargement impossible");
    }
  }, []);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const loadMore = useCallback(async () => {
    const token = getToken();
    if (!token || !nextBefore || loadingMore) return;
    setLoadingMore(true);
    try {
      const feed = await fetchBoostFeed(token, { limit: PAGE_SIZE, before: nextBefore });
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...feed.items.filter((i) => !seen.has(i.id))];
      });
      setNextBefore(feed.next_before);
    } catch {
      /* Page suivante indisponible : le fil déjà chargé reste utilisable. */
    } finally {
      setLoadingMore(false);
    }
  }, [nextBefore, loadingMore]);

  /** Réaction optimiste : le clic se voit tout de suite, l’échec réseau l’annule. */
  const react = useCallback(
    async (runId: string, kind: BoostKind) => {
      const token = getToken();
      if (!token) return;
      const before = items;
      const target = items.find((i) => i.id === runId);
      if (!target) return;
      const removing = target.my_boost === kind;

      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== runId) return i;
          const counts = { ...i.boosts };
          if (i.my_boost) counts[i.my_boost] = Math.max(0, (counts[i.my_boost] ?? 0) - 1);
          if (!removing) counts[kind] = (counts[kind] ?? 0) + 1;
          return { ...i, boosts: counts, my_boost: removing ? null : kind };
        }),
      );

      try {
        if (removing) {
          await removeBoost(token, runId);
        } else {
          await boostRun(token, runId, kind);
        }
      } catch {
        setItems(before);
      }
    },
    [items],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-white">
            Le fil de tes amis
          </h2>
          <p className="mt-1 text-[12px] leading-snug text-white/42">
            Leurs courses NeuroRun, les plus récentes d’abord — envoie-leur un boost.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFriendsOpen((o) => !o)}
          aria-expanded={friendsOpen}
          className="chart-chip relative cursor-pointer"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Amis
          {pendingCount > 0 ? (
            <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-orange px-1 text-[10px] font-bold text-white">
              {pendingCount > 9 ? "9+" : pendingCount}
            </span>
          ) : null}
        </button>
      </div>

      {friendsOpen ? (
        <FriendsPanel onPendingChange={setPendingCount} onFriendsChange={() => void load()} />
      ) : null}

      {received.length > 0 ? <BoostsReceived items={received} /> : null}
      <WeeklyLeaderboard rows={leaderboard} weekStart={weekStart} />

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Chargement du fil">
          <div className="app-skeleton h-[250px]" />
          <div className="app-skeleton h-[250px]" />
        </div>
      ) : items.length === 0 ? (
        <div className="app-empty">
          <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-brand-orange/30 bg-brand-orange/[0.1] text-brand-orange">
            <BoltIcon size={20} />
          </span>
          <p className="text-[15px] font-semibold text-white/90">
            {error ? "Chargement impossible" : "Aucune course pour le moment"}
          </p>
          <p className="mx-auto mt-1.5 max-w-[340px] text-[13px] leading-[19px] text-white/40">
            {error ||
              (leaderboard.length > 1
                ? "Tes amis n’ont rien publié pour l’instant. Leurs sorties apparaîtront ici, et tu pourras les booster."
                : "Ajoute des amis pour voir leurs courses ici et leur envoyer un boost.")}
          </p>
          {!error ? (
            <button
              type="button"
              onClick={() => setFriendsOpen(true)}
              className="btn-brand mt-4 cursor-pointer"
            >
              Ajouter un ami
            </button>
          ) : null}
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item) => (
            <RunCard key={item.id} item={item} onReact={(kind) => void react(item.id, kind)} />
          ))}
        </ul>
      )}

      {!loading && nextBefore ? (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="btn-quiet w-full cursor-pointer px-4 text-[13px]"
        >
          {loadingMore ? "Chargement…" : "Charger plus de courses"}
        </button>
      ) : null}
    </div>
  );
}
