import { Image, StyleSheet, Text, View } from "react-native";
import type { Theme } from "../theme";
import { radius, spacing, type, weight } from "./tokens";

const logo = require("../../assets/ls-logo.png");

/**
 * The app's display name. Deliberately not read from `app.json` — that still
 * carries the `aia-app` scaffold name, which is the build identifier rather
 * than anything a student should ever be shown.
 */
export const APP_NAME_LEAD = "LASU";
export const APP_NAME_TAIL = "Scholar";

/** The company behind the product. Sits under the app name, never beside it. */
export const BRAND_NAME = "AIA•ACADEMY";

/**
 * Logo plus name, locked up as one unit.
 *
 * The auth screens previously opened on a bare 48pt square with no name
 * anywhere on the page — recognisable only to someone who already knew the
 * app, which is exactly the wrong assumption on a sign-in screen.
 *
 * The type is the app's own scale, not a new typeface: `type.section` is
 * already heavy with tight negative tracking, which is what makes a name read
 * as a wordmark rather than as a heading. Two tones separate the two halves
 * without needing two fonts — the risk-free version of "styled well".
 *
 * Sized to sit *above* each screen's own headline, never to compete with it.
 *
 * `brand` adds AIA•ACADEMY beneath the app name. It is set in the smallest,
 * quietest step in the scale on purpose: a company name is provenance, not a
 * headline, and at kicker size it reads as a mark rather than as another line
 * of copy competing with the two already under it.
 */
export function Wordmark({
  theme,
  /** Smaller and quieter, for screens whose own icon is the focal point. */
  compact = false,
  brand = false,
  /** Drop the mark where the surrounding chrome already carries it — the
   *  dashboard bar shows the same image as the avatar's fallback, and two
   *  copies of one logo in a 44pt bar reads as a mistake. */
  showLogo = true,
}: {
  theme: Theme;
  compact?: boolean;
  brand?: boolean;
  showLogo?: boolean;
}) {
  const size = compact ? 30 : 38;

  return (
    <View style={styles.row}>
      {showLogo ? (
        <Image
          source={logo}
          resizeMode="cover"
          style={[
            styles.logo,
            {
              width: size,
              height: size,
              borderRadius: compact ? radius.xs : radius.sm,
              borderColor: theme.border,
            },
          ]}
        />
      ) : null}

      <View>
        <Text
          style={[compact ? styles.nameCompact : styles.name, { color: theme.text }]}
          numberOfLines={1}
        >
          {APP_NAME_LEAD}
          <Text style={{ color: theme.accent }}> {APP_NAME_TAIL}</Text>
        </Text>

        {brand ? (
          <Text style={[styles.brand, { color: theme.muted2 }]} numberOfLines={1}>
            {BRAND_NAME}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: spacing.sm,
  },
  logo: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  name: {
    ...type.section,
    // Tighter than the scale's -0.2. At wordmark size the letters need to sit
    // closer than they would in a heading, or the name reads as a sentence.
    letterSpacing: -0.6,
  },
  nameCompact: {
    ...type.bodyLg,
    fontWeight: weight.black,
    letterSpacing: -0.4,
  },
  brand: {
    ...type.kicker,
    // Wide tracking is what separates a mark from a word. At 10pt the letters
    // need the air, and it stops AIA•ACADEMY reading as a second headline.
    letterSpacing: 1.4,
    marginTop: 2,
  },
});
