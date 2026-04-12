"use client";

import { useEffect } from "react";

export function LandingPage({ bodyHtml }: { bodyHtml: string }) {
  useEffect(() => {
    // Load landing page CSS
    const cssLink = document.createElement("link");
    cssLink.rel = "stylesheet";
    cssLink.href = "/landing/landing.css";
    document.head.appendChild(cssLink);

    // Load landing page fonts
    const fontLink1 = document.createElement("link");
    fontLink1.rel = "stylesheet";
    fontLink1.href = "https://fonts.cdnfonts.com/css/cabinet-grotesk";
    document.head.appendChild(fontLink1);

    const fontLink2 = document.createElement("link");
    fontLink2.rel = "stylesheet";
    fontLink2.href = "https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap";
    document.head.appendChild(fontLink2);

    // Set theme attribute for landing page CSS
    document.documentElement.setAttribute("data-theme", "light");

    // Load the landing page JavaScript (scroll reveals, particles, tabs, etc.)
    const script = document.createElement("script");
    script.src = "/landing/landing.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      try {
        document.head.removeChild(cssLink);
        document.head.removeChild(fontLink1);
        document.head.removeChild(fontLink2);
        document.body.removeChild(script);
      } catch { /* already removed */ }
      document.documentElement.removeAttribute("data-theme");
    };
  }, []);

  return (
    <div dangerouslySetInnerHTML={{ __html: bodyHtml }} />
  );
}
