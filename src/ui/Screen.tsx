import { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * Every top-level screen should mount its fixed header inside <Screen.Header>
 * and its scroll content as a plain sibling below. This replaces hardcoded
 * `paddingTop: 38`-style magic numbers with the device's real safe area, so
 * the layout is correct on a Dynamic Island phone, an old Android with a thick
 * status bar, or a tablet — instead of "looks right on the phone I tested on".
 */
export function Screen({
  children,
  backgroundColor,
}: {
  children: ReactNode;
  backgroundColor: string;
}) {
  return <View style={[styles.screen, { backgroundColor }]}>{children}</View>;
}

Screen.Header = function ScreenHeader({
  children,
  backgroundColor,
}: {
  children: ReactNode;
  backgroundColor: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        { backgroundColor, paddingTop: insets.top + 8 },
      ]}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 10,
    zIndex: 20,
  },
});
