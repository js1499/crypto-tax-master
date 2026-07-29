import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getAllPosts,
  getPost,
  getCategory,
  getPostsByCategory,
  getArticleJsonLd,
  postHref,
} from "@/lib/blog";
import { Breadcrumbs } from "@/components/breadcrumbs";

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
    <article>
      <Breadcrumbs
        items={[
          { name: "Home", href: "/" },
          { name: "Blog", href: "/blog" },
          { name: cat?.name ?? "Blog", href: `/blog/${post.category}` },
          { name: post.title, href: postHref(post) },
        ]}
      />
      <h1 className="blog-h1">{post.title}</h1>
      <p className="blog-lede">{post.description}</p>
      <div className="blog-meta">
        By {post.author} · {fmt(post.datePublished)} · {post.readingTimeMinutes} min read ·{" "}
        <Link href={`/blog/${post.category}`}>{cat?.name}</Link>
      </div>

      <div className="blog-body" dangerouslySetInnerHTML={{ __html: post.html }} />

      {related.length > 0 && (
        <>
          <div className="blog-section-title">Related articles</div>
          <ul className="blog-post-list">
            {related.map((p) => (
              <li key={p.slug} className="blog-post-item">
                <Link href={postHref(p)} className="blog-post-title">
                  {p.title}
                </Link>
                <p>{p.excerpt}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(getArticleJsonLd(post)) }}
      />
    </article>
  );
}
