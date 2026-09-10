// TEMPORARY — verifies the real scoreTopic + TheoryResults against the worked
// example from the proposal (44/60 = 73%). Delete once captured.
import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useThemeMode } from "../theme";
import { marksFor, ratingFraction, scoreTopic, type ScoredItem } from "../theoryScore";
import { TheoryResults, type TheoryResultRow } from "../ui/TheoryResults";

// Exactly the table in the proposal.
const FIXTURE = [
  { id: "t1", kind: "theory", marks: 15, rating: "got" },
  { id: "t2", kind: "theory", marks: 10, rating: "partly" },
  { id: "t3", kind: "theory", marks: 5, rating: "missed" },
  { id: "g1", kind: "grid", marks: 8, cells: [6, 8] },
  { id: "t4", kind: "theory", marks: 5, rating: "got" },
  { id: "g2", kind: "grid", marks: 12, cells: [9, 12] },
  { id: "t5", kind: "theory", marks: 5, rating: "partly" },
] as const;

const LABEL: Record<string, string> = { missed: "Missed it", partly: "Partly", got: "Got it" };

export default function TheoryResultsPreview() {
  const { theme, isDark } = useThemeMode();

  const items: ScoredItem[] = FIXTURE.map((f: any) => ({
    id: f.id,
    marks: f.marks,
    fraction:
      f.kind === "grid" ? f.cells[0] / f.cells[1] : ratingFraction(f.rating),
    source: f.kind === "grid" ? "auto" : "self",
  }));

  const score = scoreTopic(items);

  const rows: TheoryResultRow[] = FIXTURE.map((f: any, i) => {
    const marks = marksFor({ marks: f.marks });
    const fraction = f.kind === "grid" ? f.cells[0] / f.cells[1] : ratingFraction(f.rating);

    return {
      id: f.id,
      number: i + 1,
      marks,
      earned: fraction === null ? 0 : marks * fraction,
      fraction,
      source: f.kind === "grid" ? "auto" : "self",
      detail:
        f.kind === "grid" ? `${f.cells[0]} of ${f.cells[1]} cells` : LABEL[f.rating],
      tone:
        f.kind === "grid"
          ? theme.info
          : f.rating === "got"
            ? theme.success
            : f.rating === "partly"
              ? theme.warning
              : theme.error,
    };
  });

  useEffect(() => {
    // Printed so the capture can assert on numbers rather than pixels.
    console.log(
      "[score]",
      JSON.stringify({
        earned: score.earned,
        possible: score.possible,
        percent: score.percent,
        self: score.self,
        auto: score.auto,
        attempted: score.attempted,
        total: score.total,
      }),
    );
  }, [score]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 60 }}>
        <TheoryResults
          theme={theme}
          dark={isDark}
          score={score}
          rows={rows}
          courseCode="PHS 301"
          courseColor="#8B5CF6"
          topicTitle="Membrane Potentials"
          onReview={() => {}}
        />
      </ScrollView>
    </View>
  );
}
