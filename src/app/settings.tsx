import { router } from "expo-router";
import { useInstallPrompt } from "../pwa/useInstallPrompt";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { supabase } from "../../lib/supabase";
import { usePremium } from "../premium";
import { AlertType, category, saveTheme, ThemeMode, useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import { Row, Rows } from "../ui/Rows";
import { PageHeader } from "../ui/PageHeader";
import { Screen } from "../ui/Screen";
import { useBreakpoint } from "../ui/layout/breakpoints";
import { SplitPane } from "../ui/layout/SplitPane";
import { Segmented } from "../ui/Segmented";
import type { IconName } from "../ui/alerts";
import { layout, radius, spacing, type as typeScale, weight } from "../ui/tokens";

const PRIVACY_URL = "https://lasuscholar.com/privacy";
const TERMS_URL = "https://lasuscholar.com/terms";
const WHATSAPP_URL = "https://wa.me/2347066884933";

/** Single source for the version — surfaced as a row and quoted in the About dialog. */
const APP_VERSION = "1.0";

/**
 * Width at which settings stops being one long list and becomes two panes.
 *
 * Chosen from this screen's content, not from a device class: a 200px nav rail
 * plus a readable settings column needs roughly 880 before the column starts
 * getting cramped. Other screens pick their own number for the same reason.
 */
const SETTINGS_SPLIT = 880;

type SectionId = "preferences" | "account" | "support";

/**
 * About was its own section holding two rows — a name and a version number.
 * It never earned a heading, and as a pane in a two-pane layout it would have
 * been two rows in a large empty area. Folded into Support, which is where a
 * student looking for "what is this app" would reasonably look anyway.
 */
const SECTIONS: { id: SectionId; label: string; icon: IconName }[] = [
  { id: "preferences", label: "Preferences", icon: "tune-variant" },
  { id: "account", label: "Account", icon: "account-circle-outline" },
  { id: "support", label: "Support", icon: "lifebuoy" },
];

const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsPage() {
  const { mode, theme } = useThemeMode();
  const { isPremium } = usePremium();

  // Keeps installing reachable after the banner has been dismissed.
  const install = useInstallPrompt();

  const wide = useBreakpoint(SETTINGS_SPLIT);
  const [section, setSection] = useState<SectionId>("preferences");

  const [loggingOut, setLoggingOut] = useState(false);
  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
    primaryText: "OK",
    secondaryText: "",
    onPrimary: null as null | (() => void),
    onSecondary: null as null | (() => void),
  });

  function showAlert({
    type = "info",
    title,
    message,
    primaryText = "OK",
    secondaryText = "",
    onPrimary = null,
    onSecondary = null,
  }: {
    type?: AlertType;
    title: string;
    message: string;
    primaryText?: string;
    secondaryText?: string;
    onPrimary?: null | (() => void);
    onSecondary?: null | (() => void);
  }) {
    setAlert({
      visible: true,
      type,
      title,
      message,
      primaryText,
      secondaryText,
      onPrimary,
      onSecondary,
    });
  }

  function closeAlert() {
    setAlert((prev) => ({
      ...prev,
      visible: false,
      onPrimary: null,
      onSecondary: null,
    }));
  }

  function handlePrimary() {
    const action = alert.onPrimary;
    closeAlert();
    if (action) setTimeout(action, 120);
  }

  function handleSecondary() {
    const action = alert.onSecondary;
    closeAlert();
    if (action) setTimeout(action, 120);
  }

  async function changeTheme(nextMode: ThemeMode) {
    try {
      // No confirmation dialog either way — the segmented control's own
      // selected state is the feedback. Only a genuine failure gets an alert.
      if (nextMode === mode) return;

      await saveTheme(nextMode);
    } catch {
      showAlert({
        type: "error",
        title: "Theme Error",
        message: "Could not update theme right now.",
      });
    }
  }

  function confirmLogout() {
    showAlert({
      type: "warning",
      title: "Sign Out?",
      message: "You will need to sign in again to continue using LASU Scholar.",
      primaryText: "Sign Out",
      secondaryText: "Cancel",
      onPrimary: handleLogout,
    });
  }

  async function handleLogout() {
    setLoggingOut(true);
    const { error } = await supabase.auth.signOut();
    setLoggingOut(false);

    if (error) {
      showAlert({
        type: "error",
        title: "Logout Failed",
        message: error.message,
      });
      return;
    }

    router.replace("/auth/login");
  }

  function openUrl(url: string) {
    Linking.openURL(url);
  }

  function showPrivacySecurity() {
    showAlert({
      type: "info",
      title: "Privacy & Security",
      message:
        "Your learning activity is used for progress, XP, leaderboard and study analytics. Screenshot blocking for protected pages will be enabled before the final production build.",
    });
  }

  // Section bodies are plain functions, not components: called directly they
  // keep their identity across renders, so switching panes does not remount
  // the rows. Declaring them as components here is what the
  // "Cannot create components during render" rule exists to stop.
  function renderPreferences() {
    return (
      <Rows theme={theme} title={wide ? undefined : "Preferences"}>
        <Row
          theme={theme}
          icon="crown"
          iconColor={category.yellow}
          label="LASU Scholar Premium"
          value={isPremium ? "Premium member" : "Free"}
          onPress={() => router.push("/premium" as any)}
        />

        <Row
          theme={theme}
          icon="theme-light-dark"
          label="Theme"
          accessory={
            <Segmented
              theme={theme}
              value={mode}
              options={THEME_OPTIONS}
              onChange={changeTheme}
            />
          }
        />

        {/* Hidden once installed — there is nothing left to offer, and a row
            reading "Installed" is noise. On iOS there is no prompt to fire,
            so the row explains the manual route instead. */}
        {install.installed ? null : (
          <Row
            theme={theme}
            icon="cellphone-arrow-down"
            label="Add to home screen"
            value={install.needsIosInstructions ? "Share → Add to Home Screen" : undefined}
            chevron={install.canPrompt}
            onPress={install.canPrompt ? install.install : undefined}
          />
        )}
      </Rows>
    );
  }

  function renderAccount() {
    return (
      <Rows theme={theme} title={wide ? undefined : "Account"}>
        <Row
          theme={theme}
          icon="account-edit-outline"
          label="Edit Profile"
          onPress={() => router.push("/edit-profile")}
        />

        <Row
          theme={theme}
          icon="bell-outline"
          label="Notifications"
          onPress={() => router.push("/notifications")}
        />

        <Row
          theme={theme}
          icon="shield-lock-outline"
          label="Privacy & Security"
          onPress={showPrivacySecurity}
        />

        <Row
          theme={theme}
          icon="calendar-refresh-outline"
          label="Weekly XP Reset"
          onPress={() =>
            showAlert({
              type: "info",
              title: "Weekly XP",
              message:
                "Weekly XP and leaderboard ranks reset every week. Your lifetime learning history still stays saved.",
            })
          }
        />
      </Rows>
    );
  }

  function renderSupport() {
    return (
      <Rows theme={theme} title={wide ? undefined : "Support"}>
        <Row
          theme={theme}
          icon="lifebuoy"
          label="Help & Support"
          onPress={() =>
            showAlert({
              type: "info",
              title: "Help & Support",
              message:
                "Call: +234 706 688 4933\nWhatsApp: Open WhatsApp support\nEmail: support@lasuscholar.com\nInfo: info@lasuscholar.com",
              primaryText: "WhatsApp",
              secondaryText: "Close",
              onPrimary: () => openUrl(WHATSAPP_URL),
            })
          }
        />

        <Row
          theme={theme}
          icon="shield-account-outline"
          label="Privacy Policy"
          onPress={() =>
            showAlert({
              type: "info",
              title: "Before You Continue",
              message:
                "LASU Scholar is an independent learning platform powered by AIA•ACADEMY. It is not officially affiliated with Lagos State University. The Privacy Policy explains what data we collect, why we collect it, and how you can contact support about your data.",
              primaryText: "Read More",
              secondaryText: "Close",
              onPrimary: () => openUrl(PRIVACY_URL),
            })
          }
        />

        <Row
          theme={theme}
          icon="file-document-outline"
          label="Terms of Use"
          onPress={() =>
            showAlert({
              type: "info",
              title: "Before You Continue",
              message:
                "LASU Scholar is an independent educational tool powered by AIA•ACADEMY. It is not officially affiliated with Lagos State University, and it does not replace official LASU academic portals, school notices or examination rules. The Terms of Use explain how students may use the app.",
              primaryText: "Read More",
              secondaryText: "Close",
              onPrimary: () => openUrl(TERMS_URL),
            })
          }
        />
        <Row
          theme={theme}
          icon="information-outline"
          label="About LASU Scholar"
          value="AIA•ACADEMY"
          onPress={() =>
            showAlert({
              type: "info",
              title: "About LASU Scholar",
              message: `LASU Scholar is an independent learning platform powered by AIA•ACADEMY. It is not officially affiliated with Lagos State University. Version ${APP_VERSION}`,
            })
          }
        />

        <Row theme={theme} icon="tag-outline" label="Version" value={APP_VERSION} />
      </Rows>
    );
  }

  function renderSignOut() {
    return (
      <Rows theme={theme} style={wide ? undefined : styles.signOut}>
        <Row
          theme={theme}
          label="Sign Out"
          destructive
          loading={loggingOut}
          onPress={confirmLogout}
        />
      </Rows>
    );
  }

  function renderSection(id: SectionId) {
    if (id === "preferences") return renderPreferences();
    if (id === "account") return renderAccount();
    return renderSupport();
  }

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        // Narrow: a single readable column. Wide: the pair of panes needs the
        // room, but still caps — a settings row 1900px wide is not better.
        measure={wide ? "app" : "prose"}
        theme={theme}
        title="Settings"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
      >
        {wide ? (
          <SplitPane
            theme={theme}
            railWidth={200}
            // The nav is already a distinct block; a rule as well is one
            // separator too many, and it stopped short of the page anyway.
            divider={false}
            rail={
              <View>
                {SECTIONS.map((item) => {
                  const active = item.id === section;

                  return (
                    <Pressable
                      key={item.id}
                      accessibilityRole="button"
                      accessibilityState={active ? { selected: true } : {}}
                      onPress={() => setSection(item.id)}
                      style={({ hovered }: any) => [
                        styles.navItem,
                        hovered && !active ? { backgroundColor: theme.soft } : null,
                        active ? { backgroundColor: theme.accentSoft } : null,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={item.icon}
                        size={18}
                        color={active ? theme.accent : theme.muted}
                      />
                      <Text
                        style={[
                          styles.navLabel,
                          { color: active ? theme.accent : theme.text },
                        ]}
                        numberOfLines={1}
                      >
                        {item.label}
                      </Text>
                    </Pressable>
                  );
                })}

                {/* Sign out belongs with the account, not inside whichever
                    pane happens to be open. */}
                <View style={[styles.railFooter, { borderTopColor: theme.border }]}>
                  {renderSignOut()}
                </View>
              </View>
            }
          >
            {renderSection(section)}
          </SplitPane>
        ) : (
          <>
            {renderPreferences()}
            {renderAccount()}
            {renderSupport()}
            {renderSignOut()}
          </>
        )}
      </PageHeader>

      <AlertModal
        theme={theme}
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        primaryLabel={alert.primaryText}
        onPrimary={handlePrimary}
        secondaryLabel={alert.secondaryText || undefined}
        onSecondary={handleSecondary}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: layout.screenGutter,
    paddingBottom: layout.tabBarInset,
  },
  // Extra separation so a destructive action doesn't read as just another group.
  signOut: {
    marginTop: spacing.lg,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    height: 40,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
  },
  navLabel: {
    ...typeScale.body,
    fontWeight: weight.medium,
  },
  railFooter: {
    marginTop: spacing.xxl,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
