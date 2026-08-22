import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Link, router } from "expo-router";
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
import { AUTH_REDIRECTS } from "../../auth-redirect";
import { lightTheme } from "../../theme";
import { AlertModal } from "../../ui/AlertModal";
import { AuthField } from "../../ui/AuthField";
import { Wordmark } from "../../ui/Wordmark";
import { layout, motion, radius, spacing, type, weight } from "../../ui/tokens";


export default function Signup() {
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
    type: "info" as "success" | "error" | "info" | "warning",
    title: "",
    message: "",
  });

  const [redirectAfterAlert, setRedirectAfterAlert] = useState<string | null>(null);

  function showAlert(
    type: "success" | "error" | "info" | "warning",
    title: string,
    message: string
  ) {
    setAlert({ visible: true, type, title, message });
  }


  function closeAlert() {
    setAlert((prev) => ({ ...prev, visible: false }));

    if (redirectAfterAlert) {
      router.replace(redirectAfterAlert as any);
      setRedirectAfterAlert(null);
    }
  }

  /**
   * Hands the tab to Google; `/auth/callback` resumes afterwards. See the
   * matching note in auth/login.tsx for why the native
   * `openAuthSessionAsync` pattern cannot work in a browser.
   *
   * The old code forced `/complete-profile` on return. It no longer does:
   * `routeAfterAuth` checks `profile_completed`, so a returning Google user
   * whose profile is already filled in goes straight to the dashboard instead
   * of being sent back through setup.
   */
  async function handleGoogleSignup() {
    try {
      setGoogleLoading(true);

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: AUTH_REDIRECTS.callback() },
      });

      if (error) throw error;
    } catch (error: any) {
      showAlert(
        "error",
        "Google Signup Failed",
        error?.message || "Unable to continue with Google."
      );
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleSignup() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail || !password.trim()) {
      showAlert("warning", "Missing Details", "Please enter your email and password.");
      return;
    }

    if (password.length < 6) {
      showAlert("warning", "Weak Password", "Password must be at least 6 characters.");
      return;
    }

    setLoading(true);

    const { data, error } = await supabase.auth.signUp({
  email: cleanEmail,
  password,
  options: {
    emailRedirectTo: AUTH_REDIRECTS.emailConfirm(),
  },
});

    setLoading(false);

    if (error) {
      showAlert("error", "Signup Failed", error.message);
      return;
    }

    if (data.session) {
      router.replace("/complete-profile");
      return;
    }

    setRedirectAfterAlert("/auth/login");

    showAlert(
      "success",
      "Check Your Email",
      "Account created successfully. Please confirm your email before logging in."
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
            {/* Same trade as login: the brand line came in, the subtitle went
                out. Kept identical across both so the two screens are one
                lock-up, not two variations on one. */}
            <Wordmark theme={theme} brand />

            <Text style={[styles.title, { color: theme.text }]}>Create your account</Text>
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
              placeholder="At least 6 characters"
              secure
              autoComplete="password"
            />

            <TouchableOpacity
              onPress={handleSignup}
              activeOpacity={0.9}
              disabled={loading}
              style={[styles.primary, { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <>
                  <Text style={[styles.primaryText, { color: theme.onAccent }]}>
                    Create account
                  </Text>
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
              onPress={handleGoogleSignup}
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
              Already have an account?{" "}
            </Text>
            <Link href="/auth/login" style={[styles.inlineLink, { color: theme.accent }]}>
              Sign in
            </Link>
          </View>

          <Text style={[styles.legal, { color: theme.muted }]}>
            By continuing you agree to the Terms of Use and Privacy Policy.
          </Text>
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
  head: { marginBottom: spacing.xl },
  title: { ...type.display, marginTop: spacing.lg },
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
  divider: { flex: 1, height: StyleSheet.hairlineWidth },
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
  googleText: { ...type.body, fontWeight: weight.semi },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    marginTop: spacing.xl,
  },
  footerText: { ...type.body, fontWeight: weight.regular },
  inlineLink: { ...type.body, fontWeight: weight.bold },
  legal: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    textAlign: "center",
    marginTop: spacing.lg,
  },
});
