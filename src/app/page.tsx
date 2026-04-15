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

  return `
          <a href="${safeHref}" class="btn btn--primary" style="display:inline-flex;align-items:flex-start;justify-content:flex-start;padding:${compact ? "0.82rem 1rem" : "1rem 1.2rem"};min-width:${compact ? "210px" : "250px"};text-align:left;">
            <span style="display:flex;flex-direction:column;align-items:flex-start;line-height:1.05;">
              <span style="font-size:${compact ? "0.98rem" : "1.05rem"};font-weight:700;">Open Glide</span>
              <span style="font-size:${compact ? "0.68rem" : "0.75rem"};opacity:0.88;font-weight:500;margin-top:0.28rem;">Signed in as ${safeEmail}</span>
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
