"use client";

import { Layout } from "@/components/layout";
import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { MoreHorizontal, Sparkles, Calendar } from "lucide-react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

function getInsights(data: AnalyticsData["insights"], pnl: AnalyticsData["pnl"]) {
  const items: Array<{ metric: string; description: string; detail: string }> = [];
  items.push({ metric: `${data.identifiedPct}%`, description: "of transactions identified and categorized", detail: data.identifiedPct === 100 ? "All transactions are accounted for" : `${100 - data.identifiedPct}% still need review` });
  if (data.biggestGain) items.push({ metric: `+$${data.biggestGain.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, description: `biggest gain from ${data.biggestGain.asset}`, detail: "Your top performing asset by realized gain" });
  if (data.biggestLoss) items.push({ metric: `-$${Math.abs(data.biggestLoss.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, description: `biggest loss from ${data.biggestLoss.asset}`, detail: "Your worst performing asset by realized loss" });
  items.push({ metric: `${data.distinctAssets}`, description: "distinct assets traded", detail: `Across ${data.accountsConnected} connected account${data.accountsConnected !== 1 ? "s" : ""}` });
  if (pnl.totalIncome > 0) items.push({ metric: `$${pnl.totalIncome.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, description: "earned from staking, airdrops, and rewards", detail: "Taxed as ordinary income at fair market value" });
  if (data.taxEstimate > 0) items.push({ metric: `~$${data.taxEstimate.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, description: "estimated tax liability", detail: "Based on ST 24% and LT 15% rates" });
  return items;
}

function AssetIcon({ symbol }: { symbol: string }) {
  const colors: Record<string, string> = { SOL: "#9333EA", ETH: "#2563EB", BTC: "#EA580C", USDC: "#0D9488", JUP: "#16A34A", BONK: "#DB2777" };
  const hash = (symbol || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const fallback = ["#2563EB", "#9333EA", "#EA580C", "#0D9488", "#DC2626", "#CA8A04", "#4F46E5", "#16A34A", "#DB2777"];
  const bg = colors[symbol.toUpperCase()] || fallback[hash % fallback.length];
  return <span className="inline-flex items-center justify-center h-6 w-6 rounded-full text-[9px] font-bold text-white shrink-0" style={{ backgroundColor: bg }}>{(symbol || "?")[0]}</span>;
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"gains" | "losses" | "net" | "income">("net");
  const [insightIndex, setInsightIndex] = useState(0);
  const [period, setPeriod] = useState("all");
  const chartRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login");
  }, [status, router]);

  const fetchData = useCallback(() => {
    if (status !== "authenticated") return;
    setLoading(true);
    const params = period !== "all" ? `?year=${period}` : "";
    fetch(`/api/dashboard/analytics${params}`)
      .then(r => r.json())
      .then(d => { if (d.status === "success") setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [status, period]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Cycle insights
  useEffect(() => {
    if (!data) return;
    const insights = getInsights(data.insights, data.pnl);
    if (insights.length <= 1) return;
    const interval = setInterval(() => setInsightIndex(i => (i + 1) % insights.length), 12000);
    return () => clearInterval(interval);
  }, [data]);

  // D3 chart
  useEffect(() => {
    if (!data || !chartRef.current) return;
    const d3 = require("d3");
    const container = chartRef.current;
    d3.select(container).selectAll("svg").remove();

    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = 220;
    const m = { top: 12, right: 16, bottom: 32, left: 52 };

    const chart = d3.select(container).append("svg").attr("width", w).attr("height", h);
    const monthly = data.pnl.monthly.filter((d: MonthlyData) => d.txnCount > 0 || d.gains > 0 || d.losses < 0 || d.income > 0);
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
    const y = d3.scaleLinear().domain([minVal * 1.15, maxVal * 1.15]).range([h - m.bottom, m.top]);

    // Gridlines
    chart.append("g").attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickSize(-(w - m.left - m.right)).tickFormat(() => ""))
      .call((g: any) => { g.select(".domain").remove(); g.selectAll(".tick line").attr("stroke", "#F0F0EB").attr("stroke-dasharray", "2,2"); });

    const color = activeTab === "losses" ? "#DC2626" : activeTab === "income" ? "#2563EB" : "#16A34A";

    // Gradient
    const grad = chart.append("defs").append("linearGradient").attr("id", "aGrad").attr("x1", "0%").attr("y1", "0%").attr("x2", "0%").attr("y2", "100%");
    grad.append("stop").attr("offset", "0%").attr("stop-color", color).attr("stop-opacity", 0.25);
    grad.append("stop").attr("offset", "100%").attr("stop-color", color).attr("stop-opacity", 0.02);

    // Area
    const area = d3.area().x((d: MonthlyData) => x(d.month)).y0(y(Math.max(minVal, 0))).y1((d: MonthlyData) => y(getValue(d))).curve(d3.curveMonotoneX);
    chart.append("path").datum(monthly).attr("fill", "url(#aGrad)").attr("d", area);

    // Line
    const line = d3.line().x((d: MonthlyData) => x(d.month)).y((d: MonthlyData) => y(getValue(d))).curve(d3.curveMonotoneX);
    chart.append("path").datum(monthly).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.5).attr("d", line);

    // Dots
    chart.selectAll(".dot").data(monthly).enter().append("circle")
      .attr("cx", (d: MonthlyData) => x(d.month)).attr("cy", (d: MonthlyData) => y(getValue(d)))
      .attr("r", 3).attr("fill", color).attr("stroke", "white").attr("stroke-width", 1.5);

    // X axis
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    chart.append("g").attr("transform", `translate(0,${h - m.bottom})`)
      .call(d3.axisBottom(x).tickSize(0).tickFormat((d: string) => monthNames[parseInt(d.split("-")[1]) - 1] || d))
      .call((g: any) => { g.select(".domain").remove(); g.selectAll("text").attr("fill", "#9CA3AF").attr("font-size", "11px").attr("font-weight", "500"); });

    // Y axis
    chart.append("g").attr("transform", `translate(${m.left},0)`)
      .call(d3.axisLeft(y).ticks(5).tickFormat((d: number) => `$${Math.abs(d) >= 1000 ? `${(d / 1000).toFixed(0)}k` : d.toFixed(0)}`))
      .call((g: any) => { g.select(".domain").remove(); g.selectAll("text").attr("fill", "#9CA3AF").attr("font-size", "11px"); });
  }, [data, activeTab]);

  if (status === "loading" || loading) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="h-12 w-56 skeleton-pulse rounded" />
          <div className="grid grid-cols-[1fr_360px] gap-5">
            <div className="h-[380px] skeleton-pulse rounded-xl" />
            <div className="h-[380px] skeleton-pulse rounded-xl" />
          </div>
          <div className="grid grid-cols-3 gap-5">
            <div className="h-[260px] skeleton-pulse rounded-xl" />
            <div className="h-[260px] skeleton-pulse rounded-xl" />
            <div className="h-[260px] skeleton-pulse rounded-xl" />
          </div>
        </div>
      </Layout>
    );
  }

  const insights = data ? getInsights(data.insights, data.pnl) : [];
  const currentInsight = insights[insightIndex % insights.length] || { metric: "—", description: "", detail: "" };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header — Zentra style */}
        <div className="flex items-end justify-between">
          <h1 className="text-[42px] font-normal tracking-[-0.03em] text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ lineHeight: 1 }}>Overview</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-[#E5E5E0] dark:border-[#333] rounded-lg px-3 h-9">
              <Calendar className="h-3.5 w-3.5 text-[#9CA3AF]" />
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger className="border-0 shadow-none h-8 text-[13px] font-medium w-[120px] p-0 pl-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  {Array.from({ length: new Date().getFullYear() - 2020 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Row 1: P&L Chart (65%) + Gross Volume (35%) */}
        <div className="grid grid-cols-[1fr_360px] gap-5">

          {/* P&L Over Time */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">P&L Over Time</h2>
              <MoreHorizontal className="h-4 w-4 text-[#D4D4CF] cursor-pointer hover:text-[#9CA3AF] transition-colors" />
            </div>

            {/* Metric tabs — Zentra style */}
            <div className="flex items-start gap-8 px-6 pb-4 border-b border-[#F0F0EB] dark:border-[#2A2A2A]">
              {[
                { key: "gains" as const, label: "Total Gains", value: data?.pnl.totalGains || 0, color: "#16A34A", sign: "+" },
                { key: "losses" as const, label: "Total Losses", value: data?.pnl.totalLosses || 0, color: "#DC2626", sign: "-" },
                { key: "net" as const, label: "Net P&L", value: data?.pnl.netPnl || 0, color: (data?.pnl.netPnl || 0) >= 0 ? "#16A34A" : "#DC2626", sign: (data?.pnl.netPnl || 0) >= 0 ? "+" : "" },
                { key: "income" as const, label: "Income", value: data?.pnl.totalIncome || 0, color: "#2563EB", sign: "+" },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className="text-left transition-all"
                >
                  <p className={cn("text-[12px] mb-0.5", activeTab === tab.key ? "text-[#1A1A1A] dark:text-[#F5F5F5] font-medium" : "text-[#9CA3AF]")}>{tab.label}</p>
                  <p className={cn("text-[20px] font-bold", activeTab === tab.key ? "" : "text-[#9CA3AF]")} style={{ color: activeTab === tab.key ? tab.color : undefined, fontVariantNumeric: 'tabular-nums' }}>
                    {tab.sign}${Math.abs(tab.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </p>
                </button>
              ))}
            </div>

            {/* Chart */}
            <div ref={chartRef} className="w-full px-2 pb-4 pt-2" style={{ height: 220 }} />
          </div>

          {/* Gross Volume */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Gross Volume</h2>
              <MoreHorizontal className="h-4 w-4 text-[#D4D4CF] cursor-pointer hover:text-[#9CA3AF] transition-colors" />
            </div>

            <p className="text-[40px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5] mb-8" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
              ${(data?.pnl.totalVolume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </p>

            <div className="space-y-6">
              {[
                { label: "Capital Gains", value: data?.pnl.totalGains || 0, color: "#16A34A" },
                { label: "Capital Losses", value: data?.pnl.totalLosses || 0, color: "#DC2626" },
                { label: "Income", value: data?.pnl.totalIncome || 0, color: "#2563EB" },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[14px] text-[#6B7280]">{row.label}</span>
                    <span className="text-[14px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${row.value.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.min((row.value / (data?.pnl.totalVolume || 1)) * 100, 100)}%`, backgroundColor: row.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Row 2: Activity + Top Assets + Insights */}
        <div className="grid grid-cols-3 gap-5">

          {/* Activity — Zentra style with two sub-cards stacked */}
          <div className="space-y-5">
            {/* Transactions card */}
            <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Transactions</h2>
                <MoreHorizontal className="h-4 w-4 text-[#D4D4CF]" />
              </div>
              {data?.activity.peakMonth && (
                <span className="inline-flex items-center rounded-full bg-[#F5F5F0] dark:bg-[#222] px-2.5 py-0.5 text-[11px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5] mb-3">
                  Peak: {data.activity.peakMonth}
                </span>
              )}
              <div className="flex items-center gap-4">
                <p className="text-[36px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                  {(data?.activity.totalTransactions || 0).toLocaleString()}
                </p>
                {/* Dot grid */}
                <div className="flex items-end gap-[2px] h-[40px] flex-1">
                  {(data?.activity.monthlyPattern || []).slice(-12).map((m, i) => {
                    const max = Math.max(...(data?.activity.monthlyPattern || []).map(p => p.count), 1);
                    const h = Math.max(3, (m.count / max) * 36);
                    return <div key={i} className="flex-1 rounded-sm bg-[#2563EB]" style={{ height: h, opacity: 0.2 + (m.count / max) * 0.8 }} title={`${m.month}: ${m.count}`} />;
                  })}
                </div>
              </div>
            </div>

            {/* Assets count card */}
            <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
              <div className="flex items-center justify-between mb-1">
                <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Assets Traded</h2>
                <MoreHorizontal className="h-4 w-4 text-[#D4D4CF]" />
              </div>
              <span className="inline-flex items-center rounded-full bg-[#F5F5F0] dark:bg-[#222] px-2.5 py-0.5 text-[11px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5] mb-3">
                Across {data?.insights.accountsConnected || 0} accounts
              </span>
              <p className="text-[36px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {data?.insights.distinctAssets || 0}
              </p>
            </div>
          </div>

          {/* Top Assets */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Top Assets</h2>
              <MoreHorizontal className="h-4 w-4 text-[#D4D4CF]" />
            </div>
            <div className="space-y-0">
              {(data?.topAssets || []).slice(0, 7).map((asset, i) => (
                <div key={asset.asset} className={cn("flex items-center justify-between py-3", i > 0 && "border-t border-[#F0F0EB] dark:border-[#2A2A2A]")}>
                  <div className="flex items-center gap-3">
                    <AssetIcon symbol={asset.asset} />
                    <span className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">{asset.asset}</span>
                  </div>
                  <span className={cn("text-[14px] font-semibold", asset.gainLoss >= 0 ? "text-[#16A34A]" : "text-[#DC2626]")} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {asset.gainLoss >= 0 ? "+" : "-"}${Math.abs(asset.gainLoss).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Insights — Zentra gradient card */}
          <div className="rounded-xl p-6 text-white overflow-hidden relative" style={{ background: "linear-gradient(135deg, #1E3A5F 0%, #0C1929 100%)" }}>
            <div className="flex items-center justify-between mb-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(147,197,253,0.15)] px-3 py-1 text-[12px] font-medium text-[#93C5FD]">
                <Sparkles className="h-3.5 w-3.5" />
                Insights
              </span>
              <MoreHorizontal className="h-4 w-4 text-white/30" />
            </div>

            <div className="transition-opacity duration-300" key={insightIndex}>
              <p className="text-[52px] font-bold leading-none mb-4" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {currentInsight.metric}
              </p>
              <p className="text-[17px] font-normal text-white/85 leading-snug mb-2">
                {currentInsight.description}
              </p>
              <p className="text-[13px] text-white/45 leading-relaxed">
                {currentInsight.detail}
              </p>
            </div>

            {insights.length > 1 && (
              <div className="flex items-center gap-1.5 mt-8">
                {insights.map((_, i) => (
                  <button key={i} onClick={() => setInsightIndex(i)} className={cn("h-1 rounded-full transition-all duration-300", i === insightIndex % insights.length ? "w-5 bg-white" : "w-1.5 bg-white/25")} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-8 pt-1">
          {[
            { label: "View Transactions", href: "/transactions" },
            { label: "Tax Reports", href: "/tax-reports" },
            { label: "Manage Accounts", href: "/accounts" },
          ].map(link => (
            <Link key={link.href} href={link.href} className="text-[13px] text-[#9CA3AF] hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors">
              {link.label} →
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
}
