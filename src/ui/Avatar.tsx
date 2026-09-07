import { MaterialCommunityIcons } from "@expo/vector-icons";
import { Image, StyleSheet, Text, View } from "react-native";
import { category, categoryOrder, type Theme } from "../theme";
import { shade, weight, withAlpha } from "./tokens";

/**
 * A person, at any size.
 *
 * WHAT THIS REPLACES
 * ------------------
 * The dashboard's bar fell back to the LASU Scholar logo when a profile had
 * no picture, which is every account on its first day. Two things were wrong
 * with it: the app's mark already sits in the same bar three inches to the
 * left, so the bar showed its own logo twice; and a brand mark in the slot
 * reserved for "you" says the account belongs to the app rather than to the
 * student. Initials say whose account it is even before anyone uploads
 * anything.
 *
 * WHY NOT WHITE ON ORANGE
 * -----------------------
 * The profile screen draws its initials as `onAccent` on a solid accent
 * block, which is fine there because the type is 34pt — large text only needs
 * 3:1, and white on #F97316 measures 3.0. At the 32px used in a bar the
 * initials are 12pt, small text, and the same pair fails. So this uses a
 * tinted disc with deeply shaded ink of the same hue, the treatment already
 * proven on the folder glyph. Measured across all seven category hues it
 * lands between 5.2:1 (yellow, light) and 6.4:1 (orange, light), with dark
 * mode between 5.7:1 and 6.3:1.
 */

/** First and last initial; a single name gives up its first two letters. */
function initialsOf(name?: string | null) {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  const letters =
    words.length === 1
      ? words[0].slice(0, 2)
      : words[0][0] + words[words.length - 1][0];

  return letters.toUpperCase();
}

/**
 * A stable hue per person.
 *
 * Deterministic on the name rather than random, so your own avatar is the
 * same colour every time you open the app — a colour that changed on each
 * load would read as a bug, and it is also what makes the leaderboard
 * scannable once several people are on screen.
 */
function hueFor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return category[categoryOrder[hash % categoryOrder.length]];
}

export function Avatar({
  theme,
  uri,
  name,
  size = 32,
}: {
  theme: Theme;
  /** The uploaded picture, when there is one. */
  uri?: string | null;
  /** Drives both the initials and the hue. */
  name?: string | null;
  size?: number;
}) {
  const frame = {
    width: size,
    height: size,
    // Circles stay `size / 2` arithmetic, per the note in tokens.ts.
    borderRadius: size / 2,
    borderColor: theme.border,
  };

  if (uri) {
    return (
      <View style={[styles.frame, frame]}>
        <Image source={{ uri }} style={styles.image} resizeMode="cover" />
      </View>
    );
  }

  const dark = theme.mode === "dark";
  // "lasu" only so a nameless account still gets a stable colour rather than
  // whatever hue an empty string happens to hash to.
  const hue = hueFor(name || "lasu");
  const initials = initialsOf(name);
  const ink = dark ? shade(hue, 0.35) : shade(hue, -0.45);

  return (
    <View
      style={[
        styles.frame,
        frame,
        { backgroundColor: withAlpha(hue, dark ? 0.28 : 0.16) },
      ]}
    >
      {initials ? (
        <Text
          style={[
            styles.initials,
            {
              color: ink,
              // Proportional rather than a token step: this component is used
              // at 32 in the bar and could be used at 64 elsewhere, and the
              // type scale has no step that suits both.
              fontSize: Math.round(size * 0.38),
              lineHeight: Math.round(size * 0.46),
            },
          ]}
        >
          {initials}
        </Text>
      ) : (
        <MaterialCommunityIcons
          name="account"
          size={Math.round(size * 0.62)}
          color={ink}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  initials: {
    fontWeight: weight.black,
    letterSpacing: 0.2,
  },
});
