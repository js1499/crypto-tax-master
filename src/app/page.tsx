import { renderFullLanding } from "./landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Crypto Tax Calculator & Software",
  description:
    "Glide is crypto tax software that identifies every transaction and prices it to the exact on-chain block. Connect your wallets and exchanges for accurate, audit-ready tax forms.",
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  return renderFullLanding();
}
