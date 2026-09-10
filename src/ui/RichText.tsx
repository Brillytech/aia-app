import { createElement, useEffect, useState } from "react";
import { Platform, StyleSheet, Text } from "react-native";
import type { Theme } from "../theme";
import { spacing, type as typeScale, weight } from "./tokens";

/**
 * Sanitized HTML with embedded LaTeX, rendered inline in the app.
 *
 * WHY NOT AN IFRAME, GIVEN THE MATERIAL VIEWER IS ONE
 * ---------------------------------------------------
 * `MaterialFrame` frames third-party documents — Drive, arbitrary PDF hosts —
 * where isolation is the point and a fixed-height pane is the correct shape.
 * Neither holds here. This content is ours, and a question has to flow inline
 * between native components at whatever height it happens to be. An iframe has
 * no intrinsic content height, so inline it needs a postMessage/ResizeObserver
 * handshake per frame, and every frame loads its own copy of KaTeX.
 *
 * Measured in a real browser before this was written: a plain `div` injected
 * inside a react-native-web View, with RN-web's actual View reset applied,
 * sized itself to its 219px of content and the native `Text` after it moved
 * down accordingly. So it is a div, created the same way MaterialFrame creates
 * its iframe — React's own `createElement`, the sanctioned way to emit a real
 * DOM node from inside a react-native tree.
 *
 * THE COST OF DROPPING THE IFRAME
 * -------------------------------
 * The HTML now lands in the app's own document, where an escape would run with
 * the student's Supabase session. Server-side sanitizing is not something the
 * client should have to take on trust, so it is sanitized again here against a
 * strict allowlist. That is the trade: no height plumbing, in exchange for
 * owning the sanitize step properly.
 *
 * Native gets the plain-text mirror. There is no DOM there, which is exactly
 * what `question_text` / `answer_text` are for.
 */

/** Formatting only. Nothing that can navigate, load, or execute. */
const ALLOWED_TAGS = [
  "p",
  "br",
  "span",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "code",
  "sub",
  "sup",
  "ol",
  "ul",
  "li",
];

/**
 * `data-latex` carries the source KaTeX renders; `data-display` marks the ones
 * that should be centred on their own line. No `style`, no `href`, no `src`,
 * no `class` — a class would let content reach the app's own stylesheet.
 */
const ALLOWED_ATTR = ["data-latex", "data-display"];

type Engine = {
  sanitize: (html: string) => { clean: string; removed: string[] };
  renderMath: (root: HTMLElement) => void;
};

const KATEX_CSS_ID = "lsr-katex-css";

/**
 * Requests KaTeX's stylesheet once and resolves when it has actually
 * parsed, so the first expression is never painted unstyled.
 *
 * The file and its fonts are copied into public/katex by
 * scripts/sync-katex.js on postinstall; the relative `fonts/...` inside the
 * stylesheet resolves against that directory, which is the whole reason it
 * is served from there rather than imported.
 */
function ensureKatexCss(): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();

  const settle = (link: HTMLLinkElement) =>
    new Promise<void>((resolve) => {
      // Resolve on error as well as load. Unstyled maths is bad; a promise
      // that never settles would strand the question on its plain-text
      // mirror forever, which is worse.
      link.addEventListener("load", () => resolve(), { once: true });
      link.addEventListener("error", () => resolve(), { once: true });
    });

  const existing = document.getElementById(KATEX_CSS_ID) as HTMLLinkElement | null;
  if (existing) return existing.sheet ? Promise.resolve() : settle(existing);

  const link = document.createElement("link");
  link.id = KATEX_CSS_ID;
  link.rel = "stylesheet";
  link.href = "/katex/katex.min.css";
  const done = settle(link);
  document.head.appendChild(link);
  return done;
}

/**
 * Loaded once for the whole app, on the first theory question opened, and
 * shared by every block after that.
 *
 * Measured from the published tarballs: ~87KB gzipped of JS between the two,
 * plus ~98KB of woff2 for the faces a typical expression pulls. None of it is
 * on the critical path for any other screen, which is the entire reason this
 * is a dynamic import rather than a top-level one.
 */
let enginePromise: Promise<Engine> | null = null;

function loadEngine(): Promise<Engine> {
  if (!enginePromise) {
    enginePromise = (async () => {
      const [purify, katexModule] = await Promise.all([
        import("dompurify"),
        import("katex"),
        // NOT `import("katex/dist/katex.min.css")`. Metro emits that as a
        // chunk but leaves the `url("fonts/...")` references inside it
        // untouched, so every face 404s and KaTeX silently falls back to
        // system fonts. Verified against a real export before this was
        // changed: zero KaTeX font files reached dist. The stylesheet is
        // served from public/ instead, beside its fonts.
        ensureKatexCss(),
      ]);

      const DOMPurify = purify.default;
      const katex = katexModule.default;

      return {
        sanitize(html: string) {
          const clean = DOMPurify.sanitize(html, {
            ALLOWED_TAGS,
            ALLOWED_ATTR,
            // Content is a fragment, not a document.
            RETURN_DOM: false,
            RETURN_DOM_FRAGMENT: false,
          });

          // What the allowlist threw away. Silent stripping is how you end up
          // with a question that renders as a run-on sentence and nobody knows
          // why, so in dev this is reported rather than swallowed.
          const removed = (DOMPurify.removed || []).map((entry: any) =>
            String(entry?.element?.nodeName || entry?.attribute?.name || "?").toLowerCase(),
          );

          return { clean, removed };
        },

        renderMath(root: HTMLElement) {
          root.querySelectorAll("span[data-latex]").forEach((node) => {
            const el = node as HTMLElement;
            const source = el.getAttribute("data-latex") || "";

            try {
              katex.render(source, el, {
                // Never throw on a bad expression: one malformed question must
                // not take the screen down. KaTeX renders the error inline in
                // its own error colour instead.
                throwOnError: false,
                displayMode: el.hasAttribute("data-display"),
              });
            } catch {
              // Belt and braces — if KaTeX throws anyway, show the source
              // rather than an empty span.
              el.textContent = source;
            }
          });
        },
      };
    })();
  }

  return enginePromise;
}

/**
 * Rules for the injected markup, added once.
 *
 * Element-level styling cannot come from the RN `style` prop — that only
 * reaches the container — so the children are styled by a real stylesheet.
 * None of these rules carry a colour: the container sets `color` inline from
 * the theme and everything inside inherits it, so there is nothing here to
 * keep in sync when the palette changes.
 */
const STYLE_ID = "lsr-richtext";
const CSS = `
.lsr > :first-child { margin-top: 0; }
.lsr > :last-child { margin-bottom: 0; }
.lsr p { margin: 0 0 12px; }
.lsr ol, .lsr ul { margin: 0 0 12px; padding-left: 22px; }
.lsr li { margin-bottom: 6px; }
.lsr code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 0.92em; }
.lsr .katex { font-size: 1.02em; }
.lsr .katex-display { margin: 14px 0; overflow-x: auto; overflow-y: hidden; }
`;

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;

  const tag = document.createElement("style");
  tag.id = STYLE_ID;
  tag.textContent = CSS;
  document.head.appendChild(tag);
}

export function RichText({
  theme,
  html,
  text,
  size = 16,
  onReady,
}: {
  theme: Theme;
  /** The sanitized-on-the-server HTML. Sanitized again here regardless. */
  html?: string | null;
  /** The plain-text mirror. Shown on native, and before the engine loads. */
  text?: string | null;
  size?: number;
  /**
   * Fires when the block is actually typeset — or immediately when there is
   * nothing to typeset (native, or no html).
   *
   * Exists so a caller can hold a transition until the content it is about
   * to animate exists. Without it, changing question mid-flight lets React
   * reset innerHTML and KaTeX re-run underneath a moving view, which flashes.
   *
   * MUST BE STABLE (useCallback). It is a real effect dependency; an inline
   * arrow re-runs the effect every render. Calling it twice is harmless —
   * every caller uses it to set a flag — but the churn is not.
   */
  onReady?: () => void;
}) {
  const [clean, setClean] = useState<string | null>(null);
  const [node, setNode] = useState<HTMLDivElement | null>(null);

  const web = Platform.OS === "web";
  const plain = (text || "").trim();

  useEffect(() => {
    if (!web || !html) return;

    let live = true;
    ensureStyles();

    loadEngine()
      .then((engine) => {
        if (!live) return;
        const result = engine.sanitize(html);

        if (__DEV__ && result.removed.length) {
          console.log(
            "[RichText] sanitizer removed:",
            Array.from(new Set(result.removed)).join(", "),
            "— widen ALLOWED_TAGS/ALLOWED_ATTR if the admin legitimately emits these.",
          );
        }

        setClean(result.clean);
      })
      .catch((error) => {
        // The plain-text mirror is already on screen, so a failed engine load
        // degrades to readable rather than blank.
        console.log("[RichText] engine failed to load:", error?.message || error);
      });

    return () => {
      live = false;
    };
  }, [web, html]);

  // Runs after React has written the sanitized markup, and again whenever that
  // markup changes. React leaves innerHTML alone when the string is unchanged,
  // so KaTeX's own DOM survives unrelated re-renders.
  useEffect(() => {
    // Nothing to typeset: ready as soon as the plain mirror is on screen.
    if (!web || !html) {
      onReady?.();
      return;
    }

    if (!clean || !node) return;

    let live = true;
    loadEngine().then((engine) => {
      if (!live) return;
      engine.renderMath(node);
      onReady?.();
    });

    return () => {
      live = false;
    };
  }, [clean, node, web, html, onReady]);

  if (!web || !html || clean === null) {
    if (!plain) return null;

    return (
      <Text style={[styles.plain, { color: theme.text, fontSize: size }]}>
        {plain}
      </Text>
    );
  }

  return createElement("div", {
    ref: setNode,
    className: "lsr",
    dangerouslySetInnerHTML: { __html: clean },
    style: {
      color: theme.text,
      fontSize: size,
      lineHeight: `${Math.round(size * 1.62)}px`,
      fontWeight: 400,
      // react-native-web puts font-family on Text elements, not on their
      // containers, so `inherit` here climbed all the way to the browser
      // default and every question rendered in Times. Verified in a real
      // build before this was changed. This is RN-web's own default stack,
      // so injected prose matches the Text beside it.
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      // Long expressions scroll inside the block rather than widening the page.
      maxWidth: "100%",
    },
  });
}

const styles = StyleSheet.create({
  plain: {
    ...typeScale.body,
    fontWeight: weight.regular,
    letterSpacing: 0,
    lineHeight: 26,
    marginBottom: spacing.xs,
  },
});
