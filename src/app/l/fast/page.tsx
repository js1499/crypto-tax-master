import { renderLandingVariant } from "../../landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Glide | Crypto Taxes Done in Minutes",
  description:
    "Connect your exchanges and wallets and get tax-ready forms in minutes. Glide pulls, prices, and categorizes every transaction for you.",
};

export default async function FastLandingPage() {
  return renderLandingVariant("fast");
}
