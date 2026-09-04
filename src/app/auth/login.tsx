import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { useState } from "react";
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
import { AUTH_REDIRECTS, routeAfterAuth } from "../../auth-redirect";
import { lightTheme } from "../../theme";
import { useMeasure } from "../../ui/layout/measure";
import { AlertModal } from "../../ui/AlertModal";
import { AuthField } from "../../ui/AuthField";
import { Wordmark } from "../../ui/Wordmark";
import { layout, motion, radius, spacing, type, weight } from "../../ui/tokens";

type AlertType = "success" | "error" | "warning" | "info";

export default function Login() {
  const measure = useMeasure("form");
  // Pinned to the default theme: pre-auth screens run before any
  // preference exists, and useThemeMode flashes light-then-saved on mount.
  const theme = lightTheme;
  const isDark = false;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [alert, setAlert] = useState({
    visible: false,
    type: "info" as AlertType,
    title: "",
    message: "",
  });

  function showAlert(type: AlertType, title: string, message: string) {
    setAlert({ visible: true, type, title, message });
  }

  function closeAlert() {
    setAlert((prev) => ({ ...prev, visible: false }));
  }

  // Post-login routing moved to `routeAfterAuth` in src/auth-redirect.ts so
  // the OAuth callback route applies the identical rule. `createSessionFromUrl`
  // is gone with it: on web Supabase reads the tokens out of the URL itself
  // via `detectSessionInUrl`, so there is nothing left here to parse.
  function goToNextScreen(userId: string) {
    return routeAfterAuth(userId, (message) =>
      showAlert("error", "Profile Error", message),
    );
  }

  /**
   * On web this hands the whole tab to Google and never returns — the browser
   * navigates away, and `/auth/callback` picks the session up afterwards.
   *
   * The old flow used `skipBrowserRedirect: true` plus
   * `WebBrowser.openAuthSessionAsync`, which is the native pattern: open a
   * system browser, wait for it to bounce back to a custom scheme, and read
   * the tokens off the returned URL. In a browser there is no separate window
   * to await and no custom scheme to catch, so that path just stalls.
   */
  async function handleGoogleLogin() {
    try {
      setGoogleLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: AUTH_REDIRECTS.callback() },
      });

      if (error) throw error;

      // Reached only if the redirect did not happen. Leaving the spinner up
      // would look like a hang.
    } catch (error: any) {
      showAlert(
        "error",
        "Google Login Failed",
        error?.message || "Unable to continue with Google."
      );
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleLogin() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password.trim()) {
      showAlert("warning", "Missing Details", "Please enter your email and password.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes("email not confirmed")) {
        showAlert(
          "warning",
          "Email Not Confirmed",
          "Please confirm your email first. Check your inbox or spam folder."
        );
        return;
      }

      showAlert("error", "Login Failed", error.message);
      return;
    }

    const user = data.user;

    if (!user) {
      showAlert("error", "Login Failed", "Unable to get user details.");
      return;
    }

    await goToNextScreen(user.id);
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
          contentContainerStyle={[styles.scroll, measure]}
        >
          {/* No card wrapper. The old layout boxed the form inside a white
              panel floating on a glow, which is a web landing-page shape —
              a native sign-in puts the form on the page itself.

              The head is a strict two-part lock-up: brand block, then the
              headline. AIA•ACADEMY was added under the app name, so the
              subtitle came out to pay for it — "Sign in to pick up where you
              left off" told nobody anything the button below it doesn't. */}
          <Animated.View entering={FadeInDown.duration(motion.base)} style={styles.head}>
            <Wordmark theme={theme} brand />

            <Text style={[styles.title, { color: theme.text }]}>Welcome back</Text>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).duration(motion.base)}>
            <AuthField
              theme={theme}
              label="Email"
              icon="email-outline"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoComplete="email"
            />

            <AuthField
              theme={theme}
              label="Password"
              icon="lock-outline"
              value={password}
              onChangeText={setPassword}
              placeholder="Enter password"
              secure
              autoComplete="password"
              right={
                <Link href="/auth/forgot-password" style={[styles.inlineLink, { color: theme.accent }]}>
                  Forgot?
                </Link>
              }
            />

            <TouchableOpacity
              onPress={handleLogin}
              activeOpacity={0.9}
              disabled={loading}
              style={[styles.primary, { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <>
                  <Text style={[styles.primaryText, { color: theme.onAccent }]}>Sign in</Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color={theme.onAccent} />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(120).duration(motion.base)}>
            <View style={styles.dividerRow}>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
              <Text style={[styles.dividerText, { color: theme.muted }]}>or</Text>
              <View style={[styles.divider, { backgroundColor: theme.border }]} />
            </View>

            <TouchableOpacity
              onPress={handleGoogleLogin}
              activeOpacity={0.9}
              disabled={googleLoading}
              style={[styles.google, { backgroundColor: theme.card, borderColor: theme.border }]}
            >
              {googleLoading ? (
                <ActivityIndicator color={theme.text} />
              ) : (
                <>
                  <MaterialCommunityIcons name="google" size={20} color={theme.text} />
                  <Text style={[styles.googleText, { color: theme.text }]}>
                    Continue with Google
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.muted }]}>
              New here?{" "}
            </Text>
            <Link href="/auth/signup" style={[styles.inlineLink, { color: theme.accent }]}>
              Create an account
            </Link>
          </View>

          {/* Stripped from release bundles: Metro inlines `__DEV__` as a
              literal `false`, so the minifier drops this branch entirely. */}
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
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: layout.screenGutter,
    paddingVertical: spacing.xl,
  },
  head: {
    marginBottom: spacing.xl,
  },
  title: {
    // `display` rather than `hero`. A 34pt headline under a wordmark gives the
    // page two competing identities and eats a chunk of the fold on a small
    // phone; 28pt still leads without shouting.
    ...type.display,
    marginTop: spacing.lg,
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
  primaryText: {
    ...type.bodyLg,
    fontWeight: weight.bold,
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  divider: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  google: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 52,
  },
  googleText: {
    ...type.body,
    fontWeight: weight.semi,
  },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: spacing.xl,
  },
  footerText: {
    ...type.body,
    fontWeight: weight.regular,
  },
  inlineLink: {
    ...type.body,
    fontWeight: weight.bold,
  },
});
