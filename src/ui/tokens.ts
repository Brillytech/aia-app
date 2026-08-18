// Shared design tokens. Every screen should pull spacing/radius/type values
// from here instead of hardcoding numbers, so the whole app moves and looks
// like one product instead of five different screens.

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
};

// Layout constants, deliberately kept out of `spacing` so nobody reaches for
// `spacing.tabBarInset` as a margin. These are positions, not ramp steps.
export const layout = {
  screenGutter: 20,
  tabBarInset: 150,
};

export const radius = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  xxl: 34,
  pill: 999,
};

export const weight = {
  regular: "400",
  medium: "600",
  semi: "700",
  bold: "800",
  black: "900",
} as const;

// Type scale. Every step carries an explicit lineHeight — without one, iOS and
// Android derive different defaults from the font metrics and rows drift apart.
// Assign a step directly (`title: type.title`) when a style is exactly the step;
// spread it (`{ ...type.micro, marginTop: 2 }`) only when adding properties.
export const type = {
  micro: { fontSize: 10, lineHeight: 14, fontWeight: weight.bold, letterSpacing: 0.4 },
  kicker: { fontSize: 10, lineHeight: 14, fontWeight: weight.black, letterSpacing: 1 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: weight.bold, letterSpacing: 0.2 },
  body: { fontSize: 14, lineHeight: 20, fontWeight: weight.semi, letterSpacing: 0 },
  bodyStrong: { fontSize: 14, lineHeight: 20, fontWeight: weight.black, letterSpacing: 0 },
  bodyLg: { fontSize: 16, lineHeight: 22, fontWeight: weight.semi, letterSpacing: 0 },
  section: { fontSize: 18, lineHeight: 24, fontWeight: weight.black, letterSpacing: -0.2 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: weight.black, letterSpacing: -0.4 },
  display: { fontSize: 28, lineHeight: 34, fontWeight: weight.black, letterSpacing: -0.6 },
  hero: { fontSize: 34, lineHeight: 40, fontWeight: weight.black, letterSpacing: -0.8 },
  mega: { fontSize: 64, lineHeight: 68, fontWeight: weight.black, letterSpacing: -1.6 },
} as const;

// Elevation presets — pass shadowColor from the active theme.
// Level 0 is a real flat card; it replaces the `shadowColor="transparent"` hack.
//
// Opacities are set for LIGHT mode, where the shadow is the only thing
// separating a card from the page: `card #FFFFFF` on `bg #FBF7EF` is ~3%
// apart, and cards no longer draw a border. Dark mode separates by surface
// hue instead (`card #101A2D` on `bg #07101F`) and barely renders shadows at
// all, so the same numbers are harmless there.
export function elevation(level: 0 | 1 | 2 | 3, shadowColor: string) {
  const presets = {
    0: { shadowOpacity: 0, shadowRadius: 0, elevation: 0, shadowOffset: { width: 0, height: 0 } },
    1: { shadowOpacity: 0.06, shadowRadius: 10, elevation: 2, shadowOffset: { width: 0, height: 4 } },
    2: { shadowOpacity: 0.09, shadowRadius: 16, elevation: 4, shadowOffset: { width: 0, height: 8 } },
    3: { shadowOpacity: 0.12, shadowRadius: 22, elevation: 6, shadowOffset: { width: 0, height: 12 } },
  } as const;

  return { shadowColor, ...presets[level] };
}

// Motion timings — keep every animation in the app on the same clock.
export const motion = {
  fast: 160,
  base: 260,
  slow: 420,
  stagger: 55, // delay between successive list/section items
  pressScale: 0.96,
  springConfig: { damping: 16, stiffness: 220, mass: 0.5 },
};

/**
 * Mix a colour toward white (positive) or black (negative), 0–1.
 *
 * Needed for two-tone artwork like the folder icon, where an alpha tint is
 * wrong — the lighter face has to be opaque, or whatever sits behind the SVG
 * shows through it.
 */
export function shade(color: string, amount: number): string {
  const rgb = toRgb(color);
  if (!rgb) return color;

  const target = amount >= 0 ? 255 : 0;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number) => Math.round(c + (target - c) * t);

  return `rgb(${mix(rgb[0])},${mix(rgb[1])},${mix(rgb[2])})`;
}

function toRgb(color: string): [number, number, number] | null {
  if (color.startsWith("#")) {
    const hex = color.slice(1);
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;

    if (full.length < 6) return null;

    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);

    return Number.isNaN(r + g + b) ? null : [r, g, b];
  }

  const m = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/**
 * Tint a color. Replaces the `${color}18` template-literal pattern, which
 * produces #RRGGBBAA — not reliably supported on react-native-web.
 * Any existing alpha on the input is replaced, not multiplied.
 */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));

  if (color === "transparent") return color;

  if (color.startsWith("#")) {
    const hex = color.slice(1);
    let r: number;
    let g: number;
    let b: number;

    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16);
      g = parseInt(hex[1] + hex[1], 16);
      b = parseInt(hex[2] + hex[2], 16);
    } else if (hex.length === 6 || hex.length === 8) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    } else {
      return color;
    }

    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return color;

    return `rgba(${r},${g},${b},${a})`;
  }

  const rgb = color.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
  if (rgb) return `rgba(${rgb[1]},${rgb[2]},${rgb[3]},${a})`;

  return color;
}
