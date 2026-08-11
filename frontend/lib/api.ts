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
  /** Parcours GPS + classements (souvent offre Performance) */
  circuit_tracks?: boolean;
};

export type MeUser = {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  birth_date?: string;
  gender?: string;
  strava_linked: boolean;
  created_at: string;
  role?: string;
  plan?: string;
  capabilities?: MeCapabilities;
};

export type RegisterGender = "female" | "male" | "other" | "unspecified";

export type RegisterPayload = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: RegisterGender;
  /** Offre payante visée ensuite : diffère la notification admin jusqu’au paiement. */
  intended_plan?: string;
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
      circuit_tracks: boolean;
    }
  >;
  prices_eur: Record<string, number>;
  /** Libellés affichés (admin → Offres), clés = ids paliers côté API. */
  tier_display_names?: Record<string, string>;
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

export async function fetchMe(
  token: string,
  init?: Pick<RequestInit, "signal">,
): Promise<MeUser> {
  return api<MeUser>("/api/me", { token, ...init });
}

export type PatchMePayload = {
  first_name: string;
  last_name: string;
  birth_date: string;
  gender: RegisterGender;
  /** Obligatoire si `new_password` est défini. */
  current_password?: string;
  new_password?: string;
};

export async function patchMe(token: string, body: PatchMePayload): Promise<MeUser> {
  return api<MeUser>("/api/me", {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export async function deleteMyAccount(token: string, password: string): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>("/api/me/delete-account", {
    method: "POST",
    token,
    body: JSON.stringify({ password }),
  });
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

export type PaymentConfig = {
  stripe_enabled: boolean;
  publishable_key: string;
  currency: string;
};

/** Clé publique Stripe servie par l’API (le front est un export statique : pas d’env au runtime). */
export async function fetchPaymentConfig(): Promise<PaymentConfig> {
  return api<PaymentConfig>("/api/public/payment-config");
}

export type CheckoutSessionResult =
  /** Montant à 0 € (promo 100 %) : l’offre est déjà activée, aucune redirection. */
  | { free: true; amount_cents: 0; user: MeUser }
  | {
      free: false;
      session_id: string;
      /** URL de la page de paiement hébergée par Stripe. */
      url: string;
      amount_cents: number;
      currency: string;
    };

/** Crée la session Stripe Checkout ; le paiement se fait sur checkout.stripe.com. */
export async function createCheckoutSession(
  token: string,
  plan: "strava" | "performance",
  promoCode?: string,
): Promise<CheckoutSessionResult> {
  return api<CheckoutSessionResult>("/api/checkout/session", {
    method: "POST",
    token,
    body: JSON.stringify({
      plan,
      promo_code: promoCode ?? "",
      origin: typeof window === "undefined" ? "" : window.location.origin,
      return_path: typeof window === "undefined" ? "" : window.location.pathname,
    }),
  });
}

/** Active l’offre au retour de Stripe — le serveur relit la session chez Stripe avant de l’accorder. */
export async function confirmCheckoutSession(
  token: string,
  sessionId: string,
): Promise<{ ok: boolean; user: MeUser }> {
  return api<{ ok: boolean; user: MeUser }>("/api/checkout/confirm", {
    method: "POST",
    token,
    body: JSON.stringify({ session_id: sessionId }),
  });
}

export type BillingInvoice = {
  id: string;
  number?: string;
  amount_paid_cents: number;
  currency: string;
  status: string;
  paid_at: string;
  hosted_url?: string;
  pdf_url?: string;
};

export type BillingState = {
  plan: string;
  has_subscription: boolean;
  /** Qui encaisse : "stripe" (web) ou "apple" (achat intégré iOS). Absent sans abonnement. */
  provider?: "stripe" | "apple";
  /**
   * L’abonnement ne peut être ni résilié ni repris depuis NeuroRun : c’est le cas des achats
   * App Store, qu’Apple réserve aux réglages iOS.
   */
  managed_externally?: boolean;
  status?: string;
  amount_cents?: number;
  currency?: string;
  /** Prochain prélèvement — absent si la résiliation est programmée. */
  next_payment_at?: string;
  /** Fin des droits en cas de résiliation programmée. */
  ends_at?: string;
  cancel_at_period_end: boolean;
  invoices: BillingInvoice[];
};

export async function fetchBillingState(
  token: string,
  init?: Pick<RequestInit, "signal">,
): Promise<BillingState> {
  return api<BillingState>("/api/billing/subscription", { token, ...init });
}

/** Résilie à l’échéance : plus de prélèvement, l’offre reste active jusqu’à la fin de la période payée. */
export async function cancelBillingSubscription(token: string): Promise<BillingState> {
  return api<BillingState>("/api/billing/cancel", { method: "POST", token });
}

/** Annule une résiliation programmée tant que la période payée n’est pas terminée. */
export async function resumeBillingSubscription(token: string): Promise<BillingState> {
  return api<BillingState>("/api/billing/resume", { method: "POST", token });
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

export type SignupDayRow = { day: string; count: number };

export type TopActiveUserRow = {
  user_id: string;
  email: string;
  activity: number;
  live_runs: number;
  goals: number;
  conversations: number;
};

export type AdminStats = {
  users_total: number;
  users_last_7d: number;
  users_plan_standard: number;
  users_plan_strava: number;
  users_plan_performance: number;
  /** Ids paliers (config offres), ordre d’affichage stable */
  tier_order?: string[];
  /** Effectifs par id de palier (aligné sur la config offres) */
  users_by_plan?: Record<string, number>;
  /** Libellés marketing par id (même clés que la config offres) */
  tier_display_names?: Record<string, string>;
  /** Inscriptions par jour (UTC), typiquement 30 jours */
  signups_by_day?: SignupDayRow[];
  top_active_users?: TopActiveUserRow[];
  /** Revenu récurrent mensuel estimé (Σ prix × abonnés par palier payant) */
  mrr_estimated_eur?: number;
  prices_eur?: Record<string, number>;
  subscribers_strava?: number;
  subscribers_performance?: number;
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
  /** Dernière activité API (connexion ou usage du site avec token), RFC3339 */
  last_seen_at?: string;
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
  live_runs: LiveRunListItem[];
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

export async function adminDeleteUser(token: string, id: string): Promise<void> {
  await api<unknown>(`/api/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
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

export type CircuitLatLng = { lat: number; lng: number };

export type CircuitSummary = {
  id: string;
  name: string;
  start_index: number;
  points: CircuitLatLng[];
  center: { type: string; coordinates: number[] };
  created_at: string;
  /** Longueur totale du tracé boucle (m), calculée côté API. */
  length_m?: number;
  /** ID utilisateur créateur (Mongo hex). */
  created_by?: string;
  /** Présent sur GET /circuits/:id. */
  creator_display_name?: string;
  /** Personnes distinctes ayant enregistré un temps. */
  participant_count?: number;
};

export type CircuitTopRow = {
  id: string;
  user_id: string;
  duration_ms: number;
  created_at: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
};

export type CircuitDetailResponse = {
  circuit: CircuitSummary;
  top_times: CircuitTopRow[];
  participant_count: number;
  completion_count_total: number;
};

export async function fetchCircuitsNear(
  token: string,
  lat: number,
  lng: number,
  radiusKm = 25,
): Promise<{ circuits: CircuitSummary[] }> {
  const q = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radius_km: String(radiusKm),
  });
  return api<{ circuits: CircuitSummary[] }>(`/api/circuits/near?${q}`, { token });
}

export async function createCircuit(
  token: string,
  body: { name: string; points: CircuitLatLng[]; start_index: number },
): Promise<CircuitSummary> {
  return api<CircuitSummary>("/api/circuits", {
    method: "POST",
    token,
    body: JSON.stringify(body),
  });
}

export async function fetchCircuitDetail(token: string, id: string): Promise<CircuitDetailResponse> {
  return api<CircuitDetailResponse>(`/api/circuits/${encodeURIComponent(id)}`, { token });
}

export async function postCircuitTime(
  token: string,
  circuitId: string,
  durationMs: number,
): Promise<{ id: string; duration_ms: number; created_at: string }> {
  return api(`/api/circuits/${encodeURIComponent(circuitId)}/times`, {
    method: "POST",
    token,
    body: JSON.stringify({ duration_ms: durationMs }),
  });
}

export async function adminListCircuits(
  token: string,
  q = "",
  skip = 0,
  limit = 50,
): Promise<{ circuits: (CircuitSummary & { created_by?: string })[]; total: number }> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  if (q.trim()) params.set("q", q.trim());
  return api(`/api/admin/circuits?${params}`, { token });
}

export async function adminPatchCircuit(
  token: string,
  id: string,
  body: { name: string },
): Promise<CircuitSummary> {
  return api<CircuitSummary>(`/api/admin/circuits/${encodeURIComponent(id)}`, {
    method: "PATCH",
    token,
    body: JSON.stringify(body),
  });
}

export async function adminDeleteCircuit(token: string, id: string): Promise<void> {
  await api(`/api/admin/circuits/${encodeURIComponent(id)}`, {
    method: "DELETE",
    token,
  });
}

export type AdminCircuitTimeRow = CircuitTopRow & {
  circuit_id?: string;
  circuit_name?: string;
  email?: string;
};

export async function adminListCircuitTimes(
  token: string,
  circuitId: string,
  skip = 0,
  limit = 100,
): Promise<{ times: AdminCircuitTimeRow[]; total: number }> {
  const params = new URLSearchParams({ skip: String(skip), limit: String(limit) });
  return api(`/api/admin/circuits/${encodeURIComponent(circuitId)}/times?${params}`, { token });
}

export async function adminSearchCircuitTimesByUser(
  token: string,
  firstName: string,
  lastName: string,
  skip = 0,
  limit = 50,
): Promise<{ times: AdminCircuitTimeRow[]; total: number }> {
  const params = new URLSearchParams({
    skip: String(skip),
    limit: String(limit),
    first_name: firstName.trim(),
    last_name: lastName.trim(),
  });
  return api(`/api/admin/circuit-times/search?${params}`, { token });
}

export async function adminDeleteCircuitTime(token: string, timeId: string): Promise<void> {
  await api(`/api/admin/circuit-times/${encodeURIComponent(timeId)}`, {
    method: "DELETE",
    token,
  });
}

export async function login(email: string, password: string) {
  return api<{ token: string; user: MeUser }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function register(body: RegisterPayload) {
  return api<{ token: string; user: MeUser }>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Vérifie le format et si l’email n’est pas déjà enregistré (inscription). */
export async function checkRegistrationEmail(email: string) {
  return api<{ available: boolean }>("/api/auth/register/check-email", {
    method: "POST",
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
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

/** Fiabilité de la projection pour une distance. */
export type ForecastConfidence = "high" | "medium" | "low";

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
  /** Bornes de la fourchette de plausibilité autour de `time_sec`. */
  time_low_sec?: number;
  time_high_sec?: number;
  confidence: ForecastConfidence;
  /** Sorties dans la bande de preuve directe (0 = projection extrapolée). */
  direct_runs: number;
  /** Taille d’échantillon effective (Kish) après pondération récence × proximité. */
  effective_runs?: number;
  /** Sortie la plus longue de la fenêtre : garde-fou endurance sur semi / marathon. */
  longest_run_km?: number;
};

export type RaceForecastPayload = {
  legs: RaceLegForecast[];
  runs_analyzed: number;
  generated_at: string;
  /** Profondeur d’historique réellement prise en compte. */
  window_days?: number;
  /** Sortie la plus longue de la fenêtre, toutes distances confondues. */
  longest_run_km?: number;
};

function normalizeConfidence(v: unknown): ForecastConfidence {
  return v === "high" || v === "low" ? v : "medium";
}

function normalizeRaceForecastPayload(d: RaceForecastPayload): RaceForecastPayload {
  return {
    runs_analyzed: typeof d.runs_analyzed === "number" ? d.runs_analyzed : 0,
    generated_at: d.generated_at == null ? "" : String(d.generated_at),
    window_days: typeof d.window_days === "number" ? d.window_days : undefined,
    longest_run_km: typeof d.longest_run_km === "number" ? d.longest_run_km : undefined,
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
      time_low_sec: typeof leg.time_low_sec === "number" ? leg.time_low_sec : undefined,
      time_high_sec: typeof leg.time_high_sec === "number" ? leg.time_high_sec : undefined,
      confidence: normalizeConfidence(leg.confidence),
      direct_runs: typeof leg.direct_runs === "number" ? leg.direct_runs : 0,
      effective_runs: typeof leg.effective_runs === "number" ? leg.effective_runs : undefined,
      longest_run_km: typeof leg.longest_run_km === "number" ? leg.longest_run_km : undefined,
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
  /** Présent quand la trace inclut la FC (ex. import Strava avec flux heartrate). */
  hr_bpm?: number;
};

/** Métriques agrégées calculées à l’enregistrement de la course (côté client). */
export type LiveRunClientStats = {
  max_speed_kmh: number;
  avg_speed_kmh: number;
  avg_pace_sec_per_km: number;
  min_split_pace_sec_per_km: number;
  max_split_pace_sec_per_km: number;
  elevation_gain_m: number;
  elevation_loss_m: number;
  max_altitude_m: number;
  min_altitude_m: number;
  pause_overhead_sec: number;
  track_point_count: number;
  split_count: number;
  distance_km: number;
  moving_sec: number;
  wall_sec: number;
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
  client_stats?: LiveRunClientStats | null;
  /** Présent pour les sorties chargées depuis Strava. */
  strava_activity_id?: number;
  activity_name?: string;
  activity_type?: string;
  avg_heartrate?: number;
  max_heartrate?: number;
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

/** Une entrée du flux d’historique : course NeuroRun (live) ou sortie Strava. */
export type RunHistoryFeedItem = {
  source: "live" | "strava";
  /** Live uniquement */
  id?: string;
  /** Live uniquement */
  created_at?: string;
  /** Strava uniquement */
  strava_activity_id?: number;
  /** Strava uniquement : titre de l’activité */
  name?: string;
  /** Strava uniquement */
  start_date?: string;
  distance_m: number;
  moving_sec: number;
  elapsed_sec?: number;
  avg_pace_sec_per_km: number;
  split_count?: number;
  activity_type?: string;
  /** Dénivelé positif (m), Strava. */
  elevation_gain_m?: number;
  /** Vitesse max (km/h), Strava. */
  max_speed_kmh?: number;
  /** Fréquence cardiaque moyenne (bpm), Strava. */
  avg_heartrate?: number;
};

/**
 * Historique fusionné courses NeuroRun + sorties Strava, trié par date décroissante
 * (même endpoint que l’app mobile). `strava_included` est faux si Strava n’est pas
 * lié ou si l’appel Strava a échoué côté serveur.
 */
export async function fetchRunHistoryFeed(
  token: string,
  params?: { limit?: number; before?: string },
): Promise<{
  items: RunHistoryFeedItem[];
  next_before?: string;
  strava_included: boolean;
}> {
  const q = new URLSearchParams();
  if (params?.limit != null && params.limit > 0) q.set("limit", String(params.limit));
  if (params?.before) q.set("before", params.before);
  const qs = q.toString();
  const d = await api<{
    items: RunHistoryFeedItem[];
    next_before?: string;
    strava_included?: boolean;
  }>(`/api/run-history/feed${qs ? `?${qs}` : ""}`, { token });
  return {
    items: asArray(d.items),
    next_before: d.next_before,
    strava_included: Boolean(d.strava_included),
  };
}

/** Détail d’une sortie Strava, renvoyé au même format qu’une course live. */
export async function getStravaActivityDetail(
  token: string,
  stravaActivityId: number,
): Promise<LiveRunDetail> {
  return api<LiveRunDetail>(
    `/api/strava/activities/${encodeURIComponent(String(stravaActivityId))}`,
    { token },
  );
}
