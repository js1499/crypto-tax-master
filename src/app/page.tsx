"use client";

import { Layout } from "@/components/layout";
import { useEffect, useState, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MoreHorizontal, TrendingUp, TrendingDown, Sparkles } from "lucide-react";
import Link from "next/link";

interface MonthlyData {
  month: string;
  gains: number;
  losses: number;
  income: number;
  txnCount: number;
}

interface TopAsset {
  asset: string;
  gainLoss: number;
}

interface AnalyticsData {
  pnl: {
    monthly: MonthlyData[];
    totalGains: number;
    totalLosses: number;
    netPnl: number;
    totalIncome: number;
    totalVolume: number;
  };
  activity: {
    totalTransactions: number;
    peakMonth: string;
    monthlyPattern: Array<{ month: string; count: number }>;
  };
  topAssets: TopAsset[];
  insights: {
    identifiedPct: number;
    biggestGain: { asset: string; amount: number } | null;
    biggestLoss: { asset: string; amount: number } | null;
    distinctAssets: number;
    accountsConnected: number;
    taxEstimate: number;
  };
}

// Insights content
function getInsights(data: AnalyticsData["insights"], pnl: AnalyticsData["pnl"]) {
  const items: Array<{ metric: string; description: string; detail: string }> = [];

  items.push({
    metric: `${data.identifiedPct}%`,
    description: "of transactions identified and categorized",
    detail: data.identifiedPct === 100 ? "All transactions are accounted for" : `${100 - data.identifiedPct}% still need review`,
  });

  if (data.biggestGain) {
    items.push({
      metric: `+$${data.biggestGain.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      description: `biggest gain from ${data.biggestGain.asset}`,
      detail: "Your top performing asset by realized gain",
    });
  }

  if (data.biggestLoss) {
    items.push({
      metric: `-$${Math.abs(data.biggestLoss.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      description: `biggest loss from ${data.biggestLoss.asset}`,
      detail: "Your worst performing asset by realized loss",
    });
  }

  items.push({
    metric: `${data.distinctAssets}`,
    description: "distinct assets traded",
    detail: `Across ${data.accountsConnected} connected account${data.accountsConnected !== 1 ? "s" : ""}`,
  });

  if (pnl.totalIncome > 0) {
    items.push({
      metric: `$${pnl.totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      description: "earned from staking, airdrops, and rewards",
      detail: "Taxed as ordinary income at fair market value on receipt",
    });
  }

  if (data.taxEstimate > 0) {
    items.push({
      metric: `~$${data.taxEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
      description: "estimated tax liability",
      detail: "Based on ST 24% and LT 15% rates",
    });
  }

  return items;
}

// Asset icon helper
function AssetIcon({ symbol }: { symbol: string }) {
  const colors: Record<string, string> = {
    SOL: "#9333EA", WSOL: "#9333EA", ETH: "#2563EB", WETH: "#2563EB",
    BTC: "#EA580C", WBTC: "#EA580C", USDC: "#0D9488", USDT: "#14B8A6",
    JUP: "#16A34A", BONK: "#DB2777",
  };
  const hash = (symbol || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const fallback = ["#2563EB", "#9333EA", "#EA580C", "#0D9488", "#DC2626", "#CA8A04", "#4F46E5", "#16A34A", "#DB2777"];
  const bg = colors[symbol.toUpperCase()] || fallback[hash % fallback.length];

  return (
    <span
      className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[8px] font-bold text-white shrink-0"
      style={{ backgroundColor: bg }}
    >
      {(symbol || "?")[0]}
    </span>
  );
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"gains" | "losses" | "net" | "income">("net");
  const [insightIndex, setInsightIndex] = useState(0);
  const chartRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/dashboard/analytics")
      .then(r => r.json())
      .then(d => { if (d.status === "success") setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status]);

  // Cycle insights
  useEffect(() => {
    if (!data) return;
    const insights = getInsights(data.insights, data.pnl);
    if (insights.length <= 1) return;
    const interval = setInterval(() => {
      setInsightIndex(i => (i + 1) % insights.length);
    }, 12000);
    return () => clearInterval(interval);
  }, [data]);

  // D3 chart rendering
  useEffect(() => {
    if (!data || !chartRef.current) return;
    const d3 = require("d3");
    const container = chartRef.current;
    const svg = d3.select(container).select("svg");
    if (!svg.empty()) svg.remove();

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = 200;
    const m = { top: 8, right: 16, bottom: 28, left: 50 };

    const chart = d3.select(container).append("svg").attr("width", w).attr("height", h);

    const monthly = data.pnl.monthly;
    if (monthly.length === 0) return;

    const getValue = (d: MonthlyData) => {
      if (activeTab === "gains") return d.gains;
      if (activeTab === "losses") return Math.abs(d.losses);
      if (activeTab === "income") return d.income;
      return d.gains + d.losses + d.income;
    };

    const maxVal = Math.max(...monthly.map(getValue), 1);
    const minVal = activeTab === "net" ? Math.min(...monthly.map(getValue), 0) : 0;

    const x = d3.scalePoint().domain(monthly.map((d: MonthlyData) => d.month)).range([m.left, w - m.right]).padding(0.5);
    const y = d3.scaleLinear().domain([minVal * 1.1, maxVal * 1.1]).range([h - m.bottom, m.top]);

    // Gridlines
    chart.append("g")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickSize(-(w - m.left - m.right)).tickFormat(() => ""))
      .call((g: any) => g.select(".domain").remove())
      .call((g: any) => g.selectAll(".tick line").attr("stroke", "#F0F0EB").attr("stroke-dasharray", "2,2"));

    // Area fill
    const color = activeTab === "losses" ? "#DC2626" : activeTab === "income" ? "#2563EB" : "#16A34A";
    const area = d3.area()
      .x((d: MonthlyData) => x(d.month))
      .y0(y(Math.max(minVal, 0)))
      .y1((d: MonthlyData) => y(getValue(d)))
      .curve(d3.curveMonotoneX);

    const gradient = chart.append("defs").append("linearGradient").attr("id", "areaGrad").attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
    gradient.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.3);
    gradient.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0.02);

    chart.append("path").datum(monthly).attr("fill", "url(#areaGrad)").attr("d", area);

    // Line
    const line = d3.line()
      .x((d: MonthlyData) => x(d.month))
      .y((d: MonthlyData) => y(getValue(d)))
      .curve(d3.curveMonotoneX);

    chart.append("path").datum(monthly).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2).attr("d", line);

    // X axis
    chart.append("g")
      .attr("transform", `translate(0,${h - m.bottom})`)
      .call(d3.axisBottom(x).tickSize(0).tickFormat((d: string) => {
        const parts = d.split("-");
        return ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][parseInt(parts[1]) - 1] || d;
      }))
      .call((g: any) => g.select(".domain").remove())
      .call((g: any) => g.selectAll("text").attr("fill", "#9CA3AF").attr("font-size", "11px"));

    // Y axis
    chart.append("g")
      .attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat((d: number) => `$${Math.abs(d) >= 1000 ? `${(d/1000).toFixed(0)}k` : d}`))
      .call((g: any) => g.select(".domain").remove())
      .call((g: any) => g.selectAll("text").attr("fill", "#9CA3AF").attr("font-size", "11px"));

  }, [data, activeTab]);

  if (status === "loading" || loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="h-10 w-48 skeleton-pulse rounded" />
          <div className="grid grid-cols-[1fr_340px] gap-4">
            <div className="h-[320px] skeleton-pulse rounded-xl" />
            <div className="h-[320px] skeleton-pulse rounded-xl" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-[240px] skeleton-pulse rounded-xl" />
            <div className="h-[240px] skeleton-pulse rounded-xl" />
            <div className="h-[240px] skeleton-pulse rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  const insights = data ? getInsights(data.insights, data.pnl) : [];
  const currentInsight = insights[insightIndex % insights.length] || { metric: "—", description: "", detail: "" };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Page title */}
        <h1 className="text-[40px] font-normal tracking-[-0.02em] text-[#1A1A1A] dark:text-[#F5F5F5]">Overview</h1>

        {/* Row 1: P&L Chart + Gross Volume */}
        <div className="grid grid-cols-[1fr_340px] gap-4">

          {/* P&L Over Time */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">P&L Over Time</h2>
              <MoreHorizontal className="h-4 w-4 text-[#9CA3AF]" />
            </div>

            {/* Metric tabs */}
            <div className="flex items-center gap-6 mb-4">
              {[
                { key: "gains" as const, label: "Total Gains", value: data?.pnl.totalGains || 0, color: "#16A34A", sign: "+" },
                { key: "losses" as const, label: "Total Losses", value: data?.pnl.totalLosses || 0, color: "#DC2626", sign: "-" },
                { key: "net" as const, label: "Net P&L", value: data?.pnl.netPnl || 0, color: (data?.pnl.netPnl || 0) >= 0 ? "#16A34A" : "#DC2626", sign: (data?.pnl.netPnl || 0) >= 0 ? "+" : "" },
                { key: "income" as const, label: "Income", value: data?.pnl.totalIncome || 0, color: "#2563EB", sign: "+" },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={cn("text-left transition-colors", activeTab === tab.key ? "opacity-100" : "opacity-50 hover:opacity-75")}
                >
                  <p className="text-[12px] text-[#6B7280]">{tab.label}</p>
                  <p className="text-[18px] font-semibold" style={{ color: activeTab === tab.key ? tab.color : "#1A1A1A", fontVariantNumeric: 'tabular-nums' }}>
                    {tab.sign}${Math.abs(tab.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                  {activeTab === tab.key && <div className="h-[2px] mt-1 rounded-full" style={{ backgroundColor: tab.color }} />}
                </button>
              ))}
            </div>

            {/* Chart */}
            <div ref={chartRef} className="w-full" style={{ height: 200 }} />
          </div>

          {/* Gross Volume */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Gross Volume</h2>
              <MoreHorizontal className="h-4 w-4 text-[#9CA3AF]" />
            </div>

            <div className="flex items-baseline gap-2 mb-6">
              <p className="text-[36px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                ${(data?.pnl.totalVolume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </p>
            </div>

            <div className="space-y-5">
              {[
                { label: "Capital Gains", value: data?.pnl.totalGains || 0, color: "#16A34A", max: data?.pnl.totalVolume || 1 },
                { label: "Capital Losses", value: data?.pnl.totalLosses || 0, color: "#DC2626", max: data?.pnl.totalVolume || 1 },
                { label: "Income", value: data?.pnl.totalIncome || 0, color: "#2563EB", max: data?.pnl.totalVolume || 1 },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[14px] text-[#6B7280]">{row.label}</span>
                    <span className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="h-[6px] w-full rounded-full bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.min((row.value / row.max) * 100, 100)}%`, backgroundColor: row.color }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Activity + Top Assets + Insights */}
        <div className="grid grid-cols-3 gap-4">

          {/* Activity */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Transactions</h2>
              <MoreHorizontal className="h-4 w-4 text-[#9CA3AF]" />
            </div>
            {data?.activity.peakMonth && (
              <span className="inline-flex items-center rounded-full bg-[#F5F5F0] dark:bg-[#222] px-2 py-0.5 text-[11px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5] mb-3">
                Peak: {data.activity.peakMonth}
              </span>
            )}
            <p className="text-[36px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5] mb-3" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
              {(data?.activity.totalTransactions || 0).toLocaleString()}
            </p>

            {/* Dot grid pattern */}
            <div className="flex items-end gap-[3px] h-[60px] mb-3">
              {(data?.activity.monthlyPattern || []).slice(-12).map((m, i) => {
                const max = Math.max(...(data?.activity.monthlyPattern || []).map(p => p.count), 1);
                const height = Math.max(4, (m.count / max) * 50);
                return (
                  <div key={i} className="flex-1 rounded-sm bg-[#2563EB]" style={{ height, opacity: 0.3 + (m.count / max) * 0.7 }} title={`${m.month}: ${m.count}`} />
                );
              })}
            </div>
          </div>

          {/* Top Assets */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Top Assets</h2>
              <MoreHorizontal className="h-4 w-4 text-[#9CA3AF]" />
            </div>

            <div className="space-y-0">
              {(data?.topAssets || []).slice(0, 6).map((asset, i) => (
                <div key={asset.asset} className={cn("flex items-center justify-between py-2.5", i > 0 && "border-t border-[#F0F0EB] dark:border-[#2A2A2A]")}>
                  <div className="flex items-center gap-2.5">
                    <AssetIcon symbol={asset.asset} />
                    <span className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">{asset.asset}</span>
                  </div>
                  <span className={cn("text-[14px] font-medium", asset.gainLoss >= 0 ? "text-[#16A34A]" : "text-[#DC2626]")} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {asset.gainLoss >= 0 ? "+" : "-"}${Math.abs(asset.gainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Insights */}
          <div className="rounded-xl p-6 text-white overflow-hidden relative" style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #0C1929 100%)" }}>
            <div className="flex items-center justify-between mb-6">
              <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(147,197,253,0.15)] px-2.5 py-0.5 text-[11px] font-medium text-[#93C5FD]">
                <Sparkles className="h-3 w-3" />
                Insights
              </span>
              <MoreHorizontal className="h-4 w-4 text-white/40" />
            </div>

            <div className="transition-opacity duration-300" key={insightIndex}>
              <p className="text-[48px] font-bold leading-none mb-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {currentInsight.metric}
              </p>
              <p className="text-[16px] font-normal text-white/80 mb-2">
                {currentInsight.description}
              </p>
              <p className="text-[13px] text-white/50">
                {currentInsight.detail}
              </p>
            </div>

            {/* Progress dots */}
            {insights.length > 1 && (
              <div className="flex items-center gap-1.5 mt-6">
                {insights.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setInsightIndex(i)}
                    className={cn("h-1 rounded-full transition-all duration-300", i === insightIndex % insights.length ? "w-4 bg-white" : "w-1.5 bg-white/30")}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-6 pt-2">
          <Link href="/transactions" className="text-[13px] text-[#6B7280] hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors">
            View Transactions →
          </Link>
          <Link href="/tax-reports" className="text-[13px] text-[#6B7280] hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors">
            Generate Tax Report →
          </Link>
          <Link href="/accounts" className="text-[13px] text-[#6B7280] hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors">
            Manage Accounts →
          </Link>
        </div>
      </div>
    </Layout>
  );
}
