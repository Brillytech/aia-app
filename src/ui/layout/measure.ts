import { StyleSheet } from "react-native";
import { useIsDesktop } from "./breakpoints";

/**
 * How wide content is allowed to get on a large screen.
 *
 * The app had exactly one layout rule — "fill the column" — which was
 * invisible while the column was capped at 480px, because filling 480px is
 * always fine. Once the column can be the whole viewport that rule stops
 * meaning anything, and it produced measured results like a 1814px password
 * field and 269 characters per line on the signup screen. Comfortable prose is
 * 45-75.
 *
 * So width becomes a property of the CONTENT, not of the window. Every screen
 * declares what kind of thing it is showing and gets a measure that suits it.
 * This is the same reason a text editor is ~700px wide on a 27" monitor.
 *
 * The numbers are not arbitrary:
 *
 *   form  420  a single column of fields. Wider inputs are harder to scan and
 *              do not hold more useful text; every design system lands near
 *              this for sign-in.
 *   prose 680  ~70 characters at the 14px body step — inside the comfortable
 *              range for continuous reading.
 *   feed  900  cards and rows that carry their own internal structure, so the
 *              line length is set by the card rather than by the page.
 *   app  1280  dense, multi-column screens. Measured, /study and /exam already
 *              land near this on their own, which is what suggested it.
 *   full  none the two-pane viewer, which genuinely wants the whole width.
 */
export type Measure = "form" | "prose" | "feed" | "app" | "full";

export const MEASURE_WIDTH: Record<Exclude<Measure, "full">, number> = {
  form: 420,
  prose: 680,
  feed: 900,
  app: 1280,
};

const styles = StyleSheet.create({
  form: { width: "100%", maxWidth: MEASURE_WIDTH.form, alignSelf: "center" },
  prose: { width: "100%", maxWidth: MEASURE_WIDTH.prose, alignSelf: "center" },
  feed: { width: "100%", maxWidth: MEASURE_WIDTH.feed, alignSelf: "center" },
  app: { width: "100%", maxWidth: MEASURE_WIDTH.app, alignSelf: "center" },
});

/**
 * Returns a style that constrains and centres content at the given measure,
 * or `null` below the desktop breakpoint.
 *
 * `null` rather than a style carrying the phone value, for the same reason as
 * `useContentInset`: `[styles.scroll, null]` flattens to exactly
 * `styles.scroll`, so phone markup is unchanged rather than merely equivalent.
 * That is what the 390px DOM diff verifies.
 *
 * Applied to an existing container's style — usually a ScrollView's
 * `contentContainerStyle` — so it adds no wrapper element:
 *
 *     contentContainerStyle={[styles.scroll, measure]}
 */
export function useMeasure(measure: Measure) {
  const desktop = useIsDesktop();
  if (!desktop || measure === "full") return null;
  return styles[measure];
}
