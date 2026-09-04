import { router, Tabs } from "expo-router";
import type { IconName } from "../../ui/alerts";
import { useThemeMode } from "../../theme";
import { useIsDesktop } from "../../ui/layout/breakpoints";
import { SideNav } from "../../ui/SideNav";
import { TabBar } from "../../ui/TabBar";

/**
 * Four modes plus a raised center action.
 *
 * Profile is deliberately not a tab — it is an account destination, not a
 * learning mode. It stays reachable from the dashboard, where both the avatar
 * and the greeting block route to it.
 */
const TAB_ICONS: Record<string, { focused: IconName; blurred: IconName }> = {
  dashboard: { focused: "home", blurred: "home-outline" },
  study: {
    focused: "book-open-page-variant",
    blurred: "book-open-page-variant-outline",
  },
  practice: { focused: "crosshairs-gps", blurred: "crosshairs" },
  exam: {
    focused: "file-document-edit",
    blurred: "file-document-edit-outline",
  },
};

export default function TabsLayout() {
  const { theme } = useThemeMode();
  const desktop = useIsDesktop();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // `tabBarPosition: 'left'` is a first-class option of this navigator,
        // not a workaround: BottomTabView switches its own container to
        // `flexDirection: 'row'` and renders the bar before the screens. So
        // the sidebar is the SAME navigator with the SAME routes and state —
        // no navigation logic changes, and nothing here reimplements routing.
        //
        // It also sets BottomTabBarHeightContext to 0 for any position other
        // than 'bottom', which is correct: there is no bar below the content.
        tabBarPosition: desktop ? "left" : "bottom",
      }}
      tabBar={(props) =>
        desktop ? (
          <SideNav
            {...props}
            theme={theme}
            icons={TAB_ICONS}
            center={{
              icon: "compass-outline",
              label: "AIA Tutorial",
              onPress: () => router.push("/aia-tutorial" as any),
            }}
          />
        ) : (
          <TabBar
            {...props}
            theme={theme}
            icons={TAB_ICONS}
            center={{
              // A whole section of the app, not a video player — a compass
              // reads as "explore this area" rather than "press play".
              icon: "compass-outline",
              label: "AIA Tutorial",
              onPress: () => router.push("/aia-tutorial" as any),
            }}
          />
        )
      }
    >
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="study" options={{ title: "Study" }} />
      <Tabs.Screen name="practice" options={{ title: "Practice" }} />
      <Tabs.Screen name="exam" options={{ title: "Exam" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", href: null }} />
    </Tabs>
  );
}
