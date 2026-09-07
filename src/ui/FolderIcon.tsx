import { useId } from "react";
import { StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { shade } from "./tokens";

/**
 * A real folder, drawn as vector.
 *
 * Deliberately not an icon-font glyph or a downloaded PNG: this takes the
 * subject's own hue, so a biology folder is green and a chemistry one purple
 * without shipping one asset per colour. Being vector it also stays crisp at
 * any size and can animate, which a raster folder can't.
 *
 * Two faces — a back panel with the tab, and a lighter front panel offset
 * down — because a single flat shape reads as a glyph rather than an object.
 * The front is opaque (via `shade`, not alpha) so the page behind never
 * shows through it.
 *
 * WHY THE FRONT IS ITS OWN LAYER
 * ------------------------------
 * The two faces used to be paths in one SVG, and "opening" swapped the front
 * path for a skewed one. That is a discrete change: the shape teleported
 * between two states with nothing in between, which is why the press read as
 * a jump rather than a hinge no matter how the wrapper was eased.
 *
 * The front now sits in its own absolutely-positioned layer, so a caller can
 * hand it a transform and rotate it about its bottom edge like an actual lid.
 * Animating a View transform is also far more dependable than animating SVG
 * path props, on web especially.
 */

const RATIO = 56 / 64;

const BACK_PATH =
  "M2 10a6 6 0 0 1 6-6h13.6a6 6 0 0 1 4.3 1.8l3.5 3.6a6 6 0 0 0 4.3 1.8H56a6 6 0 0 1 6 6v29a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V10Z";

const FRONT_CLOSED =
  "M5 22h54a4 4 0 0 1 4 4v20a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6V26a4 4 0 0 1 4-4Z";

/** The pre-skewed shape, kept for callers that toggle rather than animate. */
const FRONT_OPEN =
  "M6 26h52a5 5 0 0 1 4.9 6l-3.4 15A5 5 0 0 1 54.6 51H9.4a5 5 0 0 1-4.9-4L1.1 32A5 5 0 0 1 6 26Z";

export function FolderIcon({
  color,
  size = 64,
  open = false,
  frontStyle,
}: {
  color: string;
  size?: number;
  /**
   * Swaps the front face for the pre-skewed shape. A discrete toggle — use
   * `frontStyle` instead when the opening should be animated.
   */
  open?: boolean;
  /**
   * Transform applied to the front face alone. Rotate about the bottom edge
   * (`transformOrigin: "bottom"`) for a hinge.
   */
  /** Accepts a Reanimated animated style, which is not a plain ViewStyle. */
  frontStyle?: React.ComponentProps<typeof Animated.View>["style"];
}) {
  const back = shade(color, -0.12);
  const frontTop = shade(color, 0.24);
  const frontBottom = shade(color, 0.04);

  const height = size * RATIO;

  // Was the literal "folderFront" on every instance. SVG resolves
  // url(#id) against the whole document, so with more than one folder on
  // screen — the course grid, always — every front face took the FIRST
  // folder's gradient while its back panel stayed its own colour. React's
  // ids carry colons, which are not valid in a url(#...) reference.
  const frontId = `folderFront${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <View style={{ width: size, height }}>
      <Svg
        width={size}
        height={height}
        viewBox="0 0 64 56"
        fill="none"
        style={StyleSheet.absoluteFill}
      >
        {/* Back panel: the tabbed silhouette everyone reads as "folder". */}
        <Path d={BACK_PATH} fill={back} />
      </Svg>

      <Animated.View style={[StyleSheet.absoluteFill, frontStyle]}>
        <Svg width={size} height={height} viewBox="0 0 64 56" fill="none">
          <Defs>
            <LinearGradient id={frontId} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={frontTop} />
              <Stop offset="1" stopColor={frontBottom} />
            </LinearGradient>
          </Defs>

          {/* Front face, offset down so the back panel shows above it. */}
          <Path d={open ? FRONT_OPEN : FRONT_CLOSED} fill={`url(#${frontId})`} />
        </Svg>
      </Animated.View>
    </View>
  );
}
