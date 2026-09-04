import { router } from "expo-router";
import { useInstallPrompt } from "../pwa/useInstallPrompt";
import { useState } from "react";
import { Linking, StyleSheet } from "react-native";
import { supabase } from "../../lib/supabase";
import { usePremium } from "../premium";
import { AlertType, category, saveTheme, ThemeMode, useThemeMode } from "../theme";
import { AlertModal } from "../ui/AlertModal";
import { ListRow, ListSection } from "../ui/List";
import { PageHeader } from "../ui/PageHeader";
import { Screen } from "../ui/Screen";
import { Segmented } from "../ui/Segmented";
import { layout, spacing } from "../ui/tokens";

const PRIVACY_URL = "https://lasuscholar.com/privacy";
const TERMS_URL = "https://lasuscholar.com/terms";
const WHATSAPP_URL = "https://wa.me/2347066884933";

/** Single source for the version — surfaced as a row and quoted in the About dialog. */
const APP_VERSION = "1.0";

const THEME_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

export default function SettingsPage() {
  const { mode, theme } = useThemeMode();
  const { isPremium } = usePremium();

  // Keeps installing reachable after the banner has been dismissed.
  const install = useInstallPrompt();

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

  return (
    <Screen backgroundColor={theme.bg}>
      <PageHeader
        measure="prose"
        theme={theme}
        title="Settings"
        onBack={() => router.back()}
        contentContainerStyle={styles.scroll}
      >
        {/* Plan and Appearance were a section each, and each held exactly one
            row — a card and a shadow wrapped around a single line. Merged,
            they are one surface carrying two rows, which is what the card was
            always for. */}
        <ListSection theme={theme} title="Preferences">
          <ListRow
            theme={theme}
            icon="crown"
            iconColor={category.yellow}
            label="LASU Scholar Premium"
            value={isPremium ? "Premium member" : "Free"}
            onPress={() => router.push("/premium" as any)}
          />

          <ListRow
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
            <ListRow
              theme={theme}
              icon="cellphone-arrow-down"
              label="Add to home screen"
              value={install.needsIosInstructions ? "Share → Add to Home Screen" : undefined}
              chevron={install.canPrompt}
              onPress={install.canPrompt ? install.install : undefined}
            />
          )}
        </ListSection>

        <ListSection theme={theme} title="Account">
          <ListRow
            theme={theme}
            icon="account-edit-outline"
            label="Edit Profile"
            onPress={() => router.push("/edit-profile")}
          />

          <ListRow
            theme={theme}
            icon="bell-outline"
            label="Notifications"
            onPress={() => router.push("/notifications")}
          />

          <ListRow
            theme={theme}
            icon="shield-lock-outline"
            label="Privacy & Security"
            onPress={showPrivacySecurity}
          />

          <ListRow
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
        </ListSection>

        <ListSection theme={theme} title="Support">
          <ListRow
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

          <ListRow
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

          <ListRow
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
        </ListSection>

        <ListSection theme={theme} title="About">
          <ListRow
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

          <ListRow theme={theme} icon="tag-outline" label="Version" value={APP_VERSION} />
        </ListSection>

        <ListSection theme={theme} style={styles.signOut}>
          <ListRow
            theme={theme}
            label="Sign Out"
            destructive
            loading={loggingOut}
            onPress={confirmLogout}
          />
        </ListSection>
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
});
