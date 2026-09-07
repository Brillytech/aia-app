import { ReactNode, useEffect } from "react";
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from "react-native";
import Animated, {
  makeMutable,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import type { Theme } from "../theme";
import { radius as radii, withAlpha } from "./tokens";

/**
 * Loading placeholders that mimic the content they stand in for.
 *
 * The screens this replaces showed a bordered card with a spinner and two
 * lines of copy — a card surface on screens that have none, telling you
 * nothing about what was arriving, and jumping the layout when the real rows
 * landed.
 *
 * ONE DRIVER FOR THE WHOLE APP
 * ----------------------------
 * `sweep` is module scope, not per component. Every bar on every screen reads
 * the same value, so they move as one surface rather than each shimmering on
 * its own clock — which is the difference between calm and busy. It also means
 * the loop runs once no matter how many bars are mounted.
 */
const SWEEP_MS = 1400;

const sweep = makeMutable(0);
let started = false;

function startSweep() {
  if (started) return;
  started = true;
  sweep.value = withRepeat(withTiming(1, { duration: SWEEP_MS }), -1, false);
}

export function SkeletonBar({
  theme,
  width,
  height,
  rounded = 999,
  style,
}: {
  theme: Theme;
  width?: number | string;
  height: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Resolved width in px, so the sweep can translate in real units. A
  // percentage translateX is not dependable across RN versions.
  const boxWidth = useSharedValue(0);

  useEffect(startSweep, []);

  const onLayout = (event: LayoutChangeEvent) => {
    boxWidth.value = event.nativeEvent.layout.width;
  };

  const sweepStyle = useAnimatedStyle(() => {
    const w = boxWidth.value;
    // Runs from fully off the left to fully off the right.
    return { transform: [{ translateX: -w * 0.6 + w * 2.2 * sweep.value }] };
  });

  const highlight = withAlpha("#FFFFFF", theme.mode === "dark" ? 0.14 : 0.85);

  return (
    <View
      onLayout={onLayout}
      style={[
        {
          width: width as any,
          height,
          borderRadius: rounded,
          backgroundColor: withAlpha(theme.text, theme.mode === "dark" ? 0.1 : 0.07),
          overflow: "hidden",
        },
        style,
      ]}
    >
      <Animated.View style={[styles.sweep, sweepStyle]}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="skeletonSweep" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={highlight} stopOpacity={0} />
              <Stop offset="0.5" stopColor={highlight} stopOpacity={1} />
              <Stop offset="1" stopColor={highlight} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#skeletonSweep)" />
        </Svg>
      </Animated.View>
    </View>
  );
}

/**
 * An outlined placeholder — a hairline box with a short bar inside.
 *
 * For things that are containers rather than text: an answer option reads as
 * an empty slot waiting to be filled, where a solid block of the same size
 * reads as a wall of grey.
 */
export function SkeletonSlot({
  theme,
  height,
  rounded = radii.md,
  children,
  style,
}: {
  theme: Theme;
  height: number;
  rounded?: number;
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        styles.slot,
        { height, borderRadius: rounded, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  sweep: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    // Narrower than the bar so the highlight reads as a band travelling across
    // it rather than the whole bar brightening.
    width: "60%",
  },
  slot: {
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: "center",
    paddingHorizontal: 16,
  },
});
