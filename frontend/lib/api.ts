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

/** Erreur HTTP API avec statut (permet de distinguer 401 et panne réseau). */
export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export type MeCapabilities = {
  coach_chat?: boolean;
  strava_dashboard?: boolean;
  goals?: boolean;
  live_runs?: boolean;
  forecast?: boolean;
  circuit?: boolean;
};

export type MeUser = {
  id: string;
  email: string;
  strava_linked: boolean;
  created_at: string;
  role?: string;
  plan?: string;
  capabilities?: MeCapabilities;
};

export type OfferConfigPayload = {
  tiers: Record<
    string,
    {
      coach_chat: boolean;
      strava_dashboard: boolean;
      goals: boolean;
      live_runs: boolean;
      forecast: boolean;
      circuit: boolean;
    }
  >;
  prices_eur: Record<string, number>;
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
    throw new ApiError(apiErrorMessage(res, text, data), res.status);
  }
  return data as T;
}

export function getApiBase() {
  return API;
}

export async function fetchMe(token: string): Promise<MeUser> {
  return api<MeUser>("/api/me", { token });
}

export async function fetchPublicOfferConfig(): Promise<OfferConfigPayload> {
  return api<OfferConfigPayload>("/api/public/offer-config");
}

export type CheckoutPreviewResult = {
  plan: string;
  base_price_eur: number;
  discount_percent: number;
  final_price_eur: number;
  email: string;
};

export async function checkoutPreview(
  token: string,
  plan: "strava" | "performance",
  promoCode?: string,
): Promise<CheckoutPreviewResult> {
  return api<CheckoutPreviewResult>("/api/checkout/preview", {
    method: "POST",
    token,
    body: JSON.stringify({ plan, promo_code: promoCode ?? "" }),
  });
}

export async function checkoutSubscribe(
  token: string,
  plan: "strava" | "performance",
  promoCode?: string,
): Promise<{ ok: boolean; user: MeUser }> {
  return api<{ ok: boolean; user: MeUser }>("/api/checkout/subscribe", {
    method: "POST",
    token,
    body: JSON.stringify({ plan, promo_code: promoCode ?? "" }),
  });
}

export type AdminStats = {
  users_total: number;
  users_last_7d: number;
  users_plan_standard: number;
  users_plan_strava: number;
  users_plan_performance: number;
};

export async function adminStats(token: string): Promise<AdminStats> {
  return api<AdminStats>("/api/admin/stats", { token });
}

export type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  plan: string;
  strava_linked: boolean;
  created_at: string;
};

export async function adminListUsers(
  token: string,
  skip = 0,
  limit = 50,
): Promise<{ users: AdminUserRow[]; total: number }> {
  const q = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  return api<{ users: AdminUserRow[]; total: number }>(`/api/admin/users?${q}`, {
    token,
  });
}

export async function adminGetUser(token: string, id: string): Promise<{
  user: MeUser;
  goals_count: number;
  runs_count: number;
  goals: unknown[];
  live_runs: unknown[];
}> {
  return api(`/api/admin/users/${encodeURIComponent(id)}`, { token });
}

export async function adminPatchUser(
  token: string,
  id: string,
  body: { role?: string; plan?: string },
): Promise<{ ok: boolean; user: MeUser }> {
  return api(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export type PromoCodeRow = {
  id: string;
  code: string;
  percent_off: number;
  max_uses: number;
  uses: number;
  expires_at?: string | null;
  active: boolean;
  applicable_plans?: string[];
  created_at: string;
};

export async function adminListPromos(token: string): Promise<{ promo_codes: PromoCodeRow[] }> {
  return api<{ promo_codes: PromoCodeRow[] }>("/api/admin/promo-codes", { token });
}

export async function adminCreatePromo(
  token: string,
  body: {
    code: string;
    percent_off: number;
    max_uses: number;
    expires_at?: string | null;
    active: boolean;
    applicable_plans?: string[];
  },
): Promise<PromoCodeRow> {
  return api<PromoCodeRow>("/api/admin/promo-codes", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export async function adminPatchPromo(
  token: string,
  id: string,
  body: Partial<{
    percent_off: number;
    max_uses: number;
    active: boolean;
    applicable_plans: string[];
  }>,
): Promise<PromoCodeRow> {
  return api<PromoCodeRow>(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export async function adminDeletePromo(token: string, id: string): Promise<void> {
  await api<unknown>(`/api/admin/promo-codes/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export async function adminGetOfferConfig(token: string): Promise<OfferConfigPayload> {
  return api<OfferConfigPayload>("/api/admin/offer-config", { token });
}

export async function adminPutOfferConfig(
  token: string,
  cfg: OfferConfigPayload,
): Promise<OfferConfigPayload> {
  return api<OfferConfigPayload>("/api/admin/offer-config", {
    method: "PUT",
    token,
    body: JSON.stringify(cfg),
  });
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

export type StravaDashboardPeriod = "7d" | "30d" | "90d" | "365d" | "all";

export type StravaDashboardWeek = {
  week_start: string;
  km: number;
  hours: number;
  avg_hr?: number;
  runs: number;
};

export type StravaPacePoint = {
  date: string;
  pace_min_per_km: number;
  distance_km: number;
};

export type StravaDashboard = {
  period: string;
  runs_total: number;
  total_km: number;
  total_hours: number;
  weekly: StravaDashboardWeek[];
  pace_5k: StravaPacePoint[];
  pace_10k: StravaPacePoint[];
  pace_half: StravaPacePoint[];
  pace_marathon: StravaPacePoint[];
};

function normalizeStravaDashboard(d: StravaDashboard): StravaDashboard {
  return {
    ...d,
    period: d.period == null ? "" : String(d.period),
    runs_total: typeof d.runs_total === "number" ? d.runs_total : 0,
    total_km: typeof d.total_km === "number" ? d.total_km : 0,
    total_hours: typeof d.total_hours === "number" ? d.total_hours : 0,
    weekly: asArray(d.weekly),
    pace_5k: asArray(d.pace_5k),
    pace_10k: asArray(d.pace_10k),
    pace_half: asArray(d.pace_half),
    pace_marathon: asArray(d.pace_marathon),
  };
}

export async function fetchStravaDashboard(token: string, period: StravaDashboardPeriod) {
  const q = encodeURIComponent(period);
  const raw = await api<StravaDashboard>(`/api/strava/dashboard?period=${q}`, { token });
  return normalizeStravaDashboard(raw);
}

export type RaceLegForecast = {
  id: string;
  label: string;
  distance_km: number;
  time_sec: number;
  pace_sec_per_km: number;
  sample_runs: number;
  runs_with_hr: number;
  data_source: string;
  ref_leg_id?: string;
  target_hr_bpm?: number;
  hr_band_low?: number;
  hr_band_high?: number;
  baseline_time_sec?: number;
};

export type RaceForecastPayload = {
  legs: RaceLegForecast[];
  runs_analyzed: number;
  generated_at: string;
};

function normalizeRaceForecastPayload(d: RaceForecastPayload): RaceForecastPayload {
  return {
    runs_analyzed: typeof d.runs_analyzed === "number" ? d.runs_analyzed : 0,
    generated_at: d.generated_at == null ? "" : String(d.generated_at),
    legs: asArray(d.legs).map((leg) => ({
      id: leg.id == null ? "" : String(leg.id),
      label: leg.label == null ? "" : String(leg.label),
      distance_km: typeof leg.distance_km === "number" ? leg.distance_km : 0,
      time_sec: typeof leg.time_sec === "number" ? leg.time_sec : 0,
      pace_sec_per_km: typeof leg.pace_sec_per_km === "number" ? leg.pace_sec_per_km : 0,
      sample_runs: typeof leg.sample_runs === "number" ? leg.sample_runs : 0,
      runs_with_hr: typeof leg.runs_with_hr === "number" ? leg.runs_with_hr : 0,
      data_source: leg.data_source == null ? "" : String(leg.data_source),
      ref_leg_id: leg.ref_leg_id == null ? undefined : String(leg.ref_leg_id),
      target_hr_bpm: typeof leg.target_hr_bpm === "number" ? leg.target_hr_bpm : undefined,
      hr_band_low: typeof leg.hr_band_low === "number" ? leg.hr_band_low : undefined,
      hr_band_high: typeof leg.hr_band_high === "number" ? leg.hr_band_high : undefined,
      baseline_time_sec:
        typeof leg.baseline_time_sec === "number" ? leg.baseline_time_sec : undefined,
    })),
  };
}

export async function fetchRaceForecast(token: string) {
  const raw = await api<RaceForecastPayload>("/api/strava/forecast", { token });
  return normalizeRaceForecastPayload(raw);
}

export type ForecastAdjustEnergy = "great" | "normal" | "tired";

export type RaceForecastAdjustResponse = {
  baseline: RaceForecastPayload;
  adjusted: RaceForecastPayload;
  rationale_fr: string;
  ai_used: boolean;
  factors: {
    "5k": number;
    "10k": number;
    half: number;
    marathon: number;
    rationale_fr: string;
  };
};

function normalizeAdjustResponse(d: RaceForecastAdjustResponse): RaceForecastAdjustResponse {
  const factors = d.factors as RaceForecastAdjustResponse["factors"] | null | undefined;
  return {
    baseline: normalizeRaceForecastPayload(d.baseline as RaceForecastPayload),
    adjusted: normalizeRaceForecastPayload(d.adjusted as RaceForecastPayload),
    rationale_fr: d.rationale_fr == null ? "" : String(d.rationale_fr),
    ai_used: Boolean(d.ai_used),
    factors: {
      "5k": typeof factors?.["5k"] === "number" ? factors!["5k"] : 1,
      "10k": typeof factors?.["10k"] === "number" ? factors!["10k"] : 1,
      half: typeof factors?.half === "number" ? factors!.half : 1,
      marathon: typeof factors?.marathon === "number" ? factors!.marathon : 1,
      rationale_fr: factors?.rationale_fr == null ? "" : String(factors.rationale_fr),
    },
  };
}

export async function adjustRaceForecast(
  token: string,
  body: { energy: ForecastAdjustEnergy; injured: boolean },
) {
  const raw = await api<RaceForecastAdjustResponse>("/api/strava/forecast/adjust", {
    method: "POST",
    token,
    body: JSON.stringify({
      energy: body.energy,
      injured: body.injured,
    }),
  });
  return normalizeAdjustResponse(raw);
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
export function asArray<T>(v: T[] | null | undefined): T[] {
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

export async function deleteConversation(token: string, id: string): Promise<void> {
  await api<unknown>(`/api/conversations/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
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

export type PlannedSession = {
  week: number;
  session: number;
  distance_km: number;
  pace_sec_per_km?: number | null;
  summary?: string;
};

export type Goal = {
  id: string;
  distance_km: number;
  distance_label: string;
  weeks: number;
  sessions_per_week: number;
  target_time: string;
  plan: string;
  /** true si le plan a été généré sans données Strava (affiner après liaison). */
  plan_without_strava_data?: boolean;
  planned_sessions?: PlannedSession[];
  /** Jours 0=lun…6=dim (optionnel ; sinon motif serveur par défaut). */
  calendar_day_offsets?: number[];
  coach_thread?: GoalCoachTurn[];
  created_at: string;
};

export type GoalCalendarItem = {
  date: string;
  week: number;
  session: number;
  summary: string;
  planned_km: number;
  target_pace_sec_per_km?: number | null;
  status: "upcoming" | "done" | "partial" | "missed";
  strava_activity_id?: number | null;
  actual_km?: number | null;
  actual_pace_sec_per_km?: number | null;
};

export type GoalCalendarResponse = {
  timezone: string;
  items: GoalCalendarItem[];
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
    plan_without_strava_data: Boolean(g.plan_without_strava_data),
    planned_sessions: asArray(g.planned_sessions as PlannedSession[] | null),
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

export async function getGoalCalendar(token: string, goalId: string) {
  const d = await api<GoalCalendarResponse>(
    `/api/goals/${encodeURIComponent(goalId)}/calendar`,
    { token },
  );
  return {
    timezone: d.timezone == null ? "" : String(d.timezone),
    items: asArray(d.items).map((it) => ({
      ...it,
      date: it.date == null ? "" : String(it.date),
      status:
        it.status === "done" || it.status === "partial" || it.status === "missed"
          ? it.status
          : "upcoming",
      summary: it.summary == null ? "" : String(it.summary),
    })) as GoalCalendarItem[],
  };
}

export async function deleteGoal(token: string, id: string) {
  await api<{ ok?: boolean }>(`/api/goals/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
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

export type LiveRunSplit = {
  km: number;
  split_sec: number;
  pace_sec_per_km: number;
  end_timestamp_ms: number;
};

export type LiveRunTrackPoint = {
  lat: number;
  lng: number;
  t_ms: number;
  accuracy_m?: number;
  alt_m?: number;
  heading_deg?: number;
  speed_mps?: number;
};

export type LiveRunPayload = {
  target_km: number;
  distance_m: number;
  moving_sec: number;
  wall_sec: number;
  gps_start_ts_ms: number;
  gps_end_ts_ms: number;
  avg_pace_sec_per_km: number;
  max_implied_speed_kmh: number;
  splits: LiveRunSplit[];
  track_points: LiveRunTrackPoint[];
  client_version: string;
  user_agent: string;
  navigator_language: string;
  screen_w: number;
  screen_h: number;
  online_at_end: boolean;
  auto_pause_detected: boolean;
};

export async function postLiveRun(token: string, body: LiveRunPayload) {
  return api<{ id: string; created_at: string }>("/api/live-runs", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export type LiveRunListItem = {
  id: string;
  created_at: string;
  target_km: number;
  distance_m: number;
  moving_sec: number;
  wall_sec: number;
  avg_pace_sec_per_km: number;
  split_count: number;
};

export async function listLiveRuns(token: string) {
  const d = await api<{ runs: LiveRunListItem[] }>("/api/live-runs", {
    token,
  });
  return d.runs ?? [];
}

export type LiveRunDetail = {
  id: string;
  created_at: string;
  target_km: number;
  distance_m: number;
  moving_sec: number;
  wall_sec: number;
  gps_start_ts_ms: number;
  gps_end_ts_ms: number;
  avg_pace_sec_per_km: number;
  max_implied_speed_kmh?: number;
  splits: LiveRunSplit[];
  track_points: LiveRunTrackPoint[];
  client_version?: string;
  user_agent?: string;
  navigator_language?: string;
  screen_w?: number;
  screen_h?: number;
  online_at_end?: boolean;
  auto_pause_detected?: boolean;
};

export async function getLiveRun(
  token: string,
  id: string,
): Promise<LiveRunDetail> {
  return api<LiveRunDetail>(
    `/api/live-runs/${encodeURIComponent(id)}`,
    { token },
  );
}
