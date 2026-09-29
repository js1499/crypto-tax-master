"use client";

import { type RefObject, useEffect } from "react";

export type WorkflowTrack = {
  selector: string;
  keyframes: Keyframe[];
};

/** Loops one synchronized walkthrough, preserving its position while offscreen. */
export function useWorkflowPlayback(
  rootRef: RefObject<HTMLDivElement | null>,
  tracks: readonly WorkflowTrack[],
  duration: number,
  reducedMotionTime: number,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const animations = tracks.flatMap(({ selector, keyframes }) =>
      Array.from(root.querySelectorAll(selector), (element) => {
        const animation = element.animate(keyframes, {
          duration,
          iterations: Infinity,
          easing: "linear",
          fill: "both",
        });
        animation.pause();
        animation.currentTime = 0;
        return animation;
      }),
    );

    let inView = false;
    let playing = false;
    let playbackReady = false;
    let startTimer: number | undefined;
    let elapsed = 0;
    let startedAt = 0;

    const timelineTime = () => {
      const time = document.timeline.currentTime;
      return typeof time === "number" ? time : null;
    };

    const seek = (time: number) => {
      for (const animation of animations) animation.currentTime = time;
    };

    const suspend = () => {
      if (!playing) return;

      const now = timelineTime();
      if (now !== null) elapsed = (now - startedAt) % duration;
      for (const animation of animations) animation.pause();
      // Use one time for every track, including a pause between rendered frames.
      seek(elapsed);
      playing = false;
    };

    const sync = () => {
      const reducedMotion = preference.matches;
      const shouldPlay = playbackReady && inView && !document.hidden && !reducedMotion;

      root.dataset.reducedMotion = String(reducedMotion);
      root.dataset.playbackReady = String(playbackReady);

      if (!shouldPlay) {
        suspend();
        seek(reducedMotion ? reducedMotionTime : elapsed);
      } else if (!playing) {
        const now = timelineTime();
        if (now !== null) {
          startedAt = now - elapsed;
          for (const animation of animations) {
            animation.currentTime = elapsed;
            animation.play();
            // Setting a shared startTime resolves pending play tasks without drift.
            animation.startTime = startedAt;
          }
          playing = true;
        }
      }

      root.dataset.playing = String(playing);
      root.dataset.completed = String(reducedMotion);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = Boolean(entry?.isIntersecting && entry.intersectionRatio >= 0.2);
        sync();
      },
      { threshold: 0.2 },
    );

    sync();
    observer.observe(root);
    document.addEventListener("visibilitychange", sync);
    preference.addEventListener("change", sync);

    const schedulePlayback = () => {
      startTimer = window.setTimeout(() => {
        playbackReady = true;
        sync();
      }, 1_000);
    };
    if (document.readyState === "complete") {
      schedulePlayback();
    } else {
      window.addEventListener("load", schedulePlayback, { once: true });
    }

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      preference.removeEventListener("change", sync);
      window.removeEventListener("load", schedulePlayback);
      if (startTimer !== undefined) window.clearTimeout(startTimer);
      for (const animation of animations) animation.cancel();
      root.dataset.playing = "false";
    };
  }, [rootRef, tracks, duration, reducedMotionTime]);
}
