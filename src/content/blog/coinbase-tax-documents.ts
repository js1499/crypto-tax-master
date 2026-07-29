import type { BlogPost } from "@/lib/blog";

const post: BlogPost = {
  slug: "coinbase-tax-documents",
  category: "exchange-guides",
  title: "How to Get Your Coinbase Tax Documents",
  description:
    "Where to find your Coinbase tax forms and full transaction history, what Coinbase does and doesn't report, and how to file accurately.",
  excerpt:
    "Coinbase gives you some tax forms — but not the full picture. Here's how to get your complete history and file accurate crypto taxes.",
  datePublished: "2026-07-28",
  author: "The Glide Team",
  readingTimeMinutes: 6,
  html: `
<p>Coinbase provides tax information inside your account, but there's an important gap most people don't realize until they file: the forms Coinbase issues usually <strong>don't include a complete, ready-to-file capital-gains calculation</strong> — especially if you've moved crypto on or off the platform.</p>

<h2>Where to find your Coinbase tax info</h2>
<ul>
  <li><strong>Coinbase Taxes / Documents</strong> — sign in and open the Taxes (or Documents) section. Depending on your activity you may find a gains/loss summary and any tax forms Coinbase issued for the year.</li>
  <li><strong>Transaction history export</strong> — you can also download a CSV of your full transaction history, which is the most useful file for accurate tax software.</li>
</ul>

<h2>What Coinbase does — and doesn't — report</h2>
<p>Starting with the 2025 tax year, US exchanges including Coinbase report gross proceeds on the new <strong>Form 1099-DA</strong>. That's a big step, but it has limits:</p>
<ul>
  <li>It covers activity <strong>on Coinbase</strong> — not the crypto you sent to a self-custody wallet, another exchange, or DeFi.</li>
  <li>Cost basis for assets you transferred <em>in</em> may be missing or incomplete, which can make a simple deposit look like a huge gain.</li>
  <li>Rewards, staking, and card spending can be split across multiple internal transaction types that are easy to miscategorize.</li>
</ul>
<p>In other words, the 1099 is a starting point, not the finished return. Your actual gain depends on the original cost basis — which often lives on a different platform. See <a href="/blog/crypto-tax-basics/how-is-cryptocurrency-taxed">how crypto is taxed</a> for why cost basis is the number that matters most.</p>

<h2>The reliable way to file: import your full history</h2>
<p>The cleanest approach is to bring your <strong>complete</strong> Coinbase history into tax software that also sees your other wallets and exchanges, so cost basis carries across platforms. You can do this two ways:</p>
<ul>
  <li><strong>Connect Coinbase directly</strong> via a read-only connection, or</li>
  <li><strong>Upload the CSV export</strong> from your transaction history.</li>
</ul>
<p>Either way, the goal is one unified ledger where every buy, sell, swap, transfer, staking reward, and card spend is identified and priced — so your Form 8949 and Schedule D reflect reality, not just on-platform activity.</p>

<div class="blog-cta-card">
  <h3>Import Coinbase into Glide in minutes</h3>
  <p>Connect Coinbase or drop in your CSV. Glide categorizes every transaction — including staking rewards and card spends — prices each to the exact block, and carries cost basis across all your wallets and exchanges.</p>
  <a href="/#pricing">Import my Coinbase history →</a>
</div>

<p style="font-size:14px;color:#6b7280;margin-top:24px;">This article is general information, not tax advice. Consult a qualified professional about your specific situation.</p>
`,
};

export default post;
