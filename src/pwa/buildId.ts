/**
 * Which build is this, according to the page itself.
 *
 * `scripts/stamp-build.mjs` writes `<meta name="build-id">` into the exported
 * index.html. Reading it back answers "is the browser running my change?"
 * without diffing a bundle — which is what that question has cost on this
 * project more than once.
 *
 * Null off the web, and null in development, where there is no export step to
 * stamp and the answer is always "whatever Metro just compiled".
 */
export function getBuildId(): string | null {
  if (typeof document === "undefined") return null;

  const meta = document.querySelector('meta[name="build-id"]');

  return meta?.getAttribute("content") || null;
}
