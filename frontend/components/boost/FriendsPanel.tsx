"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  cancelFriendRequest,
  fetchFriendRequests,
  fetchFriends,
  removeFriend,
  respondFriendRequest,
  searchUsers,
  sendFriendRequest,
  type FriendRequest,
  type FriendUser,
  type UserSearchResult,
} from "@/lib/api";
import { getToken } from "@/lib/auth";
import { initials } from "@/components/boost/boostFormat";

/** Laisse finir la frappe avant d’interroger l’API — sinon chaque lettre part en requête. */
const SEARCH_DEBOUNCE_MS = 350;

function fullName(u: FriendUser): string {
  const full = `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim();
  return full || u.display_name;
}

function ActionButton({
  label,
  onClick,
  variant = "primary",
  busy,
}: Readonly<{
  label: string;
  onClick: () => void;
  variant?: "primary" | "ghost" | "danger";
  busy?: boolean;
}>) {
  const tone =
    variant === "primary"
      ? "border-brand-orange/40 bg-brand-orange/15 text-brand-orange hover:bg-brand-orange/25"
      : variant === "danger"
        ? "border-red-400/30 bg-red-400/[0.08] text-red-300 hover:bg-red-400/15"
        : "border-white/[0.1] bg-white/[0.03] text-white/60 hover:bg-white/[0.07]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-40 ${tone}`}
    >
      {label}
    </button>
  );
}

function Row({
  user,
  subtitle,
  right,
}: Readonly<{ user: FriendUser; subtitle?: string; right: React.ReactNode }>) {
  return (
    <li className="flex items-center gap-3 rounded-xl px-1 py-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] font-display text-[11px] font-semibold tracking-[0.04em] text-white/85">
        {initials(user.first_name, user.last_name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-white/90">{fullName(user)}</span>
        {subtitle ? (
          <span className="mt-0.5 block truncate text-[11.5px] text-white/35">{subtitle}</span>
        ) : null}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">{right}</span>
    </li>
  );
}

type Props = {
  /** Remonte le nombre de demandes reçues : la pastille du bouton « Amis ». */
  onPendingChange?: (count: number) => void;
  /** Une relation a changé : le fil et le classement méritent un rechargement. */
  onFriendsChange?: () => void;
};

/**
 * Amis et demandes : recherche, demandes reçues / envoyées, liste d’amis.
 * Portage web de `FriendsScreen` — sans amis, le fil Boost reste vide.
 */
export function FriendsPanel({ onPendingChange, onFriendsChange }: Readonly<Props>) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  const [outgoing, setOutgoing] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<FriendUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  const setBusy = useCallback((id: string, on: boolean) => {
    setBusyIds((prev) => (on ? [...prev, id] : prev.filter((x) => x !== id)));
  }, []);

  const load = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const [reqs, list] = await Promise.all([fetchFriendRequests(token), fetchFriends(token)]);
      setIncoming(reqs.incoming);
      setOutgoing(reqs.outgoing);
      setFriends(list);
      onPendingChange?.(reqs.incoming.length);
    } catch {
      /* Le réseau reviendra : les sections restent vides plutôt que de bloquer. */
    }
  }, [onPendingChange]);

  useEffect(() => {
    void load().finally(() => setLoading(false));
  }, [load]);

  const searchSeq = useRef(0);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    setSearching(true);
    const seq = ++searchSeq.current;
    const timer = setTimeout(async () => {
      try {
        const found = await searchUsers(token, q);
        // Une réponse lente ne doit pas écraser celle d’une frappe plus récente.
        if (seq === searchSeq.current) setResults(found);
      } catch {
        if (seq === searchSeq.current) setResults([]);
      } finally {
        if (seq === searchSeq.current) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const onSend = useCallback(
    async (user: UserSearchResult) => {
      const token = getToken();
      if (!token) return;
      setBusy(user.id, true);
      setError("");
      setResults((prev) =>
        prev.map((r) => (r.id === user.id ? { ...r, relation: "request_sent" } : r)),
      );
      try {
        await sendFriendRequest(token, user.id);
        await load();
      } catch (e) {
        setResults((prev) => prev.map((r) => (r.id === user.id ? { ...r, relation: "none" } : r)));
        setError(e instanceof ApiError ? e.message : "Demande impossible.");
      } finally {
        setBusy(user.id, false);
      }
    },
    [load, setBusy],
  );

  const onRespond = useCallback(
    async (request: FriendRequest, accept: boolean) => {
      const token = getToken();
      if (!token) return;
      setBusy(request.id, true);
      setError("");
      try {
        await respondFriendRequest(token, request.id, accept);
        await load();
        if (accept) onFriendsChange?.();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Action impossible.");
      } finally {
        setBusy(request.id, false);
      }
    },
    [load, onFriendsChange, setBusy],
  );

  const onCancel = useCallback(
    async (request: FriendRequest) => {
      const token = getToken();
      if (!token) return;
      setBusy(request.id, true);
      setError("");
      try {
        await cancelFriendRequest(token, request.id);
        await load();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Action impossible.");
      } finally {
        setBusy(request.id, false);
      }
    },
    [load, setBusy],
  );

  const onRemove = useCallback(
    async (user: FriendUser) => {
      const token = getToken();
      if (!token) return;
      if (
        !window.confirm(
          `Retirer ${fullName(user)} ? Cette personne ne verra plus tes courses, et les siennes disparaîtront de ton fil.`,
        )
      ) {
        return;
      }
      setBusy(user.id, true);
      setError("");
      try {
        await removeFriend(token, user.id);
        await load();
        onFriendsChange?.();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Action impossible.");
      } finally {
        setBusy(user.id, false);
      }
    },
    [load, onFriendsChange, setBusy],
  );

  const searchActive = query.trim().length >= 2;

  const searchRows = useMemo(
    () =>
      results.map((u) => {
        let right: React.ReactNode;
        switch (u.relation) {
          case "friend":
            right = <span className="text-[11.5px] text-white/35">Déjà ami</span>;
            break;
          case "request_sent":
            right = <span className="text-[11.5px] text-white/35">Demande envoyée</span>;
            break;
          case "request_received":
            right = <span className="text-[11.5px] text-white/35">Te suit déjà</span>;
            break;
          default:
            right = (
              <ActionButton
                label="Ajouter"
                onClick={() => void onSend(u)}
                busy={busyIds.includes(u.id)}
              />
            );
        }
        return <Row key={u.id} user={u} right={right} />;
      }),
    [results, busyIds, onSend],
  );

  return (
    <section className="space-y-4 rounded-2xl border border-white/[0.08] bg-white/[0.015] p-4 sm:p-5">
      <div>
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-white">
          Amis
        </h2>
        <p className="mt-1 text-[12px] text-white/42">
          Ajoute des coureurs et gère tes demandes.
        </p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Chercher par prénom ou nom"
        className="field w-full"
        aria-label="Chercher un coureur"
      />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3.5 py-2.5 text-[13px] text-amber-100"
        >
          {error}
        </p>
      ) : null}

      {searchActive ? (
        <div className="space-y-1">
          <p className="app-kicker">Résultats</p>
          {searching ? (
            <p className="py-2 text-[13px] text-white/45">Recherche…</p>
          ) : results.length === 0 ? (
            <p className="py-2 text-[13px] text-white/45">
              Personne ne correspond à « {query.trim()} ».
            </p>
          ) : (
            <ul>{searchRows}</ul>
          )}
        </div>
      ) : loading ? (
        <p className="py-2 text-[13px] text-white/45">Chargement…</p>
      ) : (
        <>
          {incoming.length > 0 ? (
            <div className="space-y-1">
              <p className="app-kicker">Demandes reçues ({incoming.length})</p>
              <ul>
                {incoming.map((req) => (
                  <Row
                    key={req.id}
                    user={req.user}
                    subtitle="veut suivre tes courses"
                    right={
                      <>
                        <ActionButton
                          label="Accepter"
                          onClick={() => void onRespond(req, true)}
                          busy={busyIds.includes(req.id)}
                        />
                        <ActionButton
                          label="Refuser"
                          variant="ghost"
                          onClick={() => void onRespond(req, false)}
                          busy={busyIds.includes(req.id)}
                        />
                      </>
                    }
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {outgoing.length > 0 ? (
            <div className="space-y-1">
              <p className="app-kicker">Demandes envoyées</p>
              <ul>
                {outgoing.map((req) => (
                  <Row
                    key={req.id}
                    user={req.user}
                    subtitle="en attente de réponse"
                    right={
                      <ActionButton
                        label="Annuler"
                        variant="ghost"
                        onClick={() => void onCancel(req)}
                        busy={busyIds.includes(req.id)}
                      />
                    }
                  />
                ))}
              </ul>
            </div>
          ) : null}

          <div className="space-y-1">
            <p className="app-kicker">
              Mes amis {friends.length > 0 ? `(${friends.length})` : ""}
            </p>
            {friends.length === 0 ? (
              <p className="py-2 text-[13px] text-white/45">
                Tu n’as pas encore d’ami. Cherche quelqu’un par son nom ci-dessus.
              </p>
            ) : (
              <ul>
                {friends.map((f) => (
                  <Row
                    key={f.id}
                    user={f}
                    right={
                      <ActionButton
                        label="Retirer"
                        variant="danger"
                        onClick={() => void onRemove(f)}
                        busy={busyIds.includes(f.id)}
                      />
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
