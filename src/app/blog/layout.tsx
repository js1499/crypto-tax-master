import Link from "next/link";

// Chrome + scoped styling shared by every /blog route (hub, category, article). Server-rendered
// so all blog content is crawlable. Inter comes from the root layout; styles are scoped to .blog-*.
const BLOG_CSS = `
.blog-root { min-height: 100vh; background: #ffffff; color: #1f2937; }
.blog-container { max-width: 760px; margin: 0 auto; padding: 0 24px; }
.blog-header { border-bottom: 1px solid #eef0ee; position: sticky; top: 0; background: rgba(255,255,255,0.9); backdrop-filter: saturate(180%) blur(8px); z-index: 10; }
.blog-header__inner { display: flex; align-items: center; justify-content: space-between; height: 64px; max-width: 1080px; }
.blog-logo img { height: 34px; width: auto; display: block; }
.blog-nav { display: flex; align-items: center; gap: 20px; font-size: 14px; font-weight: 600; }
.blog-nav a { color: #374151; text-decoration: none; }
.blog-nav a:hover { color: #0d9668; }
.blog-nav .blog-cta { background: #10b981; color: #04110c; padding: 8px 16px; border-radius: 999px; }
.blog-breadcrumbs { font-size: 13px; color: #6b7280; margin: 28px 0 8px; }
.blog-breadcrumbs ol { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; padding: 0; margin: 0; }
.blog-breadcrumbs a { color: #6b7280; text-decoration: none; }
.blog-breadcrumbs a:hover { color: #0d9668; }
.blog-breadcrumbs [aria-current="page"] { color: #111827; }
.blog-h1 { font-size: 42px; line-height: 1.1; font-weight: 800; letter-spacing: -0.03em; color: #0f172a; margin: 12px 0 10px; }
.blog-lede { font-size: 19px; color: #4b5563; margin: 0 0 8px; }
.blog-meta { font-size: 14px; color: #6b7280; margin: 8px 0 28px; }
.blog-body { font-size: 17px; line-height: 1.75; color: #1f2937; }
.blog-body h2 { font-size: 26px; font-weight: 700; letter-spacing: -0.01em; color: #0f172a; margin: 40px 0 12px; }
.blog-body h3 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 28px 0 8px; }
.blog-body p { margin: 14px 0; }
.blog-body ul, .blog-body ol { margin: 14px 0; padding-left: 24px; }
.blog-body li { margin: 7px 0; }
.blog-body a { color: #0d9668; text-decoration: underline; text-underline-offset: 2px; }
.blog-body strong { color: #111827; }
.blog-body table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 15px; }
.blog-body th, .blog-body td { border: 1px solid #e5e7eb; padding: 8px 12px; text-align: left; }
.blog-body th { background: #f8fafc; font-weight: 700; }
.blog-cta-card { margin: 40px 0 8px; padding: 24px 28px; border: 1px solid #d1fae5; background: #ecfdf5; border-radius: 16px; }
.blog-cta-card h3 { margin: 0 0 6px; font-size: 20px; color: #065f46; }
.blog-cta-card p { margin: 0 0 14px; color: #047857; }
.blog-cta-card a { display: inline-block; background: #10b981; color: #04110c; font-weight: 700; padding: 10px 20px; border-radius: 999px; text-decoration: none; }
.blog-hero { padding: 44px 0 8px; }
.blog-hero h1 { font-size: 46px; line-height: 1.05; font-weight: 800; letter-spacing: -0.03em; color: #0f172a; margin: 8px 0 12px; }
.blog-hero p { font-size: 19px; color: #4b5563; max-width: 640px; }
.blog-cats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin: 28px 0; }
.blog-cat-card { display: block; border: 1px solid #eef0ee; border-radius: 14px; padding: 18px 20px; text-decoration: none; color: inherit; transition: border-color .15s; }
.blog-cat-card:hover { border-color: #10b981; }
.blog-cat-card strong { display: block; color: #0f172a; font-size: 17px; margin-bottom: 4px; }
.blog-cat-card span { color: #6b7280; font-size: 14px; }
.blog-post-list { list-style: none; padding: 0; margin: 24px 0; }
.blog-post-item { padding: 22px 0; border-top: 1px solid #eef0ee; }
.blog-post-item a.blog-post-title { display: block; font-size: 22px; font-weight: 700; color: #0f172a; text-decoration: none; letter-spacing: -0.01em; }
.blog-post-item a.blog-post-title:hover { color: #0d9668; }
.blog-post-item p { margin: 6px 0 8px; color: #4b5563; }
.blog-post-item .blog-post-meta { font-size: 13px; color: #9ca3af; }
.blog-section-title { font-size: 15px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: #9ca3af; margin: 36px 0 4px; }
.blog-footer { border-top: 1px solid #eef0ee; margin-top: 64px; padding: 32px 0; font-size: 14px; color: #6b7280; }
.blog-footer a { color: #6b7280; text-decoration: none; }
.blog-footer a:hover { color: #0d9668; }
@media (max-width: 640px) { .blog-h1, .blog-hero h1 { font-size: 34px; } }
`;

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-root">
      <header className="blog-header">
        <div className="blog-container blog-header__inner">
          <Link href="/" className="blog-logo" aria-label="Glide home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logos/glide-logo.svg" alt="Glide crypto tax software" />
          </Link>
          <nav className="blog-nav">
            <Link href="/blog">Blog</Link>
            <Link href="/#pricing">Pricing</Link>
            <Link href="/#pricing" className="blog-cta">
              Get started
            </Link>
          </nav>
        </div>
      </header>
      <div className="blog-container">{children}</div>
      <footer className="blog-footer">
        <div className="blog-container">
          <p>© 2026 Glide. Crypto &amp; equities tax software.</p>
          <p style={{ marginTop: 6 }}>
            <Link href="/">Home</Link> · <Link href="/blog">Blog</Link> · <Link href="/cpa-filing">CPA filing</Link>{" "}
            · <Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link>
          </p>
        </div>
      </footer>
      <style dangerouslySetInnerHTML={{ __html: BLOG_CSS }} />
    </div>
  );
}
