import { MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import {
  Dimensions,
  Image,
  ImageSourcePropType,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  Extrapolation,
  interpolate,
  interpolateColor,
  SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { ONBOARDING_KEY } from "../onboarding";
import { category, lightTheme, Theme } from "../theme";
import { haptics } from "../ui/haptics";
import { layout, radius, spacing, type, weight, withAlpha } from "../ui/tokens";

const { width } = Dimensions.get("window");

const logo = require("../../assets/ls-logo.png");
const readingImg = require("../../assets/onboarding/reading.png");
const examImg = require("../../assets/onboarding/exam.png");
const progressImg = require("../../assets/onboarding/progress.png");
const chooseImg = require("../../assets/onboarding/choose.png");

type Slide = {
  id: string;
  badge: string;
  title: string;
  text: string;
  image: ImageSourcePropType;
  accent: string;
};

// Accents come from `category` now, so the onboarding uses the same subject
// hues the rest of the app does rather than its own two-colour palette.
const slides: Slide[] = [
  {
    id: "1",
    badge: "Personalised",
    title: "Everything you need to study, in one place.",
    text: "Materials, past questions, practice and exam prep arranged for your department and level.",
    image: chooseImg,
    accent: category.orange,
  },
  {
    id: "2",
    badge: "Organised",
    title: "Read cleaner. Revise faster.",
    text: "Open notes, PDFs, summaries and flashcards without jumping from one place to another.",
    image: readingImg,
    accent: category.blue,
  },
  {
    id: "3",
    badge: "Exam-ready",
    title: "Prepare like it is the real exam.",
    text: "Answer questions, review mistakes and discover the topics you still need to work on.",
    image: examImg,
    accent: category.purple,
  },
  {
    id: "4",
    badge: "Progress",
    title: "Know exactly what is improving.",
    text: "Follow your XP, streaks, weak areas and performance so your reading has direction.",
    image: progressImg,
    accent: category.green,
  },
];

const ACCENTS = slides.map((s) => s.accent);
const OFFSETS = slides.map((_, i) => i * width);

/**
 * The illustration card.
 *
 * Every source PNG has an opaque WHITE background baked into its pixels —
 * the files are RGBA but the alpha channel is unused, so `contain` on any
 * tinted surface renders a white rectangle floating inside it. The fix is to
 * stop fighting that: the card *is* white, the art fills it edge to edge, and
 * the rounded corners clip it. The white then reads as the card rather than
 * as a stray box.
 *
 * 4:3 because two of the four assets are already ~1.33; the other two
 * (1.66 and 0.96) take a modest crop, which keeps every slide the same shape.
 */
const CARD_W = Math.min(width * 0.78, 330);
const CARD_H = CARD_W / 1.33;

export default function Index() {
  // Pinned to the app's default theme rather than useThemeMode(). Pre-auth
  // screens run before any preference exists, and useThemeMode starts light
  // then swaps once AsyncStorage resolves — which is the flash you saw.
  const theme = lightTheme;
  const isDark = false;

  // The key was written on finish but never read, so onboarding replayed on
  // every launch — in production too, not only under Expo. `checking` holds
  // the screen blank for one tick so a returning user never sees a flash of
  // slide 1 before the redirect.
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let active = true;

    AsyncStorage.getItem(ONBOARDING_KEY)
      .then((seen) => {
        if (!active) return;
        if (seen === "true") {
          router.replace("/auth/login");
          return;
        }
        setChecking(false);
      })
      .catch(() => {
        if (active) setChecking(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // useScrollOffset rather than a scroll handler: it hands back a shared
  // value directly, so this file performs no `.value` writes at all.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useScrollOffset(scrollRef);

  // Plain state, updated from the scroll event. Reading scrollX.value on the
  // JS thread is what raised "Reading from `value` during component render" —
  // with the React Compiler on, a read inside a component-body function gets
  // pulled into the render phase. Every shared-value read now lives in a
  // worklet, and nothing on the JS side touches `.value` at all.
  const [index, setIndex] = useState(0);

  async function finishOnboarding() {
    await AsyncStorage.setItem(ONBOARDING_KEY, "true");
    router.replace("/auth/signup");
  }

  function goNext() {
    haptics.tap();

    if (index >= slides.length - 1) {
      finishOnboarding();
      return;
    }

    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true });
  }

  // A wash of the current slide's accent, blending as you swipe. This is what
  // makes the whole screen feel like it's responding, not just the cards.
  // Stronger on light than the old 0.09. In dark the white card carries the
  // contrast on its own; on cream it needs the page to do some work, or the
  // whole screen reads as beige-on-beige.
  const washStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(scrollX.value, OFFSETS, ACCENTS),
    opacity: 0.16,
  }));

  const ctaStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(scrollX.value, OFFSETS, ACCENTS),
  }));

  // "Next" through slide 3, "Get started" on the last one. Interpolated on
  // the raw offset so the label cross-fades as you swipe rather than
  // snapping when the page settles.
  const lastPageStart = (slides.length - 2) * width;
  const lastPageEnd = (slides.length - 1) * width;

  const nextIconStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [lastPageStart, lastPageEnd],
      [1, 0],
      Extrapolation.CLAMP,
    ),
  }));

  const startLabelStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [lastPageStart, lastPageEnd],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  if (checking) {
    return <View style={[styles.safe, { backgroundColor: theme.bg }]} />;
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar
        barStyle={isDark ? "light-content" : "dark-content"}
        backgroundColor={theme.bg}
      />

      <Animated.View pointerEvents="none" style={[styles.wash, washStyle]} />

      <View style={styles.header}>
        <View style={styles.brand}>
          <Image source={logo} style={styles.logo} resizeMode="cover" />
          <Text style={[styles.brandText, { color: theme.text }]}>LASU Scholar</Text>
        </View>

        <Pressable onPress={finishOnboarding} hitSlop={12}>
          <Text style={[styles.skip, { color: theme.muted }]}>Skip</Text>
        </Pressable>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        bounces={false}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(event) =>
          setIndex(Math.round(event.nativeEvent.contentOffset.x / width))
        }
      >
        {slides.map((slide, index) => (
          <SlideView
            key={slide.id}
            slide={slide}
            index={index}
            scrollX={scrollX}
            theme={theme}
          />
        ))}
      </Animated.ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((slide, index) => (
            <Dot key={slide.id} index={index} scrollX={scrollX} theme={theme} />
          ))}
        </View>

        <Pressable onPress={goNext} style={styles.ctaWrap}>
          <Animated.View style={[styles.cta, ctaStyle]}>
            {/* Both labels are absolute so neither drives layout; an invisible
                copy of the longer one reserves the width. Previously only
                "Get started" was absolute, so the arrow sat where the shorter
                "Next" ended and overlapped it. Measuring with real text keeps
                this correct under font scaling and translation. */}
            <View style={styles.labelSlot}>
              <Text
                aria-hidden
                style={[styles.ctaLabel, styles.labelMeasure, { color: theme.onAccent }]}
              >
                Get started
              </Text>

              <Animated.Text
                style={[styles.ctaLabel, styles.labelOverlay, { color: theme.onAccent }, nextIconStyle]}
              >
                Next
              </Animated.Text>

              <Animated.Text
                style={[styles.ctaLabel, styles.labelOverlay, { color: theme.onAccent }, startLabelStyle]}
              >
                Get started
              </Animated.Text>
            </View>

            <MaterialCommunityIcons name="arrow-right" size={20} color={theme.onAccent} />
          </Animated.View>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function SlideView({
  slide,
  index,
  scrollX,
  theme,
}: {
  slide: Slide;
  index: number;
  scrollX: SharedValue<number>;
  theme: Theme;
}) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];

  // The image travels slower than the page — the parallax that makes a
  // carousel feel like depth rather than a filmstrip.
  const imageStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          range,
          [width * 0.3, 0, -width * 0.3],
          Extrapolation.CLAMP,
        ),
      },
      { scale: interpolate(scrollX.value, range, [0.86, 1, 0.86], Extrapolation.CLAMP) },
    ],
  }));

  // The halo counter-moves, which exaggerates the depth without touching the
  // artwork itself.
  const haloStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(
          scrollX.value,
          range,
          [-width * 0.15, 0, width * 0.15],
          Extrapolation.CLAMP,
        ),
      },
      { scale: interpolate(scrollX.value, range, [1.25, 1, 1.25], Extrapolation.CLAMP) },
    ],
  }));

  // Copy rises into place slightly after the art settles.
  const copyStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollX.value, range, [0, 1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(scrollX.value, range, [28, 0, 28], Extrapolation.CLAMP),
      },
    ],
  }));

  return (
    <View style={styles.slide}>
      <View style={styles.stage}>
        {/* A soft blob well behind the canvas, offset and counter-moving, so
            the composition has depth instead of one flat centred shape. */}
        <Animated.View
          style={[
            styles.halo,
            { backgroundColor: withAlpha(slide.accent, 0.2) },
            haloStyle,
          ]}
        />

        {/* White, because the art's own background is white — anything else
            shows a seam. `cover` fills the card exactly, so the corners clip
            cleanly instead of leaving a rectangle inside a rounded shape. */}
        {/* A white card on cream is only ~3% apart, so on light the border and
            shadow do all the separating — both are tinted with the accent
            rather than grey, which keeps it from looking dusty. */}
        <Animated.View
          style={[
            styles.card,
            {
              borderColor: withAlpha(slide.accent, 0.3),
              shadowColor: slide.accent,
            },
            imageStyle,
          ]}
        >
          <Image source={slide.image} style={styles.art} resizeMode="cover" />
        </Animated.View>
      </View>

      <Animated.View style={[styles.copy, copyStyle]}>
        <View
          style={[
            styles.badge,
            { backgroundColor: withAlpha(slide.accent, 0.18) },
          ]}
        >
          <Text style={[styles.badgeText, { color: slide.accent }]}>{slide.badge}</Text>
        </View>

        <Text style={[styles.title, { color: theme.text }]}>{slide.title}</Text>
        <Text style={[styles.text, { color: theme.muted }]}>{slide.text}</Text>
      </Animated.View>
    </View>
  );
}

function Dot({
  index,
  scrollX,
  theme,
}: {
  index: number;
  scrollX: SharedValue<number>;
  theme: Theme;
}) {
  const range = [(index - 1) * width, index * width, (index + 1) * width];

  // The active dot stretches into a pill and takes the slide's accent, so the
  // indicator reads as position rather than as four identical dots.
  const style = useAnimatedStyle(() => ({
    width: interpolate(scrollX.value, range, [7, 26, 7], Extrapolation.CLAMP),
    opacity: interpolate(scrollX.value, range, [0.3, 1, 0.3], Extrapolation.CLAMP),
    backgroundColor: interpolateColor(scrollX.value, OFFSETS, ACCENTS),
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: theme.muted }, style]} />;
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  wash: {
    position: "absolute",
    top: -width * 0.5,
    left: -width * 0.25,
    width: width * 1.5,
    height: width * 1.5,
    borderRadius: width,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.md,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  logo: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
  },
  brandText: {
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  skip: {
    ...type.body,
    fontWeight: weight.medium,
  },

  slide: {
    width,
    flex: 1,
    paddingHorizontal: layout.screenGutter,
  },
  stage: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  halo: {
    position: "absolute",
    width: CARD_W * 1.1,
    height: CARD_W * 1.1,
    borderRadius: width,
    // Offset rather than concentric — a halo directly behind the card just
    // reads as a thicker border.
    top: -CARD_W * 0.16,
    left: -CARD_W * 0.1,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderRadius: radius.xxl,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    shadowOpacity: 0.28,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    elevation: 8,
  },
  art: {
    width: "100%",
    height: "100%",
  },
  copy: {
    paddingBottom: spacing.xl,
    alignItems: "flex-start",
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    marginBottom: spacing.lg,
  },
  badgeText: {
    ...type.micro,
    letterSpacing: 0.6,
  },
  title: {
    ...type.display,
  },
  text: {
    ...type.bodyLg,
    fontWeight: weight.regular,
    marginTop: spacing.md,
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.lg,
    paddingHorizontal: layout.screenGutter,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    height: 7,
    borderRadius: radius.pill,
  },
  ctaWrap: {
    borderRadius: radius.pill,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.pill,
    minHeight: 54,
    // No minWidth — the label slot now sizes itself to the longest label, so
    // a fixed floor would only fight it.
  },
  ctaLabel: {
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  labelSlot: {
    justifyContent: "center",
  },
  // Sizes the slot without being seen. opacity rather than display:none so it
  // still participates in layout.
  labelMeasure: {
    opacity: 0,
  },
  labelOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },
});
