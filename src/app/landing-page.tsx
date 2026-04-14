"use client";

import { useEffect } from "react";

export function LandingPage({ bodyHtml }: { bodyHtml: string }) {
  useEffect(() => {
    // Set theme attribute for landing page CSS
    document.documentElement.setAttribute("data-theme", "light");

    // Load the landing page JavaScript (scroll reveals, particles, tabs, etc.)
    const script = document.createElement("script");
    script.src = "/landing/landing.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      try {
        document.body.removeChild(script);
      } catch { /* already removed */ }
      document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  return (
    <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: bodyHtml }} />
  );
}
