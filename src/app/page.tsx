import fs from "fs";
import path from "path";
import { LandingPage } from "./landing-page";
import { getCurrentUser } from "@/lib/auth-helpers";

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

function getLandingNavAuthMarkup(email?: string | null) {
  if (!email) {
    return `
          <a href="/login" class="nav__link" style="white-space:nowrap;">Sign in</a>
          <a href="#pricing" class="btn btn--primary">Get started</a>`;
  }

  const safeEmail = escapeHtml(email);

  return `
          <div style="display:flex;flex-direction:column;align-items:flex-end;line-height:1.15;">
            <span class="nav__link" style="white-space:nowrap;margin:0;">Signed in</span>
            <span style="font-size:0.85rem;color:var(--text-secondary);white-space:nowrap;">${safeEmail}</span>
          </div>
          <a href="/accounts" class="btn btn--primary">Open app</a>`;
}

function getLandingHeroCtaMarkup(email?: string | null) {
  if (!email) {
    return `<a href="#pricing" class="btn btn--primary">Get started</a>`;
  }

  const safeEmail = escapeHtml(email);

  return `
          <div style="display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:14px;">
            <a href="/accounts" class="btn btn--primary">Open your dashboard</a>
            <span style="font-size:0.95rem;color:var(--text-secondary);font-weight:600;">Signed in as ${safeEmail}</span>
          </div>`;
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
      <LandingPage bodyHtml={bodyHtml} />
    </>
  );
}
