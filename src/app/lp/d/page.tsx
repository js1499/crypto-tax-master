import type { Metadata } from "next";
import { GlideLandingPage } from "@/components/glide-landing/GlideLandingPage";

// Landing cell /lp/d: the same page as the home page (/), kept at this address for existing links
// and campaigns. Canonical points home so search engines index one copy.

export const metadata: Metadata = {
  title: "Crypto Taxes Made Simple",
  description:
    "Finish crypto taxes faster with a clear review and accurate reports. Money-back guarantee applies to paid plans.",
  alternates: { canonical: "/" },
  robots: { index: false, follow: true },
};

export default function LandingCellD() {
  return <GlideLandingPage />;
}
