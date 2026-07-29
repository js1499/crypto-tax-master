import type { BlogPost } from "@/lib/blog";
import howIsCryptoTaxed from "./how-is-crypto-taxed";
import cryptoStakingTaxes from "./crypto-staking-taxes";
import coinbaseTaxDocuments from "./coinbase-tax-documents";
import p0 from "./crypto-capital-gains-tax";
import p1 from "./crypto-cost-basis";
import p2 from "./fifo-lifo-hifo-crypto-taxes";
import p3 from "./do-you-have-to-report-crypto";
import p4 from "./crypto-tax-forms-explained";
import p5 from "./are-crypto-airdrops-taxable";
import p6 from "./defi-swaps-liquidity-pool-taxes";
import p7 from "./nft-taxes";
import p8 from "./crypto-bridging-wrapping-taxes";
import p9 from "./crypto-lending-yield-farming-taxes";
import p10 from "./binance-tax-documents";
import p11 from "./kraken-tax-documents";
import p12 from "./form-1099-da";
import p13 from "./import-exchange-csv-for-taxes";
import p14 from "./metamask-wallet-taxes";
import p15 from "./crypto-tax-loss-harvesting";
import p16 from "./how-to-reduce-crypto-taxes";
import p17 from "./crypto-wash-sale-rule";
import p18 from "./long-term-crypto-capital-gains";
import p19 from "./crypto-gifts-donations-taxes";

// All blog posts. Add a new article: create src/content/blog/<slug>.ts and import it here.
export const posts: BlogPost[] = [
  howIsCryptoTaxed,
  cryptoStakingTaxes,
  coinbaseTaxDocuments,
  p0,
  p1,
  p2,
  p3,
  p4,
  p5,
  p6,
  p7,
  p8,
  p9,
  p10,
  p11,
  p12,
  p13,
  p14,
  p15,
  p16,
  p17,
  p18,
  p19,
];
