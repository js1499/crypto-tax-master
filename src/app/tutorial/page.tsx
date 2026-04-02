"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  Wallet, RefreshCw, DollarSign, Calculator, FileText, CheckCircle2,
  ChevronRight, ArrowRight, AlertCircle, Upload, Building, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";

// ---------------------------------------------------------------------------
// Step definitions
// ---------------------------------------------------------------------------

interface TutorialStep {
  number: number;
  title: string;
  description: string;
  details: string[];
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  iconBg: string;
  href: string;
  buttonLabel: string;
  section: "crypto" | "securities" | "reports";
}

const STEPS: TutorialStep[] = [
  // ── Crypto ──
  {
    number: 1,
    title: "Connect Wallets & Exchanges",
    description: "Link your crypto wallets and exchange accounts so we can import your transaction history.",
    details: [
      "Solana wallets sync via Helius API (full history)",
      "EVM wallets sync via Moralis (Ethereum, Polygon, Arbitrum, etc.)",
      "Exchange API connections: Coinbase, Binance, Kraken, KuCoin, Gemini",
      "You can also import CSV exports from any exchange",
    ],
    icon: Wallet,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
    href: "/accounts",
    buttonLabel: "Go to Accounts",
    section: "crypto",
  },
  {
    number: 2,
    title: "Sync Transactions",
    description: "Pull your full transaction history from each connected wallet and exchange.",
    details: [
      "Click 'Sync All' on the Accounts page, or sync individual accounts",
      "Wallet sync fetches all on-chain transactions from genesis",
      "Exchange sync pulls trades, deposits, and withdrawals via API",
      "Duplicate transactions are automatically detected and skipped",
    ],
    icon: RefreshCw,
    iconColor: "#9333EA",
    iconBg: "#FAF5FF",
    href: "/accounts",
    buttonLabel: "Go to Accounts",
    section: "crypto",
  },
  {
    number: 3,
    title: "Enrich Prices",
    description: "Fill in missing USD prices for your transactions using historical market data.",
    details: [
      "Click 'Enrich All' on the Accounts page",
      "Uses CoinGecko, on-chain DEX data, and Birdeye for price lookups",
      "Prices swaps from on-chain OHLCV data (minute-level accuracy)",
      "Some obscure tokens may remain unpriced — this is normal",
    ],
    icon: DollarSign,
    iconColor: "#16A34A",
    iconBg: "#F0FDF4",
    href: "/accounts",
    buttonLabel: "Go to Accounts",
    section: "crypto",
  },
  {
    number: 4,
    title: "Review Transactions",
    description: "Verify your transactions are correctly categorized and priced.",
    details: [
      "Check the Transactions page for any 'Unidentified' badges",
      "Use filters to find unpriced transactions (value = $0)",
      "Reclassify incorrect transaction types (e.g., swap mislabeled as transfer)",
      "Edit individual transactions if amounts or types are wrong",
    ],
    icon: FileText,
    iconColor: "#CA8A04",
    iconBg: "#FEFCE8",
    href: "/transactions",
    buttonLabel: "Go to Transactions",
    section: "crypto",
  },
  {
    number: 5,
    title: "Compute Cost Basis",
    description: "Calculate gains, losses, and cost basis using FIFO (or your preferred method).",
    details: [
      "Cost basis is computed automatically when you open Tax Reports",
      "Uses per-wallet FIFO for IRS 2025+ compliance (or universal FIFO for prior years)",
      "Wash sale detection is applied for crypto disposals within 30-day windows",
      "Stablecoin transfers are handled specially to avoid phantom gains",
    ],
    icon: Calculator,
    iconColor: "#0D9488",
    iconBg: "#F0FDFA",
    href: "/tax-reports",
    buttonLabel: "Go to Tax Reports",
    section: "crypto",
  },

  // ── Securities ──
  {
    number: 6,
    title: "Add Brokerage Accounts",
    description: "Add your brokerage accounts and import securities transactions via CSV.",
    details: [
      "Click 'Add Brokerage' on the Securities Accounts page",
      "Choose Manual Setup to create an account, or CSV Import to upload directly",
      "Supports: Fidelity, Schwab, Vanguard, Robinhood, IBKR, and more",
      "Set the correct account type (Taxable, IRA, Roth IRA, 401k, HSA)",
    ],
    icon: Building,
    iconColor: "#9333EA",
    iconBg: "#FAF5FF",
    href: "/securities/accounts",
    buttonLabel: "Go to Securities Accounts",
    section: "securities",
  },
  {
    number: 7,
    title: "Compute Securities Lots",
    description: "Run the lot engine to calculate cost basis, wash sales, and taxable events.",
    details: [
      "Click 'Compute Lots' on the Securities Transactions page",
      "Supports FIFO, LIFO, HIFO, Specific ID, and Average Cost methods",
      "Wash sale engine detects disallowed losses (30-day rule, cross-account, IRA)",
      "Dividends, DRIP, stock splits, and short sales are all handled",
    ],
    icon: Calculator,
    iconColor: "#0D9488",
    iconBg: "#F0FDFA",
    href: "/securities/transactions",
    buttonLabel: "Go to Securities Transactions",
    section: "securities",
  },

  // ── Reports ──
  {
    number: 8,
    title: "Download Tax Reports",
    description: "Generate IRS forms, CSV exports, and country-specific tax reports.",
    details: [
      "Form 8949 (capital gains/losses) — filled PDF or detailed CSV",
      "Schedule D (summary of gains) — filled PDF",
      "TurboTax-compatible 1099-B CSV export",
      "UK (HMRC share pooling) and Germany (Freigrenze) reports available",
      "Combined crypto + securities reports on the Tax Reports page",
    ],
    icon: FileText,
    iconColor: "#DC2626",
    iconBg: "#FEF2F2",
    href: "/tax-reports",
    buttonLabel: "Go to Tax Reports",
    section: "reports",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function TutorialPage() {
  const [mounted, setMounted] = useState(false);
  const [activeSection, setActiveSection] = useState<"all" | "crypto" | "securities" | "reports">("all");
  const { startOnboarding } = useOnboarding();

  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  const filteredSteps = activeSection === "all"
    ? STEPS
    : STEPS.filter((s) => s.section === activeSection);

  const handleNavigate = (href: string) => {
    window.location.href = href;
  };

  return (
    <Layout>
      <div className="space-y-6 px-0">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-light tracking-[-0.02em] text-[#1A1A1A] dark:text-[#F5F5F5]">
              Getting Started
            </h1>
            <p className="text-[14px] text-[#6B7280] mt-1">
              Follow these steps to set up your tax calculations. Complete them in order for best results.
            </p>
          </div>
          <Button variant="outline" onClick={startOnboarding}>
            <Sparkles className="mr-2 h-4 w-4" />
            Restart Interactive Guide
          </Button>
        </div>

        {/* Section filter */}
        <div className="flex items-center gap-1 bg-[#F5F5F0] dark:bg-[#222] rounded-md p-0.5 w-fit">
          {(["all", "crypto", "securities", "reports"] as const).map((section) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={cn(
                "px-3 py-1.5 text-[13px] font-medium rounded transition-colors capitalize",
                activeSection === section
                  ? "bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#F5F5F5] shadow-sm"
                  : "text-[#6B7280] hover:text-[#4B5563]",
              )}
            >
              {section === "all" ? "All Steps" : section}
            </button>
          ))}
        </div>

        {/* Steps */}
        <div className="space-y-4">
          {filteredSteps.map((step, idx) => (
            <div
              key={step.number}
              className="border border-[#E5E5E0] dark:border-[#333] rounded-lg hover:border-[#C0C0B8] dark:hover:border-[#444] transition-colors"
            >
              <div className="flex items-start gap-4 p-5">
                {/* Step number + icon */}
                <div className="flex flex-col items-center gap-2 shrink-0">
                  <div
                    className="flex items-center justify-center h-10 w-10 rounded-lg"
                    style={{ backgroundColor: step.iconBg }}
                  >
                    <step.icon className="h-5 w-5" style={{ color: step.iconColor }} />
                  </div>
                  <span
                    className="text-[11px] font-bold rounded-full h-5 w-5 flex items-center justify-center"
                    style={{ backgroundColor: step.iconBg, color: step.iconColor }}
                  >
                    {step.number}
                  </span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                      {step.title}
                    </h2>
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded",
                        step.section === "crypto" && "bg-pill-blue-bg text-pill-blue-text",
                        step.section === "securities" && "bg-pill-purple-bg text-pill-purple-text",
                        step.section === "reports" && "bg-pill-red-bg text-pill-red-text",
                      )}
                    >
                      {step.section}
                    </span>
                  </div>
                  <p className="text-[14px] text-[#6B7280] mb-3">
                    {step.description}
                  </p>
                  <ul className="space-y-1.5">
                    {step.details.map((detail, i) => (
                      <li key={i} className="flex items-start gap-2 text-[13px] text-[#4B5563] dark:text-[#9CA3AF]">
                        <ChevronRight className="h-3.5 w-3.5 text-[#9CA3AF] shrink-0 mt-0.5" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Action button */}
                <div className="shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleNavigate(step.href)}
                  >
                    {step.buttonLabel}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* Connector line between steps */}
              {idx < filteredSteps.length - 1 && (
                <div className="flex justify-center -mb-4 pb-0">
                  <div className="w-px h-4 bg-[#E5E5E0] dark:bg-[#333]" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Tax AI callout */}
        <div className="rounded-md bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 p-4">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[14px] font-medium text-blue-900 dark:text-blue-200">
                Need help along the way?
              </p>
              <p className="text-[13px] mt-0.5 text-blue-700 dark:text-blue-300">
                Tax AI can answer questions about your data, reformat CSVs for import, and help you understand your tax obligations.
              </p>
              <button
                onClick={() => handleNavigate("/tax-ai")}
                className="mt-2 inline-flex items-center text-[13px] text-blue-600 hover:text-blue-800 dark:text-blue-400 font-medium"
              >
                Open Tax AI <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
