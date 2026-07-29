"use client";

import { useEffect, useState } from "react";

/** Thin fixed bar at the very top that fills as the reader scrolls the page. */
export function ReadingProgress({ color }: { color: string }) {
  const [pct, setPct] = useState(0);
  useEffect(() => {
    const update = () => {
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      setPct(max > 0 ? Math.min(100, Math.max(0, (el.scrollTop / max) * 100)) : 0);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div
      aria-hidden="true"
      style={{ position: "fixed", top: 0, left: 0, right: 0, height: 3, zIndex: 60, pointerEvents: "none" }}
    >
      <div style={{ height: "100%", width: `${pct}%`, background: color, transition: "width 80ms linear" }} />
    </div>
  );
}
