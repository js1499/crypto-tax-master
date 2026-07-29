import type { MetadataRoute } from "next";

const SITE_URL = "https://glidetaxes.com";

// Emitted at /robots.txt. Allows the public marketing + blog surface, disallows the authenticated
// app, auth screens, API, the Sentry tunnel, and the ad-only /lp landers. Points crawlers at the
// sitemap. Reinforced by X-Robots-Tag: noindex headers in next.config.js (defense in depth).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/accounts",
        "/transactions",
        "/tax-reports",
        "/settings",
        "/tax-ai",
        "/tutorial",
        "/securities",
        "/checkout",
        "/login",
        "/register",
        "/forgot-password",
        "/reset-password",
        "/lp",
        "/api",
        "/monitoring",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
