// Dependency-free, typed blog content model + registry. Posts are TypeScript modules under
// src/content/blog/*, imported explicitly here (so Next bundles them and adding a post is one
// import line). Categories form a hub-and-spoke taxonomy: /blog -> /blog/[category] -> post.

export interface BlogCategory {
  slug: string;
  name: string; // short label (nav, cards)
  title: string; // SEO <title> for the category page
  description: string; // meta description + hub blurb
}

export interface BlogPost {
  slug: string;
  category: string; // category slug
  title: string; // H1 + SEO title
  description: string; // meta description
  excerpt: string; // card blurb on hub/category
  datePublished: string; // ISO (YYYY-MM-DD)
  dateModified?: string;
  author: string;
  readingTimeMinutes: number;
  html: string; // article body
}

const SITE_URL = "https://glidetaxes.com";

export const BLOG_CATEGORIES: BlogCategory[] = [
  {
    slug: "crypto-tax-basics",
    name: "Crypto Tax Basics",
    title: "Crypto Tax Basics — How Crypto Is Taxed",
    description:
      "Plain-English guides to how cryptocurrency is taxed in the US: capital gains, cost basis, income, and the forms you file.",
  },
  {
    slug: "defi-and-staking",
    name: "DeFi & Staking",
    title: "DeFi, Staking & NFT Taxes",
    description:
      "How DeFi swaps, staking rewards, airdrops, bridges, and NFTs are taxed — and how to report them correctly.",
  },
  {
    slug: "exchange-guides",
    name: "Exchange Guides",
    title: "Exchange Tax Guides",
    description:
      "How to find your tax documents and import your full transaction history from Coinbase, Binance, Kraken, and more.",
  },
  {
    slug: "tax-strategy",
    name: "Tax Strategy",
    title: "Crypto Tax Strategy",
    description:
      "Legal ways to reduce your crypto tax bill: tax-loss harvesting, holding periods, cost-basis methods, and more.",
  },
];

// --- Post registry. Posts live in src/content/blog/* and are aggregated in manifest.ts.
// To add an article: create src/content/blog/<slug>.ts and add one line to manifest.ts. ---
import { posts } from "@/content/blog/manifest";

export const ALL_POSTS: BlogPost[] = [...posts].sort((a, b) =>
  a.datePublished < b.datePublished ? 1 : -1,
);

export function getAllPosts(): BlogPost[] {
  return ALL_POSTS;
}
export function getCategory(slug: string): BlogCategory | undefined {
  return BLOG_CATEGORIES.find((c) => c.slug === slug);
}
export function getPostsByCategory(slug: string): BlogPost[] {
  return ALL_POSTS.filter((p) => p.category === slug);
}
export function getPost(category: string, slug: string): BlogPost | undefined {
  return ALL_POSTS.find((p) => p.category === category && p.slug === slug);
}
export function postHref(p: BlogPost): string {
  return `/blog/${p.category}/${p.slug}`;
}

// --- Structured data ---
export function getArticleJsonLd(p: BlogPost) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: p.title,
    description: p.description,
    datePublished: p.datePublished,
    dateModified: p.dateModified ?? p.datePublished,
    author: { "@type": "Organization", name: "Glide", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "Glide",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/landing/logos/glide-logo.png` },
    },
    image: `${SITE_URL}/opengraph-image`,
    mainEntityOfPage: { "@type": "WebPage", "@id": `${SITE_URL}${postHref(p)}` },
  };
}

export function getBlogListingJsonLd(name: string, description: string, path: string, posts: BlogPost[]) {
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name,
    description,
    url: `${SITE_URL}${path}`,
    hasPart: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.title,
      url: `${SITE_URL}${postHref(p)}`,
      datePublished: p.datePublished,
    })),
  };
}
