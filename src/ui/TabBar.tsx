import { MaterialCommunityIcons } from "@expo/vector-icons";
// react-navigation is bundled inside expo-router rather than being a direct
// dependency, and the root package does not re-export this type.
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { haptics } from "./haptics";
import { elevation, radius, spacing } from "./tokens";

/**
 * Floating pill tab bar: four icon-only tabs plus a raised center action.
 *
 * Custom rather than styled-default because the default bar cannot lift one
 * item above the others. Built on BottomTabBarProps so focus state, the
 * `tabPress` event (and therefore scroll-to-top / stack-reset behaviour) and
 * accessibility roles all keep working.
 */

const BAR_HEIGHT = 64;
const CENTER_SIZE = 56;
/** How far the center button sits proud of the bar's top edge. */
const CENTER_LIFT = 18;
const ICON = 24;

type CenterAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
};

export function TabBar({
  state,
  descriptors,
  navigation,
  theme,
  icons,
  center,
}: BottomTabBarProps & {
  theme: Theme;
  /** Route name -> icon pair. Focused icon is the filled variant. */
  icons: Record<string, { focused: IconName; blurred: IconName }>;
  center: CenterAction;
}) {
  const insets = useSafeAreaInsets();

  // The bar is absolutely positioned, so it must clear the home indicator /
  // gesture pill itself. Math.max keeps a gap on devices reporting 0 inset.
  const bottom = Math.max(insets.bottom, 12);

  const routes = state.routes.filter((route) => icons[route.name]);
  const half = Math.ceil(routes.length / 2);

  function renderTab(route: (typeof routes)[number]) {
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const pair = icons[route.name];

    return (
      <Pressable
        key={route.key}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={options.tabBarAccessibilityLabel ?? options.title ?? route.name}
        onPress={() => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!focused && !event.defaultPrevented) {
            haptics.tap();
            navigation.navigate(route.name, route.params);
          }
        }}
        onLongPress={() => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        }}
        style={styles.tab}
      >
        <MaterialCommunityIcons
          name={focused ? pair.focused : pair.blurred}
          size={ICON}
          color={focused ? theme.accent : theme.muted2}
        />
      </Pressable>
    );
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom, height: BAR_HEIGHT + CENTER_LIFT }]}
    >
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.navBg,
            ...elevation(3, theme.shadow),
          },
        ]}
      >
        {routes.slice(0, half).map(renderTab)}

        <View style={styles.centerSlot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={center.label}
            onPress={() => {
              haptics.press();
              center.onPress();
            }}
            style={[
              styles.center,
              { backgroundColor: theme.accent, ...elevation(3, theme.shadow) },
            ]}
          >
            <MaterialCommunityIcons
              name={center.icon}
              size={26}
              color={theme.onAccent}
            />
          </Pressable>
        </View>

        {routes.slice(half).map(renderTab)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Taller than the bar so the raised button is inside the touch target
  // rather than escaping a clipped parent.
  wrap: {
    position: "absolute",
    left: spacing.md + 2,
    right: spacing.md + 2,
    justifyContent: "flex-end",
  },
  bar: {
    height: BAR_HEIGHT,
    borderRadius: radius.xl + 2,
    flexDirection: "row",
    alignItems: "center",
  },
  tab: {
    flex: 1,
    height: BAR_HEIGHT,
    alignItems: "center",
    justifyContent: "center",
  },
  centerSlot: {
    width: CENTER_SIZE + spacing.md,
    alignItems: "center",
    justifyContent: "center",
  },
  center: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: CENTER_LIFT,
  },
});
