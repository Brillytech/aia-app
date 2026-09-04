import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ReactNode } from "react";
import {
  Pressable,
  ScrollViewProps,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import { useMeasure, type Measure } from "./layout/measure";
import { haptics } from "./haptics";
import { layout, spacing, type, weight } from "./tokens";

/** Nav-bar height, excluding the safe-area inset above it. */
const BAR_HEIGHT = 44;
/** Scroll distance over which the title collapses, then holds. */
const COLLAPSE = 56;
/** Horizontal room reserved for the back button and trailing slot. */
const SLOT = 56;

/**
 * Screen scaffold with a collapsing large title (iOS Settings/Mail pattern).
 *
 * Owns the ScrollView rather than sitting inside one — the bar has to be a
 * fixed sibling of the scroll content for any of this to work, and owning it
 * means every screen inherits the behaviour instead of wiring it up by hand.
 *
 * There are deliberately TWO title nodes, cross-faded, rather than one title
 * animating between sizes:
 *
 *   - the large title lives in the scroll content, so it scrolls away for free
 *   - the compact title lives in the fixed bar, already centred by flexbox
 *
 * Only opacity/translate/scale animate, so there is no per-frame relayout and
 * no width measurement to get the centring right. Animating `fontSize` would
 * relayout the text every frame; faking it with scale + translateX needs a
 * measured width and breaks on long titles and font scaling.
 *
 * The back button is a plain View sibling carrying no animated style at all —
 * it cannot be affected by the title animation.
 */
export function PageHeader({
  theme,
  title,
  onBack,
  right,
  bar,
  intro,
  children,
  contentContainerStyle,
  measure = "full",
  ...scrollProps
}: {
  theme: Theme;
  /** Omit only when passing a custom `bar`. */
  title?: string;
  onBack?: () => void;
  right?: ReactNode;
  /** Replaces the default back+title bar. For screens whose pinned chrome is
   *  live status rather than a location label — see dashboard. */
  bar?: ReactNode;
  /** Replaces the large title in the scroll content, keeping the same
   *  fade-and-shrink on scroll. */
  intro?: ReactNode;
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /**
   * How wide the page content may get on desktop. Constrains the scroll
   * content AND the pinned bar row together, so the back button stays aligned
   * with the content instead of drifting to the far edge of a wide viewport.
   * Defaults to "full", which is a no-op — existing callers are unaffected.
   */
  measure?: Measure;
} & Omit<ScrollViewProps, "contentContainerStyle" | "children" | "ref">) {
  const insets = useSafeAreaInsets();
  const measureStyle = useMeasure(measure);

  // useScrollOffset over useAnimatedScrollHandler: it hands back a shared value
  // directly, so this file performs zero `.value` writes — the pattern that
  // react-hooks/immutability rejects. The ref is passed explicitly because
  // Animated.ScrollView's own `scrollViewOffset` prop branches on
  // `ref === null`, and an unpassed ref in React 19 is undefined, not null.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);

  const largeTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, 38], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(scrollY.value, [0, COLLAPSE], [0, -6], Extrapolation.CLAMP),
      },
      {
        scale: interpolate(scrollY.value, [0, COLLAPSE], [1, 0.92], Extrapolation.CLAMP),
      },
    ],
  }));

  const compactTitleStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [26, 52], [0, 1], Extrapolation.CLAMP),
    transform: [
      { translateY: interpolate(scrollY.value, [26, 52], [8, 0], Extrapolation.CLAMP) },
    ],
  }));

  // Transparent at rest so the page reads as one surface; opaque once
  // collapsed so content cannot show through behind the compact title.
  const barBackgroundStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [30, COLLAPSE], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <View style={styles.root}>
      <View style={[styles.bar, { height: insets.top + BAR_HEIGHT, paddingTop: insets.top }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.barBackground,
            { backgroundColor: theme.bg, borderBottomColor: theme.border },
            barBackgroundStyle,
          ]}
        />

        {bar ? null : (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.compactTitleWrap, { top: insets.top }, compactTitleStyle]}
          >
            <Text numberOfLines={1} style={[styles.compactTitle, { color: theme.text }]}>
              {title}
            </Text>
          </Animated.View>
        )}

        <View style={[styles.barRow, measureStyle]}>
          {bar ?? (
            <>
              {onBack ? (
                <Pressable
                  onPress={() => {
                    haptics.tap();
                    onBack();
                  }}
                  hitSlop={12}
                  style={styles.back}
                >
                  <MaterialCommunityIcons name="chevron-left" size={28} color={theme.text} />
                </Pressable>
              ) : (
                <View />
              )}

              {right}
            </>
          )}
        </View>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        {...scrollProps}
        contentContainerStyle={[
          { paddingTop: insets.top + BAR_HEIGHT },
          contentContainerStyle,
          measureStyle,
        ]}
      >
        <Animated.View style={[styles.largeTitleWrap, largeTitleStyle]}>
          {intro ?? (
            <Text accessibilityRole="header" style={[styles.largeTitle, { color: theme.text }]}>
              {title}
            </Text>
          )}
        </Animated.View>

        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
  },
  barBackground: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  barRow: {
    height: BAR_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.screenGutter,
  },
  back: {
    // Pulls the optical edge of the glyph out to the screen gutter.
    marginLeft: -spacing.sm,
  },
  compactTitleWrap: {
    position: "absolute",
    left: SLOT,
    right: SLOT,
    height: BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  compactTitle: {
    ...type.bodyLg,
    fontWeight: weight.semi,
  },
  largeTitleWrap: {
    // Anchor the shrink to the left edge so the title does not drift inward
    // as it scales; the default origin is the centre.
    transformOrigin: "left center",
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  largeTitle: {
    ...type.display,
  },
});
