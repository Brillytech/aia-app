import { useEffect } from "react";
import {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { motion } from "./tokens";

/**
 * Staggered entrance: fade + rise. Pass the item's index in a list/section
 * so cards cascade in one after another instead of popping in all at once.
 * This is the single biggest "this feels native" signal on a screen.
 */
export function useEntrance(index = 0, { skip = false }: { skip?: boolean } = {}) {
  const progress = useSharedValue(skip ? 1 : 0);

  useEffect(() => {
    if (skip) return;
    progress.value = withDelay(
      index * motion.stagger,
      withTiming(1, { duration: motion.base, easing: Easing.out(Easing.cubic) }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  return useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 14 }],
  }));
}

/**
 * Press-scale: every tappable surface in the app should shrink slightly on
 * press and spring back on release. Pair with Reanimated's Pressable-like
 * usage — call onPressIn/onPressOut from the component's Pressable/Touchable.
 */
export function usePressScale(scaleTo: number = motion.pressScale) {
  const scale = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const onPressIn = () => {
    scale.value = withSpring(scaleTo, motion.springConfig);
  };

  const onPressOut = () => {
    scale.value = withSpring(1, motion.springConfig);
  };

  return { style, onPressIn, onPressOut };
}

/**
 * Simple count-up for numbers (XP, percentages) — small detail but it's the
 * kind of thing that reads as "app" rather than "page that just rendered a
 * number".
 */
export function useAnimatedNumber(value: number, duration = motion.slow) {
  const shared = useSharedValue(0);

  useEffect(() => {
    shared.value = withTiming(value, { duration, easing: Easing.out(Easing.cubic) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return shared;
}
