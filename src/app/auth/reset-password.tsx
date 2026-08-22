import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
import { useEffect, useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";
import { lightTheme } from "../../theme";
import { AlertModal } from "../../ui/AlertModal";
import { AuthField } from "../../ui/AuthField";
import { Wordmark } from "../../ui/Wordmark";
import { layout, motion, radius, spacing, type, weight, withAlpha } from "../../ui/tokens";


type AlertType = "success" | "error" | "warning" | "info";

export default function ResetPassword() {
  // Pinned to the default theme: pre-auth screens run before any
  // preference exists, and useThemeMode flashes light-then-saved on mount.
  const theme = lightTheme;
  const isDark = false;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [hasSession, setHasSession] = useState(false);

  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
  });

  const [redirectAfterAlert, setRedirectAfterAlert] = useState<string | null>(null);

  /**
   * Establishes the recovery session from the emailed link.
   *
   * Previously this read the deep link with `Linking.getInitialURL()` and
   * parsed the tokens by hand — the native pattern, where the OS hands the app
   * a `aiaapp://` URL. In a browser the tokens arrive in the address bar and
   * Supabase's `detectSessionInUrl` has already consumed them, stored the
   * session, and cleaned the URL before this screen mounts. So there is
   * nothing to parse: wait for the session, and time out if none arrives.
   *
   * Both a resolved session and the PASSWORD_RECOVERY event are handled,
   * because which one wins the race depends on how quickly the token exchange
   * completes relative to first paint.
   */
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session) {
        setHasSession(true);
        setSessionLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session) {
        setHasSession(true);
        setSessionLoading(false);
      }
    });

    // An expired or already-used link produces no session at all. Without this
    // the screen would sit on its spinner indefinitely.
    const timeout = setTimeout(() => {
      if (active) setSessionLoading(false);
    }, 6000);

    return () => {
      active = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  function showAlert(type: AlertType, title: string, message: string) {
    setAlert({ visible: true, type, title, message });
  }

  function closeAlert() {
    setAlert((prev) => ({ ...prev, visible: false }));

    if (redirectAfterAlert) {
      router.replace(redirectAfterAlert as any);
      setRedirectAfterAlert(null);
    }
  }


  async function handleUpdatePassword() {
    if (!password.trim() || !confirmPassword.trim()) {
      showAlert("warning", "Missing Password", "Please enter and confirm your new password.");
      return;
    }

    if (password.length < 6) {
      showAlert("warning", "Weak Password", "Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      showAlert("warning", "Password Mismatch", "Both passwords must match.");
      return;
    }

    if (!hasSession) {
      showAlert(
        "error",
        "Invalid Session",
        "Please open the latest password reset link from your email."
      );
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({
      password,
    });

    setLoading(false);

    if (error) {
      showAlert("error", "Reset Failed", error.message);
      return;
    }

    await supabase.auth.signOut();

    setRedirectAfterAlert("/auth/login");

    showAlert(
      "success",
      "Password Updated",
      "Your password has been changed. Please login with your new password."
    );
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: theme.bg }]}>
      <StatusBar barStyle={isDark ? "light-content" : "dark-content"} backgroundColor={theme.bg} />

      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          <Animated.View entering={FadeInDown.duration(motion.base)} style={styles.head}>
            {/* Wordmark and shield share a row rather than stacking — same
                reasoning as forgot-password. */}
            <View style={styles.brandRow}>
              <Wordmark theme={theme} compact brand />

              <View
                style={[
                  styles.plate,
                  { backgroundColor: withAlpha(theme.accent, isDark ? 0.2 : 0.13) },
                ]}
              >
                <MaterialCommunityIcons name="shield-key-outline" size={20} color={theme.accent} />
              </View>
            </View>

            <Text style={[styles.title, { color: theme.text }]}>New password</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              Choose a fresh password for your account.
            </Text>
          </Animated.View>

          {sessionLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={theme.accent} />
              <Text style={[styles.centeredText, { color: theme.muted }]}>
                Checking your reset link
              </Text>
            </View>
          ) : (
            <Animated.View entering={FadeInDown.delay(60).duration(motion.base)}>
              {!hasSession ? (
                <View
                  style={[
                    styles.notice,
                    { backgroundColor: withAlpha(theme.warning, isDark ? 0.2 : 0.13) },
                  ]}
                >
                  <MaterialCommunityIcons
                    name="alert-outline"
                    size={20}
                    color={theme.warning}
                  />

                  <View style={styles.flex1}>
                    <Text style={[styles.noticeTitle, { color: theme.text }]}>
                      Link not active
                    </Text>
                    <Text style={[styles.noticeText, { color: theme.muted }]}>
                      Open the most recent reset email, or request a new link.
                    </Text>

                    <Link
                      href="/auth/forgot-password"
                      style={[styles.inlineLink, { color: theme.accent }]}
                    >
                      Request a new link
                    </Link>
                  </View>
                </View>
              ) : null}

              <AuthField
                theme={theme}
                label="New password"
                icon="lock-outline"
                value={password}
                onChangeText={setPassword}
                placeholder="At least 6 characters"
                secure
                autoComplete="password"
              />

              <AuthField
                theme={theme}
                label="Confirm password"
                icon="lock-check-outline"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                placeholder="Re-enter password"
                secure
                autoComplete="password"
                error={
                  confirmPassword.length > 0 && confirmPassword !== password
                    ? "Passwords do not match"
                    : undefined
                }
              />

              <TouchableOpacity
                onPress={handleUpdatePassword}
                activeOpacity={0.9}
                disabled={loading}
                style={[
                  styles.primary,
                  { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 },
                ]}
              >
                {loading ? (
                  <ActivityIndicator color={theme.onAccent} />
                ) : (
                  <>
                    <Text style={[styles.primaryText, { color: theme.onAccent }]}>
                      Update password
                    </Text>
                    <MaterialCommunityIcons
                      name="arrow-right"
                      size={20}
                      color={theme.onAccent}
                    />
                  </>
                )}
              </TouchableOpacity>
            </Animated.View>
          )}

          <View style={styles.footer}>
            <Link href="/auth/login" style={[styles.inlineLink, { color: theme.accent }]}>
              Back to sign in
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <AlertModal
        theme={theme}
        visible={alert.visible}
        type={alert.type}
        title={alert.title}
        message={alert.message}
        primaryLabel="OK"
        onPrimary={closeAlert}
        onRequestClose={closeAlert}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  keyboard: { flex: 1 },
  flex1: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.xl,
  },
  head: { marginBottom: spacing.xl },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  plate: {
    width: 38,
    height: 38,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { ...type.display, marginTop: spacing.lg },
  subtitle: {
    ...type.body,
    fontWeight: weight.regular,
    marginTop: spacing.xs,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    paddingVertical: spacing.xxl,
  },
  centeredText: { ...type.body, fontWeight: weight.regular },
  notice: {
    flexDirection: "row",
    gap: spacing.md,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  noticeTitle: { ...type.body, fontWeight: weight.bold },
  noticeText: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
  },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    minHeight: 52,
    marginTop: spacing.sm,
  },
  primaryText: { ...type.bodyLg, fontWeight: weight.bold },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  inlineLink: { ...type.body, fontWeight: weight.bold },
});
