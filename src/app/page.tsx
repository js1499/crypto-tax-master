import fs from "fs";
import path from "path";
import { LandingPage } from "./landing-page";
import { getCurrentUser } from "@/lib/auth-helpers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Glide | Crypto Tax Software",
  description:
    "Every transaction identified. Effortlessly exact. On-chain verification at the exact block timestamp.",
};

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

export default async function HomePage() {
  const htmlPath = path.join(process.cwd(), "src", "app", "landing-body.html");
  const user = await getCurrentUser();
  const bodyHtml = fs
    .readFileSync(htmlPath, "utf-8")
    .replace("{{LANDING_NAV_AUTH}}", getLandingNavAuthMarkup(user?.email))
    .replace("{{LANDING_HERO_CTA}}", getLandingHeroCtaMarkup(user?.email));

  return (
    <>
      <link rel="stylesheet" href="/landing/landing.css" />
      <link
        rel="stylesheet"
        href="https://fonts.cdnfonts.com/css/cabinet-grotesk"
      />
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap"
      />
      <LandingPage
        billingHref="/settings?tab=billing"
        bodyHtml={bodyHtml}
        isAuthenticated={!!user?.email}
      />
    </>
  );
}
