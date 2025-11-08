"use client";

import { useEffect } from "react";

export default function UseAutoOpenVirtualTableOnScrollEnd() {

  useEffect(() => {
    const middle = document.querySelector(".middle-panel");
    const shell = document.querySelector(".dash-shell");

    if (!middle || !shell) return;

    const handler = () => {
      const scrollTop = middle.scrollTop;
      const scrollHeight = middle.scrollHeight;
      const clientHeight = middle.clientHeight;

      // how close to bottom?
      const remaining = scrollHeight - (scrollTop + clientHeight);

      // ✅ threshold before switching to virtual table
      const threshold = 80; // px before bottom

      if (remaining <= threshold) {
        shell.classList.add("vt-open");
      } else {
        shell.classList.remove("vt-open");
      }
    };

    middle.addEventListener("scroll", handler);
    return () => middle.removeEventListener("scroll", handler);
  }, []);

  return null;
}
