export const tierNames = ["Trial", "Starter", "Active", "Pro", "Prime"] as const;

export type TierName = (typeof tierNames)[number];
export type FeatureValues = readonly [
  boolean | string,
  boolean | string,
  boolean | string,
  boolean | string,
  boolean | string,
];

export interface PricingTier {
  name: TierName;
  audience: string;
  price: string;
  cadence: string;
  blurb?: string;
  features: readonly string[];
  cta: string;
  highlighted?: boolean;
}

export interface FeatureRow {
  label: string;
  values: FeatureValues;
  highlighted?: boolean;
}

export interface FeatureGroup {
  id: string;
  category: string;
  rows: readonly FeatureRow[];
}

export const pricingTiers: readonly PricingTier[] = [
  {
    name: "Trial",
    audience: "See your result first",
    price: "$0",
    cadence: "",
    blurb: "See your portfolio result before choosing a paid plan.",
    features: [
      "Unlimited transaction viewing",
      "Micro transaction support",
      "Spam detection",
      "Exchange CSV import",
    ],
    cta: "Try free",
  },
  {
    name: "Starter",
    audience: "A straightforward tax year",
    price: "$49",
    cadence: "/year",
    features: [
      "Up to 300 transactions",
      "Tax forms and reports",
      "All report exports",
      "Email support",
    ],
    cta: "Choose Starter",
  },
  {
    name: "Active",
    audience: "Frequent trading activity",
    price: "$99",
    cadence: "/year",
    features: [
      "Up to 1,000 transactions",
      "Everything in Starter",
      "Live wallet and price tracking",
      "In-app chat support",
    ],
    cta: "Choose Active",
    highlighted: true,
  },
  {
    name: "Pro",
    audience: "Advanced portfolios",
    price: "$299",
    cadence: "/year",
    features: [
      "Up to 10,000 transactions",
      "Everything in Active",
      "Advanced trade analytics",
      "Risk-adjusted metrics",
    ],
    cta: "Choose Pro",
  },
  {
    name: "Prime",
    audience: "High-volume activity",
    price: "$699",
    cadence: "/year",
    features: [
      "Up to 100,000 transactions",
      "Everything in Pro",
      "High-volume transaction capacity",
    ],
    cta: "Choose Prime",
  },
];

const all = [true, true, true, true, true] satisfies FeatureValues;
const paid = [false, true, true, true, true] satisfies FeatureValues;
const active = [false, false, true, true, true] satisfies FeatureValues;
const pro = [false, false, false, true, true] satisfies FeatureValues;

export const featureGroups: readonly FeatureGroup[] = [
  {
    id: "limits",
    category: "Transactions & limits",
    rows: [
      { label: "Price", values: ["$0/yr", "$49/yr", "$99/yr", "$299/yr", "$699/yr"] },
      { label: "Money-back guarantee", values: ["Not applicable", true, true, true, true], highlighted: true },
      { label: "Yearly transaction limit", values: ["Unlimited*", "300", "1,000", "10,000", "100,000"] },
      { label: "Micro transaction support", values: all },
      { label: "Spam detection", values: all },
    ],
  },
  {
    id: "imports",
    category: "Data import",
    rows: [
      { label: "Exchange CSV import", values: all },
      { label: "Custom CSV import", values: all },
      { label: "Full exchange support", values: all },
    ],
  },
  {
    id: "assets",
    category: "Asset class support",
    rows: [
      { label: "DeFi", values: all },
      { label: "NFTs", values: all },
      { label: "Staking rewards", values: all },
      { label: "Margin trading", values: all },
      { label: "Lending & borrowing", values: all },
      { label: "Liquidity pools / LP tokens", values: all },
      { label: "Yield farming rewards", values: all },
      { label: "Airdrops", values: all },
      { label: "Forks & chain splits", values: all },
      { label: "Wrapped & bridged assets", values: all },
      { label: "DCAs", values: all },
      { label: "Unlisted tokens", values: all },
      { label: "Meme tokens", values: all },
      { label: "Stablecoins", values: all },
      { label: "Derivatives & perpetuals", values: all },
    ],
  },
  {
    id: "securities",
    category: "Equities / securities support",
    rows: [
      { label: "Stocks & ETFs", values: all },
      { label: "Options trading", values: all },
      { label: "Futures & futures options", values: all },
      { label: "Mutual funds", values: all },
      { label: "Bonds & fixed income", values: all },
      { label: "Dividends & distributions", values: all },
      { label: "Stock splits & corporate actions", values: all },
      { label: "Wash sale detection", values: all },
      { label: "Short sales & covered calls", values: all },
      { label: "1099-B reconciliation", values: all },
      { label: "RSUs, ESPP, equity compensation", values: all },
      { label: "Section 1256 contracts", values: all },
    ],
  },
  {
    id: "reconciliation",
    category: "Reconciliation",
    rows: [
      { label: "Double-entry ledger", values: all },
      { label: "Transaction sorting", values: all },
      { label: "Cost analysis", values: all },
      { label: "Error reconciliation", values: all },
    ],
  },
  {
    id: "cost-basis",
    category: "Cost basis & tax optimization",
    rows: [
      { label: "FIFO, LIFO, ACB methods", values: paid },
      { label: "Wallet-based cost tracking", values: paid },
      { label: "Change method by year", values: paid },
      { label: "Tax loss harvesting", values: paid },
      { label: "Tax lots breakdown", values: paid },
      { label: "Advanced tax settings", values: paid },
      { label: "Tax planning insights", values: paid },
      { label: "Capital gains preview", values: paid },
      { label: "Performance dashboard", values: paid },
    ],
  },
  {
    id: "reports",
    category: "Tax forms & reports",
    rows: [
      { label: "Form 8949 / Schedule D", values: paid },
      { label: "International tax reports", values: paid },
      { label: "Income report", values: paid },
      { label: "Capital gains report", values: paid },
      { label: "Download tax forms", values: paid },
      { label: "Export to TurboTax and TaxAct", values: paid },
    ],
  },
  {
    id: "portfolio",
    category: "Portfolio & tracking",
    rows: [
      { label: "Unlimited revisions", values: all },
      { label: "20,000+ cryptocurrencies", values: all },
      { label: "Unlimited exchanges & wallets", values: all },
      { label: "Live wallet tracking", values: active },
      { label: "Live price tracking", values: active },
      { label: "Live portfolio tracking", values: active },
    ],
  },
  {
    id: "support",
    category: "Professional & support",
    rows: [
      { label: "Email support", values: all },
      { label: "Live / in-app chat support", values: active },
    ],
  },
  {
    id: "analysis",
    category: "Trade analysis",
    rows: [
      { label: "Win/loss ratio", values: pro },
      { label: "Realized vs. unrealized P&L", values: pro },
      { label: "Best & worst trades", values: pro },
      { label: "Average hold-time analysis", values: pro },
      { label: "Performance by asset", values: pro },
      { label: "Entry/exit timing analysis", values: pro },
      { label: "Risk-adjusted metrics", values: pro },
      { label: "Benchmark comparisons", values: pro },
    ],
  },
];
