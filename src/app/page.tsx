import { renderFullLanding } from "./landing-shared";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Glide | Crypto Tax Software",
  description:
    "Every transaction identified. Effortlessly exact. On-chain verification at the exact block timestamp.",
};

export default async function HomePage() {
  return renderFullLanding();
}
