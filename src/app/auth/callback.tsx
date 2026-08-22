import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../../lib/supabase";
import { routeAfterAuth } from "../../auth-redirect";
import { lightTheme } from "../../theme";
import { layout, spacing, type, weight } from "../../ui/tokens";
import { Wordmark } from "../../ui/Wordmark";

/**
 * Landing point for Google OAuth.
 *
 * This route did not exist before. On native it never needed to: the redirect
 * was a custom scheme that `WebBrowser.openAuthSessionAsync` intercepted
 * in-process, so the app never actually navigated to `/auth/callback`. A
 * browser genuinely navigates here, so without this file the user lands on a
 * dead route mid-login.
 *
 * There is nothing to parse. The client is configured with
 * `detectSessionInUrl`, so Supabase has already taken the tokens out of the
 * URL by the time this mounts — this screen only waits for the result and
 * forwards accordingly.
 */
export default function AuthCallback() {
  const theme = lightTheme;
  const [message, setMessage] = useState("Finishing sign in…");

  useEffect(() => {
    let active = true;

    async function finish(userId: string) {
      await routeAfterAuth(userId, (error) => {
        if (!active) return;
        setMessage(error);
        setTimeout(() => router.replace("/auth/login"), 1500);
      });
    }

    // Session may already be in place by first paint, or may land a tick later
    // once detectSessionInUrl finishes — so check once and also subscribe.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      if (data.session?.user?.id) finish(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      if (session?.user?.id) finish(session.user.id);
    });

    // Nothing arrived — a cancelled consent screen, a stale link, or a
    // redirect URL missing from the Supabase allowlist. Bounce to login
    // rather than spinning forever.
    const timeout = setTimeout(async () => {
      if (!active) return;
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setMessage("Could not complete sign in.");
        router.replace("/auth/login");
      }
    }, 8000);

    return () => {
      active = false;
      clearTimeout(timeout);
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <View style={styles.center}>
        <Wordmark theme={theme} brand />
        <ActivityIndicator color={theme.accent} style={styles.spinner} />
        <Text style={[styles.text, { color: theme.muted }]}>{message}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: layout.screenGutter,
  },
  spinner: { marginTop: spacing.xxl },
  text: {
    ...type.body,
    fontWeight: weight.regular,
    marginTop: spacing.md,
    textAlign: "center",
  },
});
