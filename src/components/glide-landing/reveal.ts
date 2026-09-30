import type { CSSProperties } from "react";

/** Stagger position of a [data-reveal-item]; glide-landing.css turns it into an animation delay. */
export const revealStep = (index: number) => ({ "--i": index }) as CSSProperties;
