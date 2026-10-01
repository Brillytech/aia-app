import { StyleSheet, View } from "react-native";
import Svg, { Circle, G, Path, Rect, Text as SvgText } from "react-native-svg";
import type { Theme } from "../theme";
import { fontFor } from "./fonts";
import { weight, withAlpha } from "./tokens";

/**
 * A filled pie with its slices labelled where they sit.
 *
 * A legend makes you look twice: once at the slice, once at the key, matching
 * them by colour. A label on a leader line points at the thing it names, so
 * the chart is read once. That is the whole reason this replaced the ring and
 * legend that stood here before.
 *
 * WHAT IT DOES THAT A HAND-DRAWN PIE DOES NOT
 *
 * Labels do not collide. Each side is laid out independently: the labels are
 * sorted by the angle of the slice they belong to, then pushed apart until
 * every one clears its neighbour by LABEL_PITCH, and the column is nudged
 * back inside the box if the pushing ran it off the end. Two thin adjacent
 * slices would otherwise print their names on top of each other, which is the
 * failure every pie chart with outside labels has.
 *
 * Labels adapt to the room available. Beside a pie on a 390pt phone there is
 * space for a course code and not for "Human Anatomy and Physiology", so the
 * long form appears only when the gutter can hold it. The alternative is what
 * the reference did — clip the name at the edge of the screen.
 *
 * Every slice carries its value under its name, so the chart answers "how
 * many" as well as "which", and does not need a table underneath repeating
 * itself.
 */

export type PieSlice = {
  key: string;
  /** Short form — a course code. Always used when the gutter is tight. */
  label: string;
  /** Full name, used instead when there is room for it. */
  longLabel?: string;
  value: number;
  color: string;
};

/**
 * The connector runs horizontally off the slice to a rail, then vertically
 * along it to the label. Nothing is drawn at an angle: a fan of diagonals
 * reads as scribble over a chart whose own lines are all arcs and radii.
 */
const RAIL_GAP = 12;
const BOX_GAP = 6;

/** Minimum vertical distance between two labels on the same side. */
const LABEL_PITCH = 40;

/** The label box itself: two lines of text with a little air. */
const LABEL_BLOCK = 34;
const BOX_PAD_X = 6;

/**
 * Rough advance per character at each label size.
 *
 * SVG text cannot be measured before it is laid out, so the box is sized
 * from an estimate. The estimate runs slightly wide on purpose: a box a
 * couple of points too roomy looks fine, where one too narrow clips its own
 * text.
 */
const NAME_CHAR_W = 6.2;
const VALUE_CHAR_W = 5.8;
const LONG_LABEL_MIN = 132;

const MIN_R = 46;
const MAX_R = 92;
const V_PAD = 16;

function polar(cx: number, cy: number, r: number, angle: number) {
  return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
}

function wedge(cx: number, cy: number, r: number, from: number, to: number) {
  const a = polar(cx, cy, r, from);
  const b = polar(cx, cy, r, to);
  const large = to - from > Math.PI ? 1 : 0;

  return `M ${cx} ${cy} L ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y} Z`;
}

function truncate(text: string, maxWidth: number) {
  const fits = Math.floor(maxWidth / NAME_CHAR_W);
  if (text.length <= fits) return text;
  if (fits <= 1) return "…";

  return text.slice(0, fits - 1).trimEnd() + "…";
}

/**
 * Push a column of labels apart, then back inside the box.
 *
 * Returns the y each label should be drawn at, in the order given.
 */
function spread(targets: number[], top: number, bottom: number) {
  const count = targets.length;
  if (count === 0) return [];
  if (count === 1) return [Math.min(Math.max(targets[0], top), bottom)];

  /**
   * Two passes, and the pitch shrinks if the band is too tight for the usual
   * one.
   *
   * A single downward pass only enforces a minimum gap, so a column whose
   * labels naturally spanned more than the box still ran off the end — and
   * the obvious repair, sliding the whole column back up, then pushed the
   * first label off the top, where a second repair slid it down again and
   * undid the first. Four labels down one side of a six-slice pie landed the
   * last one 13pt below the bottom edge that way.
   *
   * Capping the pitch at what the band can actually hold makes the feasible
   * region non-empty, and then pushing down from the top and pulling up from
   * the bottom lands every label inside it.
   */
  const pitch = Math.min(LABEL_PITCH, (bottom - top) / (count - 1));
  const order = targets.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);

  let floor = top;
  for (const item of order) {
    item.y = Math.max(item.y, floor);
    floor = item.y + pitch;
  }

  let ceiling = bottom;
  for (let i = order.length - 1; i >= 0; i--) {
    order[i].y = Math.min(order[i].y, ceiling);
    ceiling = order[i].y - pitch;
  }

  const out = new Array<number>(count);
  for (const item of order) out[item.i] = item.y;

  return out;
}

export function PieChart({
  theme,
  slices,
  width,
  unit = "",
}: {
  theme: Theme;
  slices: PieSlice[];
  /** The space the chart has. Everything else is derived from it. */
  width: number;
  /** Suffix on each value, e.g. "m" for minutes. Counts need none. */
  unit?: string;
}) {
  const live = slices.filter((slice) => slice.value > 0);
  const total = live.reduce((sum, slice) => sum + slice.value, 0);
  if (live.length === 0 || total <= 0) return null;

  // The gutter each side has to hold a label; the pie gets what is left.
  // Weighted toward the labels: on a 360 screen a pie drawn to the old
  // ratio left room for seven characters, so "Practice" arrived as
  // "Practi…". A slightly smaller pie reads just as well; a clipped word
  // does not.
  const gutter = Math.max(84, Math.min(150, width * 0.32));
  const radius = Math.max(MIN_R, Math.min(MAX_R, width / 2 - gutter));
  const labelWidth = width / 2 - radius - RAIL_GAP - BOX_GAP - 2;
  const useLongLabels = labelWidth >= LONG_LABEL_MIN;

  const cx = width / 2;

  // --- geometry ------------------------------------------------------------
  // Each wedge's start, summed from the slices before it rather than carried
  // in a running variable. A variable reassigned during render is what the
  // React Compiler rejects, and a pie has a handful of slices, so paying for
  // the prefix sum costs nothing.
  const arcs = live.map((slice, index) => {
    const before = live.slice(0, index).reduce((sum, earlier) => sum + earlier.value, 0);
    const from = -Math.PI / 2 + (before / total) * Math.PI * 2;
    const to = from + (slice.value / total) * Math.PI * 2;

    return { slice, from, to, mid: (from + to) / 2 };
  });

  const right = arcs.filter((arc) => Math.cos(arc.mid) >= 0);
  const left = arcs.filter((arc) => Math.cos(arc.mid) < 0);

  /**
   * Tall enough for the pie, or for whichever side carries more labels.
   *
   * This has to come AFTER the split, not before. Guessing half the slices
   * per side is wrong whenever they divide unevenly: six slices landing two
   * right and four left needs room for four, and sizing for three pushed the
   * last label's value line off the bottom edge.
   */
  const crowded = Math.max(right.length, left.length);
  const stack = Math.max(0, crowded - 1) * LABEL_PITCH + LABEL_BLOCK;
  const height = Math.max(radius * 2, stack) + V_PAD * 2;
  const cy = height / 2;

  const place = (group: typeof arcs) => {
    // The label wants to sit level with the point its connector leaves from,
    // so the vertical run is as short as it can be.
    const wanted = group.map((arc) => polar(cx, cy, radius, arc.mid).y);
    // y is the box's centre, so both halves of it have to clear the edges.
    const half = LABEL_BLOCK / 2;
    const ys = spread(wanted, V_PAD + half, height - V_PAD - half);

    return group.map((arc, i) => ({ arc, y: ys[i] }));
  };

  const placed = [
    ...place(right).map((p) => ({ ...p, side: 1 as const })),
    ...place(left).map((p) => ({ ...p, side: -1 as const })),
  ];

  return (
    <View style={[styles.wrap, { width, height }]}>
      <Svg width={width} height={height}>
        {/* A single slice is a whole circle. Drawn as an arc it would sweep
            exactly 2π, where the start and end points coincide and the path
            collapses to nothing. */}
        {live.length === 1 ? (
          <Circle cx={cx} cy={cy} r={radius} fill={live[0].color} />
        ) : (
          arcs.map(({ slice, from, to }) => (
            <Path
              key={slice.key}
              d={wedge(cx, cy, radius, from, to)}
              fill={slice.color}
              // A hairline in the page colour between wedges, so two similar
              // hues still read as two slices.
              stroke={theme.bg}
              strokeWidth={1.5}
            />
          ))
        )}

        {placed.map(({ arc, y, side }) => {
          // Where the connector leaves the slice: on the edge, at the angle
          // that bisects it.
          const touch = polar(cx, cy, radius, arc.mid);
          const railX = cx + side * (radius + RAIL_GAP);
          const boxEdge = railX + side * BOX_GAP;

          const long = arc.slice.longLabel;
          const room = labelWidth - BOX_PAD_X * 2;
          const text =
            useLongLabels && long ? truncate(long, room) : truncate(arc.slice.label, room);

          const percent = Math.round((arc.slice.value / total) * 100);
          const value = `${arc.slice.value}${unit} · ${percent}%`;

          // The box takes the width of its wider line, never more than the
          // gutter can hold.
          const boxWidth = Math.min(
            labelWidth,
            Math.max(text.length * NAME_CHAR_W, value.length * VALUE_CHAR_W) + BOX_PAD_X * 2,
          );

          const boxX = side > 0 ? boxEdge : boxEdge - boxWidth;
          const textX = side > 0 ? boxX + BOX_PAD_X : boxX + boxWidth - BOX_PAD_X;
          const anchor = side > 0 ? "start" : "end";

          return (
            <G key={arc.slice.key}>
              {/* Horizontal off the slice, then vertical down the rail. Two
                  segments, both square to the page. */}
              <Path
                d={`M ${touch.x} ${touch.y} H ${railX} V ${y}`}
                fill="none"
                stroke={arc.slice.color}
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              <Rect
                x={boxX}
                y={y - LABEL_BLOCK / 2}
                width={boxWidth}
                height={LABEL_BLOCK}
                rx={7}
                fill={withAlpha(arc.slice.color, theme.mode === "dark" ? 0.2 : 0.11)}
                stroke={withAlpha(arc.slice.color, 0.45)}
                strokeWidth={1}
              />

              <SvgText
                x={textX}
                y={y - 2}
                fill={theme.text}
                fontSize={11.5}
                fontWeight={weight.bold}
                // An SVG text node inherits nothing from the React Native
                // tree, so without this the labels rendered in the browser
                // default serif while the rest of the page was Figtree.
                fontFamily={fontFor(weight.bold)}
                textAnchor={anchor}
              >
                {text}
              </SvgText>

              <SvgText
                x={textX}
                y={y + 11}
                fill={theme.muted}
                fontSize={10}
                fontWeight={weight.medium}
                fontFamily={fontFor(weight.medium)}
                textAnchor={anchor}
              >
                {value}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  // Left, with its heading. Centred, a capped-width chart drifts into the
  // middle of a wide page while the title it belongs to stays at the margin.
  wrap: { alignSelf: "flex-start" },
});

/** Exported for the skeleton, so the placeholder reserves the real height. */
export function pieChartHeight(width: number, sliceCount: number) {
  const gutter = Math.max(84, Math.min(150, width * 0.32));
  const radius = Math.max(MIN_R, Math.min(MAX_R, width / 2 - gutter));
  // The placeholder cannot know how the slices will fall either side, so it
  // assumes an even split, which is the most it can be wrong by.
  const crowded = Math.ceil(Math.max(1, sliceCount) / 2);
  const stack = Math.max(0, crowded - 1) * LABEL_PITCH + LABEL_BLOCK;

  return Math.max(radius * 2, stack) + V_PAD * 2;
}

