/**
 * Turning the summary HTML into a PDF on the web.
 *
 * `expo-print`'s entire web implementation is four lines: `printToFileAsync()`
 * calls `window.print()` and returns `undefined`. There is no browser API that
 * renders HTML to a PDF file silently, so the only route to a real PDF is the
 * print dialog's own "Save as PDF".
 *
 * WHY THIS PRINTS A WINDOW AND NOT AN IFRAME
 * ------------------------------------------
 * The first two attempts printed an offscreen iframe. Both produced a PDF with
 * no suggested filename, and the reason was measured rather than guessed:
 *
 *   window.print() on the top-level document  -> `beforeprint` FIRES
 *   iframe.contentWindow.print()              -> parent `beforeprint` NEVER fires
 *
 * `beforeprint` fires only in the document being printed. So Chrome prints the
 * *frame's* document — which meant the second attempt's trick of temporarily
 * borrowing the parent's `document.title` was writing to a document Chrome
 * never consults. And the frame's own document, though correctly titled
 * (verified: `about:srcdoc`, title present at load), is a `srcdoc` document
 * with no real URL, which is where the suggested filename goes missing.
 *
 * Printing a genuine top-level document removes both problems: it is the
 * document Chrome prints, and its `document.title` is what names the job.
 *
 * The window must be opened inside the click that triggered it — see
 * `openPrintWindow` — because popup blockers reject `window.open` once the
 * user gesture has been spent on an `await`.
 */

/** Escapes a string for safe use as element text. */
function escapeTitle(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Puts a `<title>` into the document being printed. This is what the browser
 * turns into the suggested PDF filename, so it is also the filename.
 */
function withTitle(html: string, title: string) {
  const tag = `<title>${escapeTitle(title)}</title>`;

  if (/<title[\s>]/i.test(html)) {
    return html.replace(/<title[^>]*>[\s\S]*?<\/title>/i, tag);
  }
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head([^>]*)>/i, `<head$1>${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html([^>]*)>/i, `<html$1><head>${tag}</head>`);

  return `<head>${tag}</head>${html}`;
}

/**
 * Builds the suggested PDF filename.
 *
 * Browsers sanitise this themselves, but they differ on how, so the string is
 * pre-normalised to something every platform accepts unchanged: no slashes, no
 * colons, no runs of whitespace.
 */
export function summaryPrintTitle(materialTitle: string) {
  const clean = String(materialTitle || "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return clean ? `LASU-Scholar-${clean}` : "LASU-Scholar-Summary";
}

/**
 * Opens the blank window that `printHtmlDocument` will fill.
 *
 * MUST be called synchronously from the event handler, before any `await`.
 * A popup opened after the gesture has been spent is blocked, and the caller
 * then has no window to print into.
 *
 * Returns null when the popup was blocked, which the caller should surface
 * rather than fail silently.
 */
export function openPrintWindow(): Window | null {
  if (typeof window === "undefined") return null;

  try {
    const win = window.open("", "_blank", "width=820,height=1000");
    if (!win) return null;

    // Something to look at while the summary is assembled — an empty white
    // popup reads as a broken tab.
    win.document.write(
      `<!DOCTYPE html><html><head><title>Preparing summary…</title></head>` +
        `<body style="margin:0;display:flex;align-items:center;justify-content:center;` +
        `height:100vh;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;` +
        `color:#5B6678;background:#FBF7EF">Preparing summary…</body></html>`,
    );

    return win;
  } catch {
    return null;
  }
}

/**
 * Writes the summary into an already-open window and prints it.
 *
 * `printWindow` comes from `openPrintWindow()` called in the click handler.
 */
export function printHtmlDocument(
  html: string,
  title: string,
  printWindow: Window | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Printing is only available in a browser."));
      return;
    }

    if (!printWindow || printWindow.closed) {
      reject(
        new Error(
          "Could not open the print view. Please allow pop-ups for this site and try again.",
        ),
      );
      return;
    }

    const safeTitle = title || "LASU-Scholar-Summary";

    try {
      // document.write over srcdoc/blob deliberately: it produces a document
      // that inherits this origin and keeps the opener's URL, so the window is
      // a first-class top-level document rather than an `about:` one.
      printWindow.document.open();
      printWindow.document.write(withTitle(html, safeTitle));
      printWindow.document.close();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }

    let settled = false;

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      if (error) reject(error);
      else resolve();
    }

    function doPrint() {
      try {
        // Belt and braces: the markup already carries the title, and this
        // covers the case where document.write raced the parser.
        printWindow!.document.title = safeTitle;

        printWindow!.focus();
        printWindow!.print();

        // Closing immediately would cancel the job in some browsers, and the
        // dialog is modal in others, so the close is deferred and guarded.
        // `afterprint` fires when the dialog is dismissed either way.
        const close = () => {
          try {
            if (printWindow && !printWindow.closed) printWindow.close();
          } catch {
            // A window the user has taken over is theirs to close.
          }
        };

        printWindow!.addEventListener("afterprint", close, { once: true });
        setTimeout(close, 60_000);

        finish();
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    }

    // `document.write` on an already-loaded window does not always fire a
    // fresh load event, so poll readiness instead of relying on one.
    if (printWindow.document.readyState === "complete") {
      // Give the parser and any inlined images a tick to settle before the
      // dialog snapshots the page.
      setTimeout(doPrint, 250);
    } else {
      printWindow.addEventListener("load", () => setTimeout(doPrint, 250), { once: true });
      // Fallback for the same reason as above.
      setTimeout(() => {
        if (!settled) doPrint();
      }, 1500);
    }

    const guard = setTimeout(
      () => finish(new Error("The summary took too long to prepare.")),
      20_000,
    );
  });
}
