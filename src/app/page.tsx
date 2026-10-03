import { GlideLandingPage } from "@/components/glide-landing/GlideLandingPage";
import { getSiteStructuredDataJson } from "@/lib/structured-data";

// The home page is the landing page first built at /lp/d. The previous static landing
// (landing-body.html via landing-shared.tsx) still backs the /lp/a·b·c and /defi, /fast, /audit cells.

export const metadata = {
  // The root segment doesn't receive the layout's title.template, so brand it explicitly here.
  title: "Crypto Tax Calculator & Software | Glide",
  description:
    "Glide is crypto tax software that prices every trade at the second it happened. Connect your wallets and exchanges, review one result, and download Form 8949 and Schedule D. Accurate taxes or your money back on paid plans.",
  alternates: { canonical: "/" },
};

export default function HomePage() {
  return (
    <>
      {/* Organization + WebSite + SoftwareApplication(+Offers) JSON-LD — see src/lib/structured-data.ts */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: getSiteStructuredDataJson() }} />
      <GlideLandingPage />
    </>
  );
}
