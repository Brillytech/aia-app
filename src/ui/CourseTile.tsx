import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { CourseFolder } from "./CourseFolder";
import { elevation, motion, radius, spacing, type as typeScale, weight } from "./tokens";

/**
 * One course, as a tile.
 *
 * Extracted from study.tsx so the dashboard shows the same object rather than
 * a second course-card style. The folder, the press behaviour, the badge and
 * the measurements are all one definition now.
 *
 * `meta` is a plain string rather than the tile deriving it, because the two
 * screens legitimately say different things: study shows the department and
 * level, the dashboard shows progress through the course. Passing the line in
 * avoids giving the tile a prop that one caller never uses.
 *
 * ELEVATION EXCEPTION, DELIBERATE — see the tokens pass. Shadows were removed
 * almost everywhere because floating containers made every screen read like a
 * phone. Course tiles are the exception and only they are: they are the
 * primary tappable object, and a tap target should feel liftable. Do not
 * "fix" this by flattening it.
 */
export function CourseTile({
  theme,
  title,
  code,
  meta,
  color,
  icon,
  opening = false,
  onPress,
}: {
  theme: Theme;
  title: string;
  /** Omit or pass null when the course has no code — the badge disappears
   *  rather than rendering empty. Use courseCode() from ../courses. */
  code?: string | null;
  /** The supporting line. Study passes department and level; the dashboard
   *  passes progress. */
  meta: string;
  color: string;
  icon: IconName;
  /** Drives the folder's opening sequence. */
  opening?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[code, title].filter(Boolean).join(" ")}
      onPress={onPress}
      style={({ pressed, hovered }: any) => [
        courseTileLayout.tile,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          ...elevation(hovered && !pressed ? 3 : 2, theme.shadow),
          transform: [
            { translateY: hovered && !pressed ? -2 : 0 },
            { scale: pressed ? 0.985 : 1 },
          ],
          transitionProperty: "transform, box-shadow",
          transitionDuration: motion.fast,
        },
      ]}
    >
      {/* The folder is the only thing that moves. The wrapper tilt and jiggle
          are gone: they were the shake. */}
      <CourseFolder color={color} icon={icon} size={52} open={opening} />

      <View style={styles.text}>
        <View style={styles.top}>
          {/* No numberOfLines: the full name always shows and wraps as far as
              it needs. The reserved second line is gone — that was 48px every
              tile paid whether it used them or not. */}
          <Text style={[styles.name, { color: theme.text }]}>{title}</Text>

          {/* Absent codes drop the badge entirely rather than rendering an
              empty pill. */}
          {code ? (
            <View style={[styles.badge, { borderColor: theme.border }]}>
              <Text style={[styles.badgeText, { color: theme.muted }]} numberOfLines={1}>
                {code}
              </Text>
            </View>
          ) : null}
        </View>

        <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>
          {meta}
        </Text>
      </View>

    </Pressable>
  );
}

/** Grid container and cell, so both screens lay tiles out identically. */
export const courseTileLayout = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    // Rows pack from the top; they never distribute leftover height between
    // themselves, which is what produced uneven gaps before.
    alignContent: "flex-start",
  },
  /** The tile's own box. Exported so a loading skeleton mirrors it exactly
   *  rather than keeping its own copy of the measurements. */
  tile: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    // The folder sits beside the text rather than above it, which is most of
    // what took the tile from 148pt to roughly 86.
    padding: spacing.md + 2,
  },
  cell: {
    flexGrow: 1,
    minWidth: 0,
    // The cell is a flex container so the tile inside can fill it. That is
    // what makes align-items: stretch CORRECT here — every tile in a row
    // matches height with no dead space.
    flexDirection: "row",
  },
  /** Caps a row at three: four would need 124% before gaps. */
  cellThird: {
    flexBasis: "31%",
  },
  /** Two per row, for a narrower main column. */
  cellHalf: {
    flexBasis: "46%",
  },
  cellFull: {
    flexBasis: "100%",
  },
});

const styles = StyleSheet.create({
  text: {
    flex: 1,
    minWidth: 0,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  name: {
    flex: 1,
    minWidth: 0,
    ...typeScale.bodyLg,
    fontWeight: weight.bold,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.pill,
    // Was missing: the caller passed a borderColor with no width, so the
    // outline never drew and the badge was bare text.
    borderWidth: StyleSheet.hairlineWidth,
  },

  badgeText: {
    ...typeScale.micro,
    letterSpacing: 0.5,
  },
  meta: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
  },
});
