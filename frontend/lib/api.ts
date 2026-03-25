/**
 * Base de l’API (sans slash final).
 * - Non défini / vide en build prod → URLs relatives `/api/...` (même domaine, ex. neurorun.fr derrière nginx).
 * - En dev, si vide : défaut `http://localhost:8080` pour éviter d’appeler Next (`/api/...` → 404 HTML).
 * - Sinon : `frontend/.env.local` → NEXT_PUBLIC_API_URL=...
 */
function apiBase(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw != null && raw !== "") {
    return raw.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:8080";
  }
  return "";
}

const API = apiBase();

function apiErrorMessage(res: Response, text: string, data: unknown): string {
  const obj = data as { error?: string } | null;
  const fromJson = typeof obj?.error === "string" ? obj.error : "";
  const raw = (fromJson || res.statusText || "Erreur").trim();
  if (
    raw.startsWith("<!DOCTYPE") ||
    raw.startsWith("<html") ||
    raw.length > 400
  ) {
    if (res.status === 404) {
      return "API introuvable sur ce domaine — lance le backend (ex. :8080) ou définis NEXT_PUBLIC_API_URL.";
    }
    return `Erreur ${res.status} — réponse inattendue (vérifie que l’API pointe vers le bon serveur).`;
  }
  return raw;
}

export type MeUser = {
  id: string;
  email: string;
  strava_linked: boolean;
  created_at: string;
};

export async function api<T>(
  path: string,
  init?: RequestInit & { token?: string | null },
): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = init?.token;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API}${path}`, { ...init, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { error: text };
  }
  if (!res.ok) {
    throw new Error(apiErrorMessage(res, text, data));
  }
  return data as T;
}

export function getApiBase() {
  return API;
}

export async function fetchMe(token: string): Promise<MeUser> {
  return api<MeUser>("/api/me", { token });
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: MeUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(email: string, password: string) {
  return api<{ token: string; user: MeUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function stravaAuthorizeUrl(token: string) {
  return api<{ url: string }>("/api/strava/authorize", { token });
}

export type ConversationListItem = {
  id: string;
  title: string;
  updated_at: string;
};

export type ChatTurn = {
  role: "user" | "assistant";
  text: string;
  created_at: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatTurn[];
  created_at: string;
  updated_at: string;
};

/** Mongo / JSON peuvent renvoyer null à la place d’un tableau vide. */
function asArray<T>(v: T[] | null | undefined): T[] {
  return Array.isArray(v) ? v : [];
}

function normalizeChatTurns(
  messages: ChatTurn[] | null | undefined,
): ChatTurn[] {
  return asArray(messages).map((m) => ({
    ...m,
    role: m.role === "user" ? ("user" as const) : ("assistant" as const),
    text: m.text == null ? "" : String(m.text),
  }));
}

function normalizeConversation(c: Conversation): Conversation {
  return {
    ...c,
    messages: normalizeChatTurns(c.messages),
  };
}

export async function listConversations(token: string) {
  const data = await api<{ conversations: ConversationListItem[] | null }>(
    "/api/conversations",
    { token },
  );
  return { conversations: asArray(data.conversations) };
}

export async function createConversation(token: string) {
  const c = await api<Conversation>("/api/conversations", {
    method: "POST",
    token,
  });
  return normalizeConversation(c);
}

export async function getConversation(token: string, id: string) {
  const c = await api<Conversation>(
    `/api/conversations/${encodeURIComponent(id)}`,
    { token },
  );
  return normalizeConversation(c);
}

export async function chat(
  token: string,
  message: string,
  conversationId?: string | null,
) {
  const d = await api<{ reply: string; conversation_id: string }>("/api/chat", {
    method: "POST",
    token,
    body: JSON.stringify({
      message,
      ...(conversationId ? { conversation_id: conversationId } : {}),
    }),
  });
  return {
    reply: d.reply == null ? "" : String(d.reply),
    conversation_id: d.conversation_id == null ? "" : String(d.conversation_id),
  };
}

export type GoalCoachTurn = {
  role: "user" | "assistant";
  text: string;
  created_at: string;
};

export type Goal = {
  id: string;
  distance_km: number;
  distance_label: string;
  weeks: number;
  sessions_per_week: number;
  target_time: string;
  plan: string;
  coach_thread?: GoalCoachTurn[];
  created_at: string;
};

function normalizeCoachThread(raw: Goal["coach_thread"]): GoalCoachTurn[] {
  return asArray(raw as GoalCoachTurn[] | null | undefined).map((t) => ({
    role: t.role === "user" ? "user" : "assistant",
    text: t.text == null ? "" : String(t.text),
    created_at: t.created_at == null ? "" : String(t.created_at),
  }));
}

function normalizeGoal(g: Goal): Goal {
  return {
    ...g,
    target_time: g.target_time == null ? "" : String(g.target_time),
    plan: g.plan == null ? "" : String(g.plan),
    coach_thread: normalizeCoachThread(g.coach_thread),
  };
}

export async function listGoals(token: string) {
  const data = await api<{ goals: Goal[] | null }>("/api/goals", { token });
  return { goals: asArray(data.goals).map((g) => normalizeGoal(g as Goal)) };
}

export type GoalDraftPayload = {
  distance_km: number;
  weeks: number;
  sessions_per_week: number;
  target_time: string;
};

/** Avis faisabilité (avant génération du plan complet). */
export async function previewGoalFeasibility(
  token: string,
  body: GoalDraftPayload,
  opts?: { signal?: AbortSignal },
) {
  const d = await api<{ feasibility: string }>("/api/goals/feasibility", {
    method: "POST",
    token,
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
  return { feasibility: d.feasibility == null ? "" : String(d.feasibility) };
}

export async function createGoal(token: string, body: GoalDraftPayload) {
  const g = await api<Goal>("/api/goals", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
  return normalizeGoal(g);
}

export async function getGoal(token: string, id: string) {
  const g = await api<Goal>(`/api/goals/${encodeURIComponent(id)}`, { token });
  return normalizeGoal(g);
}

export async function goalChat(token: string, goalId: string, message: string) {
  const d = await api<{ reply: string }>(
    `/api/goals/${encodeURIComponent(goalId)}/chat`,
    {
      method: "POST",
      token,
      body: JSON.stringify({ message }),
    },
  );
  return { reply: d.reply == null ? "" : String(d.reply) };
}
