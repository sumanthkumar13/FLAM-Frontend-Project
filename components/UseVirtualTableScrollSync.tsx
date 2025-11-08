"use client";

import { useEffect } from "react";

/**
 * Computes a 0..1 progress for the virtual table transition.
 * It reads the element with id="vt-sentinel" placed at the END
 * of the middle panel content (after your last card).
 * Applies the progress to CSS var --vt-progress on .dash-shell.
 * Also toggles interactivity class for VT stage when visible.
 */
export default function UseVirtualTableScrollSync() {
  useEffect(() => {
    const shell = document.querySelector(".dash-shell") as HTMLElement | null;
    const middle = document.querySelector(".middle-panel") as HTMLElement | null;
    const stage = document.querySelector(".vt-stage") as HTMLElement | null;
    const sentinel = document.getElementById("vt-sentinel");

    if (!shell || !middle || !sentinel) return;

    const calc = () => {
      const midRect = middle.getBoundingClientRect();
      const sentRect = sentinel.getBoundingClientRect();

      // When the top of sentinel starts entering middle viewport,
      // start progress; when it passes the bottom + extra “runway”, finish at 1.
      const start = midRect.top + 40;              // slightly before fully visible
      const end = midRect.bottom + 0.6 * window.innerHeight; // extra runway for slow, premium feel

      const y = sentRect.top; // position of sentinel top
      let p = (start - y) / (start - end);
      p = Math.min(1, Math.max(0, p));

      shell.style.setProperty("--vt-progress", p.toFixed(3));

      // Make VT stage clickable after ~5% reveal
      if (stage) {
        if (p > 0.05) stage.classList.add("vt-stage--interactive");
        else stage.classList.remove("vt-stage--interactive");
      }

      // Optional: broadcast for components that want the number
      document.dispatchEvent(new CustomEvent("vt-progress", { detail: p }));
    };

    calc();

    // Scroll + resize
    const onScroll = () => calc();
    const onResize = () => calc();
    middle.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);

    // Resize observer to recalc on content growth
    const ro = new ResizeObserver(calc);
    ro.observe(middle);

    return () => {
      middle.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      ro.disconnect();
    };
  }, []);

  return null;
}
