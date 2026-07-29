import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { BLOG_CATEGORIES, getCategory, getPostsByCategory, getBlogListingJsonLd } from "@/lib/blog";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BlogPostCard } from "@/components/blog-post-card";

export function generateStaticParams() {
  return BLOG_CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const cat = getCategory(category);
  if (!cat) return {};
  return {
    title: cat.title,
    description: cat.description,
    alternates: { canonical: `/blog/${cat.slug}` },
  };
}

export default async function BlogCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const cat = getCategory(category);
  if (!cat) notFound();
  const posts = getPostsByCategory(cat.slug);
  const jsonLd = getBlogListingJsonLd(cat.title, cat.description, `/blog/${cat.slug}`, posts);

  return (
    <div style={{ "--cat": cat.color, "--cat-tint": cat.tint } as unknown as React.CSSProperties}>
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Blog", href: "/blog" },
          { name: cat.name, href: `/blog/${cat.slug}` },
        ]}
      />
      <section className="blog-hero blog-hero--cat">
        <span className="blog-eyebrow">Category</span>
        <h1>{cat.name}</h1>
        <p>{cat.description}</p>
      </section>

      {posts.length === 0 ? (
        <p style={{ color: "#5b6472", margin: "24px 0" }}>New articles are on the way — check back soon.</p>
      ) : (
        <div className="blog-card-grid">
          {posts.map((p) => (
            <BlogPostCard key={p.slug} post={p} showCategory={false} />
          ))}
        </div>
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
