import type { Metadata } from "next";
import Faq from "@/components/Faq";
import FeatureGrid from "@/components/FeatureGrid";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import { JsonLd } from "@/components/JsonLd";
import Pricing from "@/components/Pricing";
import { pricingTiers } from "@/data/pricing";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Compare Glide Trial, Starter, Active, Pro, and Prime plans by transaction limit, reports, tracking, support, and analysis features.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Glide pricing and plan comparison",
    description:
      "Review every Glide plan and compare the full feature matrix.",
    url: "/pricing",
  },
};

const pricingStructuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteConfig.name,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  url: `${siteConfig.url}/pricing`,
  offers: pricingTiers.map((tier) => ({
    "@type": "Offer",
    name: tier.name,
    price: tier.price.replace("$", ""),
    priceCurrency: "USD",
    url: `${siteConfig.url}/register`,
  })),
};

export default function PricingPage() {
  return (
    <>
      <JsonLd data={pricingStructuredData} />
      <Header />
      <main id="main-content">
        <div className="bg-cream pt-6">
          <Pricing asPageHeading />
          <FeatureGrid />
          <Faq />
          <FinalCta />
        </div>
      </main>
      <Footer />
    </>
  );
}
