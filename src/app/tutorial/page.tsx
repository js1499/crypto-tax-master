"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  Wallet, RefreshCw, DollarSign, Calculator, FileText,
  ChevronRight, ArrowRight, Upload, Building, Sparkles, Play,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

const STEPS = [
  {
    number: 1,
    title: "Connect Wallets & Exchanges",
    description: "Link your crypto wallets and exchange accounts so we can import your full transaction history.",
    details: [
      "Solana wallets sync via Helius API (full history)",
      "EVM wallets sync via Moralis (Ethereum, Polygon, Arbitrum, Base, and more)",
      "Exchange API connections: Coinbase, Binance, Kraken, KuCoin, Gemini",
      "You can also import CSV exports from any exchange",
      "Add multiple wallets at once using the bulk add feature",
    ],
    icon: Wallet,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
    href: "/accounts",
    buttonLabel: "Go to Accounts",
  },
  {
    number: 2,
    title: "Automatic Sync & Price Enrichment",
    description: "After connecting, we automatically sync your transactions and pull historical USD prices.",
    details: [
      "Transactions are synced from the blockchain or exchange API",
      "Historical prices are pulled from CoinGecko, on-chain DEX data, and Binance",
      "Swap prices are calculated at the exact block timestamp for accuracy",
      "Progress is shown in the bottom-right corner — you can navigate freely while it runs",
      "Some obscure tokens may remain unpriced — this is normal and won't affect major calculations",
    ],
    icon: RefreshCw,
    iconColor: "#9333EA",
    iconBg: "#FAF5FF",
    href: "/accounts",
    buttonLabel: "Go to Accounts",
  },
  {
    number: 3,
    title: "Cost Basis Computation",
    description: "We automatically compute your cost basis, gains, and losses using IRS-compliant methods.",
    details: [
      "Per-wallet FIFO for IRS 2025+ compliance (or universal FIFO for prior years)",
      "Stablecoin transfers are handled specially to avoid phantom gains",
      "Wash sale detection is applied within 30-day windows",
      "Cost basis, gain/loss, and holding period are stored on every transaction",
      "All tax reports read from these computed values — one source of truth",
    ],
    icon: Calculator,
    iconColor: "#0D9488",
    iconBg: "#F0FDFA",
    href: "/transactions",
    buttonLabel: "View Transactions",
  },
  {
    number: 4,
    title: "Review Your Transactions",
    description: "Explore your transaction history and make sure everything looks right.",
    details: [
      "Filter by type, asset, date, chain, source, or value range",
      "Mark any bank transfers, gifts, or theft-related transactions accordingly",
      "Edit transaction types or amounts if something was miscategorized",
      "View cost basis, proceeds, and gain/loss for every disposal",
      "You can always come back here for a deeper review",
    ],
    icon: FileText,
    iconColor: "#CA8A04",
    iconBg: "#FEFCE8",
    href: "/transactions",
    buttonLabel: "Go to Transactions",
  },
  {
    number: 5,
    title: "Download Tax Reports",
    description: "Generate IRS forms, TurboTax-compatible exports, and country-specific reports.",
    details: [
      "Schedule D — capital gains and losses summary (required for IRS filing)",
      "Form 8949 — detailed transaction list by asset (required for IRS filing)",
      "Schedule 1 — crypto income from staking, airdrops, and rewards (required if applicable)",
      "TurboTax-compatible 1099-B CSV export for easy import",
      "UK (HMRC share pooling) and Germany (Anlage SO) reports also available",
    ],
    icon: FileText,
    iconColor: "#DC2626",
    iconBg: "#FEF2F2",
    href: "/tax-reports",
    buttonLabel: "Go to Tax Reports",
  },
  {
    number: 6,
    title: "Securities (Optional)",
    description: "If you trade stocks, ETFs, options, or other securities, add your brokerage accounts.",
    details: [
      "Import transactions via CSV from Fidelity, Schwab, Vanguard, Robinhood, IBKR, and more",
      "Supports FIFO, LIFO, HIFO, Specific ID, and Average Cost methods",
      "Full wash sale engine: 30-day rule, cross-account, IRA permanent disallowance",
      "Section 1256 (futures 60/40), Section 475 (trader MTM), Section 988 (forex)",
      "Combined crypto + securities reports on the Tax Reports page",
    ],
    icon: Building,
    iconColor: "#9333EA",
    iconBg: "#FAF5FF",
    href: "/securities/accounts",
    buttonLabel: "Go to Securities",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TutorialPage() {
  const [mounted, setMounted] = useState(false);
  const { startOnboarding } = useOnboarding();
  const router = useRouter();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return (
    <Layout>
      <div className="space-y-8 px-0 max-w-[900px]">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-light tracking-[-0.02em] text-[#1A1A1A] dark:text-[#F5F5F5]">
              Tutorial
            </h1>
            <p className="text-[15px] text-[#6B7280] mt-1">
              Everything you need to know to calculate your crypto taxes with Glide.
            </p>
          </div>
          <Button onClick={startOnboarding} className="bg-[#2563EB] hover:bg-[#1D4ED8]">
            <Sparkles className="mr-2 h-4 w-4" />
            Start Interactive Guide
          </Button>
        </div>

        {/* Video Section */}
        <div className="rounded-xl border border-[#E5E5E0] dark:border-[#333] overflow-hidden bg-[#000]">
          <video
            src="/landing/guided-mode.mp4"
            controls
            playsInline
            preload="metadata"
            className="w-full"
            style={{ aspectRatio: "16/9" }}
          />
        </div>

        {/* Steps */}
        <div className="space-y-0">
          {STEPS.map((step, idx) => (
            <div key={step.number}>
              {/* Step card */}
              <div className="flex gap-6 py-8">
                {/* Left: number + line */}
                <div className="flex flex-col items-center shrink-0">
                  <div
                    className="flex items-center justify-center w-12 h-12 rounded-xl text-white text-[18px] font-bold"
                    style={{ backgroundColor: step.iconColor }}
                  >
                    {step.number}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div className="w-px flex-1 bg-[#E5E5E0] dark:bg-[#333] mt-3" />
                  )}
                </div>

                {/* Right: content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="flex items-center justify-center h-8 w-8 rounded-lg"
                      style={{ backgroundColor: step.iconBg }}
                    >
                      <step.icon className="h-4 w-4" style={{ color: step.iconColor }} />
                    </div>
                    <h2 className="text-[20px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                      {step.title}
                    </h2>
                  </div>

                  <p className="text-[15px] text-[#6B7280] leading-relaxed mb-4">
                    {step.description}
                  </p>

                  <div className="rounded-lg bg-[#F8F9FA] dark:bg-[#111] border border-[#E5E5E0] dark:border-[#2A2A2A] p-4">
                    <ul className="space-y-2.5">
                      {step.details.map((detail, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <ChevronRight className="h-4 w-4 text-[#9CA3AF] shrink-0 mt-0.5" />
                          <span className="text-[14px] text-[#4B5563] dark:text-[#9CA3AF] leading-relaxed">
                            {detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => router.push(step.href)}
                    className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
                  >
                    {step.buttonLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Divider */}
              {idx < STEPS.length - 1 && (
                <div className="border-b border-[#F0F0EB] dark:border-[#2A2A2A]" />
              )}
            </div>
          ))}
        </div>

        {/* Tax AI callout */}
        <div className="rounded-xl bg-[#EFF6FF] dark:bg-[rgba(37,99,235,0.06)] border border-[#BFDBFE] dark:border-[#1E3A5F] p-6">
          <div className="flex items-start gap-4">
            <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-[#2563EB]/10 shrink-0">
              <Sparkles className="h-5 w-5 text-[#2563EB]" />
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                Need help along the way?
              </h3>
              <p className="text-[14px] text-[#6B7280] mt-1 leading-relaxed">
                Tax AI can answer questions about your data, reformat CSVs for import, and help you understand your tax obligations. It has full access to your transaction database.
              </p>
              <button
                onClick={() => router.push("/tax-ai")}
                className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-[#2563EB] hover:text-[#1D4ED8] transition-colors"
              >
                Open Tax AI <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
