"use client";

import { useEffect } from "react";

/**
 * Plays each graphic's entrance once, the first time it scrolls into view. Graphics opt in with
 * data-reveal="pending"; the stylesheet hides their items only while `reveal-js` is on <html>, so
 * without JavaScript everything is simply visible.
 */
export function RevealOnView() {
  useEffect(() => {
    const targets = Array.from(document.querySelectorAll<HTMLElement>('.glide-landing [data-reveal="pending"]'));
    if (targets.length === 0 || !("IntersectionObserver" in window)) return;

    const root = document.documentElement;
    root.classList.add("reveal-js");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          (entry.target as HTMLElement).dataset.reveal = "in";
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25, rootMargin: "0px 0px -8% 0px" },
    );
    targets.forEach((target) => observer.observe(target));

    return () => {
      observer.disconnect();
      root.classList.remove("reveal-js");
    };
  }, []);

  return null;
}
