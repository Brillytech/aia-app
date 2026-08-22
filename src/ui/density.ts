import { useWindowDimensions } from "react-native";
import { spacing } from "./tokens";

/**
 * Width at which the layout stops being a phone.
 *
 * Matches `COLUMN_MAX_WIDTH` in app/_layout.tsx: above this the app column is
 * capped and the viewport is a desktop or tablet, so the surrounding chrome is
 * no longer a phone's.
 */
export const PHONE_MAX_WIDTH = 480;

/**
 * Row heights and section rhythm, tightened once the viewport stops being a
 * phone.
 *
 * Every value in this app was tuned for a thumb on a ~390pt screen. Those
 * numbers are correct there and stay untouched — `ROW_MIN_HEIGHT` 52 is a
 * touch target, not a style choice, and shrinking it globally would make the
 * phone worse to use.
 *
 * On a pointer device none of that applies: 52pt rows and 32pt gaps read as
 * loose, and the effect compounds because the column is 480 wide against a
 * phone's ~390, so each row has 23% more width to look sparse across.
 *
 * Keyed off the window, deliberately, not the column: the column is always
 * ≤480, so measuring it would never detect a desktop.
 */
export function useDensity() {
  const { width } = useWindowDimensions();
  const compact = width > PHONE_MAX_WIDTH;

  return {
    compact,
    /** Minimum row height. Thumb-sized on phone, pointer-sized above it. */
    rowMinHeight: compact ? 46 : 52,
    /** Gap between grouped sections. */
    sectionGap: compact ? spacing.xxl : spacing.xxxl,
  };
}
