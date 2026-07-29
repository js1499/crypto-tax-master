import Link from "next/link";

/**
 * Shared server-rendered layout for the /privacy and /terms pages. Indexable, lightweight, and
 * on-brand — gives the YMYL financial product the trust/compliance pages Google (and users) expect.
 * Content is passed as an HTML string; styling is scoped to `.legal-body`.
 */
export function LegalPage({ title, updated, html }: { title: string; updated: string; html: string }) {
  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: "56px 24px 96px",
        color: "#1f2937",
        fontFamily: "var(--font-sans), system-ui, sans-serif",
      }}
    >
      <Link href="/" style={{ fontSize: 14, color: "#10b981", textDecoration: "none", fontWeight: 600 }}>
        ← Back to Glide
      </Link>
      <h1 style={{ marginTop: 20, fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", color: "#0f172a" }}>
        {title}
      </h1>
      <p style={{ marginTop: 6, fontSize: 14, color: "#6b7280" }}>Last updated: {updated}</p>
      <div className="legal-body" dangerouslySetInnerHTML={{ __html: html }} />
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .legal-body { margin-top: 28px; line-height: 1.7; font-size: 16px; }
        .legal-body h2 { margin: 34px 0 10px; font-size: 22px; font-weight: 700; color: #0f172a; }
        .legal-body p { margin: 12px 0; color: #374151; }
        .legal-body ul { margin: 12px 0; padding-left: 22px; }
        .legal-body li { margin: 6px 0; color: #374151; }
        .legal-body a { color: #0d9668; }
      `,
        }}
      />
    </main>
  );
}
