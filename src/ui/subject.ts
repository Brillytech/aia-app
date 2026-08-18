import { category, CategoryKey } from "../theme";
import type { IconName } from "./alerts";

/**
 * One subject → one colour and one icon, for the whole app.
 *
 * Four separate implementations of this existed — `getCourseAccent` in
 * dashboard and a `getCourseTheme` in each of practice, exam and study — with
 * different colour maps, different keyword chains and different fallback
 * pools. The same course could therefore render in a different hue depending
 * on which screen you were looking at, which is precisely what stops colour
 * from meaning anything.
 *
 * Everything here resolves to a `category` hue. No new palette.
 */

type CourseLike = {
  code?: string | null;
  title?: string | null;
  course_color?: string | null;
  course_icon?: string | null;
} | null | undefined;

/** Explicit `course_color` values authors can set, mapped onto category. */
const COLOR_ALIASES: Record<string, CategoryKey> = {
  orange: "orange",
  blue: "blue",
  green: "green",
  purple: "purple",
  yellow: "yellow",
  gold: "yellow",
  red: "red",
  teal: "teal",
  cyan: "teal",
};

/** Explicit `course_icon` values authors can set. */
const ICON_ALIASES: Record<string, IconName> = {
  book: "book-open-page-variant",
  notebook: "notebook-outline",
  notes: "file-document-outline",
  library: "bookshelf",
  graduation: "school-outline",
  school: "school-outline",
  document: "file-document-outline",
  stethoscope: "stethoscope",
  nursing: "medical-bag",
  medicine: "pill",
  clinical: "medical-bag",
  anatomy: "human-male",
  heart: "heart-pulse",
  heartbeat: "heart-pulse",
  brain: "brain",
  biology: "leaf",
  dna: "dna",
  microscope: "microscope",
  lab: "flask-outline",
  flask: "flask-outline",
  pharmacy: "pill",
  pill: "pill",
  injection: "needle",
  dentistry: "tooth-outline",
  chemistry: "flask-outline",
  "test-tube": "test-tube",
  beaker: "beaker-outline",
  atom: "atom",
  plant: "leaf",
  microbiology: "bacteria-outline",
  math: "calculator-variant-outline",
  calculator: "calculator-variant-outline",
  statistics: "chart-bar",
  research: "magnify",
  bolt: "lightning-bolt-outline",
  lightning: "lightning-bolt-outline",
  electricity: "flash-outline",
  cpu: "chip",
  code: "xml",
  database: "database-outline",
  circuit: "resistor-nodes",
  engineering: "cog-outline",
  technology: "laptop",
  business: "briefcase-outline",
  economics: "chart-line",
  management: "clipboard-text-outline",
  law: "scale-balance",
  language: "translate",
  music: "music-note",
  theatre: "drama-masks",
  writing: "pencil-outline",
  trophy: "trophy-outline",
};

/**
 * Keyword → (icon, colour). One chain, ordered most-specific first. Merged
 * from the four divergent versions; where they disagreed, the more specific
 * rule wins (e.g. "anatomy" before the generic "bio").
 */
const KEYWORDS: { match: string[]; icon: IconName; color: CategoryKey }[] = [
  { match: ["cvs", "cardio", "heart"], icon: "heart-pulse", color: "red" },
  { match: ["neuro", "brain"], icon: "brain", color: "purple" },
  { match: ["renal", "kidney"], icon: "water", color: "blue" },
  { match: ["resp", "lung"], icon: "lungs", color: "teal" },
  { match: ["ana", "anatomy"], icon: "human-male", color: "orange" },
  { match: ["physio", "pys", "phs"], icon: "heart-pulse", color: "red" },
  { match: ["pharm", "drug"], icon: "pill", color: "purple" },
  { match: ["micro", "bacteria"], icon: "bacteria-outline", color: "green" },
  { match: ["chem"], icon: "flask-outline", color: "green" },
  { match: ["bio"], icon: "leaf", color: "green" },
  { match: ["electric", "circuit"], icon: "lightning-bolt-outline", color: "yellow" },
  { match: ["math", "calc", "algebra"], icon: "calculator-variant-outline", color: "blue" },
  { match: ["stat"], icon: "chart-bar", color: "blue" },
  { match: ["comp", "code", "software", "program"], icon: "xml", color: "teal" },
  { match: ["law", "legal"], icon: "scale-balance", color: "purple" },
  { match: ["econ", "account", "business"], icon: "chart-line", color: "yellow" },
];

/** Stable fallback rotation for courses with no colour, icon or keyword hit. */
const POOL: CategoryKey[] = ["purple", "blue", "green", "orange", "teal"];

function searchText(course: CourseLike) {
  return `${course?.code || ""} ${course?.title || ""}`.toLowerCase();
}

/**
 * `index` only matters for courses that match nothing — it spreads them across
 * the pool instead of making every unknown course orange. Pass the course's
 * position in its list.
 */
export function subjectColor(course: CourseLike, index = 0): string {
  const saved = String(course?.course_color || "").toLowerCase().trim();
  if (COLOR_ALIASES[saved]) return category[COLOR_ALIASES[saved]];

  const text = searchText(course);
  const hit = KEYWORDS.find((rule) => rule.match.some((word) => text.includes(word)));
  if (hit) return category[hit.color];

  return category[POOL[index % POOL.length]];
}

export function subjectIcon(course: CourseLike): IconName {
  const saved = String(course?.course_icon || "").toLowerCase().trim();
  if (ICON_ALIASES[saved]) return ICON_ALIASES[saved];

  const text = searchText(course);
  const hit = KEYWORDS.find((rule) => rule.match.some((word) => text.includes(word)));
  if (hit) return hit.icon;

  return "book-open-page-variant-outline";
}
