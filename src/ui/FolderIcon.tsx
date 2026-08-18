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
 */
export function FolderIcon({
  color,
  size = 64,
  open = false,
}: {
  color: string;
  size?: number;
  /** Tilts the front face forward, as if the folder is being opened. */
  open?: boolean;
}) {
  const back = shade(color, -0.12);
  const frontTop = shade(color, 0.24);
  const frontBottom = shade(color, 0.04);

  return (
    <Svg width={size} height={size} viewBox="0 0 64 56" fill="none">
      <Defs>
        <LinearGradient id="folderFront" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={frontTop} />
          <Stop offset="1" stopColor={frontBottom} />
        </LinearGradient>
      </Defs>

      {/* Back panel: the tabbed silhouette everyone reads as "folder". */}
      <Path
        d="M2 10a6 6 0 0 1 6-6h13.6a6 6 0 0 1 4.3 1.8l3.5 3.6a6 6 0 0 0 4.3 1.8H56a6 6 0 0 1 6 6v29a6 6 0 0 1-6 6H8a6 6 0 0 1-6-6V10Z"
        fill={back}
      />

      {/* Front face, offset down so the back panel shows above it. When open
          it skews and drops, which is what sells the gesture. */}
      <Path
        d={
          open
            ? "M6 26h52a5 5 0 0 1 4.9 6l-3.4 15A5 5 0 0 1 54.6 51H9.4a5 5 0 0 1-4.9-4L1.1 32A5 5 0 0 1 6 26Z"
            : "M5 22h54a4 4 0 0 1 4 4v20a6 6 0 0 1-6 6H7a6 6 0 0 1-6-6V26a4 4 0 0 1 4-4Z"
        }
        fill="url(#folderFront)"
      />
    </Svg>
  );
}
