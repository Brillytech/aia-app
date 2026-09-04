import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { BottomTabBarProps } from "expo-router/build/react-navigation/bottom-tabs";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import type { IconName } from "./alerts";
import { radius, spacing, type, weight } from "./tokens";
import { Wordmark } from "./Wordmark";

/**
 * Desktop navigation rail. The large-screen counterpart to `TabBar`, not a
 * variant of it.
 *
 * They are separate components on purpose. `TabBar` is a floating pill,
 * absolutely positioned, with one item raised proud of the others — every one
 * of those decisions is a thumb affordance, and none of them survives being
 * turned on its side. Sharing a component would have meant a prop that changes
 * essentially all of the layout, which is two components wearing a trenchcoat.
 *
 * What they DO share is `BottomTabBarProps`: same navigator, same route keys,
 * same `tabPress` event, same focus state. This is rendered by the same
 * `<Tabs>` navigator via `tabBarPosition: 'left'`, so navigation behaviour is
 * not reimplemented here — only its appearance.
 */

const RAIL_WIDTH = 240;
const ICON = 22;

type CenterAction = {
  icon: IconName;
  label: string;
  onPress: () => void;
};

/** A row that is not a tab — pushes a route outside the tab navigator. */
type LinkRow = {
  icon: IconName;
  label: string;
  href: string;
};

const ACCOUNT_ROWS: LinkRow[] = [
  { icon: "account-circle-outline", label: "Profile", href: "/profile" },
  { icon: "bell-outline", label: "Notifications", href: "/notifications" },
  { icon: "cog-outline", label: "Settings", href: "/settings" },
];

/**
 * Declared at module scope, not inside `SideNav`. A component created during
 * render is a new type on every render, so React unmounts and remounts it —
 * throwing away its state, including the hover state this row depends on.
 */
function Row({
  icon,
  label,
  focused,
  onPress,
  theme,
  accessibilityLabel,
}: {
  icon: IconName;
  label: string;
  focused: boolean;
  onPress: () => void;
  theme: Theme;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      style={({ hovered }: any) => [
        styles.row,
        // Hover is a pointer-only affordance, so it lives here rather than in
        // the shared token set. react-native-web supplies `hovered`; on native
        // it is simply undefined and this collapses to no style.
        hovered && !focused ? { backgroundColor: theme.cardSoft } : null,
        focused ? { backgroundColor: theme.accentSoft } : null,
      ]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={ICON}
        color={focused ? theme.accent : theme.muted2}
      />
      <Text
        style={[
          styles.rowLabel,
          { color: focused ? theme.accent : theme.text },
          focused ? { fontWeight: weight.black } : null,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function SideNav({
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
  const routes = state.routes.filter((route) => icons[route.name]);

  return (
    <View
      style={[
        styles.rail,
        { backgroundColor: theme.navBg, borderRightColor: theme.border },
      ]}
    >
      <View style={styles.brand}>
        <Wordmark theme={theme} compact />
      </View>

      <View style={styles.group}>
        {routes.map((route) => {
          const index = state.routes.findIndex((r) => r.key === route.key);
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const pair = icons[route.name];

          return (
            <Row
              key={route.key}
              icon={focused ? pair.focused : pair.blurred}
              label={options.title ?? route.name}
              focused={focused}
              theme={theme}
              accessibilityLabel={
                options.tabBarAccessibilityLabel ?? options.title ?? route.name
              }
              onPress={() => {
                // Same event contract as TabBar, so scroll-to-top and
                // stack-reset listeners keep working identically.
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });

                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
            />
          );
        })}

        {/* On the phone this is a raised centre button. Here it is an ordinary
            row: a lifted circle in a vertical list reads as a mistake, and the
            affordance it buys (thumb reach) does not exist with a mouse. */}
        <Row
          icon={center.icon}
          label={center.label}
          focused={false}
          theme={theme}
          onPress={center.onPress}
        />
      </View>

      <View style={styles.spacer} />

      <View style={[styles.divider, { backgroundColor: theme.border }]} />

      <View style={styles.group}>
        {ACCOUNT_ROWS.map((row) => (
          <Row
            key={row.href}
            icon={row.icon}
            label={row.label}
            // These push routes that live outside this navigator, so there is
            // no focus state to read for them from `state`.
            focused={false}
            theme={theme}
            onPress={() => router.push(row.href as any)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: RAIL_WIDTH,
    height: "100%",
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xl,
  },
  brand: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.xl,
  },
  group: {
    gap: spacing.xxs,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: 44,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  rowLabel: {
    ...type.body,
  },
  spacer: {
    flex: 1,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: spacing.md,
    marginHorizontal: spacing.sm,
  },
});
