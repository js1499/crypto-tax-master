export const siteConfig = {
  name: "Glide",
  url: "https://glidetaxes.com",
  description:
    "Crypto tax software for activity across major blockchains, exchanges, and wallets.",
  appRoutes: {
    register: "/register",
    login: "/login",
  },
  marketingRoutes: {
    home: "/",
    pricing: "/pricing",
    blog: "/blog",
    guides: "/blog/crypto-tax-basics",
    cpaFiling: "/cpa-filing",
    contact: "/contact",
    privacy: "/privacy",
    terms: "/terms",
  },
} as const;

export const primaryNavigation = [
  { label: "How it works", href: "/#how" },
  { label: "Integrations", href: "/#integrations" },
  { label: "Pricing", href: "/pricing" },
] as const;

export const resourceNavigation = [
  { label: "Blog", description: "Product news and tax explainers", href: "/blog" },
  {
    label: "Crypto tax guides",
    description: "Plain-language filing guidance",
    href: "/blog/crypto-tax-basics",
  },
  {
    label: "CPA filing",
    description: "Get help from a tax professional",
    href: "/cpa-filing",
  },
  { label: "Contact", description: "Talk to the Glide team", href: "/contact" },
] as const;

export const publicSitemapRoutes = [
  "/",
  "/pricing",
  "/blog",
  "/cpa-filing",
  "/contact",
  "/privacy",
  "/terms",
  "/blog/crypto-tax-basics",
  "/blog/defi-and-staking",
  "/blog/exchange-guides",
  "/blog/tax-strategy",
  "/blog/exchange-guides/coinbase-tax-documents",
  "/blog/defi-and-staking/crypto-staking-taxes",
  "/blog/crypto-tax-basics/how-is-cryptocurrency-taxed",
  "/blog/tax-strategy/crypto-gifts-donations-taxes",
  "/blog/tax-strategy/long-term-crypto-capital-gains",
  "/blog/tax-strategy/crypto-wash-sale-rule",
  "/blog/tax-strategy/how-to-reduce-crypto-taxes",
  "/blog/tax-strategy/crypto-tax-loss-harvesting",
  "/blog/exchange-guides/metamask-wallet-taxes",
  "/blog/exchange-guides/import-exchange-csv-for-taxes",
  "/blog/exchange-guides/form-1099-da",
  "/blog/exchange-guides/kraken-tax-documents",
  "/blog/exchange-guides/binance-tax-documents",
  "/blog/defi-and-staking/crypto-lending-yield-farming-taxes",
  "/blog/defi-and-staking/crypto-bridging-wrapping-taxes",
  "/blog/defi-and-staking/nft-taxes",
  "/blog/defi-and-staking/defi-swaps-liquidity-pool-taxes",
  "/blog/defi-and-staking/are-crypto-airdrops-taxable",
  "/blog/crypto-tax-basics/crypto-tax-forms-explained",
  "/blog/crypto-tax-basics/do-you-have-to-report-crypto",
  "/blog/crypto-tax-basics/fifo-lifo-hifo-crypto-taxes",
  "/blog/crypto-tax-basics/crypto-cost-basis",
  "/blog/crypto-tax-basics/crypto-capital-gains-tax",
] as const;
