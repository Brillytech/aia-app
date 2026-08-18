import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from "react-native-reanimated";

/** Scroll distance over which a header finishes collapsing, then holds. */
export const COLLAPSE_DISTANCE = 64;

/**
 * Continuous, scroll-linked header collapse.
 *
 * Replaces the `useState` + threshold approach, which flipped at a single
 * offset — so even with a transition on it, the header *jumped* rather than
 * tracking the finger. Here every value is derived from the live scroll
 * offset on the UI thread, so the header moves with the content.
 *
 * Attach `scrollRef` to a `Animated.ScrollView`; no onScroll handler is
 * needed, and nothing writes a shared value from JS (which is what the
 * react-hooks/immutability rule rejects).
 */
export function useCollapse(distance = COLLAPSE_DISTANCE) {
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollOffset(scrollRef);

  /** Large title: shrinks toward the bar and eases toward centre. */
  const titleStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(scrollY.value, [0, distance], [1, 0.68], Extrapolation.CLAMP),
      },
    ],
  }));

  /** Secondary line under the title: gone well before the collapse finishes. */
  const sublineStyle = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, distance * 0.55], [1, 0], Extrapolation.CLAMP),
    transform: [
      {
        translateY: interpolate(scrollY.value, [0, distance], [0, -6], Extrapolation.CLAMP),
      },
    ],
  }));

  /** Bottom fade, arriving only once there is content sliding beneath. */
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollY.value,
      [distance * 0.35, distance],
      [0, 1],
      Extrapolation.CLAMP,
    ),
  }));

  /** Container padding, tightening as the title shrinks. */
  const containerStyle = useAnimatedStyle(() => ({
    paddingBottom: interpolate(scrollY.value, [0, distance], [16, 10], Extrapolation.CLAMP),
  }));

  return { scrollRef, scrollY, titleStyle, sublineStyle, fadeStyle, containerStyle };
}
