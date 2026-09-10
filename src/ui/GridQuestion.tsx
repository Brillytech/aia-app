import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { QuestionShell } from "./QuestionShell";
import { RichText } from "./RichText";
import { noFocusRing, radius, shade, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * A fill-in-the-table question.
 *
 * The whole table is shown as the admin built it — headers, every row, every
 * filled cell — and only the cells marked `blank` become inputs. Hiding the
 * filled cells would turn a table into a quiz and lose the thing that makes it
 * a table: the answer is legible from its neighbours.
 *
 * The chrome comes from QuestionShell, shared with the free-text questions:
 * same numeral, same marks in the margin, same place in the sequence.
 *
 * WIDTH, AND THE COLUMN YOU CANNOT SEE
 * ------------------------------------
 * The table scrolls horizontally rather than being restacked into something
 * that is no longer a table. But a column that is off-screen with nothing
 * saying so is worse than a cramped one: the first build of this put the
 * third column past the right edge on a phone, and three of that question's
 * seven blanks were in it. A student would have scored 2/7 having never seen
 * a third of the paper.
 *
 * So two things. MIN_COLUMN is small enough that three columns fit a phone
 * without scrolling at all — tall cells beat invisible ones. And when the
 * table genuinely is wider than its container, it says so, under the table,
 * rather than relying on a scrollbar that web hides until you touch it.
 *
 * The shell clips its own overflow for the turn animation, which is why this
 * scroller has to be inside it rather than wrapping it.
 */

export type GridColumn = { id: string; header: string };
export type GridCell = { content: string; blank: boolean };
export type GridRow = { id: string; cells: GridCell[] };
export type Grid = { version: number; columns: GridColumn[]; rows: GridRow[] };

/** Answers for one grid, keyed by `${rowId}:${columnIndex}`. */
export type GridAnswers = Record<string, string>;

export function cellKey(rowId: string, column: number) {
  return `${rowId}:${column}`;
}

/**
 * The matching rule, exactly as the admin side grades it: trim, collapse
 * internal whitespace, lowercase, then compare for equality. No fuzzy or
 * partial matching — a near miss is a miss, and the student sees the expected
 * value so they can judge it themselves.
 */
export function normalizeAnswer(value: string) {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

export function isCellCorrect(typed: string | undefined, expected: string) {
  return normalizeAnswer(typed || "") === normalizeAnswer(expected);
}

/** Every blank in the grid, in reading order. */
export function blanksOf(grid: Grid) {
  const out: { key: string; expected: string }[] = [];

  for (const row of grid.rows || []) {
    (row.cells || []).forEach((cell, column) => {
      if (cell?.blank) out.push({ key: cellKey(row.id, column), expected: cell.content ?? "" });
    });
  }

  return out;
}

/** How many blanks the student got right, and how many there were. */
export function gradeGrid(grid: Grid, answers: GridAnswers) {
  const blanks = blanksOf(grid);
  const correct = blanks.filter((blank) => isCellCorrect(answers[blank.key], blank.expected)).length;

  return { correct, total: blanks.length };
}

/**
 * True for a grid this component knows how to draw.
 *
 * Checked rather than assumed: the column is jsonb, the shape is versioned,
 * and a row written by a future admin build should say so plainly instead of
 * crashing a student's screen.
 */
export function isSupportedGrid(grid: any): grid is Grid {
  return Boolean(
    grid &&
      grid.version === 1 &&
      Array.isArray(grid.columns) &&
      Array.isArray(grid.rows),
  );
}

/**
 * The narrowest a column may get before the table starts scrolling instead.
 *
 * A minimum ALONE does not work here, which measuring proved: inside a
 * horizontal ScrollView there is no width to lay out against, so a cell with
 * flex 1 and minWidth 104 grew to whatever its longest line needed. Measured:
 * 180pt per column, a 542pt table inside a 348pt viewport, third column
 * off-screen. Nothing wrapped because nothing was ever constrained.
 *
 * So the width is computed from the measured viewport instead: share it out
 * evenly while every column can still hold this much, and fall back to
 * scrolling only when it cannot.
 */
const MIN_COLUMN = 104;

export function GridQuestion({
  theme,
  grid,
  promptHtml,
  promptText,
  marks,
  difficulty,
  index,
  total,
  segments,
  direction,
  answers,
  checked,
  onAnswer,
  onCheck,
  onPrev,
  onNext,
  onFinish,
}: {
  theme: Theme;
  grid: any;
  promptHtml: string | null;
  promptText: string | null;
  marks: number | null;
  difficulty: string | null;
  index: number;
  total: number;
  segments: (string | null)[];
  direction: "next" | "prev" | null;
  answers: GridAnswers;
  checked: boolean;
  onAnswer: (key: string, value: string) => void;
  onCheck: () => void;
  onPrev: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const dark = theme.mode === "dark";

  // A grid with no prompt has nothing to typeset, so it is ready immediately;
  // one with a prompt waits for RichText the same way a theory stem does.
  const [promptReady, setPromptReady] = useState(!promptHtml);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const onPromptReady = useCallback(() => setPromptReady(true), []);
  // A pixel of slack: sub-pixel layout rounding otherwise reports a table
  // that exactly fits as overflowing, and the hint would never go away.
  const overflows = contentWidth > viewportWidth + 1;

  const supported = isSupportedGrid(grid);
  const score = supported ? gradeGrid(grid, answers) : { correct: 0, total: 0 };

  // Floored, so rounding can never push the sum a pixel past the viewport and
  // turn an exact fit into a scroll. Before onLayout reports a width the
  // columns take the minimum for one frame, then settle.
  const columnCount = supported ? Math.max(1, grid.columns.length) : 1;
  // The table draws its own hairline on both sides, so the columns get the
  // viewport minus that. Measured without it: 3 x 116 = 348 columns inside a
  // 348 viewport still reported a 350 table, and the scroll hint never went
  // away on a table that visually fitted.
  const columnWidth =
    viewportWidth > 0
      ? Math.max(
          MIN_COLUMN,
          Math.floor((viewportWidth - 2 * StyleSheet.hairlineWidth) / columnCount),
        )
      : MIN_COLUMN;

  return (
    <QuestionShell
      theme={theme}
      index={index}
      total={total}
      segments={segments}
      marks={marks}
      difficulty={difficulty}
      direction={direction}
      ready={promptReady}
      onPrev={onPrev}
      onNext={onNext}
      onFinish={onFinish}
    >
      {promptHtml || promptText ? (
        <RichText
          theme={theme}
          html={promptHtml}
          text={promptText}
          size={16}
          onReady={onPromptReady}
        />
      ) : null}

      {!supported ? (
        <View style={[styles.unsupported, { borderColor: theme.border }]}>
          <MaterialCommunityIcons name="table-off" size={18} color={theme.muted} />
          <Text style={[styles.unsupportedText, { color: theme.muted }]}>
            This table was saved in a newer format than this app can display yet.
          </Text>
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
          onContentSizeChange={(width) => setContentWidth(width)}
          contentContainerStyle={styles.tableScroll}
        >
          <View style={[styles.table, { borderColor: theme.border }]}>
            <View style={[styles.headerRow, { backgroundColor: theme.soft }]}>
              {grid.columns.map((column: GridColumn) => (
                <View key={column.id} style={[styles.cell, { width: columnWidth }]}>
                  <Text style={[styles.headerText, { color: theme.text }]}>
                    {column.header}
                  </Text>
                </View>
              ))}
            </View>

            {grid.rows.map((row: GridRow, rowIndex: number) => (
              <View
                key={row.id}
                style={[
                  styles.row,
                  rowIndex > 0 ? { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth } : null,
                ]}
              >
                {grid.columns.map((column: GridColumn, columnIndex: number) => {
                  const cell = row.cells?.[columnIndex];
                  const key = cellKey(row.id, columnIndex);

                  if (!cell?.blank) {
                    return (
                      <View key={column.id} style={[styles.cell, { width: columnWidth }]}>
                        <Text style={[styles.cellText, { color: theme.text }]}>
                          {cell?.content ?? ""}
                        </Text>
                      </View>
                    );
                  }

                  const typed = answers[key] || "";
                  const correct = isCellCorrect(typed, cell.content);
                  const tone = correct ? theme.success : theme.error;

                  return (
                    <View key={column.id} style={[styles.cell, { width: columnWidth }]}>
                      {checked ? (
                        // Not a disabled TextInput. A single-line input scrolls
                        // while you type, which is fine, but once it is read-only
                        // it clips: "Temporal fossa" reviewed as "TEMPORAI". The
                        // answer has to be legible at the moment you are being
                        // shown whether it was right.
                        <View
                          style={[
                            styles.box,
                            {
                              borderColor: tone,
                              backgroundColor: withAlpha(tone, dark ? 0.2 : 0.1),
                            },
                          ]}
                        >
                          <Text style={[styles.boxText, { color: theme.text }]}>
                            {typed.trim() || "—"}
                          </Text>
                        </View>
                      ) : (
                        <TextInput
                          value={typed}
                          onChangeText={(next) => onAnswer(key, next)}
                          placeholder="—"
                          placeholderTextColor={theme.muted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={[
                            styles.box,
                            styles.boxText,
                            noFocusRing,
                            { color: theme.text, borderColor: theme.border },
                          ]}
                        />
                      )}

                      {/* Only once checked, and only where it is wrong: the
                          expected value is the whole point of checking, and
                          showing it beside a correct answer is noise. */}
                      {checked && !correct ? (
                        <Text
                          style={[
                            styles.expected,
                            { color: dark ? shade(theme.success, 0.35) : shade(theme.success, -0.45) },
                          ]}
                        >
                          {cell.content}
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {supported && overflows ? (
        <View style={styles.overflowHint}>
          <MaterialCommunityIcons name="gesture-swipe-horizontal" size={15} color={theme.muted} />
          <Text style={[styles.overflowHintText, { color: theme.muted }]}>
            Scroll the table sideways — {grid.columns.length} columns
          </Text>
        </View>
      ) : null}

      {supported && !checked ? (
        // Outlined, matching the theory reveal. Checking ends the exercise, so
        // it should not be the loudest thing on the screen.
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            haptics.tap();
            onCheck();
          }}
          style={({ hovered }: any) => [
            styles.action,
            { borderColor: theme.border },
            hovered ? { backgroundColor: withAlpha(theme.text, 0.04) } : null,
          ]}
        >
          <Text style={[styles.actionText, { color: theme.text }]}>Check answers</Text>
          <MaterialCommunityIcons name="check-all" size={20} color={theme.muted} />
        </Pressable>
      ) : null}

      {supported && checked ? (
        <View style={styles.scoreRow}>
          <MaterialCommunityIcons
            name={score.correct === score.total ? "check-circle" : "information-outline"}
            size={18}
            color={score.correct === score.total ? theme.success : theme.muted}
          />
          <Text style={[styles.scoreText, { color: theme.text }]}>
            {score.correct} of {score.total} {score.total === 1 ? "blank" : "blanks"} correct
          </Text>
        </View>
      ) : null}
    </QuestionShell>
  );
}

const styles = StyleSheet.create({
  tableScroll: {
    // A table narrower than the screen should still start at the gutter.
    flexGrow: 1,
  },
  table: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    overflow: "hidden",
    flexGrow: 1,
  },
  headerRow: {
    flexDirection: "row",
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    // Width comes from the caller — see columnWidth. Neither flex nor
    // minWidth can supply it: there is nothing to flex against inside a
    // horizontal scroller.
    padding: spacing.md,
    gap: spacing.xs,
  },
  headerText: {
    ...typeScale.micro,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cellText: {
    ...typeScale.body,
    fontWeight: weight.regular,
  },
  /** The box both the input and its checked, read-only twin sit in. */
  box: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    minHeight: 40,
    justifyContent: "center",
  },
  boxText: {
    ...typeScale.body,
    fontWeight: weight.regular,
  },
  expected: {
    ...typeScale.micro,
    letterSpacing: 0,
  },

  action: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  actionText: {
    ...typeScale.bodyLg,
    fontWeight: weight.bold,
  },
  overflowHint: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: -spacing.sm,
  },
  overflowHintText: {
    ...typeScale.micro,
    letterSpacing: 0.2,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  scoreText: {
    ...typeScale.bodyLg,
    fontWeight: weight.bold,
  },
  unsupported: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
  },
  unsupportedText: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    flex: 1,
    minWidth: 0,
  },
});
