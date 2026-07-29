import { LegalPage } from "@/components/legal-page";

export const metadata = {
  title: "Privacy Policy",
  description:
    "How Glide collects, uses, and protects your personal and financial data when you use our crypto & equities tax software.",
  alternates: { canonical: "/privacy" },
};

const HTML = `
<p>This Privacy Policy explains how Glide ("Glide", "we", "us") collects, uses, and protects your
information when you use our crypto and equities tax software and website (the "Service"). By using
the Service you agree to the practices described here.</p>

<h2>Information we collect</h2>
<ul>
  <li><strong>Account information</strong> — your name, email address, and password (stored hashed).</li>
  <li><strong>Financial and transaction data</strong> — wallet addresses, exchange API keys or read-only
  connections, and the transaction data we import on your behalf to calculate your taxes.</li>
  <li><strong>Payment information</strong> — processed by our payment provider (Stripe). We do not store
  your full card details.</li>
  <li><strong>Usage and device data</strong> — log data, IP address, browser type, and analytics events
  used to operate and improve the Service.</li>
  <li><strong>Cookies</strong> — used for authentication, preferences, and analytics.</li>
</ul>

<h2>How we use your information</h2>
<ul>
  <li>To provide the Service — import, categorize, price, and calculate your crypto and equities taxes.</li>
  <li>To process payments and manage your subscription.</li>
  <li>To provide support and communicate with you about your account.</li>
  <li>To secure, maintain, and improve the Service.</li>
  <li>To comply with legal obligations.</li>
</ul>

<h2>How we share your information</h2>
<p>We do not sell your personal information. We share it only with:</p>
<ul>
  <li><strong>Service providers</strong> that operate the Service on our behalf — for example payment
  processing (Stripe), hosting, error monitoring, and analytics.</li>
  <li><strong>Data sources you connect</strong> — exchanges and blockchain data providers, solely to
  import the transactions you ask us to import.</li>
  <li><strong>Legal and safety</strong> — where required by law or to protect our rights and users.</li>
</ul>

<h2>Data retention</h2>
<p>We retain your information for as long as your account is active or as needed to provide the Service
and meet legal obligations. You can delete your account at any time from your settings, which removes
your associated data, subject to any retention we are legally required to keep.</p>

<h2>Security</h2>
<p>We use industry-standard measures to protect your data, including encryption of sensitive credentials
in transit and at rest. No method of transmission or storage is completely secure, so we cannot
guarantee absolute security.</p>

<h2>Your rights</h2>
<p>Depending on your location, you may have the right to access, correct, export, or delete your personal
information, and to object to or restrict certain processing. You can exercise many of these directly in
your account settings, or by contacting us.</p>

<h2>Third-party services</h2>
<p>The Service integrates with third parties (such as exchanges and payment processors) that have their
own privacy policies. We are not responsible for their practices.</p>

<h2>Children</h2>
<p>The Service is not directed to children under 18, and we do not knowingly collect information from them.</p>

<h2>International users</h2>
<p>We may process and store information in the United States and other countries. By using the Service you
consent to such transfer.</p>

<h2>Changes to this policy</h2>
<p>We may update this Privacy Policy from time to time. Material changes will be posted on this page with
an updated "Last updated" date.</p>

<h2>Contact us</h2>
<p>Questions about this policy? <a href="/contact">Contact us</a> or use the in-app chat.</p>
`;

export default function PrivacyPolicyPage() {
  return <LegalPage title="Privacy Policy" updated="July 2026" html={HTML} />;
}
