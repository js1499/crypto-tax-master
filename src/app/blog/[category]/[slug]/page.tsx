import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllPosts, getPost, getCategory, getPostsByCategory, getArticleJsonLd, postHref } from "@/lib/blog";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { BlogPostCard } from "@/components/blog-post-card";

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ category: p.category, slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}): Promise<Metadata> {
  const { category, slug } = await params;
  const post = getPost(category, slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: postHref(post) },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: postHref(post),
      publishedTime: post.datePublished,
      modifiedTime: post.dateModified ?? post.datePublished,
    },
  };
}

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ category: string; slug: string }>;
}) {
  const { category, slug } = await params;
  const post = getPost(category, slug);
  if (!post) notFound();
  const cat = getCategory(post.category);
  const related = getPostsByCategory(post.category)
    .filter((p) => p.slug !== post.slug)
    .slice(0, 3);

  return (
    <article className="blog-article">
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Blog", href: "/blog" },
          { name: cat?.name ?? "Blog", href: `/blog/${post.category}` },
          { name: post.title, href: postHref(post) },
        ]}
      />
      <Link href={`/blog/${post.category}`} className="blog-article-pill">
        {cat?.name ?? "Article"}
      </Link>
      <h1 className="blog-h1">{post.title}</h1>
      <p className="blog-lede">{post.description}</p>
      <div className="blog-meta">
        By {post.author} · {fmt(post.datePublished)} · {post.readingTimeMinutes} min read
      </div>

      <div className="blog-body" dangerouslySetInnerHTML={{ __html: post.html }} />

      {related.length > 0 && (
        <div className="blog-related">
          <div className="blog-section-label">Related articles</div>
          <div className="blog-card-grid">
            {related.map((p) => (
              <BlogPostCard key={p.slug} post={p} showCategory={false} />
            ))}
          </div>
        </div>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getArticleJsonLd(post)) }}
      />
    </article>
  );
}
