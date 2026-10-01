import { Platform } from "react-native";

/**
 * The app's typeface.
 *
 * There was none before this: every screen rendered in whatever the platform
 * supplied — Segoe UI on Windows, Roboto on Android, San Francisco on iOS —
 * so the same screen had three different voices and none of them was chosen.
 * All the character in the design came from weight and letter-spacing doing
 * work a typeface should be doing.
 *
 * WHY FIGTREE
 * The scale leans hard on weight 900: `type.section`, `title`, `display`,
 * `hero` and `mega` are all black, and the headline on a report is 44pt of
 * it. Most geometric sans families on Google Fonts stop at 800 — Plus Jakarta
 * Sans, the other candidate, does — which would have meant either
 * re-weighting the whole scale or letting the browser fake the difference.
 * Figtree carries a real 300 through 900, and its black is genuinely black
 * rather than a bold with the contrast turned up.
 *
 * TWO MECHANISMS, ONE FOR EACH PLATFORM
 * On web, a font family holds all its weights and CSS picks between them, so
 * one family name plus `fontWeight` is all it takes; the faces come from the
 * stylesheet linked in public/index.html.
 *
 * React Native has no such thing. Each weight is a separately registered
 * family, and `fontWeight` on top of one does nothing but ask the OS to
 * synthesise. So native maps the weight to its own family name, and the
 * mapping lives here rather than being repeated at every call site.
 */
export const FONT_FAMILY = "Figtree";

/**
 * Weight to registered family, for native.
 *
 * Keys are the values in `weight` from tokens — kept as the strings React
 * Native actually passes, so a lookup cannot miss by type.
 */
const NATIVE_FAMILY: Record<string, string> = {
  "300": "Figtree_300Light",
  "400": "Figtree_400Regular",
  "500": "Figtree_500Medium",
  "600": "Figtree_600SemiBold",
  "700": "Figtree_700Bold",
  "800": "Figtree_800ExtraBold",
  "900": "Figtree_900Black",
};

/**
 * The family to set alongside a given weight.
 *
 * Call it anywhere a style overrides `fontWeight` on top of a type token —
 * on web it is the same family either way and the call costs nothing, but on
 * native it is the difference between the real face and a synthesised one.
 */
export function fontFor(weight: string | number | undefined): string {
  if (Platform.OS === "web") return FONT_FAMILY;

  return NATIVE_FAMILY[String(weight ?? "400")] ?? NATIVE_FAMILY["400"];
}
