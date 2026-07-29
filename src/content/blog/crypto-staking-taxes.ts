import type { BlogPost } from "@/lib/blog";

const post: BlogPost = {
  slug: "crypto-staking-taxes",
  category: "defi-and-staking",
  title: "Do You Pay Taxes on Crypto Staking Rewards?",
  description:
    "How staking rewards are taxed in the US: ordinary income when received, capital gains when sold, plus how to track cost basis.",
  excerpt:
    "Staking rewards are taxed twice over their life — as income when you receive them, and as capital gains when you sell. Here's how it works.",
  datePublished: "2026-07-24",
  author: "The Glide Team",
  readingTimeMinutes: 6,
  html: `
<p>Short answer: <strong>yes</strong>. In the US, staking rewards are taxable. But <em>how</em> they're taxed trips a lot of people up, because a single reward can be taxed at two different points in its life.</p>

<h2>Step 1 — income when you receive the reward</h2>
<p>When you gain "dominion and control" over a staking reward (generally, when it lands in your wallet and you can move it), it's <strong>ordinary income</strong> equal to its fair market value at that moment. If you receive 0.1 ETH worth $300, you have $300 of income — regardless of whether you sell it.</p>
<p>This is the IRS position confirmed in Revenue Ruling 2023-14. It applies to proof-of-stake rewards whether you stake directly or through an exchange's staking program.</p>

<h2>Step 2 — capital gains when you sell</h2>
<p>That $300 of value becomes your <strong>cost basis</strong> in the reward. When you later dispose of it — sell, swap, or spend — you calculate a capital gain or loss on the change in value since you received it. If the 0.1 ETH is worth $360 when you sell, you have a $60 capital gain on top of the $300 you already reported as income.</p>
<p>Holding period starts when you received the reward, so rewards held more than a year before selling qualify for lower long-term rates. See our overview of <a href="/blog/crypto-tax-basics/how-is-cryptocurrency-taxed">how crypto is taxed</a> for the short-vs-long-term breakdown.</p>

<h2>Why staking is hard to track by hand</h2>
<p>Staking often pays out <strong>frequently and in tiny amounts</strong> — sometimes many times a day. Each payout needs its own fair-market-value snapshot to get both the income figure and the future cost basis right. Doing that manually across hundreds or thousands of micro-rewards is where most spreadsheets fall apart.</p>
<ul>
  <li>Each reward = an income event at its FMV on the receipt date.</li>
  <li>Each reward = a new cost-basis lot for later disposal.</li>
  <li>"Restaking"/compounding creates <em>more</em> reward events, not fewer.</li>
</ul>

<h2>What about unstaking and moving principal?</h2>
<p>Moving your <em>principal</em> into or out of a staking contract or an exchange staking product is generally a non-taxable transfer — it's still your asset. Only the <strong>rewards</strong> are income, and only an actual <strong>disposal</strong> triggers capital gains.</p>

<div class="blog-cta-card">
  <h3>Glide books staking rewards automatically</h3>
  <p>Glide flags each staking reward as income at its exact block-timestamp value and sets the cost basis for you — so your income report and capital gains both come out right.</p>
  <a href="/#pricing">Try Glide on your wallet →</a>
</div>

<p style="font-size:14px;color:#6b7280;margin-top:24px;">This article is general information, not tax advice. Consult a qualified professional about your specific situation.</p>
`,
};

export default post;
