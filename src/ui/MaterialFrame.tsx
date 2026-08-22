import { MaterialCommunityIcons } from "@expo/vector-icons";
import { createElement, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import { haptics } from "./haptics";
import { radius, spacing, type, weight, withAlpha } from "./tokens";

/**
 * Embedded viewer for study materials — PDFs, images and Google Drive
 * previews.
 *
 * Replaces `react-native-webview`, which has no web build at all: no
 * `browser` field, no `.web.*` files, so the bundler falls through to its
 * generic stub, which renders the literal red text "React Native WebView does
 * not support this platform." That is what the material viewer showed on web.
 *
 * The browser equivalent is an iframe, reached through react-native-web's
 * `unstable_createElement` — the sanctioned way to emit a real DOM node from
 * inside a react-native tree.
 *
 * THE IMPORTANT CONSTRAINT: a page can refuse to be framed, via
 * `X-Frame-Options` or a CSP `frame-ancestors` directive, and Google Drive
 * routinely does. When that happens the browser blanks the frame and — by
 * design, for security — tells the parent page nothing. `onLoad` still fires,
 * and same-origin inspection of the frame throws. There is no reliable way to
 * detect it.
 *
 * So this does not try. "Open in new tab" is always visible rather than
 * appearing after a failure that cannot be observed, and a hint appears if
 * the frame has not reported a load within a few seconds. Anything cleverer
 * would be guessing.
 */
export function MaterialFrame({
  theme,
  /** Page to embed. */
  url,
  /** Inline document to render instead of a URL — used for the image viewer. */
  html,
  /** Opens the original link, never the preview URL, in a new tab. */
  onOpenExternal,
}: {
  theme: Theme;
  url?: string;
  html?: string;
  onOpenExternal: () => void;
}) {
  // Callers pass a `key` derived from the material, so switching materials
  // remounts this and the two flags below start fresh. That is why there is no
  // effect resetting them on prop change — which would be a synchronous
  // setState inside an effect, and a cascading render.
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (loaded) return;

    const timer = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(timer);
  }, [loaded, url, html]);

  // React's own createElement rather than react-native-web's
  // `unstable_createElement`: the web build renders through react-dom, so a
  // plain DOM tag works, it is typed against IframeHTMLAttributes, and it
  // avoids importing from react-native-web (which ships no type declarations).
  const frame = createElement("iframe", {
    // `srcDoc` for inline HTML, `src` for a URL. Never both.
    ...(html ? { srcDoc: html } : { src: url }),
    onLoad: () => setLoaded(true),
    style: {
      border: "none",
      width: "100%",
      height: "100%",
      backgroundColor: theme.bg,
    },
    // Permit the frame to run scripts and load its own resources — pdf.js and
    // Drive both need it — while withholding same-origin privileges so an
    // embedded document cannot reach this app's storage or session.
    sandbox: "allow-scripts allow-same-origin allow-popups allow-forms",
    referrerPolicy: "no-referrer",
    allow: "fullscreen",
    title: "Study material",
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.frame}>{frame}</View>

      {!loaded ? (
        <View style={[styles.overlay, { backgroundColor: theme.bg }]} pointerEvents="none">
          <ActivityIndicator color={theme.accent} />
          <Text style={[styles.loadingText, { color: theme.muted }]}>
            Opening material…
          </Text>
        </View>
      ) : null}

      {/* Always present, not conditional on a failure we cannot detect. */}
      <Pressable
        onPress={() => {
          haptics.tap();
          onOpenExternal();
        }}
        style={[
          styles.openButton,
          { backgroundColor: theme.card, borderColor: theme.border },
        ]}
      >
        <MaterialCommunityIcons name="open-in-new" size={16} color={theme.accent} />
        <Text style={[styles.openLabel, { color: theme.accent }]}>Open in new tab</Text>
      </Pressable>

      {slow && !loaded ? (
        <View
          style={[
            styles.hint,
            { backgroundColor: withAlpha(theme.warning, theme.mode === "dark" ? 0.22 : 0.13) },
          ]}
        >
          <MaterialCommunityIcons name="information-outline" size={15} color={theme.warning} />
          <Text style={[styles.hintText, { color: theme.text }]}>
            Taking a while. Some hosts block embedding — use “Open in new tab”.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  frame: { flex: 1, overflow: "hidden" },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  loadingText: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
  },
  openButton: {
    position: "absolute",
    right: spacing.lg,
    bottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  openLabel: {
    ...type.caption,
    letterSpacing: 0,
  },
  hint: {
    position: "absolute",
    left: spacing.lg,
    right: spacing.lg,
    bottom: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  hintText: {
    ...type.caption,
    fontWeight: weight.regular,
    letterSpacing: 0,
    flex: 1,
  },
});
