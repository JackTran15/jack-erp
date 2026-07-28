import { afterEach, describe, expect, it, vi } from "vitest";

import { printHtmlDocument } from "./print-html-document";

/**
 * jsdom does not implement `window.print`, and iframe navigation never fires
 * a real `load` event synchronously — so each test wires the iframe's
 * `onload`/`print` by hand instead of waiting on jsdom to drive them.
 */
function stubIframePrint() {
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
    const el = originalCreateElement(tagName);
    if (tagName === "iframe") {
      const iframe = el as HTMLIFrameElement;
      Object.defineProperty(iframe, "contentWindow", {
        configurable: true,
        get: () => iframe.contentDocument?.defaultView ?? window,
      });
      queueMicrotask(() => iframe.onload?.(new Event("load")));
    }
    return el;
  });
}

describe("printHtmlDocument", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll("iframe").forEach((el) => el.remove());
  });

  it("removes the iframe from the DOM once printing finishes", async () => {
    stubIframePrint();
    const printSpy = vi
      .spyOn(window, "print")
      .mockImplementation(function (this: Window) {
        this.onafterprint?.(new Event("afterprint"));
      });

    await printHtmlDocument("<html><body>hello</body></html>");

    expect(printSpy).toHaveBeenCalledOnce();
    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });

  it("leaves no stray iframe after two consecutive calls", async () => {
    stubIframePrint();
    vi.spyOn(window, "print").mockImplementation(function (this: Window) {
      this.onafterprint?.(new Event("afterprint"));
    });

    await printHtmlDocument("<html><body>first</body></html>");
    await printHtmlDocument("<html><body>second</body></html>");

    expect(document.querySelectorAll("iframe")).toHaveLength(0);
  });

  it("resolves without throwing outside a browser environment", async () => {
    const originalDocument = globalThis.document;
    // @ts-expect-error simulating an SSR/non-DOM environment
    delete globalThis.document;

    await expect(printHtmlDocument("<html></html>")).resolves.toBeUndefined();

    globalThis.document = originalDocument;
  });
});
