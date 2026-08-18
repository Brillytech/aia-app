import { ReactNode } from "react";
import Animated from "react-native-reanimated";
import { useEntrance } from "./motion";

/**
 * Wraps a section (a card, a list block, a header) in the shared staggered
 * entrance animation. `index` controls the delay, so sections cascade in
 * top to bottom on first load instead of popping in all at once. Use one
 * per major visual block on a screen, numbering them in on-screen order.
 */
export function AnimatedSection({
  index,
  children,
}: {
  index: number;
  children: ReactNode;
}) {
  const entranceStyle = useEntrance(index);
  return <Animated.View style={entranceStyle}>{children}</Animated.View>;
}
