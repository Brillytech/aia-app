import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { haptics } from "./haptics";
import { radius, spacing, type, weight, withAlpha } from "./tokens";

export type RailCourse = {
  id: string;
  code: string;
  title: string;
  /** 0–100. Drives the ring sweep. */
  progress: number;
  done: number;
  total: number;
  color: string;
  icon: IconName;
};

const RING = 66;
const STROKE = 5;
const ITEM_WIDTH = 78;

/**
 * The dashboard's course list, as a horizontal rail of progress rings.
 *
 * It was a vertical settings-style list — five rows of icon, label, thin bar,
 * chevron — which is the shape a preferences screen takes, and reads as a
 * webpage table on a home screen. Five courses cost five rows of height to say
 * very little, and the progress bar inside each row was too small to read.
 *
 * A ring says the same thing better: the sweep *is* the progress, legible at a
 * glance without a number, and the whole catalogue fits in the height two of
 * the old rows took. Horizontal paging is also the right gesture here — a
 * course list is something you flick through, not something you scan
 * top-to-bottom looking for a setting.
 */
export function CourseRail({
  theme,
  courses,
  onPressCourse,
}: {
  theme: Theme;
  courses: RailCourse[];
  onPressCourse: (courseId: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.rail}
      // Snaps course-by-course rather than drifting to a half-visible ring.
      snapToInterval={ITEM_WIDTH + spacing.lg}
      decelerationRate="fast"
    >
      {courses.map((course) => (
        <CourseRing
          key={course.id}
          theme={theme}
          course={course}
          onPress={() => onPressCourse(course.id)}
        />
      ))}
    </ScrollView>
  );
}

function CourseRing({
  theme,
  course,
  onPress,
}: {
  theme: Theme;
  course: RailCourse;
  onPress: () => void;
}) {
  const r = (RING - STROKE) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, course.progress));
  const dark = theme.mode === "dark";
  const complete = course.total > 0 && course.done >= course.total;

  return (
    <Pressable
      onPress={() => {
        haptics.tap();
        onPress();
      }}
      style={styles.item}
    >
      <View style={styles.ringWrap}>
        <Svg width={RING} height={RING}>
          <Circle
            cx={RING / 2}
            cy={RING / 2}
            r={r}
            stroke={withAlpha(course.color, dark ? 0.22 : 0.16)}
            strokeWidth={STROKE}
            fill="none"
          />
          {clamped > 0 ? (
            <Circle
              cx={RING / 2}
              cy={RING / 2}
              r={r}
              stroke={course.color}
              strokeWidth={STROKE}
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={circumference * (1 - clamped / 100)}
              rotation="-90"
              origin={`${RING / 2}, ${RING / 2}`}
            />
          ) : null}
        </Svg>

        {/* The subject glyph sits inside the ring, so the ring reads as the
            course's own badge rather than as a chart wrapped around an icon. */}
        <View style={styles.ringCenter}>
          <View
            style={[
              styles.glyph,
              { backgroundColor: withAlpha(course.color, dark ? 0.24 : 0.14) },
            ]}
          >
            <MaterialCommunityIcons name={course.icon} size={21} color={course.color} />
          </View>
        </View>

        {/* A finished course earns a mark on the ring itself. Nothing else on
            the dashboard tells you a course is done. */}
        {complete ? (
          <View style={[styles.tick, { backgroundColor: course.color, borderColor: theme.bg }]}>
            <MaterialCommunityIcons name="check" size={11} color={theme.onAccent} />
          </View>
        ) : null}
      </View>

      <Text style={[styles.code, { color: theme.text }]} numberOfLines={1}>
        {course.code}
      </Text>

      <Text style={[styles.meta, { color: theme.muted }]} numberOfLines={1}>
        {course.total > 0 ? `${course.done}/${course.total}` : "—"}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rail: {
    flexDirection: "row",
    gap: spacing.lg,
    // Matches the screen gutter so the first ring lines up with the section
    // heading above it, while the rail itself still bleeds to both edges.
    paddingHorizontal: 20,
    paddingVertical: spacing.xs,
  },
  item: {
    width: ITEM_WIDTH,
    alignItems: "center",
  },
  ringWrap: {
    width: RING,
    height: RING,
    alignItems: "center",
    justifyContent: "center",
  },
  ringCenter: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  tick: {
    position: "absolute",
    right: 0,
    bottom: 2,
    width: 19,
    height: 19,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  code: {
    ...type.caption,
    marginTop: spacing.sm,
  },
  meta: {
    ...type.micro,
    fontWeight: weight.medium,
    letterSpacing: 0.2,
    marginTop: 1,
  },
});
