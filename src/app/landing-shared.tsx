import fs from "fs";
import path from "path";
import { LandingPage } from "./landing-page";
import { getCurrentUser } from "@/lib/auth-helpers";

// Shared rendering for the marketing landing page + its A/B test variants. The full page lives in
// landing-body.html; variants reuse ALL of its chrome (nav, how-it-works, supported platforms,
// pricing, feature table, footer) and only swap the hero + story sections. This keeps every
// variant on-brand and in sync with the real pricing/plan content automatically.

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getSignedInButtonMarkup(email: string, href: string, compact = false) {
  const safeEmail = escapeHtml(email);
  const safeHref = escapeHtml(href);
  const emailMaxWidth = compact ? "128px" : "188px";
  const emailFontSize = compact ? "0.72rem" : "0.82rem";
  const labelFontSize = compact ? "0.68rem" : "0.76rem";

  return `
          <a href="${safeHref}" class="btn btn--primary" style="display:inline-flex;align-items:center;justify-content:center;padding:${compact ? "0.82rem 1.05rem" : "1rem 1.35rem"};min-width:${compact ? "210px" : "250px"};text-align:center;">
            <span style="display:flex;flex-direction:column;align-items:center;line-height:1.08;max-width:100%;">
              <span style="font-size:inherit;font-weight:700;">Open Glide</span>
              <span style="display:inline-flex;align-items:center;gap:0.38rem;max-width:100%;margin-top:0.34rem;padding:${compact ? "0.24rem 0.52rem" : "0.28rem 0.62rem"};border-radius:999px;background:rgba(255,255,255,0.16);box-shadow:inset 0 1px 0 rgba(255,255,255,0.14);line-height:1;">
                <span style="font-size:${labelFontSize};opacity:0.84;font-weight:600;white-space:nowrap;">Signed in as</span>
                <span title="${safeEmail}" style="display:block;max-width:${emailMaxWidth};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:'DM Mono',monospace;font-size:${emailFontSize};font-weight:500;letter-spacing:-0.01em;">${safeEmail}</span>
              </span>
            </span>
          </a>`;
}

function getLandingNavAuthMarkup(email?: string | null) {
  if (!email) {
    return `
          <a href="/login" class="nav__link" style="white-space:nowrap;">Sign in</a>
          <a href="#pricing" class="btn btn--primary">Get started</a>`;
  }
  return getSignedInButtonMarkup(email, "/accounts", true);
}

function getLandingHeroCtaMarkup(email?: string | null) {
  if (!email) {
    return `<a href="#pricing" class="btn btn--primary">Get started</a>`;
  }
  return getSignedInButtonMarkup(email, "/accounts");
}

// Section markers in landing-body.html used to splice in a variant hero/story.
const HERO_MARK = '<section class="hero section--textured" id="hero">';
const HOW_MARK = "<!-- HOW IT WORKS -->";
const COMP_MARK = "<!-- COMPARISON -->";
const PRICEWRAP_MARK = "<!-- PRICING + FEATURE TABLE wrapper";

/**
 * Replace the hero + accuracy-story block (hero → just before "How it works") of the base landing
 * with a variant's content, and drop the "How we achieve accuracy" comparison section (variants
 * make no comparison/superiority claims). Everything else — nav, how-it-works, supported platforms,
 * pricing, feature table, footer — is reused verbatim. Falls back to the full page if markers move.
 */
function buildVariantBody(base: string, variant: string): string {
  const heroIdx = base.indexOf(HERO_MARK);
  const howIdx = base.indexOf(HOW_MARK);
  if (heroIdx === -1 || howIdx === -1) return base;
  let html = base.slice(0, heroIdx) + variant.trim() + "\n\n  " + base.slice(howIdx);
  const compIdx = html.indexOf(COMP_MARK);
  const priceIdx = html.indexOf(PRICEWRAP_MARK);
  if (compIdx !== -1 && priceIdx !== -1 && compIdx < priceIdx) {
    html = html.slice(0, compIdx) + html.slice(priceIdx);
  }
  return html;
}

function renderBody(bodyHtml: string, isAuthenticated: boolean) {
  return (
    <>
      <link rel="stylesheet" href="/landing/landing.css" />
      <link rel="stylesheet" href="https://fonts.cdnfonts.com/css/cabinet-grotesk" />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap"
      />
      <LandingPage billingHref="/settings?tab=billing" bodyHtml={bodyHtml} isAuthenticated={isAuthenticated} />
    </>
  );
}

function applyAuth(html: string, email?: string | null): string {
  return html
    .replace("{{LANDING_NAV_AUTH}}", getLandingNavAuthMarkup(email))
    .replace("{{LANDING_HERO_CTA}}", getLandingHeroCtaMarkup(email));
}

const appDir = () => path.join(process.cwd(), "src", "app");

/** The full home landing page. */
export async function renderFullLanding() {
  const base = fs.readFileSync(path.join(appDir(), "landing-body.html"), "utf-8");
  const user = await getCurrentUser();
  return renderBody(applyAuth(base, user?.email), !!user?.email);
}

export type LandingVariant = "defi" | "fast" | "audit";

// Literal readFileSync per variant so Next.js file-tracing bundles each HTML file in production
// (a variable path may not be traced → ENOENT at runtime).
function readVariant(variant: LandingVariant): string {
  switch (variant) {
    case "defi":
      return fs.readFileSync(path.join(appDir(), "landing-body-defi.html"), "utf-8");
    case "fast":
      return fs.readFileSync(path.join(appDir(), "landing-body-fast.html"), "utf-8");
    case "audit":
      return fs.readFileSync(path.join(appDir(), "landing-body-audit.html"), "utf-8");
  }
}

/** A landing variant: same chrome/pricing as home, with a swapped hero + story section. */
export async function renderLandingVariant(variant: LandingVariant) {
  const base = fs.readFileSync(path.join(appDir(), "landing-body.html"), "utf-8");
  const user = await getCurrentUser();
  return renderBody(applyAuth(buildVariantBody(base, readVariant(variant)), user?.email), !!user?.email);
}
