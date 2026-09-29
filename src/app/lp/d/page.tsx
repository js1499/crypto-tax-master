import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { AlternativeHeader } from "@/components/glide-landing/alternative/AlternativeHeader";
import { AlternativeLanding } from "@/components/glide-landing/alternative/AlternativeLanding";
import "@/components/glide-landing/glide-landing.css";

// Unlinked landing-page cell /lp/d: the React port of the standalone glidetaxes-landing site
// (apps/glidetaxes-landing), served from the product domain beside the static /lp/a·b·c cells
// and kept out of the index like them.

const brandFont = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  title: "Crypto Taxes Made Simple",
  description:
    "Finish crypto taxes faster with a clear review and accurate reports. Money-back guarantee applies to paid plans.",
  robots: { index: false, follow: false },
};

export default function LandingCellD() {
  return (
    <div className={`glide-landing ${brandFont.variable}`}>
      <AlternativeHeader />
      <AlternativeLanding />
    </div>
  );
}
