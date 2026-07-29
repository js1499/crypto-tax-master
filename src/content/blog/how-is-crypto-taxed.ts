import type { BlogPost } from "@/lib/blog";

const post: BlogPost = {
  slug: "how-is-cryptocurrency-taxed",
  category: "crypto-tax-basics",
  title: "How Is Cryptocurrency Taxed in the US? (2026 Guide)",
  description:
    "A plain-English guide to how crypto is taxed in the US: capital gains vs. income, what's taxable, cost basis, and the forms you file.",
  excerpt:
    "Crypto is taxed as property. That means two things can happen at tax time — capital gains and ordinary income. Here's exactly when each applies.",
  datePublished: "2026-07-20",
  author: "The Glide Team",
  readingTimeMinutes: 7,
  html: `
<p>In the United States, the IRS treats cryptocurrency as <strong>property</strong>, not currency. That single fact drives almost everything about how it's taxed: two different taxes can apply to your crypto activity — <strong>capital gains tax</strong> when you dispose of crypto, and <strong>ordinary income tax</strong> when you earn it.</p>

<h2>Capital gains: when you dispose of crypto</h2>
<p>A "disposal" is any time you part with a crypto asset. The most common disposals are:</p>
<ul>
  <li><strong>Selling</strong> crypto for dollars.</li>
  <li><strong>Swapping</strong> one crypto for another (for example, ETH → USDC). Yes — a crypto-to-crypto trade is a taxable disposal.</li>
  <li><strong>Spending</strong> crypto to buy goods or services, including with a crypto debit card.</li>
</ul>
<p>Your gain or loss is simply <strong>proceeds − cost basis</strong>. Cost basis is what you originally paid for the asset (including fees). If you bought 1 ETH for $1,500 and later swapped it when it was worth $2,500, you have a $1,000 capital gain — even though you never touched dollars.</p>

<h3>Short-term vs. long-term</h3>
<p>Holding period matters. If you held the asset for <strong>one year or less</strong>, the gain is short-term and taxed at your ordinary income rate. Held for <strong>more than a year</strong>, it's long-term and taxed at lower capital-gains rates. This is why holding period is one of the biggest levers in <a href="/blog/tax-strategy">crypto tax strategy</a>.</p>

<h2>Ordinary income: when you earn crypto</h2>
<p>Some crypto is taxed as income at its fair market value on the day you receive it. Common examples:</p>
<ul>
  <li><strong>Staking rewards</strong> — see <a href="/blog/defi-and-staking/crypto-staking-taxes">how staking rewards are taxed</a>.</li>
  <li><strong>Airdrops</strong> and promotional rewards.</li>
  <li><strong>Interest</strong> and lending yield.</li>
  <li><strong>Mining</strong> rewards.</li>
</ul>
<p>Income-taxed crypto also gets a cost basis equal to that fair market value — so when you later sell it, you only pay capital gains on the change in value <em>after</em> you received it.</p>

<h2>What is NOT taxable</h2>
<ul>
  <li><strong>Buying crypto with dollars</strong> and holding it. There's no tax until you dispose of it.</li>
  <li><strong>Holding</strong> — unrealized gains are not taxed.</li>
  <li><strong>Transferring between your own wallets</strong> — moving crypto from an exchange to your own hardware wallet is not a disposal.</li>
</ul>

<h2>Cost basis and accounting methods</h2>
<p>When you sell part of a position you bought at different times, which "lot" did you sell? The accounting method decides. FIFO (first-in, first-out) is the default; LIFO and HIFO are alternatives that can change your bill. Note that for 2025 and later, the IRS expects cost basis to be tracked <strong>per wallet/account</strong> rather than universally — a change many people miss.</p>

<h2>The forms you file</h2>
<ul>
  <li><strong>Form 8949</strong> — lists every disposal (proceeds, cost basis, gain/loss).</li>
  <li><strong>Schedule D</strong> — summarizes your total capital gains and losses.</li>
  <li><strong>Schedule 1</strong> — reports crypto income like staking and airdrops.</li>
</ul>

<div class="blog-cta-card">
  <h3>Let Glide do the math</h3>
  <p>Connect your wallets and exchanges and Glide identifies every transaction, prices it to the exact block, and generates your 8949, Schedule D, and income report.</p>
  <a href="/#pricing">Calculate my crypto taxes →</a>
</div>

<p style="font-size:14px;color:#6b7280;margin-top:24px;">This article is general information, not tax advice. Consult a qualified professional about your specific situation.</p>
`,
};

export default post;
