import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  BLOG_CATEGORIES,
  getCategory,
  getPostsByCategory,
  postHref,
  getBlogListingJsonLd,
} from "@/lib/blog";
import { Breadcrumbs } from "@/components/breadcrumbs";

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

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

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
    <>
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Blog", href: "/blog" },
          { name: cat.name, href: `/blog/${cat.slug}` },
        ]}
      />
      <div className="blog-hero">
        <h1>{cat.title}</h1>
        <p>{cat.description}</p>
      </div>

      {posts.length === 0 ? (
        <p style={{ color: "#6b7280", margin: "24px 0" }}>New articles are on the way — check back soon.</p>
      ) : (
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
      )}

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
