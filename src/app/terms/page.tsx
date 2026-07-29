import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Terms of Service",
  description:
    "The terms that govern your use of Glide's crypto & equities tax software, including subscriptions, acceptable use, and disclaimers.",
  alternates: { canonical: "/terms" },
};

const HTML = `
<p>These Terms of Service ("Terms") govern your use of Glide's crypto and equities tax software and
website (the "Service"). By creating an account or using the Service, you agree to these Terms.</p>

<h2>The Service</h2>
<p>Glide helps you import, categorize, price, and calculate taxes on your crypto and equities activity,
and generate tax reports and forms. Features and availability may change over time.</p>

<h2>Not tax, legal, or financial advice</h2>
<p>Glide is a software tool, not a tax preparer, accountant, or financial advisor, and using it does not
create any such relationship. The reports and figures Glide produces are estimates based on the data you
provide and connect. You are responsible for reviewing your results for accuracy and for your own tax
filings. Consult a qualified professional before relying on any output for a tax return.</p>

<h2>Your account</h2>
<p>You must provide accurate information, keep your credentials secure, and be at least 18 years old. You
are responsible for all activity under your account.</p>

<h2>Your data and accuracy</h2>
<p>You are responsible for the accuracy and completeness of the wallets, exchange connections, and data
you add. Glide's output depends on that input; missing or incorrect source data will affect your results.</p>

<h2>Subscriptions and billing</h2>
<ul>
  <li>Paid plans are billed through our payment processor (Stripe) on the terms shown at checkout.</li>
  <li>Prices and plan limits are described on our pricing page and may change with notice.</li>
  <li>Unless stated otherwise, fees are non-refundable except where required by law.</li>
</ul>

<h2>Acceptable use</h2>
<p>You agree not to misuse the Service, including by attempting to disrupt it, access it without
authorization, reverse engineer it, or use it for unlawful purposes.</p>

<h2>Intellectual property</h2>
<p>The Service, including its software, design, and content, is owned by Glide and protected by
intellectual-property laws. You receive a limited, non-exclusive, non-transferable right to use it.</p>

<h2>Third-party connections</h2>
<p>The Service integrates with third parties (such as exchanges and payment processors). Your use of those
services is subject to their terms, and we are not responsible for them.</p>

<h2>Disclaimers</h2>
<p>The Service is provided "as is" and "as available" without warranties of any kind, whether express or
implied, including as to accuracy, merchantability, or fitness for a particular purpose.</p>

<h2>Limitation of liability</h2>
<p>To the maximum extent permitted by law, Glide will not be liable for indirect, incidental, special, or
consequential damages, or for any tax liability, penalty, or loss arising from your use of the Service.
Our total liability is limited to the amount you paid us in the twelve months before the claim.</p>

<h2>Termination</h2>
<p>You may stop using the Service and delete your account at any time. We may suspend or terminate access
for violations of these Terms or as needed to protect the Service.</p>

<h2>Governing law</h2>
<p>These Terms are governed by the laws of the United States and the state in which Glide is established,
without regard to conflict-of-laws rules.</p>

<h2>Changes to these Terms</h2>
<p>We may update these Terms from time to time. Material changes will be posted on this page with an
updated "Last updated" date; continued use of the Service means you accept the changes.</p>

<h2>Contact us</h2>
<p>Questions about these Terms? <a href="/contact">Contact us</a> or use the in-app chat.</p>
`;

export default function TermsOfServicePage() {
  return <LegalPage title="Terms of Service" updated="July 2026" html={HTML} />;
}
