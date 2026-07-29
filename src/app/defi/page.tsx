import { renderLandingVariant } from "../landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Crypto Tax for DeFi, Staking & Every Chain",
  description:
    "DeFi swaps, staking, airdrops, bridges, and unlisted tokens across Ethereum, Solana, and every major EVM chain — identified, categorized, and priced.",
  // Ad-only landing variant (near-duplicate of the home page). Keep it out of the index so it does
  // not cannibalize the home page; `follow` so links still pass equity. To rank this organically
  // instead, give it unique body content + a self-canonical.
  robots: { index: false, follow: true },
};

export default async function DefiLandingPage() {
  return renderLandingVariant("defi");
}
