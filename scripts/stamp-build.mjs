// Stamps dist/index.html with the commit and time it was built.
//
// Runs BETWEEN `expo export` and `build-sw.mjs`: export wipes dist, and the
// service worker's precache manifest hashes index.html, so the stamp has to be
// in the file before that hash is taken or the worker would cache a shell whose
// revision does not match its contents.
//
// WHY THIS EXISTS
// "Is the browser running my change?" has cost several rounds of investigation
// on this project — once against a build that turned out never to have been
// pushed, and once against a stale local dist that produced a blank screenshot.
// Every time, the answer took a bundle diff to find. A build id in the page
// makes it a two-second question: read it in Settings, or in the console.
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const DIST = process.argv[2] || "dist";
const INDEX = path.join(DIST, "index.html");

if (!fs.existsSync(INDEX)) {
  console.error(`[stamp] no index.html in ${DIST}/ — run \`expo export -p web\` first`);
  process.exit(1);
}

function sha() {
  try {
    const out = execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] });
    const dirty = execSync("git status --porcelain", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();

    // Name what made it dirty, in the build log. The "+" on its own says a build
    // came from uncommitted work but not which, and an unexplained marker is one
    // nobody acts on — which is how this one stayed permanently on, reporting a
    // tracked CLI cache file, until someone went looking.
    if (dirty) {
      const lines = dirty.split("\n");
      console.error(`[stamp] tree is dirty, ${lines.length} path(s):`);
      for (const line of lines.slice(0, 20)) console.error(`[stamp]   ${line}`);
      if (lines.length > 20) console.error(`[stamp]   … and ${lines.length - 20} more`);
    }

    return out.toString().trim() + (dirty ? "+" : "");
  } catch {
    // Building outside a checkout is legitimate; the timestamp still identifies
    // the build, which is most of the value.
    return "nogit";
  }
}

const stamp = `${sha()} ${new Date().toISOString().slice(0, 16).replace("T", " ")}Z`;

let html = fs.readFileSync(INDEX, "utf8");

// Idempotent: re-stamping a already-stamped file replaces rather than appends.
html = html.replace(/\s*<meta name="build-id"[^>]*>/g, "");

const head = html.indexOf("</head>");
if (head < 0) {
  // Failing loudly rather than shipping an unstamped build. A stamp that is
  // silently absent is worse than no stamp at all — it would read as "this
  // build is old" the next time someone checks.
  console.error("[stamp] no </head> in index.html — cannot stamp, refusing to continue");
  process.exit(1);
}

html = html.slice(0, head) + `<meta name="build-id" content="${stamp}">` + html.slice(head);
fs.writeFileSync(INDEX, html);

if (!fs.readFileSync(INDEX, "utf8").includes(`content="${stamp}"`)) {
  console.error("[stamp] wrote index.html but the stamp is not in it");
  process.exit(1);
}

console.log(`[stamp] build-id ${stamp}`);
