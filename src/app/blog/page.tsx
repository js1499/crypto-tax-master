import Link from "next/link";
import { BLOG_CATEGORIES, getAllPosts, getBlogListingJsonLd } from "@/lib/blog";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BlogPostCard } from "@/components/blog-post-card";

const HUB_DESC =
  "Clear, practical guides to crypto and equities taxes — how crypto is taxed, DeFi and staking, exchange tax documents, and ways to lower your bill.";

export const metadata = {
  title: "Crypto Tax Blog & Guides",
  description: HUB_DESC,
  alternates: { canonical: "/blog" },
};

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
      <section className="blog-hero">
        <span className="blog-eyebrow">Glide Blog</span>
        <h1>Crypto taxes, explained.</h1>
        <p>{HUB_DESC}</p>
      </section>

      <div className="blog-section-label">Browse by topic</div>
      <div className="blog-cats">
        {BLOG_CATEGORIES.map((c) => (
          <Link key={c.slug} href={`/blog/${c.slug}`} className="blog-cat-card">
            <strong>{c.name}</strong>
            <span>{c.description}</span>
            <em>Read articles →</em>
          </Link>
        ))}
      </div>

      <div className="blog-section-label">Latest articles</div>
      <div className="blog-card-grid">
        {posts.map((p) => (
          <BlogPostCard key={p.slug} post={p} />
        ))}
      </div>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
