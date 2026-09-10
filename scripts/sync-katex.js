// Copy KaTeX's stylesheet and web fonts into public/, where Expo will ship
// them verbatim.
//
// WHY THIS EXISTS
// ---------------
// The obvious approach — `import "katex/dist/katex.min.css"` — builds without
// complaint and is broken. Metro emits the stylesheet as its own chunk but
// does NOT resolve the `url("fonts/KaTeX_*.woff2")` references inside it into
// assets. Verified against a real export: the emitted CSS still carried the
// original relative URLs and `dist` contained zero KaTeX font files, so every
// face 404s at runtime and KaTeX silently falls back to system fonts — wrong
// glyphs, wrong metrics, no error anywhere.
//
// Serving the package's own CSS from public/ fixes it without forking the
// file: the relative `fonts/...` inside it then resolves against
// /katex/katex.min.css, which is exactly where the fonts are put below. The
// stylesheet stays byte-identical to the installed version, so upgrading katex
// and re-running this is the whole maintenance story.
//
// Runs on postinstall, so a `npm install` or a version bump refreshes it.

const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "node_modules", "katex", "dist");
const OUT = path.join(__dirname, "..", "public", "katex");

/**
 * woff2 first — every browser released since about 2016 takes it, and it is
 * roughly a third the size of the .ttf. woff is kept as a real fallback for
 * anything older. The .ttf copies are deliberately skipped: they are 817KB of
 * the package's 1.08MB of fonts and no browser will reach for them on the web,
 * because katex.min.css lists woff2 and woff ahead of them in every @font-face.
 */
const FONT_EXTENSIONS = [".woff2", ".woff"];

function main() {
  if (!fs.existsSync(SRC)) {
    // Not an error worth failing an install over — the app builds fine until
    // someone opens a theory question, and a missing node_modules mid-install
    // is a normal transient state.
    console.log("[sync-katex] katex not installed yet, skipping");
    return;
  }

  fs.mkdirSync(path.join(OUT, "fonts"), { recursive: true });

  fs.copyFileSync(
    path.join(SRC, "katex.min.css"),
    path.join(OUT, "katex.min.css"),
  );

  const fonts = fs
    .readdirSync(path.join(SRC, "fonts"))
    .filter((name) => FONT_EXTENSIONS.includes(path.extname(name)));

  let bytes = 0;
  for (const name of fonts) {
    const from = path.join(SRC, "fonts", name);
    fs.copyFileSync(from, path.join(OUT, "fonts", name));
    bytes += fs.statSync(from).size;
  }

  const version = require(path.join(__dirname, "..", "node_modules", "katex", "package.json")).version;
  console.log(
    `[sync-katex] katex ${version}: stylesheet + ${fonts.length} font files ` +
      `(${Math.round(bytes / 1024)}KB) -> public/katex`,
  );
}

main();
