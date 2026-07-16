import fs from "fs";
import path from "path";

// Unlinked paid-traffic landing-page test cells (/lp/a, /lp/b, /lp/c). The pages are
// self-contained static HTML in apps/ (shared, legally-reviewed copy; per-variant theme) and are
// deliberately NOT linked from the homepage or nav; X-Robots-Tag + an in-page meta keep them out
// of the index. Literal readFileSync per variant so Next.js file-tracing bundles each HTML file
// in production (a variable path may not be traced → ENOENT at runtime) — same pattern as
// landing-shared.tsx.

const appsDir = () => path.join(process.cwd(), "apps");

function readVariant(variant: string): string | null {
  switch (variant) {
    case "a":
      return fs.readFileSync(path.join(appsDir(), "glide-landing", "index.html"), "utf-8");
    case "b":
      return fs.readFileSync(path.join(appsDir(), "glide-landing-b", "index.html"), "utf-8");
    case "c":
      return fs.readFileSync(path.join(appsDir(), "glide-landing-c", "index.html"), "utf-8");
    default:
      return null;
  }
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ variant: string }> }
) {
  const { variant } = await params;
  let html: string | null;
  try {
    html = readVariant(variant);
  } catch {
    html = null;
  }
  if (!html) return new Response("Not found", { status: 404 });

  // The static pages reference their logo images relatively (assets/logos/*); in the app those
  // exact files already ship under public/landing/logos/, so point at them instead.
  html = html.replaceAll('src="assets/logos/', 'src="/landing/logos/');

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
