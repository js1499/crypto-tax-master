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
import { useSyncPipeline } from "@/components/sync-pipeline/pipeline-provider";

const taxForms = [
  // Crypto forms
  {
    id: 1,
    name: "IRS Form 8949",
    description: "Capital gains and losses — required for filing",
    category: "irs" as const,
    status: "ready" as const,
    country: "US" as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 2,
    name: "IRS Schedule D",
    description: "Summary of capital gains/losses — companion to Form 8949",
    category: "irs" as const,
    status: "ready" as const,
    country: "US" as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 9,
    name: "IRS Schedule 1",
    description: "Additional income — Line 8z for crypto staking, airdrops, rewards",
    category: "irs" as const,
    status: "ready" as const,
    country: "US" as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 3,
    name: "Capital Gains CSV",
    description: "All capital gains and losses with cost basis details",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 4,
    name: "Income Report",
    description: "All income from staking, airdrops, and rewards",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 5,
    name: "Transaction History",
    description: "Complete transaction history for the year",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 6,
    name: "Capital Gains by Asset",
    description: "Gains and losses aggregated per asset",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 7,
    name: "Summary Report",
    description: "Complete tax summary with all key figures",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 8,
    name: "TurboTax 1099-B",
    description: "CSV formatted for TurboTax import",
    category: "tax-software" as const,
    status: "ready" as const,
    country: "US" as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 10,
    name: "SA108 Summary",
    description: "Capital Gains Summary for Self Assessment",
    category: "csv" as const,
    status: "ready" as const,
    country: "UK" as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 11,
    name: "UK Disposals CSV",
    description: "Detailed disposals with HMRC matching rules",
    category: "csv" as const,
    status: "ready" as const,
    country: "UK" as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 12,
    name: "Anlage SO Summary",
    description: "Zusammenfassung f\u00fcr die Steuererkl\u00e4rung",
    category: "csv" as const,
    status: "ready" as const,
    country: "DE" as string | undefined,
    engine: "crypto" as const,
  },
  {
    id: 13,
    name: "DE Disposals CSV",
    description: "Detaillierte Ver\u00e4u\u00dferungen mit Haltedauer",
    category: "csv" as const,
    status: "ready" as const,
    country: "DE" as string | undefined,
    engine: "crypto" as const,
  },
  // Securities forms
  {
    id: 20,
    name: "Securities Form 8949",
    description: "Capital gains and losses from stocks, options, and other securities",
    category: "irs" as const,
    status: "ready" as const,
    country: "US" as string | undefined,
    engine: "securities" as const,
  },
  {
    id: 21,
    name: "Realized Gains/Losses",
    description: "All closed positions with lot detail",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "securities" as const,
  },
  {
    id: 22,
    name: "Wash Sale Detail",
    description: "Every wash sale with disallowed amounts and adjustments",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "securities" as const,
  },
  {
    id: 23,
    name: "Wash Sale Carry-Forward",
    description: "Cross-year wash sales carrying into next year",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "securities" as const,
  },
  {
    id: 24,
    name: "Permanently Disallowed",
    description: "IRA/retirement wash sale losses that cannot be recovered",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "securities" as const,
  },
  {
    id: 25,
    name: "Dividend Summary",
    description: "Dividends by payer and type for Schedule B",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "securities" as const,
  },
  {
    id: 26,
    name: "Section 1256 Summary",
    description: "Section 1256 contract gains with 60/40 breakdown",
    category: "csv" as const,
    status: "ready" as const,
    country: undefined as string | undefined,
    engine: "securities" as const,
  },
  {
    id: 27,
    name: "Securities TurboTax",
    description: "TurboTax-compatible securities import",
    category: "tax-software" as const,
    status: "ready" as const,
    country: "US" as string | undefined,
    engine: "securities" as const,
  },
  // Combined forms
  {
    id: 30,
    name: "Combined Schedule D",
    description: "Capital gains summary — crypto + securities combined",
    category: "irs" as const,
    status: "ready" as const,
    country: "US" as string | undefined,
    engine: "combined" as const,
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
  currency?: string; // "USD", "GBP", "EUR"
  currencySymbol?: string; // "$", "£", "€"
}

export default function TaxReportsPage() {
  const { refreshKey } = useSyncPipeline();
  const [isPaidPlan, setIsPaidPlan] = useState(true);

  useEffect(() => {
    fetch("/api/stripe/status", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setIsPaidPlan(d.planKey !== "free"); })
      .catch(() => {});
  }, []);
  const [mounted, setMounted] = useState(false);
  const [selectedYear, setSelectedYear] = useState("2025");
  const [generatingFormId, setGeneratingFormId] = useState<string | null>(null);
  const [reportData, setReportData] = useState<TaxReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costBasisMethod, setCostBasisMethod] = useState<"FIFO" | "LIFO" | "HIFO">("FIFO");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [formFilter, setFormFilter] = useState<"all" | "irs" | "csv" | "tax-software">("all");
  const [engineFilter, setEngineFilter] = useState<"all" | "crypto" | "securities" | "combined">("all");
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [userCountry, setUserCountry] = useState("US");
  const { status: sessionStatus } = useSession();

  useEffect(() => {
    setMounted(true);
    const currentYear = new Date().getFullYear().toString();
    if (currentYear !== selectedYear) {
      setSelectedYear(currentYear);
    }
  }, []);

  // Fetch tax report + settings on mount / year change
  useEffect(() => {
    if (!mounted) return;

    const loadData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Fetch settings and tax report in parallel
        const [settingsRes, reportRes] = await Promise.all([
          fetch("/api/settings").catch(() => null),
          fetch(`/api/tax-reports?year=${selectedYear}`),
        ]);

        // Parse settings
        if (settingsRes && settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (settingsData.costBasisMethod) {
            setCostBasisMethod(settingsData.costBasisMethod);
          }
          if (settingsData.country) {
            setUserCountry(settingsData.country);
          }
        }

        // Parse report
        if (!reportRes.ok) {
          const errorData = await reportRes.json().catch(() => ({}));
          throw new Error(errorData.error || errorData.details || "Failed to fetch tax report");
        }
        const data = await reportRes.json();
        if (data.status === "success" && data.report) {
          setReportData(data.report as TaxReportData);
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
        setInitialLoadDone(true);
      }
    };

    setInitialLoadDone(false);
    loadData();
  }, [selectedYear, mounted, refreshKey]);

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
      setGeneratingFormId(_currentFormId);
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
      setGeneratingFormId(null);
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
      setGeneratingFormId(_currentFormId);
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
      setGeneratingFormId(null);
    }
  };

  const handleDownloadSecuritiesExport = async (reportType: string, filename: string) => {
    if (sessionStatus === "unauthenticated") {
      toast.error("Please log in to export securities reports");
      return;
    }
    if (sessionStatus === "loading") {
      toast.info("Checking authentication...");
      return;
    }
    try {
      setGeneratingFormId(_currentFormId);
      const response = await fetch(`/api/securities/reports?year=${selectedYear}&type=${reportType}`, {
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
      setGeneratingFormId(null);
    }
  };

  const handleDownloadCombined = async (formParam: string, filename: string) => {
    if (sessionStatus === "unauthenticated") {
      toast.error("Please log in to generate combined reports");
      return;
    }
    if (sessionStatus === "loading") {
      toast.info("Checking authentication...");
      return;
    }
    try {
      setGeneratingFormId(_currentFormId);
      const response = await fetch(`/api/tax-reports/combined?year=${selectedYear}&form=${formParam}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          toast.error("Session expired. Please log in again.");
          return;
        }
        throw new Error(errorData.error || errorData.details || "Failed to generate combined report");
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
      setGeneratingFormId(null);
    }
  };

  // Track which form is currently downloading (used by sub-handlers via closure)
  let _currentFormId: string | null = null;

  const handleFormDownload = async (form: typeof taxForms[0]) => {
    if (form.status === "needs-pdf") {
      toast.info(`${form.name} requires fillable PDF support — coming soon.`);
      return;
    }
    _currentFormId = form.name;

    // Securities CSV exports
    const securitiesExportMap: Record<string, { type: string; filename: string }> = {
      "Securities Form 8949": { type: "realized-gains", filename: `Securities-Form8949-${selectedYear}.csv` },
      "Realized Gains/Losses": { type: "realized-gains", filename: `Securities-Realized-Gains-${selectedYear}.csv` },
      "Wash Sale Detail": { type: "wash-sale-detail", filename: `Securities-Wash-Sale-Detail-${selectedYear}.csv` },
      "Wash Sale Carry-Forward": { type: "carry-forward", filename: `Securities-Wash-Sale-Carry-Forward-${selectedYear}.csv` },
      "Permanently Disallowed": { type: "permanently-disallowed", filename: `Securities-Permanently-Disallowed-${selectedYear}.csv` },
      "Dividend Summary": { type: "dividend-summary", filename: `Securities-Dividend-Summary-${selectedYear}.csv` },
      "Section 1256 Summary": { type: "section-1256", filename: `Securities-Section-1256-${selectedYear}.csv` },
      "Securities TurboTax": { type: "turbotax", filename: `Securities-TurboTax-${selectedYear}.csv` },
    };
    if (securitiesExportMap[form.name]) {
      const info = securitiesExportMap[form.name];
      await handleDownloadSecuritiesExport(info.type, info.filename);
      return;
    }

    // Combined forms
    const combinedFormMap: Record<string, { param: string; filename: string }> = {
      "Combined Schedule D": { param: "schedule-d", filename: `Combined-ScheduleD-${selectedYear}.json` },
    };
    if (combinedFormMap[form.name]) {
      const info = combinedFormMap[form.name];
      await handleDownloadCombined(info.param, info.filename);
      return;
    }

    // IRS PDF forms (crypto)
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

    // CSV exports (crypto)
    const csvExportMap: Record<string, { type: string; filename: string }> = {
      "Capital Gains CSV": { type: "capital-gains-csv", filename: `Capital-Gains-${selectedYear}.csv` },
      "Transaction History": { type: "transaction-history", filename: `Transaction-History-${selectedYear}.csv` },
      "Income Report": { type: "income-report", filename: `Income-Report-${selectedYear}.csv` },
      "Capital Gains by Asset": { type: "capital-gains-by-asset", filename: `Capital-Gains-by-Asset-${selectedYear}.csv` },
      "Summary Report": { type: "summary-report", filename: `Crypto-Tax-Summary-${selectedYear}.csv` },
      "TurboTax 1099-B": { type: "turbotax-1099b", filename: `TurboTax-1099B-${selectedYear}.csv` },
      "SA108 Summary": { type: "uk-sa108-summary", filename: `SA108-Summary-${selectedYear}.csv` },
      "UK Disposals CSV": { type: "uk-disposals-csv", filename: `UK-Disposals-${selectedYear}.csv` },
      "Anlage SO Summary": { type: "de-anlage-so", filename: `Anlage-SO-${selectedYear}.csv` },
      "DE Disposals CSV": { type: "de-disposals-csv", filename: `DE-Veraeusserungen-${selectedYear}.csv` },
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

  const parseCurrency = (value: string): number => parseFloat(value.replace(/[$\u00a3\u20ac,]/g, "")) || 0;

  const currencySymbol = displayData.currencySymbol || "$";
  const currencyCode = displayData.currency || "USD";
  const isNonUsd = currencyCode !== "USD";

  const totalGains = parseCurrency(displayData.shortTermGains); // API puts total gains here
  const totalLosses = parseCurrency(displayData.shortTermLosses); // API puts total losses here (negative)
  const totalIncome = parseCurrency(displayData.totalIncome);
  const netTaxable = parseCurrency(displayData.totalTaxableGain);
  const estimatedTax = Math.max(0, netTaxable) * 0.24; // simplified estimate

  const fmtUsd = (n: number) => `${currencySymbol}${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtSign = (n: number) => n >= 0 ? `+${fmtUsd(n)}` : `-${fmtUsd(n)}`;

  // Bar widths for breakdown
  const maxBar = Math.max(totalGains, Math.abs(totalLosses), totalIncome, 1);
  const barPct = (v: number) => `${Math.min((Math.abs(v) / maxBar) * 100, 100)}%`;

  const countryForms = taxForms.filter(f => !f.country || f.country === userCountry);
  const engineForms = engineFilter === "all" ? countryForms : countryForms.filter(f => f.engine === engineFilter);
  const filteredForms = formFilter === "all" ? engineForms : engineForms.filter(f => f.category === formFilter);

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
            <div className="flex items-center gap-2 border border-[#E5E5E0] dark:border-[#333] rounded-lg px-4 h-11">
              <Calendar className="h-4 w-4 text-[#9CA3AF]" />
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger data-onboarding="tax-year-picker" className="border-0 shadow-none h-10 text-[15px] font-semibold w-[90px] p-0 pl-1">
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
        <div className={cn("grid grid-cols-[1fr_340px] gap-5", !isPaidPlan && "blur-sm select-none pointer-events-none")}>

          {/* Tax Summary */}
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl bg-white dark:bg-[#1A1A1A]">
            <div className="px-6 pt-6 pb-4">
              <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mb-1">Tax Summary</h2>
              <p className="text-[12px] text-[#9CA3AF] mb-5">
                {costBasisMethod} method &middot; {displayData.taxableEvents} taxable events &middot; {displayData.incomeEvents} income events
                {isNonUsd && <span className="ml-1">&middot; amounts in USD</span>}
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
                  { label: "Gains", value: totalGains, color: "#16A34A" },
                  { label: "Losses", value: totalLosses, color: "#DC2626" },
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
                { label: "Capital Gains", value: totalGains, color: "#16A34A" },
                { label: "Capital Losses", value: totalLosses, color: "#DC2626" },
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
                disabled={!!generatingFormId}
              >
                <ArrowDownToLine className="mr-1.5 h-3.5 w-3.5" />
                Download Summary CSV
              </Button>
            </div>
          </div>
        </div>

        {/* Upgrade banner for free users */}
        {!isPaidPlan && (
          <div className="rounded-lg bg-[#EFF6FF] dark:bg-[rgba(37,99,235,0.08)] border border-[#BFDBFE] dark:border-[#1E3A5F] px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Upgrade to download tax reports</p>
              <p className="text-[13px] text-[#6B7280] mt-0.5">PDF forms (Schedule D, Form 8949, Schedule 1) and CSV exports require a paid plan.</p>
            </div>
            <button
              onClick={() => window.location.href = "/#pricing"}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors"
            >
              View Plans
            </button>
          </div>
        )}

        {/* Row 2: Available Reports */}
        <div data-onboarding="download-reports" className="border border-[#E5E5E0] dark:border-[#333] rounded-xl bg-white dark:bg-[#1A1A1A]">
          {/* Engine filter tabs */}
          <div className="flex items-center gap-2 px-6 pt-6 pb-3">
            {([
              { key: "all", label: "All" },
              { key: "crypto", label: "Crypto" },
              { key: "securities", label: "Securities" },
              { key: "combined", label: "Combined" },
            ] as const).map(tab => (
              <button
                key={tab.key}
                onClick={() => setEngineFilter(tab.key)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[13px] font-semibold transition-colors",
                  engineFilter === tab.key
                    ? "bg-[#1A1A1A] dark:bg-[#F5F5F5] text-white dark:text-[#1A1A1A]"
                    : "text-[#6B7280] hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] hover:bg-[#F5F5F0] dark:hover:bg-[#222] border border-[#E5E5E0] dark:border-[#333]"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between px-6 pb-4">
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
                      <div className="flex items-center gap-2">
                        <h3 className="text-[13px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">{form.name}</h3>
                        {form.engine === "combined" && (
                          <span className="inline-flex items-center rounded-full bg-[#EFF6FF] dark:bg-[#1A1A3A] px-2 py-0.5 text-[10px] font-medium text-[#2563EB]">
                            Crypto + Securities
                          </span>
                        )}
                      </div>
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
                      disabled={!!generatingFormId}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E5E0] dark:border-[#333] px-3.5 py-1.5 text-[12px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5] hover:bg-[#F5F5F0] dark:hover:bg-[#222] transition-colors disabled:opacity-50"
                    >
                      {generatingFormId === form.name ? (
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
