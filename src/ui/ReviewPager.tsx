import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { layout, radius, spacing, type, weight, withAlpha } from "./tokens";

const { width } = Dimensions.get("window");

export type ReviewOption = { key: string; text: string };

/**
 * Turns the flat `option_a … option_e` columns both screens store into the
 * list this component renders, dropping the ones a question does not use.
 */
export function buildReviewOptions(question: {
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  option_e?: string | null;
}): ReviewOption[] {
  return (
    [
      ["A", question.option_a],
      ["B", question.option_b],
      ["C", question.option_c],
      ["D", question.option_d],
      ["E", question.option_e],
    ] as const
  )
    .filter(([, text]) => Boolean(text && String(text).trim()))
    .map(([key, text]) => ({ key, text: String(text) }));
}

export type ReviewItem = {
  id: string;
  question: string;
  topic?: string | null;
  options: ReviewOption[];
  /** Upper-case letter of the right answer. */
  correctKey: string;
  /** What the student picked, if anything. */
  chosenKey?: string | null;
  explanation?: string | null;
  /** Practice only — the self-rating captured during the session. */
  confidence?: string | null;
};

/**
 * Answer review, one question per screen.
 *
 * Both review screens used to be a single long scroll of bordered cards — one
 * per question, each restating "Your answer: B / Correct: C" as a label-value
 * table. Two problems with that. A card is a container for something you might
 * skip past, but here every question *is* the content, so the card was
 * decoration around the only thing on screen. And the answers were named by
 * letter, which means reading "you picked B" then hunting back up the question
 * to remember what B said.
 *
 * This shows the options themselves, marked in place: the right one filled
 * green, a wrong pick struck through in red. You see what you chose and what
 * was right without decoding letters. One question fills the screen, you swipe
 * between them, and the rail at the top doubles as a score overview and a jump
 * control — the thing a long scroll could never give you.
 */
export function ReviewPager({
  theme,
  title,
  items,
  onExit,
}: {
  theme: Theme;
  title: string;
  items: ReviewItem[];
  onExit: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [wrongOnly, setWrongOnly] = useState(false);

  const listRef = useRef<FlatList<ReviewItem>>(null);
  const railRef = useRef<ScrollView>(null);

  const visible = useMemo(
    () =>
      wrongOnly
        ? items.filter((item) => item.chosenKey !== item.correctKey)
        : items,
    [items, wrongOnly],
  );

  const wrongCount = useMemo(
    () => items.filter((item) => item.chosenKey !== item.correctKey).length,
    [items],
  );

  const safeIndex = Math.min(index, Math.max(0, visible.length - 1));
  const current = visible[safeIndex];

  // Keeps the active pill in view as you swipe. Centring rather than merely
  // revealing, so you can always see the questions either side of where you
  // are — the rail is a map, not just an indicator.
  useEffect(() => {
    railRef.current?.scrollTo({
      x: Math.max(0, safeIndex * (PILL + spacing.sm) - width / 2 + PILL),
      animated: true,
    });
  }, [safeIndex]);

  function goTo(nextIndex: number) {
    haptics.tap();
    setIndex(nextIndex);
    listRef.current?.scrollToIndex({ index: nextIndex, animated: true });
  }

  function toggleFilter() {
    haptics.tap();
    setWrongOnly((prev) => !prev);
    setIndex(0);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <View style={styles.bar}>
        <Pressable
          onPress={() => {
            haptics.tap();
            onExit();
          }}
          hitSlop={12}
          style={styles.back}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text} />
        </Pressable>

        <View style={styles.barCenter}>
          <Text style={[styles.barTitle, { color: theme.text }]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.barCount, { color: theme.muted }]}>
            {visible.length > 0 ? `${safeIndex + 1} of ${visible.length}` : "Nothing to review"}
          </Text>
        </View>

        {/* Jumping straight to what you got wrong is the reason most people
            open this screen at all. */}
        {wrongCount > 0 ? (
          <Pressable
            onPress={toggleFilter}
            hitSlop={10}
            style={[
              styles.filter,
              {
                backgroundColor: wrongOnly
                  ? withAlpha(theme.error, theme.mode === "dark" ? 0.28 : 0.14)
                  : "transparent",
                borderColor: wrongOnly ? "transparent" : theme.border,
              },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                { color: wrongOnly ? theme.error : theme.muted },
              ]}
            >
              {wrongOnly ? `${wrongCount} wrong` : "Wrong"}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.back} />
        )}
      </View>

      {/* Every question at a glance, green or red, and tappable. */}
      <ScrollView
        ref={railRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {visible.map((item, i) => {
          const right = item.chosenKey === item.correctKey;
          const active = i === safeIndex;
          const tone = right ? theme.success : theme.error;

          return (
            <Pressable
              key={item.id}
              onPress={() => goTo(i)}
              style={[
                styles.pill,
                {
                  backgroundColor: active
                    ? tone
                    : withAlpha(tone, theme.mode === "dark" ? 0.24 : 0.14),
                },
              ]}
            >
              <Text
                style={[
                  styles.pillText,
                  { color: active ? theme.onAccent : tone },
                ]}
              >
                {i + 1}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <MaterialCommunityIcons
            name="check-circle-outline"
            size={40}
            color={theme.success}
          />
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Nothing wrong to review.
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={visible}
          keyExtractor={(item) => item.id}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          // Fixed page width, so the list never has to measure to know where a
          // page starts — scrollToIndex from the rail is exact.
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(event) => {
            const next = Math.round(event.nativeEvent.contentOffset.x / width);
            if (next !== safeIndex) setIndex(next);
          }}
          renderItem={({ item }) => <ReviewPage theme={theme} item={item} />}
        />
      )}

      {current ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <NavButton
            theme={theme}
            icon="chevron-left"
            label="Previous"
            disabled={safeIndex === 0}
            onPress={() => goTo(safeIndex - 1)}
          />
          <NavButton
            theme={theme}
            icon="chevron-right"
            label="Next"
            disabled={safeIndex >= visible.length - 1}
            onPress={() => goTo(safeIndex + 1)}
          />
        </View>
      ) : null}
    </View>
  );
}

function ReviewPage({ theme, item }: { theme: Theme; item: ReviewItem }) {
  const dark = theme.mode === "dark";
  const answered = Boolean(item.chosenKey);
  const right = item.chosenKey === item.correctKey;

  return (
    <ScrollView
      style={{ width }}
      contentContainerStyle={styles.page}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageHead}>
        <Text
          style={[
            styles.verdict,
            { color: right ? theme.success : theme.error },
          ]}
        >
          {right ? "Correct" : answered ? "Incorrect" : "Not answered"}
        </Text>

        {item.topic ? (
          <Text style={[styles.topic, { color: theme.muted }]} numberOfLines={1}>
            {item.topic}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.question, { color: theme.text }]}>{item.question}</Text>

      {/* The options themselves, marked in place. This is the whole point —
          "Your answer: B" made you scroll back up to find out what B was. */}
      <View style={styles.options}>
        {item.options.map((option) => {
          const isCorrect = option.key === item.correctKey;
          const isChosen = option.key === item.chosenKey;
          const isWrongPick = isChosen && !isCorrect;
          const tone = isCorrect ? theme.success : theme.error;
          const marked = isCorrect || isWrongPick;

          return (
            <View
              key={option.key}
              style={[
                styles.option,
                {
                  backgroundColor: marked
                    ? withAlpha(tone, dark ? 0.16 : 0.09)
                    : theme.card,
                  borderColor: marked ? withAlpha(tone, 0.5) : theme.border,
                },
              ]}
            >
              <View
                style={[
                  styles.optionKey,
                  {
                    backgroundColor: marked ? tone : withAlpha(theme.text, dark ? 0.12 : 0.07),
                  },
                ]}
              >
                {marked ? (
                  <MaterialCommunityIcons
                    name={isCorrect ? "check" : "close"}
                    size={14}
                    color={theme.onAccent}
                  />
                ) : (
                  <Text style={[styles.optionKeyText, { color: theme.muted }]}>
                    {option.key}
                  </Text>
                )}
              </View>

              <Text
                style={[
                  styles.optionText,
                  {
                    color: marked ? theme.text : theme.muted,
                    // Striking the wrong pick says "you chose this and it was
                    // not it" in a way no label-value row can.
                    textDecorationLine: isWrongPick ? "line-through" : "none",
                  },
                ]}
              >
                {option.text}
              </Text>

              {isChosen ? (
                <Text style={[styles.yours, { color: tone }]}>Yours</Text>
              ) : null}
            </View>
          );
        })}
      </View>

      {item.explanation ? (
        <View style={[styles.explain, { backgroundColor: theme.cardSoft }]}>
          <View style={styles.explainHead}>
            <MaterialCommunityIcons
              name="lightbulb-on-outline"
              size={15}
              color={theme.accent}
            />
            <Text style={[styles.explainTitle, { color: theme.accent }]}>Why</Text>
          </View>
          <Text style={[styles.explainText, { color: theme.text }]}>
            {item.explanation}
          </Text>
        </View>
      ) : null}

      {item.confidence ? (
        <Text style={[styles.confidence, { color: theme.muted2 }]}>
          You rated your confidence {item.confidence}
        </Text>
      ) : null}
    </ScrollView>
  );
}

function NavButton({
  theme,
  icon,
  label,
  disabled,
  onPress,
}: {
  theme: Theme;
  icon: "chevron-left" | "chevron-right";
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.nav,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          opacity: disabled ? 0.4 : 1,
        },
      ]}
    >
      {icon === "chevron-left" ? (
        <MaterialCommunityIcons name={icon} size={20} color={theme.text} />
      ) : null}
      <Text style={[styles.navText, { color: theme.text }]}>{label}</Text>
      {icon === "chevron-right" ? (
        <MaterialCommunityIcons name={icon} size={20} color={theme.text} />
      ) : null}
    </Pressable>
  );
}

const PILL = 34;

const styles = StyleSheet.create({
  root: { flex: 1 },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: layout.screenGutter,
    height: 48,
  },
  back: {
    width: 32,
    alignItems: "flex-start",
    justifyContent: "center",
  },
  barCenter: {
    flex: 1,
    alignItems: "center",
  },
  barTitle: {
    ...type.body,
    fontWeight: weight.black,
  },
  barCount: {
    ...type.micro,
    fontWeight: weight.medium,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  filter: {
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  filterText: {
    ...type.micro,
    letterSpacing: 0.3,
  },
  rail: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.md,
  },
  pill: {
    width: PILL,
    height: PILL,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  pillText: {
    ...type.caption,
    letterSpacing: 0,
  },
  page: {
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxxl,
  },
  pageHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  verdict: {
    ...type.micro,
    letterSpacing: 1,
  },
  topic: {
    ...type.micro,
    fontWeight: weight.medium,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
  question: {
    ...type.section,
    marginBottom: spacing.xl,
  },
  options: {
    gap: spacing.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  optionKey: {
    width: 26,
    height: 26,
    borderRadius: radius.xs,
    alignItems: "center",
    justifyContent: "center",
  },
  optionKeyText: {
    ...type.caption,
    letterSpacing: 0,
  },
  optionText: {
    ...type.body,
    fontWeight: weight.regular,
    flex: 1,
  },
  yours: {
    ...type.micro,
    letterSpacing: 0.4,
  },
  explain: {
    borderRadius: radius.md,
    padding: spacing.lg,
    marginTop: spacing.xl,
  },
  explainHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  explainTitle: {
    ...type.micro,
    letterSpacing: 0.8,
  },
  explainText: {
    ...type.body,
    fontWeight: weight.regular,
  },
  confidence: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.lg,
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  emptyText: {
    ...type.body,
    fontWeight: weight.regular,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.md,
  },
  nav: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 46,
  },
  navText: {
    ...type.body,
    fontWeight: weight.semi,
  },
});
