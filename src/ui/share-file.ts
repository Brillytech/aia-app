/**
 * Sharing and downloading real files on the web.
 *
 * `expo-sharing` maps to `navigator.share` on web, and its `isAvailableAsync`
 * is just `!!navigator.share` — false on most desktop browsers. Worse, the old
 * call sites passed a `file://` or `data:` URI as the `url` field, which Web
 * Share rejects outright. So the previous behaviour on web was: nothing on
 * desktop, and a rejected promise on mobile.
 *
 * Web Share Level 2 is the working path: build a real `File`, ask
 * `navigator.canShare({ files })` whether this browser will take it, and fall
 * back to a plain download when it will not. Between the two, every browser
 * ends up doing something useful.
 */

/** True when this browser can share these actual files (not just any share). */
function canShareFiles(files: File[]) {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files })
  );
}

/**
 * Copies text to the clipboard, reporting whether it actually worked.
 *
 * `writeText` needs a secure context and a focused document, and some browsers
 * additionally require the user gesture to still be "live" — which the awaits
 * before this (font wait, canvas capture, blob conversion) can outlast. So the
 * result is returned rather than assumed, and callers show the caption
 * manually when it comes back false.
 */
export async function copyToClipboard(text: string) {
  try {
    if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Saves a blob to the user's downloads via a synthetic anchor.
 *
 * The object URL is revoked on a delay rather than immediately — Safari
 * cancels an in-flight download if the URL disappears in the same tick.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export type ShareOutcome =
  /** One share sheet carrying the image and the caption together. */
  | "shared"
  /** Browser refused text alongside files; the image went on its own. */
  | "shared-image-only"
  /** No usable share API — image saved to disk. */
  | "downloaded"
  /** User dismissed the share sheet. */
  | "cancelled";

/**
 * Shares image and caption in a single `navigator.share` call where the
 * browser allows it, and degrades in the order that keeps them closest
 * together.
 *
 * The ordering matters, and an earlier version got it wrong: it validated
 * `canShare({ files })` — files only — and then shared `{ files, title, text }`.
 * A browser that accepts files but refuses that combination made `canShare`
 * return true, `share()` throw, and the whole thing fall through to a
 * download. Image and caption were separated by our own control flow, not by
 * any platform limit.
 *
 * Now the exact payload is validated before use, and a browser that rejects
 * the combination still gets offered the image on its own rather than
 * dropping to a download.
 *
 * What remains genuinely outside our control: a share sheet target that
 * receives both and chooses to use only the image. Instagram does this, and so
 * do some WhatsApp flows. Once `share()` resolves, the payload has been handed
 * to the OS correctly and what the destination app does with it is its own
 * decision.
 */
export async function shareOrDownloadBlob(
  blob: Blob,
  filename: string,
  options: { title?: string; text?: string } = {},
): Promise<ShareOutcome> {
  const file = new File([blob], filename, { type: blob.type });

  const full: ShareData = { files: [file] };
  if (options.title) full.title = options.title;
  if (options.text) full.text = options.text;

  const hasShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function";

  // Preferred: everything in one sheet. Validated against the payload that is
  // actually sent, not a simplified stand-in.
  if (hasShare && navigator.canShare(full)) {
    try {
      await navigator.share(full);
      return "shared";
    } catch (error: any) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }

  // The browser will take files but not this combination. Sending the image
  // alone still beats a download — the caller pairs it with a clipboard copy.
  if (hasShare && canShareFiles([file])) {
    try {
      await navigator.share({ files: [file] });
      return "shared-image-only";
    } catch (error: any) {
      if (error?.name === "AbortError") return "cancelled";
    }
  }

  downloadBlob(blob, filename);
  return "downloaded";
}

/** Turns a `data:` URL — what ViewShot returns on web — into a Blob. */
export async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

/**
 * Waits for webfonts to finish loading before a canvas capture.
 *
 * Established by spike test: html2canvas rasterises the offscreen result card
 * and its SVG ring correctly, but only renders `@expo/vector-icons` glyphs if
 * the icon font has already loaded. `react-native-view-shot`'s web path calls
 * html2canvas directly with no such wait, so a share tapped early produces a
 * card with blank squares where the medal, clock and XP icons should be.
 *
 * Resolves rather than rejects on failure: a missing icon is far better than a
 * share button that does nothing.
 */
export async function waitForFonts() {
  try {
    if (typeof document === "undefined" || !document.fonts) return;
    await document.fonts.ready;
  } catch {
    // Ignore — proceed with whatever is loaded.
  }
}

/** Filesystem-safe filename stem. */
export function safeFileName(value: string, fallback: string) {
  return (
    String(value)
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}
