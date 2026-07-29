import type { MetadataRoute } from "next";
import { BLOG_CATEGORIES, getAllPosts, postHref } from "@/lib/blog";

const SITE_URL = "https://glidetaxes.com";

// Public, indexable URLs only. Excludes the authenticated app, auth screens, /checkout, /api, and
// the noindexed ad-only landers (/defi, /fast, /audit, /lp). Blog category + post URLs are pulled
// from the blog registry, so new articles are auto-discovered here.
export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/blog`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/cpa-filing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
  const categoryRoutes: MetadataRoute.Sitemap = BLOG_CATEGORIES.map((c) => ({
    url: `${SITE_URL}/blog/${c.slug}`,
    changeFrequency: "weekly",
    priority: 0.6,
  }));
  const postRoutes: MetadataRoute.Sitemap = getAllPosts().map((p) => ({
    url: `${SITE_URL}${postHref(p)}`,
    lastModified: p.dateModified ?? p.datePublished,
    changeFrequency: "monthly",
    priority: 0.6,
  }));
  return [...staticRoutes, ...categoryRoutes, ...postRoutes];
}
