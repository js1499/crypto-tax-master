import { renderLandingVariant } from "../landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Crypto Taxes Done in Minutes",
  description:
    "Connect your exchanges and wallets and get tax-ready forms in minutes. Glide pulls, prices, and categorizes every transaction for you.",
  // Ad-only landing variant (near-duplicate of the home page) — noindex so it doesn't cannibalize
  // home; follow to pass equity. Give it unique content + self-canonical to rank it organically.
  robots: { index: false, follow: true },
};

export default async function FastLandingPage() {
  return renderLandingVariant("fast");
}
