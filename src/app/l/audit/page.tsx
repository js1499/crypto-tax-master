import { renderLandingVariant } from "../../landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Glide | Audit-Ready Crypto Tax Reports",
  description:
    "Every transaction priced at its exact on-chain block timestamp with the IRS fair-market-value method, and every number traceable to its transaction hash.",
};

export default async function AuditLandingPage() {
  return renderLandingVariant("audit");
}
