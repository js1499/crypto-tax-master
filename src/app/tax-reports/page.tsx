"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDownToLine,
  Calendar,
  FileText,
  Settings,
  Wallet,
  FileSpreadsheet,
  FileBarChart,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { useSession } from "next-auth/react";
import { cn } from "@/lib/utils";

const taxForms = [
  {
    id: 1,
    name: "IRS Form 8949",
    description: "Capital gains and losses — required for filing",
    category: "irs" as const,
    status: "ready" as const,
  },
  {
    id: 2,
    name: "IRS Schedule D",
    description: "Summary of capital gains/losses — companion to Form 8949",
    category: "irs" as const,
    status: "ready" as const,
  },
  {
    id: 9,
    name: "IRS Schedule 1",
    description: "Additional income — Line 8z for crypto staking, airdrops, rewards",
    category: "irs" as const,
    status: "ready" as const,
  },
  {
    id: 3,
    name: "Capital Gains CSV",
    description: "All capital gains and losses with cost basis details",
    category: "csv" as const,
    status: "ready" as const,
  },
  {
    id: 4,
    name: "Income Report",
    description: "All income from staking, airdrops, and rewards",
    category: "csv" as const,
    status: "ready" as const,
  },
  {
    id: 5,
    name: "Transaction History",
    description: "Complete transaction history for the year",
    category: "csv" as const,
    status: "ready" as const,
  },
  {
    id: 6,
    name: "Capital Gains by Asset",
    description: "Gains and losses aggregated per asset",
    category: "csv" as const,
    status: "ready" as const,
  },
  {
    id: 7,
    name: "Summary Report",
    description: "Complete tax summary with all key figures",
    category: "csv" as const,
    status: "ready" as const,
  },
  {
    id: 8,
    name: "TurboTax 1099-B",
    description: "CSV formatted for TurboTax import",
    category: "tax-software" as const,
    status: "ready" as const,
  },
];

interface TaxReportData {
  shortTermGains: string;
  longTermGains: string;
  shortTermLosses: string;
  longTermLosses: string;
  totalIncome: string;
  netShortTermGain: string;
  netLongTermGain: string;
  totalTaxableGain: string;
  taxableEvents: number;
  incomeEvents: number;
}

export default function TaxReportsPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedYear, setSelectedYear] = useState("2024");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState<TaxReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costBasisMethod, setCostBasisMethod] = useState<"FIFO" | "LIFO" | "HIFO">("FIFO");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [formFilter, setFormFilter] = useState<"all" | "irs" | "csv" | "tax-software">("all");
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const { status: sessionStatus } = useSession();

  useEffect(() => {
    setMounted(true);
    const currentYear = new Date().getFullYear().toString();
    if (currentYear !== selectedYear) {
      setSelectedYear(currentYear);
    }
  }, []);

  // Parallel fetch: load settings and tax report simultaneously on mount / year change
  useEffect(() => {
    if (!mounted) return;

    const fetchTaxReportWithMethod = async (method: "FIFO" | "LIFO" | "HIFO") => {
      const response = await fetch(`/api/tax-reports?year=${selectedYear}&method=${method}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || errorData.details || "Failed to fetch tax report");
      }
      const data = await response.json();
      if (data.status === "success" && data.report) {
        return data.report as TaxReportData;
      }
      throw new Error(data.error || "Failed to load tax report");
    };

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fire both requests in parallel: settings + tax report with default FIFO
        const [settingsResponse, fifoReport] = await Promise.all([
          fetch("/api/settings").catch(() => null),
          fetchTaxReportWithMethod("FIFO"),
        ]);

        // Show FIFO results immediately
        setReportData(fifoReport);

        // Parse settings to check actual cost basis method
        let actualMethod: "FIFO" | "LIFO" | "HIFO" = "FIFO";
        if (settingsResponse && settingsResponse.ok) {
          const settingsData = await settingsResponse.json();
          if (settingsData.costBasisMethod) {
            actualMethod = settingsData.costBasisMethod;
          }
        }

        setCostBasisMethod(actualMethod);

        // If user's actual method differs from FIFO, re-fetch with the correct method
        if (actualMethod !== "FIFO") {
          const correctedReport = await fetchTaxReportWithMethod(actualMethod);
          setReportData(correctedReport);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load tax report";
        setError(errorMessage);
        setReportData({
          shortTermGains: "$0.00",
          longTermGains: "$0.00",
          shortTermLosses: "$0.00",
          longTermLosses: "$0.00",
          totalIncome: "$0.00",
          netShortTermGain: "$0.00",
          netLongTermGain: "$0.00",
          totalTaxableGain: "$0.00",
          taxableEvents: 0,
          incomeEvents: 0,
        });
      } finally {
        setIsLoading(false);
        setInitialLoadDone(true);
      }
    };

    setInitialLoadDone(false);
    loadData();
  }, [selectedYear, mounted]);

  const handleMethodChange = async (method: "FIFO" | "LIFO" | "HIFO") => {
    if (method === costBasisMethod) return;
    setIsSavingSettings(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costBasisMethod: method }),
      });
      if (!response.ok) throw new Error("Failed to save settings");
      setCostBasisMethod(method);
      toast.success(`Cost basis method changed to ${method}`);
    } catch (err) {
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Re-fetch tax report when cost basis method changes (e.g., user toggles in settings dialog)
  // Skip during initial load — the parallel fetch already handles setting the correct method
  useEffect(() => {
    if (!mounted || !initialLoadDone) return;
    const fetchTaxReport = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/tax-reports?year=${selectedYear}&method=${costBasisMethod}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.details || "Failed to fetch tax report");
        }
        const data = await response.json();
        if (data.status === "success" && data.report) {
          setReportData(data.report);
        } else {
          throw new Error(data.error || "Failed to load tax report");
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load tax report";
        setError(errorMessage);
        setReportData({
          shortTermGains: "$0.00",
          longTermGains: "$0.00",
          shortTermLosses: "$0.00",
          longTermLosses: "$0.00",
          totalIncome: "$0.00",
          netShortTermGain: "$0.00",
          netLongTermGain: "$0.00",
          totalTaxableGain: "$0.00",
          taxableEvents: 0,
          incomeEvents: 0,
        });
      } finally {
        setIsLoading(false);
      }
    };
    fetchTaxReport();
  }, [costBasisMethod]);

  if (!mounted) {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="h-12 w-56 skeleton-pulse rounded" />
          <div className="grid grid-cols-[1fr_340px] gap-5">
            <div className="h-[320px] skeleton-pulse rounded-xl" />
            <div className="h-[320px] skeleton-pulse rounded-xl" />
          </div>
          <div className="h-[400px] skeleton-pulse rounded-xl" />
        </div>
      </Layout>
    );
  }

  const handleDownloadExport = async (exportType: string, filename: string) => {
    if (sessionStatus === "unauthenticated") {
      toast.error("Please log in to export tax reports");
      return;
    }
    if (sessionStatus === "loading") {
      toast.info("Checking authentication...");
      return;
    }
    try {
      setIsGeneratingReport(true);
      const response = await fetch(`/api/tax-reports/export?year=${selectedYear}&type=${exportType}`, {
        method: "GET",
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          toast.error("Session expired. Please log in again.");
          return;
        }
        throw new Error(errorData.error || errorData.details || "Failed to generate export");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Received empty file");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`${filename} downloaded successfully!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to download ${filename}`;
      toast.error(errorMessage);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleDownloadPdf = async (formParam: string, filename: string) => {
    if (sessionStatus === "unauthenticated") {
      toast.error("Please log in to generate tax reports");
      return;
    }
    if (sessionStatus === "loading") {
      toast.info("Checking authentication...");
      return;
    }
    try {
      setIsGeneratingReport(true);
      const response = await fetch(`/api/tax-reports/pdf?year=${selectedYear}&form=${formParam}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          toast.error("Session expired. Please log in again.");
          return;
        }
        throw new Error(errorData.error || errorData.details || "Failed to generate PDF");
      }
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("Received empty file");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast.success(`${filename} downloaded successfully!`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : `Failed to download ${filename}`;
      toast.error(errorMessage);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleFormDownload = async (form: typeof taxForms[0]) => {
    if (form.status === "needs-pdf") {
      toast.info(`${form.name} requires fillable PDF support — coming soon.`);
      return;
    }

    // IRS PDF forms
    const pdfFormMap: Record<string, { param: string; filename: string }> = {
      "IRS Form 8949": { param: "8949", filename: `Form8949-${selectedYear}.pdf` },
      "IRS Schedule D": { param: "scheduled", filename: `ScheduleD-${selectedYear}.pdf` },
      "IRS Schedule 1": { param: "schedule1", filename: `Schedule1-${selectedYear}.pdf` },
    };
    if (pdfFormMap[form.name]) {
      const info = pdfFormMap[form.name];
      await handleDownloadPdf(info.param, info.filename);
      return;
    }

    // CSV exports
    const csvExportMap: Record<string, { type: string; filename: string }> = {
      "Capital Gains CSV": { type: "capital-gains-csv", filename: `Capital-Gains-${selectedYear}.csv` },
      "Transaction History": { type: "transaction-history", filename: `Transaction-History-${selectedYear}.csv` },
      "Income Report": { type: "income-report", filename: `Income-Report-${selectedYear}.csv` },
      "Capital Gains by Asset": { type: "capital-gains-by-asset", filename: `Capital-Gains-by-Asset-${selectedYear}.csv` },
      "Summary Report": { type: "summary-report", filename: `Crypto-Tax-Summary-${selectedYear}.csv` },
      "TurboTax 1099-B": { type: "turbotax-1099b", filename: `TurboTax-1099B-${selectedYear}.csv` },
    };
    if (csvExportMap[form.name]) {
      const exportInfo = csvExportMap[form.name];
      await handleDownloadExport(exportInfo.type, exportInfo.filename);
      return;
    }

    toast.info(`${form.name} export is not yet available.`);
  };

  const displayData = reportData || {
    shortTermGains: "$0.00",
    longTermGains: "$0.00",
    shortTermLosses: "$0.00",
    longTermLosses: "$0.00",
    totalIncome: "$0.00",
    netShortTermGain: "$0.00",
    netLongTermGain: "$0.00",
    totalTaxableGain: "$0.00",
    taxableEvents: 0,
    incomeEvents: 0,
  };

  const parseCurrency = (value: string): number => parseFloat(value.replace(/[$,]/g, "")) || 0;

  const stGains = parseCurrency(displayData.shortTermGains);
  const ltGains = parseCurrency(displayData.longTermGains);
  const stLosses = parseCurrency(displayData.shortTermLosses);
  const ltLosses = parseCurrency(displayData.longTermLosses);
  const totalIncome = parseCurrency(displayData.totalIncome);
  const netST = parseCurrency(displayData.netShortTermGain);
  const netLT = parseCurrency(displayData.netLongTermGain);
  const netTaxable = parseCurrency(displayData.totalTaxableGain);
  const estimatedTax = Math.max(0, netST) * 0.24 + Math.max(0, netLT) * 0.15;

  const fmtUsd = (n: number) => `$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtSign = (n: number) => n >= 0 ? `+${fmtUsd(n)}` : `-${fmtUsd(n)}`;

  // Bar widths for breakdown
  const maxBar = Math.max(stGains, Math.abs(stLosses), ltGains, Math.abs(ltLosses), totalIncome, 1);
  const barPct = (v: number) => `${Math.min((Math.abs(v) / maxBar) * 100, 100)}%`;

  const filteredForms = formFilter === "all" ? taxForms : taxForms.filter(f => f.category === formFilter);

  const formIcon = (form: typeof taxForms[0]) => {
    if (form.category === "irs") return <FileText className="h-4 w-4" />;
    if (form.category === "tax-software") return <FileBarChart className="h-4 w-4" />;
    return <FileSpreadsheet className="h-4 w-4" />;
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-end justify-between">
          <h1 className="text-[42px] font-normal tracking-[-0.03em] text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ lineHeight: 1 }}>
            Tax Reports
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 border border-[#E5E5E0] dark:border-[#333] rounded-lg px-3 h-9">
              <Calendar className="h-3.5 w-3.5 text-[#9CA3AF]" />
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="border-0 shadow-none h-8 text-[13px] font-medium w-[80px] p-0 pl-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: new Date().getFullYear() - 2020 + 1 }, (_, i) => new Date().getFullYear() - i).map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Dialog>
              <DialogTrigger asChild>
                <button className="flex items-center justify-center h-9 w-9 rounded-lg border border-[#E5E5E0] dark:border-[#333] hover:bg-[#F5F5F0] dark:hover:bg-[#222] transition-colors">
                  <Settings className="h-3.5 w-3.5 text-[#9CA3AF]" />
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tax Settings</DialogTitle>
                  <DialogDescription>Configure your tax preferences and calculation methods.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <h4 className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">Calculation Method</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {(["FIFO", "LIFO", "HIFO"] as const).map(method => (
                        <button
                          key={method}
                          onClick={() => handleMethodChange(method)}
                          disabled={isSavingSettings}
                          className={cn(
                            "text-left px-4 py-2.5 rounded-lg border transition-colors text-[13px] font-medium",
                            costBasisMethod === method
                              ? "border-[#2563EB] bg-[#EFF6FF] dark:bg-[#1A1A3A] text-[#2563EB]"
                              : "border-[#E5E5E0] dark:border-[#333] text-[#6B7280] hover:border-[#9CA3AF]"
                          )}
                        >
                          {method === "FIFO" && "FIFO — First In, First Out"}
                          {method === "LIFO" && "LIFO — Last In, First Out"}
                          {method === "HIFO" && "HIFO — Highest In, First Out"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">Tax Jurisdiction</h4>
                    <p className="text-[13px] text-[#9CA3AF]">United States (IRS)</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Row 1: Tax Summary + Breakdown */}
        <div className="grid grid-cols-[1fr_340px] gap-5">

          {/* Tax Summary */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl bg-white dark:bg-[#1A1A1A]">
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mb-1">Tax Summary</h2>
              <p className="text-[12px] text-[#9CA3AF] mb-5">
                {costBasisMethod} method &middot; {displayData.taxableEvents} taxable events &middot; {displayData.incomeEvents} income events
              </p>

              {/* Hero: Net Taxable */}
              <div className="mb-6">
                <p className="text-[12px] text-[#9CA3AF] mb-0.5">Net Taxable Gain/Loss</p>
                {isLoading ? (
                  <div className="h-10 w-48 skeleton-pulse rounded" />
                ) : (
                  <p
                    className="text-[40px] font-bold"
                    style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1, color: netTaxable >= 0 ? "#16A34A" : "#DC2626" }}
                  >
                    {fmtSign(netTaxable)}
                  </p>
                )}
              </div>

              {/* Metric tabs */}
              <div className="flex items-start gap-6 border-t border-[#F0F0EB] dark:border-[#2A2A2A] pt-4">
                {[
                  { label: "Short-term", value: netST, color: netST >= 0 ? "#16A34A" : "#DC2626" },
                  { label: "Long-term", value: netLT, color: netLT >= 0 ? "#16A34A" : "#DC2626" },
                  { label: "Income", value: totalIncome, color: "#2563EB" },
                  { label: "Est. Tax", value: estimatedTax, color: "#EA580C" },
                ].map(tab => (
                  <div key={tab.label} className="text-left">
                    <p className="text-[12px] text-[#9CA3AF] mb-0.5">{tab.label}</p>
                    {isLoading ? (
                      <div className="h-6 w-20 skeleton-pulse rounded" />
                    ) : (
                      <p className="text-[20px] font-bold" style={{ fontVariantNumeric: "tabular-nums", color: tab.color }}>
                        {tab.label === "Est. Tax" ? fmtUsd(tab.value) : fmtSign(tab.value)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Breakdown */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl p-6 bg-white dark:bg-[#1A1A1A]">
            <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mb-5">Breakdown</h2>

            <div className="space-y-4">
              {[
                { label: "Short-term Gains", value: stGains, color: "#16A34A" },
                { label: "Short-term Losses", value: stLosses, color: "#DC2626" },
                { label: "Long-term Gains", value: ltGains, color: "#16A34A" },
                { label: "Long-term Losses", value: ltLosses, color: "#DC2626" },
                { label: "Income", value: totalIncome, color: "#2563EB" },
              ].map(row => (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[13px] text-[#6B7280]">{row.label}</span>
                    {isLoading ? (
                      <div className="h-4 w-16 skeleton-pulse rounded" />
                    ) : (
                      <span className="text-[13px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {fmtUsd(row.value)}
                      </span>
                    )}
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: isLoading ? "0%" : barPct(row.value), backgroundColor: row.color }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-[#F0F0EB] dark:border-[#2A2A2A]">
              <Button
                variant="outline"
                size="sm"
                className="w-full text-[13px]"
                onClick={() => handleDownloadExport("summary-report", `Crypto-Tax-Summary-${selectedYear}.csv`)}
                disabled={isGeneratingReport}
              >
                <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                Download Summary CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Row 2: Available Reports */}
        <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl bg-white dark:bg-[#1A1A1A]">
          <div className="flex items-center justify-between px-6 pt-6 pb-4">
            <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Available Reports</h2>
            <div className="flex items-center gap-1">
              {([
                { key: "all", label: "All" },
                { key: "irs", label: "IRS Forms" },
                { key: "csv", label: "CSV" },
                { key: "tax-software", label: "Tax Software" },
              ] as const).map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setFormFilter(tab.key)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors",
                    formFilter === tab.key
                      ? "bg-[#1A1A1A] dark:bg-[#F5F5F5] text-white dark:text-[#1A1A1A]"
                      : "text-[#9CA3AF] hover:text-[#6B7280] hover:bg-[#F5F5F0] dark:hover:bg-[#222]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 pb-6">
            <div className="divide-y divide-[#F0F0EB] dark:divide-[#2A2A2A]">
              {filteredForms.map(form => (
                <div key={form.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3.5">
                    <div className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-lg",
                      form.category === "irs" ? "bg-[#FFF7ED] text-[#EA580C]" :
                      form.category === "tax-software" ? "bg-[#EEF2FF] text-[#4F46E5]" :
                      "bg-[#F0FDF4] text-[#16A34A]"
                    )}>
                      {formIcon(form)}
                    </div>
                    <div>
                      <h3 className="text-[13px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">{form.name}</h3>
                      <p className="text-[12px] text-[#9CA3AF]">{form.description}</p>
                    </div>
                  </div>
                  {form.status === "needs-pdf" ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#FFF7ED] dark:bg-[#2A2000] px-3 py-1 text-[11px] font-medium text-[#EA580C]">
                      <Lock className="h-3 w-3" />
                      PDF Coming Soon
                    </span>
                  ) : (
                    <button
                      onClick={() => handleFormDownload(form)}
                      disabled={isGeneratingReport}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#333] px-3.5 py-1.5 text-[12px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5] hover:bg-[#F5F5F0] dark:hover:bg-[#222] transition-colors disabled:opacity-50"
                    >
                      {isGeneratingReport ? (
                        <>
                          <div className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <ArrowDownToLine className="h-3 w-3" />
                          Download
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
