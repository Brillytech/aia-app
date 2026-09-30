import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { radius, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * Jump to any question in a session.
 *
 * ONE COMPONENT, TWO SCREENS
 * Practice had `QuestionNavigator` and Exam had `ExamNavigator`: ninety lines
 * duplicated, differing only in a title ("Question Navigator" / "Question
 * Palette") and one stat. They had already drifted apart in a way that showed
 * — see the flag note below.
 *
 * WHY THE COLOUR WENT
 * The old grid filled every cell solid: #22C55E answered, #F97316 flagged,
 * #8B5CF6 for a third statistic, the course colour for where you are, all
 * hardcoded past the theme. Nine answered questions became a wall of green,
 * and the one thing the sheet exists to tell you — which question you are on —
 * was a blue tile the same size and shape as its neighbours.
 *
 * Colour now marks one thing: your position. It is the only saturated fill on
 * screen. Answered carries the course colour at a low alpha, untouched carries
 * the same faint ground the answer options use, and the numeral does the rest.
 *
 * A FLAG IS AN ANNOTATION, NOT A STATE
 * Both old copies chose a single fill per cell, so a question that was
 * answered AND flagged had to lose one of the two. They chose differently:
 * Practice painted it green and hid the flag, Exam painted it orange and hid
 * that it had been answered. A flag is now a dot in the corner, on top of
 * whatever the cell already says, so neither fact can hide the other.
 *
 * WHAT REPLACED THE STATS AND THE LEGEND
 * Three stat cards sat above a legend naming the same three states, and the
 * legend's "unanswered" swatch used a different colour from the actual
 * unanswered cell. Both are gone. One subline carries the counts, and the
 * grid is legible without a key.
 */

export type NavigatorMark = {
  id: string;
  answered: boolean;
  flagged: boolean;
};

const CELL = 46;
const GAP = spacing.sm;

/** Opacity ramp for the grid's soft bottom edge, densest at the bottom. */
const FADE_STEPS = [0, 0.12, 0.3, 0.55, 0.8, 1];
const FADE_HEIGHT = 28;

/**
 * Six whole rows, plus the strip the fade sits over.
 *
 * The cap used to be a flat `maxHeight: 330` — 6.1 rows — so at any length
 * past thirty-six the grid opened with a row sliced through its middle. Six
 * rows come to 316, and the fade is given its own 28 below that rather than
 * being laid over the sixth row, which would hide the bottom of six numbers
 * to hint at a seventh. What fades is the gap and the top of the next row,
 * which is the thing actually being hinted at.
 */
const MAX_ROWS = 6;
const ROWS_HEIGHT = MAX_ROWS * CELL + (MAX_ROWS - 1) * GAP;
const MAX_GRID_HEIGHT = ROWS_HEIGHT + FADE_HEIGHT;

export function QuestionNavigator({
  open,
  onClose,
  marks,
  currentIndex,
  onJump,
  theme,
  panelBg,
  color,
}: {
  open: boolean;
  onClose: () => void;
  marks: NavigatorMark[];
  currentIndex: number;
  onJump: (index: number) => void;
  theme: Theme;
  /** The sheet's surface. Practice and Exam use different papers. */
  panelBg: string;
  /** The course or paper accent. */
  color: string;
}) {
  // Whether the grid actually overflows, so the fade only appears when there
  // is something below it to hint at.
  const [overflows, setOverflows] = useState(false);

  const dark = theme.mode === "dark";
  const answered = marks.filter((m) => m.answered).length;
  const flagged = marks.filter((m) => m.flagged).length;
  const left = marks.length - answered;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.closeArea} onPress={onClose} accessibilityLabel="Close" />

        <View style={[styles.sheet, { backgroundColor: panelBg, borderColor: theme.border }]}>
          <View style={styles.head}>
            <View style={styles.flex1}>
              {/* Where you are, which is what the sheet is for. The old title
                  named the component, which you knew from having opened it. */}
              <Text style={[styles.title, { color: theme.text }]}>
                Question {currentIndex + 1} of {marks.length}
              </Text>
              <Text style={[styles.subline, { color: theme.muted }]}>
                {answered} answered · {left} left
                {flagged > 0 ? ` · ${flagged} flagged` : ""}
              </Text>
            </View>

            {/* One dismiss. The drag handle that used to sit above this was a
                promise of a gesture no version of this sheet implements. */}
            <Pressable onPress={onClose} hitSlop={12} style={styles.close} accessibilityLabel="Close">
              <MaterialCommunityIcons name="close" size={20} color={theme.muted} />
            </Pressable>
          </View>

          <View style={styles.gridWrap}>
            <ScrollView
              style={styles.gridScroll}
              contentContainerStyle={styles.grid}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={(_, height) => setOverflows(height > MAX_GRID_HEIGHT + 1)}
            >
              {marks.map((mark, index) => {
                const active = index === currentIndex;

                return (
                  <Pressable
                    key={mark.id}
                    onPress={() => {
                      haptics.tap();
                      onJump(index);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={
                      `Question ${index + 1}` +
                      (active ? ", current" : mark.answered ? ", answered" : ", not answered") +
                      (mark.flagged ? ", flagged" : "")
                    }
                    style={[
                      styles.cell,
                      active
                        ? { backgroundColor: color }
                        : mark.answered
                          ? { backgroundColor: withAlpha(color, dark ? 0.22 : 0.12) }
                          : { backgroundColor: withAlpha(theme.text, dark ? 0.06 : 0.04) },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cellNum,
                        { color: active ? theme.onAccent : mark.answered ? color : theme.muted },
                      ]}
                    >
                      {index + 1}
                    </Text>

                    {/* Red, matching the flag toggle in the question screen's
                        own toolbar — the control that put the flag here. It
                        was amber first, which disappeared against Exam, whose
                        accent is the brand orange. */}
                    {mark.flagged ? (
                      <View
                        style={[
                          styles.flagDot,
                          { backgroundColor: theme.error, borderColor: panelBg },
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Bands rather than a gradient: expo-linear-gradient is not a
                dependency here, and this is the same ramp the course header
                already fades with. */}
            {overflows ? (
              <View pointerEvents="none" style={styles.fade}>
                {FADE_STEPS.map((step, i) => (
                  <View key={i} style={[styles.fadeBand, { backgroundColor: withAlpha(panelBg, step) }]} />
                ))}
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(7,16,31,0.45)" },
  closeArea: { flex: 1 },
  flex1: { flex: 1, minWidth: 0 },

  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: 34,
  },
  head: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  title: { ...typeScale.title, fontSize: 19 },
  subline: { ...typeScale.caption, fontWeight: weight.regular, letterSpacing: 0, marginTop: 3 },
  close: { width: 28, height: 28, alignItems: "flex-end", justifyContent: "center" },

  gridWrap: { marginTop: spacing.xl },
  gridScroll: { maxHeight: MAX_GRID_HEIGHT },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: GAP },
  cell: {
    width: CELL,
    height: CELL,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  cellNum: { ...typeScale.body, fontWeight: weight.semi, letterSpacing: 0 },
  flagDot: {
    position: "absolute",
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },

  fade: { position: "absolute", left: 0, right: 0, bottom: 0, height: FADE_HEIGHT, flexDirection: "column" },
  fadeBand: { flex: 1 },
});
