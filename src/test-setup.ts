import { beforeEach, vi } from "vitest";

// Radix uses layout APIs missing from jsdom; layout is verified in the browser.
beforeEach(() => {
  if (typeof Element === "undefined") return;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollIntoView = vi.fn();
});
