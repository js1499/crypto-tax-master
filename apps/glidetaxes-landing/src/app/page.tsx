import type { Metadata } from "next";
import DappsAI from "@/components/DappsAI";
import Faq from "@/components/Faq";
import FinalCta from "@/components/FinalCta";
import Footer from "@/components/Footer";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import { JsonLd } from "@/components/JsonLd";
import PowerUsers from "@/components/PowerUsers";
import Pricing from "@/components/Pricing";
import VideoDemo from "@/components/VideoDemo";
import { faqs } from "@/data/faqs";
import { pricingTiers } from "@/data/pricing";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Crypto Tax Software for Every Portfolio",
  description:
    "Bring activity from major blockchains, exchanges, and wallets together, review every transaction, and prepare tax-ready crypto reports with Glide.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Every transaction identified, effortlessly",
    description:
      "A clearer crypto tax workflow for activity across major blockchains, exchanges, and wallets.",
    url: "/",
  },
};

const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteConfig.name,
    url: siteConfig.url,
    logo: `${siteConfig.url}/seo/favicon.svg`,
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteConfig.name,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: siteConfig.description,
    url: siteConfig.url,
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "0",
      highPrice: "699",
      offerCount: pricingTiers.length,
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  },
];

export default function Home() {
  return (
    <>
      <JsonLd data={structuredData} />
      <Header />
      <main id="main-content">
        <Hero />
        <PowerUsers />
        <VideoDemo />
        <DappsAI />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
