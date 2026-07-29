// schema.org JSON-LD for the marketing surface. One connected @graph:
//  - Organization + WebSite seed the "Glide" brand entity and disambiguate the name.
//  - SoftwareApplication + Offers make the public pricing eligible for price-bearing rich cards.
// Deliberately NO FAQPage / AggregateRating / Review — that content does not exist on-page and
// marking it up would be fabricated structured data (manual-action risk). Offers mirror the plan
// tiers rendered in landing-body.html; keep them in sync if pricing changes.

const SITE_URL = "https://glidetaxes.com";
const SITE_NAME = "Glide";

const PLAN_OFFERS = [
  { name: "Starter", price: "49", description: "Up to 300 transactions" },
  { name: "Active", price: "99", description: "Up to 1,000 transactions" },
  { name: "Pro", price: "299", description: "Up to 10,000 transactions" },
  { name: "Prime", price: "699", description: "Up to 100,000 transactions" },
];

export function getSiteStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${SITE_URL}/#organization`,
        name: SITE_NAME,
        url: SITE_URL,
        logo: `${SITE_URL}/landing/logos/glide-logo.png`,
        description:
          "Crypto & equities tax software that identifies every transaction and prices it to the exact on-chain block for accurate, audit-ready tax forms.",
      },
      {
        "@type": "WebSite",
        "@id": `${SITE_URL}/#website`,
        url: SITE_URL,
        name: SITE_NAME,
        inLanguage: "en-US",
        publisher: { "@id": `${SITE_URL}/#organization` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE_URL}/#software`,
        name: SITE_NAME,
        url: SITE_URL,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Web",
        publisher: { "@id": `${SITE_URL}/#organization` },
        offers: PLAN_OFFERS.map((p) => ({
          "@type": "Offer",
          name: `${p.name} plan`,
          price: p.price,
          priceCurrency: "USD",
          description: p.description,
          category: "annual subscription",
          url: `${SITE_URL}/#pricing`,
        })),
      },
    ],
  };
}

/** JSON-LD as a string ready for a <script type="application/ld+json"> tag. */
export function getSiteStructuredDataJson(): string {
  return JSON.stringify(getSiteStructuredData());
}
