import { renderLandingVariant } from "../landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Audit-Ready Crypto Tax Reports",
  description:
    "Every transaction priced at its exact on-chain block timestamp with the IRS fair-market-value method, and every number traceable to its transaction hash.",
  // Ad-only landing variant (near-duplicate of the home page) — noindex so it doesn't cannibalize
  // home; follow to pass equity. Give it unique content + self-canonical to rank it organically.
  robots: { index: false, follow: true },
};

export default async function AuditLandingPage() {
  return renderLandingVariant("audit");
}
