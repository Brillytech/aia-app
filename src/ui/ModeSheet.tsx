import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { haptics } from "./haptics";
import { elevation, radius, spacing, type as typeScale, weight, withAlpha } from "./tokens";

/**
 * Choosing how to study a topic.
 *
 * Tapping a topic used to jump straight into Questions — `openTopic` forced
 * the tab — so two of the three ways to study a topic were reachable only by
 * noticing a pill row above the content. The choice is explicit now.
 *
 * TWO CONTAINERS, ONE SET OF CARDS
 * --------------------------------
 * On a phone the cards live in a bottom sheet over the topic list. On desktop
 * a bottom sheet over a two-pane layout reads as a phone pattern borrowed
 * badly, so the same cards render as a row where the tab pills used to be —
 * which also makes them the mode switcher there, marking the active one.
 *
 * The phone has no such row, so it gets a pill under the mode title that
 * reopens this sheet. Without it, switching from Questions to Materials means
 * going back to the topic list first, and the back destination is not obvious
 * mid-question.
 */

export type StudyMode = "materials" | "questions" | "cards";

export type ModeOption = {
  key: StudyMode;
  title: string;
  description: string;
  icon: IconName;
  /** The category hue this mode already owns in the topic header's stat row. */
  color: string;
  /** A notch on the card's top border. One card at most. */
  badge?: string;
};

function ModeCard({
  theme,
  option,
  index,
  isActive,
  row,
  animate,
  onPick,
}: {
  theme: Theme;
  option: ModeOption;
  index: number;
  isActive: boolean;
  row: boolean;
  /** Only the panel's cards enter. The desktop row is a persistent
   *  switcher; re-animating it on every mode change would be noise. */
  animate: boolean;
  onPick: (mode: StudyMode) => void;
}) {
  const reduce = useReducedMotion();
  const enter = useSharedValue(animate && !reduce ? 0 : 1);
  const [picked, setPicked] = useState(false);
  const lift = useSharedValue(0);
  const handoff = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The pick is deliberately late, so it can outlive the card if the sheet
  // closes another way in the meantime.
  useEffect(
    () => () => {
      if (handoff.current) clearTimeout(handoff.current);
    },
    [],
  );

  // Driven from state through an effect rather than written straight from
  // the press handler: React treats a shared value as immutable outside one.
  useEffect(() => {
    lift.value = withTiming(picked ? 1 : 0, { duration: LIFT_IN });
  }, [picked, lift]);

  useEffect(() => {
    if (!animate || reduce) {
      enter.value = 1;
      return;
    }

    // Each card follows the one before it, so they arrive as a sequence
    // rather than as a block that happens to be moving.
    enter.value = withDelay(index * STAGGER, withSpring(1, CARD));
  }, [animate, reduce, index, enter]);

  // Entrance and lift share one transform: they can overlap, and two
  // animated styles both writing `transform` would fight over it.
  //
  // No opacity. The card slides and nothing else — it is opaque against an
  // opaque panel the whole way, and the Modal is already fading the lot in.
  const cardStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: (1 - enter.value) * CARD_RISE - lift.value * LIFT_RISE },
      { scale: 1 + lift.value * LIFT_SCALE },
    ],
  }));

  const liftStyle = useAnimatedStyle(() => ({ opacity: lift.value }));

  function choose() {
    haptics.select();

    if (reduce) {
      onPick(option.key);
      return;
    }

    setPicked(true);
    handoff.current = setTimeout(() => onPick(option.key), LIFT_HOLD);
  }

  return (
    <Animated.View style={[row ? styles.rowItem : styles.stackItem, cardStyle]}>
      {/* The shadow is its own layer rather than a style on the card, because
          a shadow that fades has to fade something — react-native-web resolves
          shadow* into a boxShadow string, which is not a value an animation
          can drive. A layer's opacity is. Its background matches the panel it
          sits on, so only the shadow it casts is visible. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.lift,
          { backgroundColor: theme.card, ...elevation(3, theme.shadow) },
          liftStyle,
        ]}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={`${option.title}. ${option.description}`}
        onPress={choose}
        style={({ hovered }: any) => [
          styles.card,
          row ? styles.cardRow : styles.cardStack,
          { borderColor: isActive ? theme.accent : theme.border },
          isActive ? styles.cardActive : null,
          hovered && !isActive ? { backgroundColor: withAlpha(theme.text, 0.03) } : null,
        ]}
      >
        {/* Straddles the card's top border, at the leading edge. It began
            tucked inside a corner, where it read as a small side tag and was
            easy to miss entirely — a recommendation nobody sees is not a
            recommendation. Sitting on the border is what makes it belong to
            this card rather than float above it. */}
        {option.badge && !isActive ? (
          <View style={styles.badgeSlot} pointerEvents="none">
            <View style={[styles.badge, { backgroundColor: theme.text }]}>
              <Text style={[styles.badgeText, { color: theme.bg }]}>{option.badge}</Text>
            </View>
          </View>
        ) : null}

        {/* Bare, not in a tinted disc. The icon simply is the colour, which
            is the rule everywhere else on this screen — and per-mode colour,
            not one monochrome tint, because the hue is what identifies the
            mode at a glance.

            The slot is a fixed width so all three titles start on the same
            line regardless of how wide each glyph draws. */}
        <View style={row ? undefined : styles.iconSlot}>
          <MaterialCommunityIcons
            name={option.icon}
            size={row ? 28 : 34}
            color={option.color}
          />
        </View>

        <View style={styles.text}>
          <Text style={[row ? styles.titleRow : styles.title, { color: theme.text }]}>
            {option.title}
          </Text>
          <Text style={[styles.description, { color: theme.muted }]}>
            {option.description}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ModeOptions({
  theme,
  options,
  active,
  layout,
  animate = false,
  onPick,
}: {
  theme: Theme;
  options: ModeOption[];
  /** Marks the current mode. Only the row layout uses it — the panel is a
   *  chooser, and nothing is chosen while it is open. */
  active?: StudyMode | null;
  layout: "stack" | "row";
  animate?: boolean;
  onPick: (mode: StudyMode) => void;
}) {
  const row = layout === "row";

  return (
    <View style={row ? styles.row : undefined}>
      {options.map((option, index) => (
        <ModeCard
          key={option.key}
          theme={theme}
          option={option}
          index={index}
          isActive={row && active === option.key}
          row={row}
          animate={animate}
          onPick={onPick}
        />
      ))}
    </View>
  );
}
export function ModeSheet({
  theme,
  visible,
  topicTitle,
  courseCode,
  options,
  onPick,
  onClose,
}: {
  theme: Theme;
  visible: boolean;
  topicTitle?: string | null;
  /** Course code, as the line above the topic. Falls back to "Topic". */
  courseCode?: string | null;
  options: ModeOption[];
  onPick: (mode: StudyMode) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const enter = useSharedValue(0);

  useEffect(() => {
    // On the way IN only.
    //
    // Resetting this when `visible` went false snapped the panel from fully
    // opaque to fully gone in a single frame, while the Modal behind it was
    // still fading its scrim out for another 280ms. Traced frame by frame:
    // the white sheet vanished at +174ms and left the page sitting under a
    // 40% dark wash until +458ms. That hard cut to a darkened page was the
    // flash. Left alone, the panel fades out with the scrim as one piece.
    if (!visible) return;

    enter.value = 0;
    enter.value = reduce ? 1 : withSpring(1, PANEL);
  }, [visible, reduce, enter]);

  // Position only. The Modal already fades the whole composition in and out;
  // a second fade here, and a third on each card, multiplied into a flicker
  // rather than adding up to a softer arrival.
  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - enter.value) * PANEL_RISE }],
  }));

  return (
    <Modal
      visible={visible}
      transparent
      // Not "slide": the panel and its cards do the motion themselves, and
      // the platform sliding the whole thing up underneath a staggered
      // entrance masks exactly the part worth seeing.
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.scrimWrap, { backgroundColor: withAlpha(theme.text, 0.4) }]}>
        {/* Dimming above the card, and nothing else anywhere. The card runs
            edge to edge and down to the bottom of the screen, so there are no
            side or bottom strips for the page to show through — which is what
            the stray cream was every time it appeared. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          style={styles.scrimTop}
        />

        <Animated.View
          style={[
            styles.panel,
            panelStyle,
            {
              // Opaque. Translucency let the cream page through at the edges,
              // and no amount of blur hides that — one clean white surface is
              // the whole point.
              backgroundColor: theme.card,
              // Bottom padding rather than a bottom margin: the card reaches
              // the screen edge and the tab bar sits over this space.
              paddingBottom: insets.bottom + TAB_BAR_CLEARANCE,
            },
          ]}
        >
          <View style={styles.head}>
            {/* The topic was a 10px uppercase kicker, which is how you label
                something, not how you name it. It is the answer to "which
                topic am I choosing for", so it gets read as a title. */}
            <View style={styles.text}>
              <Text style={[styles.kicker, { color: theme.muted }]} numberOfLines={1}>
                {courseCode || "Topic"}
              </Text>

              {topicTitle ? (
                <Text style={[styles.topic, { color: theme.text }]} numberOfLines={2}>
                  {topicTitle}
                </Text>
              ) : null}
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={8}
              style={[styles.close, { backgroundColor: theme.soft }]}
            >
              <MaterialCommunityIcons name="close" size={18} color={theme.muted} />
            </Pressable>
          </View>

          {/* No scroller. Every option is visible at once or the chooser is
              not doing its job — the card heights below are set so three fit
              an iPhone SE with the page still showing above. */}
          <ModeOptions
            theme={theme}
            options={options}
            layout="stack"
            animate
            onPick={onPick}
          />
        </Animated.View>
      </View>    </Modal>
  );
}

/**
 * The phone's mode switcher: which mode you are in, and one tap back to
 * the chooser.
 *
 * Desktop does not need it — its cards sit where the tab row was and stay
 * put. A phone has nowhere to keep them, and without this, changing from
 * Questions to Materials means backing out to the topic list and finding
 * the row again, from a screen where the back destination is not obvious.
 */
/**
 * The line between the masthead and the content.
 *
 * It says which of the three modes is showing and how much of it there is,
 * and it is the only place that count appears once the chooser has closed.
 * It was a free-floating title with a pill beside it; as a rule it does the
 * same job and also separates the header from what it heads.
 */
export function ModeBar({
  theme,
  title,
  icon,
  color,
  count,
  onSwitch,
}: {
  theme: Theme;
  title: string;
  icon: IconName;
  /** The mode's own hue, on the glyph and nowhere else. */
  color: string;
  count: number;
  /**
   * Omitted where something else already switches mode — on desktop the
   * three cards are on the page, and a second control for the same thing
   * beside them is noise.
   */
  onSwitch?: () => void;
}) {
  return (
    <View style={[styles.rule, { borderTopColor: theme.border }]}>
      <View style={styles.ruleName}>
        <MaterialCommunityIcons name={icon} size={18} color={color} />
        <Text style={[styles.ruleTitle, { color: theme.text }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.ruleCount, { color: theme.muted }]}>{`· ${count}`}</Text>
      </View>

      {onSwitch ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change how you study this topic"
          onPress={() => {
            haptics.tap();
            onSwitch();
          }}
          style={({ hovered }: any) => [
            styles.switch,
            { borderColor: theme.border },
            hovered ? { backgroundColor: withAlpha(theme.text, 0.04) } : null,
          ]}
        >
          <MaterialCommunityIcons name="swap-horizontal" size={16} color={theme.muted} />
          <Text style={[styles.switchText, { color: theme.text }]}>Change mode</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * One deceleration, no bounce.
 *
 * These were zeta 0.73 and 0.65 — springs that shoot past their resting
 * place and come back. Measured, the card reached its resting position in
 * 218ms and then spent longer than that wobbling around it; three of those
 * arriving in sequence read as a flicker rather than as arrival.
 *
 * At zeta ~0.9 the overshoot is under 0.2% — a tenth of a pixel on 72px of
 * travel, which is nothing — so what is left is a single glide that eases
 * out. Slightly under-damped rather than exactly critical because a
 * critically damped spring crawls through its last few percent: at zeta 1
 * the same move measured 555ms, and that is past calm into slow.
 */
const PANEL = { mass: 1, damping: 22, stiffness: 150 };
const CARD = { mass: 1, damping: 23, stiffness: 156 };

/**
 * The tap acknowledgement.
 *
 * Picking a mode replaces the whole screen, and the card that was tapped is
 * gone before the eye has confirmed which one it hit. So it lifts first — a
 * shadow fading in under it and two percent of scale — and the screen
 * changes a beat later. Long enough to register, short enough that nobody
 * waits for it.
 */
const LIFT_IN = 110;
// Measured: the shadow is at 99% of full by 124ms, so this is the lift plus
// a breath. Everything after it belongs to react-native-web's Modal, which
// takes a further 300ms to fade itself out.
const LIFT_HOLD = 150;
const LIFT_RISE = 3;
const LIFT_SCALE = 0.02;

/**
 * Enough that the cards arrive one after another rather than as a block,
 * without the third one still moving long after the first has landed.
 */
const STAGGER = 60;

/** How far below its resting place each thing starts. */
const CARD_RISE = 28;
const PANEL_RISE = 44;

/** Enough to clear the floating tab bar and its bottom offset. */
const TAB_BAR_CLEARANCE = 86;

const styles = StyleSheet.create({
  scrimWrap: {
    flex: 1,
    // The dimming lives here, behind everything, so the card’s rounded top
    // corners cut through to scrim rather than to undimmed page. That was the
    // last place a cream sliver survived. Safe now only because the card is
    // opaque — while it was glass, a scrim behind it was what the blur
    // frosted, and the card came out grey.
    // The card sits on the bottom edge and takes only the height its cards
    // need, so the page stays visible above it.
    justifyContent: "flex-end",
  },
  scrimTop: {
    flex: 1,
  },
  panel: {
    // Full width, top corners only. Side margins meant side strips, and every
    // strip was somewhere the page showed through.
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
    marginBottom: spacing.xxl,
  },
  kicker: {
    ...typeScale.kicker,
    textTransform: "uppercase",
  },
  topic: {
    ...typeScale.title,
    marginTop: spacing.xs,
  },
  close: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    flexGrow: 0,
    flexShrink: 0,
  },

  rule: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
    marginTop: spacing.xl,
    marginBottom: spacing.lg,
  },
  ruleName: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexShrink: 1,
    minWidth: 0,
  },
  ruleTitle: {
    ...typeScale.section,
    flexShrink: 1,
  },
  ruleCount: {
    ...typeScale.caption,
    letterSpacing: 0,
    flexGrow: 0,
    flexShrink: 0,
  },
  switch: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    maxWidth: "100%",
  },
  switchText: {
    ...typeScale.caption,
    letterSpacing: 0,
    flexShrink: 1,
  },
  row: {
    flexDirection: "row",
    gap: spacing.md,
  },
  card: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.xl,
  },
  cardStack: {
    gap: spacing.lg,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    // Measured against an iPhone SE: three of these plus the head, the
    // gaps and the tab-bar clearance leave about 70pt of page above. Any
    // taller and the third card needs a scroller to reach.
    minHeight: 124,
  },
  /**
   * The gap belongs to the wrapper, not the card: the lift's shadow layer
   * fills the wrapper, and a margin on the card would leave 24pt of shadow
   * hanging below every card.
   *
   * Wide enough that the next card's badge sits in clear air — at 16 the
   * badge straddled its own top border and touched the card above.
   */
  stackItem: {
    marginBottom: spacing.xxl,
  },
  /** Matches the flex on cardRow, which the wrapper would otherwise eat. */
  rowItem: {
    flex: 1,
    minWidth: 0,
  },
  lift: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.xl,
  },
  /** Fixed, so every title starts on the same line whatever the glyph. */
  iconSlot: {
    width: 44,
    alignItems: "center",
    flexGrow: 0,
    flexShrink: 0,
  },

  cardRow: {
    flex: 1,
    minWidth: 0,
    gap: spacing.md,
    padding: spacing.lg,
  },
  cardActive: {
    // Real width, not a colour swap: a 1px accent line on a hairline border is
    // almost invisible next to two unselected cards.
    borderWidth: 2,
  },
  badgeSlot: {
    position: "absolute",
    top: -13,
    left: 0,
    right: 0,
    // Left, over the corner rather than the middle of the border. There it
    // reads as a tab on the card it labels; centred it read as a caption
    // floating between this card and whatever sits above it.
    alignItems: "flex-start",
    paddingLeft: spacing.xl,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  badgeText: {
    ...typeScale.caption,
    letterSpacing: 0.4,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...typeScale.title,
  },
  titleRow: {
    ...typeScale.bodyLg,
    fontWeight: weight.black,
  },
  description: {
    ...typeScale.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xs,
  },
});
