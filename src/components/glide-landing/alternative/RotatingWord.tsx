"use client";

import { useEffect, useRef, useState } from "react";

export const rotatingWords = ["simple", "fast", "easy", "accurate"] as const;

// The slot is sized by an invisible in-flow copy of this word — the median width of the set —
// and never resizes, so the static part of the headline stays put. Shorter words leave a little
// air on the right and "accurate" runs a little long; the line's centring drifts by a few pixels.
const anchorWord: (typeof rotatingWords)[number] = "simple";

const holdDuration = 2_000;

/**
 * Rotates the closing word of the hero headline: the leaving word lifts and fades while
 * the next rises into the same fixed slot. Reduced motion pins the first word.
 */
export function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState<number | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const indexRef = useRef(0);
  const activeIndex = reducedMotion ? 0 : index;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(() => {
        if (!document.hidden) {
          const current = indexRef.current;
          const next = (current + 1) % rotatingWords.length;
          indexRef.current = next;
          setLeaving(current);
          setIndex(next);
        }
        schedule();
      }, holdDuration);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [reducedMotion]);

  return (
    <span aria-hidden="true" data-testid="hero-rotating-word" data-word={rotatingWords[activeIndex]} className="hero-rotator">
      <span className="hero-rotator-sizer">{anchorWord}.</span>
      {rotatingWords.map((word, wordIndex) => {
        const state = wordIndex === activeIndex ? "active" : wordIndex === leaving && !reducedMotion ? "leaving" : "idle";
        return (
          <span key={word} data-state={state} onAnimationEnd={state === "leaving" ? () => setLeaving(null) : undefined}>
            {word}.
          </span>
        );
      })}
    </span>
  );
}
