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
import { useMeasure } from "../../ui/layout/measure";
import { AlertModal } from "../../ui/AlertModal";
import { AuthField } from "../../ui/AuthField";
import { Wordmark } from "../../ui/Wordmark";
import { layout, motion, radius, spacing, type, weight, withAlpha } from "../../ui/tokens";

type AlertType = "success" | "error" | "warning" | "info";


export default function ForgotPassword() {
  const measure = useMeasure("form");
  // Pinned to the default theme: pre-auth screens run before any
  // preference exists, and useThemeMode flashes light-then-saved on mount.
  const theme = lightTheme;
  const isDark = false;

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

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
    const shouldGoLogin = alert.type === "success";

    setAlert((prev) => ({ ...prev, visible: false }));

    if (shouldGoLogin) {
      setTimeout(() => {
        router.replace("/auth/login");
      }, 180);
    }
  }


  async function handleReset() {
    const cleanEmail = email.trim().toLowerCase();

    if (!cleanEmail) {
      showAlert("warning", "Email Required", "Please enter your email address.");
      return;
    }

    try {
      setLoading(true);

      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: AUTH_REDIRECTS.passwordReset(),
      });

      if (error) {
        showAlert("error", "Reset Failed", error.message);
        return;
      }

      showAlert(
        "success",
        "Email Sent",
        "A secure password reset link has been sent to your email."
      );
    } finally {
      setLoading(false);
    }
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
          <Animated.View entering={FadeInDown.duration(motion.base)} style={styles.head}>
            {/* Wordmark and lock share a row rather than stacking. Two
                separate blocks above the title made this the tallest head of
                the four screens for the least content. */}
            <View style={styles.brandRow}>
              <Wordmark theme={theme} compact brand />

              <View
                style={[
                  styles.plate,
                  { backgroundColor: withAlpha(theme.accent, isDark ? 0.2 : 0.13) },
                ]}
              >
                <MaterialCommunityIcons name="lock-reset" size={20} color={theme.accent} />
              </View>
            </View>

            <Text style={[styles.title, { color: theme.text }]}>Reset your password</Text>
            <Text style={[styles.subtitle, { color: theme.muted }]}>
              Enter your email and we&apos;ll send you a secure reset link.
            </Text>
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

            <TouchableOpacity
              onPress={handleReset}
              activeOpacity={0.9}
              disabled={loading}
              style={[styles.primary, { backgroundColor: theme.accent, opacity: loading ? 0.7 : 1 }]}
            >
              {loading ? (
                <ActivityIndicator color={theme.onAccent} />
              ) : (
                <>
                  <Text style={[styles.primaryText, { color: theme.onAccent }]}>
                    Send reset link
                  </Text>
                  <MaterialCommunityIcons name="arrow-right" size={20} color={theme.onAccent} />
                </>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.muted }]}>
              Remembered it?{" "}
            </Text>
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
    flexWrap: "wrap",
    marginTop: spacing.xl,
  },
  footerText: { ...type.body, fontWeight: weight.regular },
  inlineLink: { ...type.body, fontWeight: weight.bold },
});
