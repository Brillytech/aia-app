import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
    Easing,
    useAnimatedProps,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import Svg, { Circle } from "react-native-svg";
import { motion } from "./tokens";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * Small circular progress indicator with an animated sweep. Used for the
 * "today's goal" ring on the dashboard — a filled arc reads as a real native
 * progress control, where a static bordered box just reads as a div.
 */
export function ProgressRing({
  percent,
  size = 74,
  strokeWidth = 7,
  trackColor,
  progressColor,
  textColor,
  label,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  trackColor: string;
  progressColor: string;
  textColor: string;
  label: string;
}) {
  const radiusPx = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusPx;
  const clamped = Math.max(0, Math.min(100, percent));

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(clamped, {
      duration: motion.slow,
      easing: Easing.out(Easing.cubic),
    });
  }, [clamped]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value / 100),
  }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radiusPx}
          stroke={progressColor}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.percentText, { color: textColor }]}>
          {Math.round(clamped)}%
        </Text>
        <Text style={[styles.label, { color: textColor, opacity: 0.6 }]}>
          {label}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  percentText: {
    fontSize: 17,
    fontWeight: "900",
  },
  label: {
    fontSize: 9,
    fontWeight: "900",
  },
});
