import Link from "next/link";
import { type BlogPost, getCategory, postHref } from "@/lib/blog";

const fmt = (iso: string) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** Reusable article card used on the hub, category pages, and related-posts sections.
 *  Colored per the post's category via the --cat / --cat-tint CSS variables. */
export function BlogPostCard({ post, showCategory = true }: { post: BlogPost; showCategory?: boolean }) {
  const cat = getCategory(post.category);
  const style = cat
    ? ({ "--cat": cat.color, "--cat-tint": cat.tint } as unknown as React.CSSProperties)
    : undefined;
  return (
    <Link href={postHref(post)} className="blog-card" style={style}>
      {showCategory && <span className="blog-pill">{cat?.name ?? "Article"}</span>}
      <h3 className="blog-card-title">{post.title}</h3>
      <p className="blog-card-excerpt">{post.excerpt}</p>
      <div className="blog-card-meta">
        {fmt(post.datePublished)} · {post.readingTimeMinutes} min read
      </div>
    </Link>
  );
}
