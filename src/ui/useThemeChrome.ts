import { useEffect } from "react";
import { Platform } from "react-native";
import type { Theme } from "../theme";
import { shade } from "./tokens";

/**
 * The two grounds the app paints, derived from one theme.
 *
 * Exported because three places have to agree on them and they were previously
 * computed inline in the root layout: the layout itself, the document body,
 * and the browser's own chrome. When they disagreed you got exactly the bug
 * this was written for — a black app with a cream status bar above it and
 * cream slivers down the sides.
 *
 * The surround always recedes and the column always reads as the lit surface —
 * the same depth model in both themes.
 *
 * The first attempt tinted the surround with `theme.text`, which inverted
 * between modes: measured, it produced a surround DARKER than the column in
 * light (#efebe4 vs #fbf7ef) but LIGHTER than it in dark (#272c34 vs #050b16).
 * Content receded on dark and advanced on light, which is why the dark
 * surround read wrong. In dark there is no room to go darker — the page ground
 * is already #050B16 — so depth comes from lifting the column instead of
 * sinking the surround.
 */
export function appSurfaces(theme: Theme) {
  const dark = theme.mode === "dark";

  return {
    /** Behind the column: the desktop letterbox, and the page's own ground. */
    surround: dark ? shade(theme.bg, -0.45) : shade(theme.bg, -0.06),
    /** The app column itself, and therefore what sits under the status bar. */
    column: dark ? shade(theme.bg, 0.05) : theme.bg,
  };
}

/** Marks the tag this hook owns, so it never fights the ones in index.html. */
const MANAGED = "data-app-chrome";

/**
 * Keeps the browser's chrome on the app's theme.
 *
 * WHAT WAS WRONG
 * --------------
 * `index.html` hard-codes a cream `theme-color` and a cream body background.
 * In an installed PWA the theme-color is what paints the system status bar,
 * and the body background is what shows in the safe-area insets and during
 * rubber-band overscroll. So in dark mode the app was black with a cream strip
 * above it and cream slivers at the edges — the app's own colours never
 * reached past its root view.
 *
 * WHY IT CANNOT BE DONE IN CSS ALONE
 * ----------------------------------
 * `prefers-color-scheme` answers what the OS wants. This app's theme is a
 * manual toggle stored in AsyncStorage and defaulting to light, so the two
 * disagree for any user whose phone is dark and whose app is not, or the
 * reverse. The media-query pair in index.html is still worth having — it is
 * the best a first paint can do before the bundle loads and the saved theme is
 * known — but once it is known, this takes over and the OS preference stops
 * mattering.
 *
 * Native is a no-op: there is no document, and the status bar there is
 * `expo-status-bar`'s business.
 */
export function useThemeChrome(theme: Theme) {
  const { column } = appSurfaces(theme);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;

    // The media-query pair from index.html has served its purpose by now, and
    // leaving it in place means two competing tags where the OS could win.
    document
      .querySelectorAll(`meta[name="theme-color"]:not([${MANAGED}])`)
      .forEach((tag) => tag.remove());

    let meta = document.querySelector(`meta[${MANAGED}]`);
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "theme-color");
      meta.setAttribute(MANAGED, "");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", column);

    // Both, not just body: overscroll on iOS paints the html element's
    // background, and body's alone leaves the bounce cream.
    document.documentElement.style.backgroundColor = column;
    document.body.style.backgroundColor = column;
  }, [column]);
}
