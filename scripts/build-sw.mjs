// Generates dist/sw.js after `expo export -p web`.
//
// Runs as a separate build step because `expo export` wipes dist/ — anything
// written before it is destroyed.
//
// The caching split here is driven by a measurement, not a default. The export
// is ~7.7 MB, and 4.0 MB of that is vector-icon fonts: Expo ships all 19
// families as assets, but the app imports exactly one (MaterialCommunityIcons,
// 147 usages; every other family has zero). Precaching the lot would cost
// every student 7.7 MB on first visit and again on every update, 2.7 MB of it
// fonts that are never loaded.

import { generateSW } from "workbox-build";
import fs from "node:fs";
import path from "node:path";

// A literal RegExp, not a closure — see the note on the NetworkOnly rule
// below for why that distinction matters.
const SUPABASE_URL_RE = /^https:\/\/dabpwmhmkodrvakalsnv\.supabase\.co\//;
const DIST = process.argv[2] || "dist";

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error(`[sw] no index.html in ${DIST}/ — run \`expo export -p web\` first`);
  process.exit(1);
}

const { count, size, warnings } = await generateSW({
  globDirectory: DIST,
  swDest: path.join(DIST, "sw.js"),

  // ---- PRECACHE -----------------------------------------------------------
  // Revisioned, so a new build always replaces the old entry. This is the
  // anti-stale mechanism: Expo does not content-hash index.html, so without a
  // revision a cached shell would keep pointing at a superseded bundle.
  globPatterns: [
    "index.html",
    "manifest.json",
    "_expo/static/js/**/*.js",
    "icon-*.png",
    "favicon.ico",
    // The only icon font the app imports. Without it every glyph in the UI
    // renders as a blank box.
    "assets/**/MaterialCommunityIcons.*.ttf",
  ],
  // Workbox ignores **/node_modules/** by default, and Expo emits the icon
  // fonts to assets/node_modules/@expo/vector-icons/... — a real build output
  // that merely has "node_modules" in its path. Left at the default the font
  // glob silently matches nothing and every glyph ships as a blank box
  // offline. Overridden to exclude only the worker's own files.
  globIgnores: ["sw.js", "workbox-*.js"],

  // 4 MB ceiling per file: the JS bundle is ~3.2 MB and the default limit
  // would silently drop it from the precache, which is the worst possible
  // failure — a service worker that installs cleanly and caches no app.
  maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,

  // ---- UPDATE FLOW --------------------------------------------------------
  // skipWaiting:false makes Workbox emit a {type:'SKIP_WAITING'} message
  // listener instead of activating unconditionally, which is what lets the app
  // show a prompt and let the user decide.
  // clientsClaim:false so a new worker never takes over a page that is still
  // running the previous bundle.
  skipWaiting: false,
  clientsClaim: false,
  cleanupOutdatedCaches: true,

  // ---- NAVIGATION ---------------------------------------------------------
  navigateFallback: "/index.html",
  navigateFallbackDenylist: [
    /^\/_expo\//,
    /^\/assets\//,
    // Anything with a file extension is an asset, not a route: a missing file
    // must 404 rather than be answered with the app shell.
    /\/[^/?]+\.[^/]+$/,
  ],

  runtimeCaching: [
    // ---- NEVER CACHED ----
    // The entire Supabase origin. Auth is the sharp edge — a cached session
    // or a cached 401 is a real bug — and matching the whole origin also keeps
    // every insert/update out of the worker rather than trying to enumerate
    // auth paths.
    {
      // MUST be a RegExp, not a closure. Workbox serialises urlPattern
      // functions into the worker by stringifying them, so a function
      // referencing a build-script constant emits
      // `({url}) => url.origin === CONSTANT` into a scope where that
      // identifier does not exist — a ReferenceError on every match attempt.
      // A RegExp literal survives serialisation intact.
      urlPattern: SUPABASE_URL_RE,
      handler: "NetworkOnly",
    },
    // Everything else cross-origin: Drive previews, wa.me, mailto handoffs.
    {
      urlPattern: ({ url }) => url.origin !== self.location.origin,
      handler: "NetworkOnly",
    },

    // ---- CACHED ONLY IF ACTUALLY REQUESTED ----
    // The 18 unused icon fonts. Left out of the precache; if some future screen
    // imports one, it is cached on first use rather than shipped to everyone.
    {
      urlPattern: /\/assets\/.*\.ttf$/,
      handler: "CacheFirst",
      options: {
        cacheName: "fonts",
        expiration: { maxEntries: 20, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    // Onboarding art (seen once) and expo-router's own icons.
    {
      urlPattern: /\/assets\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
      handler: "CacheFirst",
      options: {
        cacheName: "images",
        expiration: { maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
  ],
});

warnings.forEach((w) => console.warn("[sw] warning:", w));

console.log(`[sw] precached ${count} files, ${(size / 1024 / 1024).toFixed(2)} MB`);
console.log(`[sw] wrote ${path.join(DIST, "sw.js")}`);
