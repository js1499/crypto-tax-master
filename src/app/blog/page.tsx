import Link from "next/link";
import { BLOG_CATEGORIES, getAllPosts, postHref, getBlogListingJsonLd } from "@/lib/blog";
import { Breadcrumbs } from "@/components/breadcrumbs";

const HUB_DESC =
  "Clear, practical guides to crypto and equities taxes — how crypto is taxed, DeFi and staking, exchange tax documents, and ways to lower your bill.";

export const metadata = {
  title: "Crypto Tax Blog & Guides",
  description: HUB_DESC,
  alternates: { canonical: "/blog" },
};

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export default function BlogHubPage() {
  const posts = getAllPosts();
  const jsonLd = getBlogListingJsonLd("Glide Crypto Tax Blog", HUB_DESC, "/blog", posts);
  return (
    <>
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Blog", href: "/blog" },
        ]}
      />
      <div className="blog-hero">
        <h1>Crypto Tax Blog &amp; Guides</h1>
        <p>{HUB_DESC}</p>
      </div>

      <div className="blog-cats">
        {BLOG_CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/blog/${c.slug}`} className="blog-cat-card">
            <strong>{c.name}</strong>
            <span>{c.description}</span>
          </Link>
        ))}
      </div>

      <div className="blog-section-title">Latest articles</div>
      <ul className="blog-post-list">
        {posts.map((p) => (
          <li key={p.slug} className="blog-post-item">
            <Link href={postHref(p)} className="blog-post-title">
              {p.title}
            </Link>
            <p>{p.excerpt}</p>
            <div className="blog-post-meta">
              {fmt(p.datePublished)} · {p.readingTimeMinutes} min read
            </div>
          </li>
        ))}
      </ul>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
