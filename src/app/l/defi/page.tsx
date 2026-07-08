import { renderLandingVariant } from "../../landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Glide | Crypto Tax for DeFi, Staking & Every Chain",
  description:
    "DeFi swaps, staking, airdrops, bridges, and unlisted tokens across Ethereum, Solana, and every major EVM chain — identified, categorized, and priced.",
};

export default async function DefiLandingPage() {
  return renderLandingVariant("defi");
}
