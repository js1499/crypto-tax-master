import type { MetadataRoute } from "next";
import { publicSitemapRoutes, siteConfig } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSitemapRoutes.map((route) => ({
    url: new URL(route, siteConfig.url).toString(),
    changeFrequency: route === "/" ? "weekly" : route.startsWith("/blog") ? "monthly" : "yearly",
    priority: route === "/" ? 1 : route === "/pricing" ? 0.9 : 0.7,
  }));
}
