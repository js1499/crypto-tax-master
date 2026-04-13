"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  Wallet, ChevronRight, ArrowRight, Sparkles, PlusCircle,
  Settings, FileText, Clock, CheckCircle2, Calendar, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import { useRouter } from "next/navigation";

// ---------------------------------------------------------------------------
// Steps — identical to the interactive guided tutorial
// ---------------------------------------------------------------------------

const STEPS = [
  {
    number: 1,
    title: "Connect Your Accounts",
    description: "Let's connect your wallets and exchanges. Click Accounts in the sidebar.",
    icon: Wallet,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 2,
    title: "Add an Account",
    description: "Click Add Account, then choose 'Add One Account' or 'Add Multiple' from the dropdown.",
    icon: PlusCircle,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 3,
    title: "Set Up Your Account",
    description: "Use the Wallets tab to connect on-chain wallets (SOL, ETH, BTC), the Exchanges tab for API connections (Coinbase, Binance), or CSV Upload to import transaction files. Enter your details and click Add & Sync.",
    icon: Settings,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 4,
    title: "All Accounts Added?",
    description: "If you need to add more wallets or exchanges, click Add Account again. Otherwise, continue to the next step.",
    icon: CheckCircle2,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 5,
    title: "Syncing in Progress",
    description: "Your accounts are being synced, prices pulled, and cost basis computed. This runs automatically in the background. Once the progress bar completes, you can move to the next step.",
    icon: Clock,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 6,
    title: "Review Your Transactions",
    description: "Syncing is complete! Click Transactions to review your data.",
    icon: FileText,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 7,
    title: "Your Transaction Ledger",
    description: "This is where you can explore all your transactions. If you have any bank transfers, gifts, or theft-related transactions, make sure to mark them accordingly. You can always come back here for a deeper review after completing the tutorial.",
    icon: FileText,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 8,
    title: "Download Tax Reports",
    description: "Once syncing is complete, click Tax Reports to generate your tax forms.",
    icon: Download,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 9,
    title: "Select Tax Year",
    description: "Choose the tax year you want to generate reports for. Your reports will reflect all transactions within that calendar year.",
    icon: Calendar,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
  },
  {
    number: 10,
    title: "Your Required Tax Forms",
    description: "For US taxpayers, you'll need: Schedule D (capital gains summary), Form 8949 (detailed transaction list), and Schedule 1 (crypto income). TurboTax-compatible CSV exports are also available. Download what you need!",
    icon: FileText,
    iconColor: "#2563EB",
    iconBg: "#EFF6FF",
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
              Follow along step by step, or click the button to start the interactive guided tour.
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
        <div>
          <h2 className="text-[20px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mb-6">
            Step-by-Step Instructions
          </h2>

          <div className="space-y-0">
            {STEPS.map((step, idx) => (
              <div key={step.number}>
                <div className="flex gap-5 py-6">
                  {/* Left: number + connecting line */}
                  <div className="flex flex-col items-center shrink-0">
                    <div
                      className="flex items-center justify-center w-11 h-11 rounded-xl text-white text-[16px] font-bold shrink-0"
                      style={{ backgroundColor: step.iconColor }}
                    >
                      {step.number}
                    </div>
                    {idx < STEPS.length - 1 && (
                      <div className="w-px flex-1 bg-[#E5E5E0] dark:bg-[#333] mt-3" />
                    )}
                  </div>

                  {/* Right: content */}
                  <div className="flex-1 min-w-0 pt-1">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div
                        className="flex items-center justify-center h-7 w-7 rounded-lg"
                        style={{ backgroundColor: step.iconBg }}
                      >
                        <step.icon className="h-3.5 w-3.5" style={{ color: step.iconColor }} />
                      </div>
                      <h3 className="text-[18px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                        {step.title}
                      </h3>
                    </div>

                    <p className="text-[15px] text-[#4B5563] dark:text-[#9CA3AF] leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>

                {idx < STEPS.length - 1 && (
                  <div className="border-b border-[#F0F0EB] dark:border-[#2A2A2A]" />
                )}
              </div>
            ))}
          </div>
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
                Tax AI can answer questions about your data, reformat CSVs for import, and help you understand your tax obligations.
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
