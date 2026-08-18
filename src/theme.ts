import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

export const THEME_KEY = "lasu_scholar_theme";

export type ThemeMode = "dark" | "light";

export type AlertType = "success" | "error" | "warning" | "info";

/**
 * The full surface of a theme. `lightTheme` and `darkTheme` are checked against
 * this with `satisfies`, so adding a key to one and forgetting the other is a
 * compile error instead of a runtime `undefined` that renders as a black or
 * transparent surface.
 */
export type Theme = {
  mode: ThemeMode;

  // Surfaces, from furthest back to closest to the user.
  bg: string;
  card: string;
  cardSoft: string;
  elevated: string;
  input: string;

  // Text ramp.
  text: string;
  muted: string;
  muted2: string;

  // Lines and washes.
  border: string;
  strongBorder: string;
  soft: string;

  // Accent.
  accent: string;
  accentSoft: string;
  onAccent: string;

  // Semantics.
  success: string;
  error: string;
  warning: string;
  info: string;

  // Chrome.
  shadow: string;
  overlay: string;
  navBg: string;

  /** @deprecated alias of `accent` — removed once every screen is migrated. */
  orange: string;
  /** @deprecated alias of `border` — removed once (tabs)/_layout.tsx is migrated. */
  navBorder: string;
  /** @deprecated alias of `muted2` — removed once (tabs)/_layout.tsx is migrated. */
  navInactive: string;
  /** @deprecated use `card` — removed once study.tsx is migrated. */
  glass: string;
};

export const darkTheme = {
  mode: "dark",

  // Deeper base, taken from exam mode's own palette (#050B16) — the shared
  // theme used to sit at #07101F, which read as washed next to it. Card and
  // elevated are unchanged, so dropping the floor actually *widens* the
  // surface ladder rather than just darkening everything uniformly.
  bg: "#050B16",
  card: "#101A2D",
  cardSoft: "#0B1220",
  elevated: "#16233C",
  input: "rgba(255,255,255,0.06)",

  text: "#F8F4EA",
  muted: "#B8C0CC",
  muted2: "#9CA3AF",

  border: "rgba(255,255,255,0.12)",
  strongBorder: "rgba(255,255,255,0.18)",
  soft: "rgba(255,255,255,0.08)",

  accent: "#F97316",
  accentSoft: "rgba(249,115,22,0.16)",
  onAccent: "#FFFFFF",

  success: "#22C55E",
  error: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",

  shadow: "#000000",
  overlay: "rgba(0,0,0,0.66)",
  navBg: "rgba(5,11,22,0.92)",

  orange: "#F97316",
  navBorder: "rgba(255,255,255,0.12)",
  navInactive: "#9CA3AF",
  glass: "rgba(255,255,255,0.08)",
} satisfies Theme;

export const lightTheme = {
  mode: "light",

  bg: "#FBF7EF",
  card: "#FFFFFF",
  cardSoft: "#F8F4EA",
  // Light-mode elevation is expressed by shadow, not lightness — so an
  // elevated surface is the same white as a card, lifted by `elevation()`.
  elevated: "#FFFFFF",
  input: "#FFF9F0",

  text: "#07101F",
  muted: "#526071",
  muted2: "#6B7280",

  border: "rgba(7,16,31,0.10)",
  strongBorder: "rgba(7,16,31,0.16)",
  soft: "rgba(7,16,31,0.05)",

  accent: "#F97316",
  accentSoft: "rgba(249,115,22,0.12)",
  onAccent: "#FFFFFF",

  success: "#22C55E",
  error: "#EF4444",
  warning: "#F59E0B",
  info: "#3B82F6",

  shadow: "#000000",
  overlay: "rgba(0,0,0,0.55)",
  navBg: "rgba(255,253,244,0.96)",

  orange: "#F97316",
  navBorder: "rgba(7,16,31,0.10)",
  navInactive: "#6B7280",
  glass: "rgba(255,255,255,0.82)",
} satisfies Theme;

/**
 * Category hues for courses, subjects and stat blocks. Mode-independent by
 * design — a course keeps its identity colour in both themes. Anything that
 * needs to *mean* something (success, error) belongs in the theme instead.
 */
export const category = {
  orange: "#F97316",
  blue: "#3B82F6",
  green: "#22C55E",
  purple: "#8B5CF6",
  yellow: "#EAB308",
  red: "#EF4444",
  teal: "#06B6D4",
} as const;

/**
 * Podium medal hues. Mode-independent like `category` — these encode rank
 * identity, not state, so they must not shift between light and dark.
 */
export const medal = {
  gold: "#F59E0B",
  silver: "#94A3B8",
  bronze: "#B45309",
} as const;

export type CategoryKey = keyof typeof category;

export const categoryOrder: readonly CategoryKey[] = [
  "orange",
  "blue",
  "green",
  "purple",
  "yellow",
  "red",
  "teal",
] as const;

const listeners = new Set<(mode: ThemeMode) => void>();

export async function saveTheme(mode: ThemeMode) {
  await AsyncStorage.setItem(THEME_KEY, mode);
  listeners.forEach((listener) => listener(mode));
}

export async function getSavedTheme(): Promise<ThemeMode> {
  const saved = await AsyncStorage.getItem(THEME_KEY);

  // Default is LIGHT now
  return saved === "dark" ? "dark" : "light";
}

export function getTheme(mode: ThemeMode): Theme {
  return mode === "dark" ? darkTheme : lightTheme;
}

export function useThemeMode() {
  // Default is LIGHT now
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    getSavedTheme().then(setMode);

    const listener = (nextMode: ThemeMode) => setMode(nextMode);
    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  async function toggleTheme() {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    await saveTheme(nextMode);
  }

  return {
    mode,
    theme: getTheme(mode),
    isDark: mode === "dark",
    toggleTheme,
  };
}
