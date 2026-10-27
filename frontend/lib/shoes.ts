import type { Shoe, ShoeCategory, ShoeWearStatus } from "@/lib/api";

/** Événement de fenêtre : une paire ou une course a changé, les écrans relisent. */
export const SHOES_CHANGED_EVENT = "neurorun:shoes-changed";

export function notifyShoesChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHOES_CHANGED_EVENT));
}

export const CATEGORY_LABELS: Record<ShoeCategory, string> = {
  daily: "Polyvalente",
  cushion: "Amorti max",
  stability: "Stabilité",
  tempo: "Dynamique",
  race: "Compétition",
  trail: "Trail",
};

/** Lecture de l’usure : libellé, badge, couleur de l’anneau et conseil d’une ligne. */
export const WEAR_STATUS: Record<
  ShoeWearStatus,
  { label: string; badge: string; color: string; hint: string }
> = {
  new: {
    label: "Comme neuves",
    badge: "badge--ok",
    color: "#34d399",
    hint: "L’amorti est intact.",
  },
  good: {
    label: "En forme",
    badge: "badge--ice",
    color: "#67e8f9",
    hint: "Encore une belle marge devant toi.",
  },
  watch: {
    label: "À surveiller",
    badge: "badge--warn",
    color: "#fbbf24",
    hint: "La mousse commence à se tasser : écoute tes jambes après les sorties longues.",
  },
  replace: {
    label: "À remplacer bientôt",
    badge: "badge--brand",
    color: "#fc4c02",
    hint: "Prévois la prochaine paire et alterne pour l’user moins vite.",
  },
  worn: {
    label: "Usées",
    badge: "badge--danger",
    color: "#f87171",
    hint: "Durée de vie théorique dépassée : l’amorti ne protège plus comme avant.",
  },
};

export function shoeTitle(s: Pick<Shoe, "brand" | "model">): string {
  return `${s.brand} ${s.model}`;
}

/** « 1 234 km », « 12,5 km » : les petites valeurs gardent une décimale. */
export function formatShoeKm(km: number): string {
  if (!Number.isFinite(km)) return "—";
  const v = km >= 100 ? Math.round(km) : Math.round(km * 10) / 10;
  return `${v.toLocaleString("fr-FR")} km`;
}

/** « 3 mars 2026 » à partir d’un jour civil AAAA-MM-JJ, sans décalage de fuseau. */
export function formatDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  return new Date(y, m - 1, d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** « mars 2027 » : une date de remplacement projetée se lit au mois près. */
export function formatMonth(day: string): string {
  const [y, m] = day.split("-").map(Number);
  if (!y || !m) return day;
  return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

/** « ~3 mois », « ~5 semaines » : horizon de la projection, arrondi pour ne pas sur-promettre. */
export function formatWeeksLeft(weeks: number): string {
  if (weeks < 1) return "moins d’une semaine";
  if (weeks < 9) {
    const w = Math.round(weeks);
    return `~${w} semaine${w > 1 ? "s" : ""}`;
  }
  const months = Math.round(weeks / 4.345);
  return `~${months} mois`;
}

/** Aujourd’hui en jour civil local AAAA-MM-JJ. */
export function todayDay(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Recherche tolérante : sans accents ni casse, chaque mot doit apparaître. */
export function matchesQuery(text: string, query: string): boolean {
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  const hay = norm(text);
  return norm(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}
