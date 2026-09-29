import type { MetadataRoute } from "next";
import { siteConfig } from "@/lib/site";

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
    sitemap: `${siteConfig.url}/sitemap.xml`,
    host: siteConfig.url,
  };
}
