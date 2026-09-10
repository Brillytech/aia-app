import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import { formatMarks, type ScoreSource, type TopicScore } from "../theoryScore";
import { haptics } from "./haptics";
import { dividerInset, ListRow, ListSection } from "./List";
import { getGrade, HeadlineRow, HeadlineStat, ScoreHero } from "./Score";
import { radius, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * What a topic's theory questions came to.
 *
 * Built on the exam result's own vocabulary — `ScoreHero`, `HeadlineStat`,
 * `ListRow` — because a student who has finished an exam already knows how to
 * read this shape, and a second scoring layout would be a second thing to
 * learn for no gain.
 *
 * FOUR THINGS IT DOES DIFFERENTLY, ON PURPOSE
 * -------------------------------------------
 * 1. The headline stats are marks, not Correct/Wrong/Time. Theory has no
 *    "wrong" and is not timed, and the self-rated / auto-graded split is worth
 *    showing rather than burying.
 * 2. The percentage carries a qualifier. Part of it is the student's own
 *    rating of themselves; an unqualified number sitting next to the app's
 *    exam scores would read as one, and it is not.
 * 3. The breakdown is per question, not per topic — this whole screen is one
 *    topic already.
 * 4. No share card. `ResultShareCard` takes correct/wrong/time/xp, none of
 *    which map here, and a card advertising a self-graded score is a worse
 *    idea than a missing button.
 */

export type TheoryResultRow = {
  id: string;
  /** 1-based, matching the numeral printed on the question. */
  number: number;
  marks: number;
  earned: number;
  /** 0..1, or null when never attempted. */
  fraction: number | null;
  source: ScoreSource;
  /** "Got it", "Missed it", "6 of 8 cells" — how the fraction was arrived at. */
  detail: string;
  /** Chip colour for `detail`. */
  tone: string;
};

export function TheoryResults({
  theme,
  dark,
  score,
  rows,
  courseCode,
  courseColor,
  topicTitle,
  onReview,
}: {
  theme: Theme;
  dark: boolean;
  score: TopicScore;
  rows: TheoryResultRow[];
  courseCode?: string | null;
  courseColor?: string;
  topicTitle?: string | null;
  onReview: () => void;
}) {
  const grade = getGrade(score.percent);
  const mixed = score.auto.possible > 0 && score.self.possible > 0;

  return (
    <View>
      <ScoreHero
        theme={theme}
        dark={dark}
        eyebrow={courseCode}
        eyebrowColor={courseColor}
        subtitle={topicTitle}
        percent={score.percent}
        label="Topic score"
        grade={grade}
        note={
          score.self.possible > 0 ? (
            <View style={styles.note}>
              <MaterialCommunityIcons
                name="account-check-outline"
                size={14}
                color={theme.muted}
              />
              <Text style={[styles.noteText, { color: theme.muted }]}>
                {mixed
                  ? `Self-assessed in part — ${formatMarks(score.self.possible)} of ${formatMarks(
                      score.possible,
                    )} marks came from your own rating`
                  : "Self-assessed — you rated every question yourself"}
              </Text>
            </View>
          ) : null
        }
      />

      <HeadlineRow>
        <HeadlineStat
          theme={theme}
          label="Marks"
          value={`${formatMarks(score.earned)}/${formatMarks(score.possible)}`}
          color={grade.color}
        />
        <HeadlineStat
          theme={theme}
          label="Self-rated"
          value={`${formatMarks(score.self.earned)}/${formatMarks(score.self.possible)}`}
          color={theme.text}
        />
        {/* Only when there is something auto-graded to report. A "0/0" column
            on a topic with no grid questions is noise. */}
        {score.auto.possible > 0 ? (
          <HeadlineStat
            theme={theme}
            label="Auto-graded"
            value={`${formatMarks(score.auto.earned)}/${formatMarks(score.auto.possible)}`}
            color={theme.info}
          />
        ) : null}
      </HeadlineRow>

      <ListSection theme={theme} title="Summary" inset={dividerInset.none}>
        <ListRow
          theme={theme}
          label="Attempted"
          value={`${score.attempted} of ${score.total}`}
          chevron={false}
        />
        {score.attempted < score.total ? (
          <ListRow
            theme={theme}
            label="Not attempted"
            // Counted into the total, the same way an exam counts unanswered
            // questions — so the percentage does not flatter a half-finished
            // topic.
            secondary="Counted as zero"
            value={String(score.total - score.attempted)}
            chevron={false}
          />
        ) : null}
      </ListSection>

      {rows.length > 0 ? (
        <ListSection theme={theme} title="By question" inset={dividerInset.none} plain>
          {rows.map((row) => (
            <ListRow
              key={row.id}
              theme={theme}
              label={`Question ${row.number}`}
              secondary={`${formatMarks(row.earned)} of ${formatMarks(row.marks)} marks`}
              pill={{ label: row.detail, color: row.tone }}
              progress={row.fraction === null ? 0 : Math.round(row.fraction * 100)}
              chevron={false}
            />
          ))}
        </ListSection>
      ) : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          haptics.tap();
          onReview();
        }}
        style={({ hovered }: any) => [
          styles.review,
          { borderColor: theme.border },
          hovered ? { backgroundColor: withAlpha(theme.text, 0.04) } : null,
        ]}
      >
        <MaterialCommunityIcons name="restart" size={18} color={theme.text} />
        <Text style={[styles.reviewText, { color: theme.text }]}>Review questions</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingHorizontal: spacing.md,
  },
  noteText: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    flex: 1,
    minWidth: 0,
  },
  review: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    height: 48,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: spacing.xl,
  },
  reviewText: {
    ...typeScale.bodyLg,
    fontWeight: weight.bold,
  },
});
