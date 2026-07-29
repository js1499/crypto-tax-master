import Link from "next/link";

// Editorial chrome + scoped design system shared by every /blog route. Server-rendered so all
// content is crawlable. Inter comes from the root layout. Per-category accent color is passed in
// via the --cat / --cat-tint CSS variables (set on cards, category pages, and article pages).
const BLOG_CSS = `
.blog-root {
  --ink:#0f172a; --muted:#5b6472; --soft:#8a94a3; --line:#e8ebe9;
  --accent:#10b981; --accent-dim:#0d9668;
  --cat:#0d9668; --cat-tint:#ecfdf5;
  min-height:100vh; background:#ffffff; color:#1f2937;
  font-family: var(--font-sans), system-ui, -apple-system, sans-serif;
  -webkit-font-smoothing:antialiased;
}
.blog-container { max-width:1120px; margin:0 auto; padding:0 24px; }

/* Header */
.blog-header { position:sticky; top:0; z-index:20; background:rgba(255,255,255,0.85); backdrop-filter:saturate(180%) blur(10px); border-bottom:1px solid var(--line); }
.blog-header__inner { display:flex; align-items:center; justify-content:space-between; height:66px; }
.blog-logo img { height:30px; width:auto; display:block; }
.blog-nav { display:flex; align-items:center; gap:26px; font-size:14.5px; font-weight:600; }
.blog-nav a { color:#374151; text-decoration:none; transition:color .15s; }
.blog-nav a:hover { color:var(--accent-dim); }
.blog-nav .blog-cta { background:var(--ink); color:#fff; padding:9px 18px; border-radius:999px; }
.blog-nav .blog-cta:hover { background:#1f2937; color:#fff; }

/* Breadcrumbs */
.blog-breadcrumbs { font-size:13px; color:var(--muted); margin:26px 0 0; }
.blog-breadcrumbs ol { list-style:none; display:flex; flex-wrap:wrap; gap:6px; padding:0; margin:0; }
.blog-breadcrumbs a { color:var(--muted); text-decoration:none; }
.blog-breadcrumbs a:hover { color:var(--accent-dim); }
.blog-breadcrumbs [aria-current="page"] { color:var(--ink); }

/* Hero */
.blog-hero { padding:46px 0 26px; border-bottom:1px solid var(--line); margin-bottom:34px; }
.blog-eyebrow { display:inline-block; font-size:13px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--accent-dim); margin-bottom:14px; }
.blog-hero--cat .blog-eyebrow { color:var(--cat); }
.blog-hero h1 { font-size:52px; line-height:1.04; font-weight:800; letter-spacing:-0.03em; color:var(--ink); margin:0 0 14px; }
.blog-hero p { font-size:20px; line-height:1.5; color:var(--muted); max-width:680px; margin:0; }

/* Section label */
.blog-section-label { font-size:13px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--soft); margin:44px 0 16px; }

/* Category cards */
.blog-cats { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:16px; }
.blog-cat-card { position:relative; display:flex; flex-direction:column; border:1px solid var(--line); border-radius:16px; padding:22px; text-decoration:none; color:inherit; background:#fff; overflow:hidden; transition:border-color .15s, transform .15s, box-shadow .15s; }
.blog-cat-card::before { content:""; position:absolute; top:0; left:0; right:0; height:3px; background:var(--cat); opacity:.9; }
.blog-cat-card:hover { border-color:var(--cat); transform:translateY(-2px); box-shadow:0 14px 34px -16px rgba(15,23,42,0.22); }
.blog-cat-dot { width:10px; height:10px; border-radius:4px; background:var(--cat); margin-bottom:12px; }
.blog-cat-card strong { font-size:18px; color:var(--ink); margin-bottom:6px; }
.blog-cat-card span { font-size:14.5px; color:var(--muted); line-height:1.5; flex:1; }
.blog-cat-card em { font-style:normal; font-size:14px; font-weight:600; color:var(--cat); margin-top:14px; }

/* Article card grid */
.blog-card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:18px; }
.blog-card { display:flex; flex-direction:column; border:1px solid var(--line); border-radius:16px; padding:22px 22px 20px; text-decoration:none; color:inherit; background:#fff; transition:border-color .15s, transform .15s, box-shadow .15s; }
.blog-card:hover { border-color:var(--cat); transform:translateY(-2px); box-shadow:0 14px 36px -16px rgba(15,23,42,0.22); }
.blog-pill { align-self:flex-start; font-size:12px; font-weight:700; color:var(--cat); background:var(--cat-tint); border:1px solid transparent; padding:4px 10px; border-radius:999px; margin-bottom:14px; }
.blog-card-title { font-size:19px; line-height:1.28; font-weight:700; letter-spacing:-0.01em; color:var(--ink); margin:0 0 8px; }
.blog-card:hover .blog-card-title { color:var(--cat); }
.blog-card-excerpt { font-size:14.5px; line-height:1.55; color:var(--muted); margin:0 0 16px; flex:1; }
.blog-card-meta { font-size:13px; color:var(--soft); }

/* Article layout: reading column + sticky TOC rail (desktop) */
.blog-article-layout { display:grid; grid-template-columns:minmax(0,1fr); max-width:720px; margin:0 auto; }
@media (min-width:1080px) {
  .blog-article-layout { grid-template-columns:minmax(0,720px) 224px; gap:56px; max-width:1000px; align-items:start; }
}
.blog-toc-rail { display:none; }
@media (min-width:1080px) { .blog-toc-rail { display:block; } }
.blog-toc { position:sticky; top:96px; }
.blog-toc__title { font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:var(--soft); margin-bottom:12px; }
.blog-toc ul { list-style:none; margin:0; padding:0; border-left:2px solid var(--line); }
.blog-toc li a { display:block; padding:7px 0 7px 14px; margin-left:-2px; border-left:2px solid transparent; color:var(--muted); text-decoration:none; font-size:13.5px; line-height:1.4; transition:color .15s, border-color .15s; }
.blog-toc li a:hover { color:var(--ink); }
.blog-toc li a.is-active { color:var(--cat); border-left-color:var(--cat); font-weight:600; }

/* Article */
.blog-article { max-width:720px; }
.blog-article-pill { display:inline-block; font-size:12px; font-weight:700; color:var(--cat); background:var(--cat-tint); border:1px solid transparent; padding:4px 12px; border-radius:999px; margin:22px 0 16px; text-decoration:none; }
.blog-h1 { font-size:44px; line-height:1.08; font-weight:800; letter-spacing:-0.03em; color:var(--ink); margin:0 0 16px; }
.blog-lede { font-size:20px; line-height:1.5; color:var(--muted); margin:0 0 22px; }
.blog-meta { display:flex; flex-wrap:wrap; gap:8px; align-items:center; font-size:14px; color:var(--soft); padding-bottom:26px; border-bottom:2px solid var(--cat); }
.blog-meta a { color:var(--cat); text-decoration:none; font-weight:600; }

/* Article body typography */
.blog-body { font-size:18px; line-height:1.78; color:#26303c; margin-top:30px; }
.blog-body h2 { font-size:27px; font-weight:800; letter-spacing:-0.01em; color:var(--ink); margin:46px 0 14px; scroll-margin-top:90px; }
.blog-body h3 { font-size:20px; font-weight:700; color:var(--ink); margin:30px 0 8px; scroll-margin-top:90px; }
.blog-body p { margin:16px 0; }
.blog-body ul, .blog-body ol { margin:16px 0; padding-left:24px; }
.blog-body li { margin:8px 0; }
.blog-body li::marker { color:var(--cat); }
.blog-body a { color:var(--accent-dim); text-decoration:underline; text-underline-offset:3px; text-decoration-thickness:1px; }
.blog-body a:hover { color:var(--ink); }
.blog-body strong { color:var(--ink); font-weight:700; }
.blog-body em { font-style:italic; }
.blog-body table { width:100%; border-collapse:collapse; margin:24px 0; font-size:15.5px; }
.blog-body th, .blog-body td { border:1px solid var(--line); padding:10px 14px; text-align:left; }
.blog-body th { background:var(--cat-tint); font-weight:700; color:var(--ink); }

/* CTA card (rendered inside article HTML) */
.blog-cta-card { margin:44px 0 8px; padding:28px 30px; border:1px solid #bbf7d0; background:linear-gradient(180deg,#f0fdf4,#ecfdf5); border-radius:18px; }
.blog-cta-card h3 { margin:0 0 8px; font-size:21px; font-weight:800; color:#065f46; }
.blog-cta-card p { margin:0 0 16px; color:#047857; font-size:16px; line-height:1.5; }
.blog-cta-card a { display:inline-block; background:var(--accent); color:#04110c; font-weight:700; padding:11px 22px; border-radius:999px; text-decoration:none; font-size:15px; }
.blog-cta-card a:hover { background:var(--accent-dim); }

.blog-related { margin-top:56px; }

/* Footer */
.blog-footer { border-top:1px solid var(--line); margin-top:80px; padding:36px 0 48px; font-size:14px; color:var(--muted); }
.blog-footer a { color:var(--muted); text-decoration:none; }
.blog-footer a:hover { color:var(--accent-dim); }

@media (max-width:680px) {
  .blog-hero { padding:34px 0 20px; }
  .blog-hero h1 { font-size:36px; }
  .blog-hero p { font-size:18px; }
  .blog-h1 { font-size:32px; }
  .blog-body { font-size:17px; }
  .blog-nav { gap:16px; font-size:14px; }
}
`;

export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="blog-root">
      <header className="blog-header">
        <div className="blog-container blog-header__inner">
          <Link href="/" className="blog-logo" aria-label="Glide home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/landing/logos/glide-logo.png" alt="Glide crypto tax software" />
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

      <main className="blog-container">{children}</main>

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
