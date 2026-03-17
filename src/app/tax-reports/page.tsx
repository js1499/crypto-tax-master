"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ArrowDownToLine,
  BarChart,
  FileText,
  Settings,
  Wallet,
} from "lucide-react";
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { useSession } from "next-auth/react";

const taxForms = [
  // IRS Forms
  {
    id: 1,
    name: "IRS Form 8949 (PDF)",
    description: "Capital gains and losses — required for filing",
    icon: FileText,
    category: "irs",
    pdfExport: true,
    status: "needs-pdf" as const,
  },
  {
    id: 2,
    name: "IRS Schedule D",
    description: "Summary of capital gains/losses — companion to Form 8949",
    icon: FileText,
    category: "irs",
    status: "needs-pdf" as const,
  },
  // CSV Exports
  {
    id: 3,
    name: "Capital Gains CSV",
    description: "All capital gains and losses with cost basis details",
    icon: FileText,
    category: "csv",
    status: "ready" as const,
  },
  {
    id: 4,
    name: "Income Report",
    description: "All income from staking, airdrops, and rewards",
    icon: FileText,
    category: "csv",
    status: "ready" as const,
  },
  {
    id: 5,
    name: "Transaction History",
    description: "Complete transaction history for the year",
    icon: FileText,
    category: "csv",
    status: "ready" as const,
  },
  {
    id: 6,
    name: "Capital Gains by Asset",
    description: "Gains and losses aggregated per asset",
    icon: FileText,
    category: "csv",
    status: "ready" as const,
  },
  {
    id: 7,
    name: "Summary Report",
    description: "Complete tax summary with all key figures",
    icon: FileText,
    category: "csv",
    status: "ready" as const,
  },
  {
    id: 8,
    name: "TurboTax 1099-B",
    description: "CSV formatted for TurboTax import",
    icon: FileText,
    category: "tax-software",
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
  // Default to current year - use a fixed value to avoid hydration mismatch
  // We'll update this after mount, but the initial render must match server
  const [selectedYear, setSelectedYear] = useState("2024");
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [reportData, setReportData] = useState<TaxReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [costBasisMethod, setCostBasisMethod] = useState<"FIFO" | "LIFO" | "HIFO">("FIFO");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const { status: sessionStatus } = useSession();

  // Set mounted and current year after component mounts (client-side only)
  useEffect(() => {
    setMounted(true);
    // Set current year after mount to avoid hydration mismatch
    const currentYear = new Date().getFullYear().toString();
    if (currentYear !== selectedYear) {
      setSelectedYear(currentYear);
    }
  }, []);

  // Fetch user's cost basis method setting
  useEffect(() => {
    if (!mounted) return;
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/settings");
        if (response.ok) {
          const data = await response.json();
          if (data.costBasisMethod) {
            setCostBasisMethod(data.costBasisMethod);
          }
        }
      } catch (err) {
        console.error("Error fetching settings:", err);
      }
    };
    fetchSettings();
  }, [mounted]);

  const handleMethodChange = async (method: "FIFO" | "LIFO" | "HIFO") => {
    if (method === costBasisMethod) return;
    setIsSavingSettings(true);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costBasisMethod: method }),
      });
      if (!response.ok) {
        throw new Error("Failed to save settings");
      }
      setCostBasisMethod(method);
      toast.success(`Cost basis method changed to ${method}`);
    } catch (err) {
      console.error("Error saving settings:", err);
      toast.error("Failed to save settings");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Fetch tax report data when year or method changes
  useEffect(() => {
    if (!mounted) return; // Don't fetch until mounted

    const fetchTaxReport = async () => {
      setIsLoading(true);
      setError(null);
      try {
        console.log(`[Tax Reports Page] Fetching tax report for year ${selectedYear}, method ${costBasisMethod}`);
        const response = await fetch(`/api/tax-reports?year=${selectedYear}&method=${costBasisMethod}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error(`[Tax Reports Page] API error (${response.status}):`, errorData);
          throw new Error(errorData.error || errorData.details || "Failed to fetch tax report");
        }
        
        const data = await response.json();
        console.log(`[Tax Reports Page] Received data:`, data);
        console.log(`[Tax Reports Page] Full API response:`, JSON.stringify(data, null, 2));
        
        if (data.status === "success" && data.report) {
          console.log(`[Tax Reports Page] Report data:`, data.report);
          console.log(`[Tax Reports Page] Taxable events: ${data.report.taxableEvents || 0}`);
          console.log(`[Tax Reports Page] Income events: ${data.report.incomeEvents || 0}`);
          console.log(`[Tax Reports Page] Short-term gains: ${data.report.shortTermGains}`);
          console.log(`[Tax Reports Page] Long-term gains: ${data.report.longTermGains}`);
          console.log(`[Tax Reports Page] Total income: ${data.report.totalIncome}`);
          
          // Check if we have detailed data
          if (data.report.detailed) {
            console.log(`[Tax Reports Page] Detailed taxable events:`, data.report.detailed.taxableEvents?.length || 0);
            if (data.report.detailed.taxableEvents && data.report.detailed.taxableEvents.length > 0) {
              console.log(`[Tax Reports Page] First taxable event:`, data.report.detailed.taxableEvents[0]);
            }
          }
          
          setReportData(data.report);
        } else {
          console.error(`[Tax Reports Page] Invalid response:`, data);
          throw new Error(data.error || "Failed to load tax report");
        }
      } catch (err) {
        console.error("Error fetching tax report:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to load tax report";
        setError(errorMessage);
        
        // Log the full error for debugging
        console.error("Full error details:", err);
        if (err instanceof Error && err.stack) {
          console.error("Error stack:", err.stack);
        }
        
        // Set default values on error
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
  }, [selectedYear, costBasisMethod, mounted]);

  // Show consistent loading state to avoid hydration mismatch
  if (!mounted) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <p className="text-lg">Loading Tax Reports...</p>
          </div>
        </div>
      </Layout>
    );
  }

  const handleDownloadExport = async (exportType: string, filename: string) => {
    // Check if user is authenticated
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
        headers: {
          "Content-Type": "application/json",
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || errorData.details || "Failed to generate export";
        
        // If 401, suggest logging in
        if (response.status === 401) {
          toast.error("Session expired. Please log in again.");
          return;
        }
        
        throw new Error(errorMessage);
      }
      
      // Get the CSV/blob
      const blob = await response.blob();
      
      // Verify we got data
      if (blob.size === 0) {
        throw new Error("Received empty file");
      }
      
      // Create download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      
      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      // Show success message
      toast.success(`${filename} downloaded successfully!`);
    } catch (error) {
      console.error(`Error downloading ${exportType}:`, error);
      const errorMessage = error instanceof Error ? error.message : `Failed to download ${filename}`;
      toast.error(errorMessage);
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleFormDownload = async (form: typeof taxForms[0]) => {
    // Block downloads for forms that need PDF implementation
    if (form.status === "needs-pdf") {
      toast.info(`${form.name} requires fillable PDF support — coming soon.`);
      return;
    }

    try {
      const formExportMap: Record<string, { type: string; filename: string }> = {
        "Capital Gains CSV": { type: "capital-gains-csv", filename: `Capital-Gains-${selectedYear}.csv` },
        "Transaction History": { type: "transaction-history", filename: `Transaction-History-${selectedYear}.csv` },
        "Income Report": { type: "income-report", filename: `Income-Report-${selectedYear}.csv` },
        "Capital Gains by Asset": { type: "capital-gains-by-asset", filename: `Capital-Gains-by-Asset-${selectedYear}.csv` },
        "Summary Report": { type: "summary-report", filename: `Crypto-Tax-Summary-${selectedYear}.csv` },
        "TurboTax 1099-B": { type: "turbotax-1099b", filename: `TurboTax-1099B-${selectedYear}.csv` },
      };

      if (formExportMap[form.name]) {
        const exportInfo = formExportMap[form.name];
        await handleDownloadExport(exportInfo.type, exportInfo.filename);
      } else {
        toast.info(`${form.name} export is not yet available.`);
      }
    } catch (error) {
      console.error(`Error downloading ${form.name}:`, error);
    }
  };

  // Use report data or default to zeros
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

  // Parse numeric values for charts
  const parseCurrency = (value: string): number => {
    return parseFloat(value.replace(/[$,]/g, "")) || 0;
  };

  // Calculate capital gains totals
  const capitalGainsTotals = {
    shortTerm: parseCurrency(displayData.shortTermGains),
    longTerm: parseCurrency(displayData.longTermGains),
  };

  // Sample data for capital gains chart
  const capitalGainsData = capitalGainsTotals.shortTerm > 0 || capitalGainsTotals.longTerm > 0
    ? [
        { name: "Short Term", shortTerm: capitalGainsTotals.shortTerm, longTerm: 0 },
        { name: "Long Term", shortTerm: 0, longTerm: capitalGainsTotals.longTerm },
      ]
    : [];

  const totalIncome = parseCurrency(displayData.totalIncome);

  // Calculate estimated tax liability using proper ST/LT rates
  // ST gains taxed as ordinary income (using ~24% as mid-bracket estimate)
  // LT gains taxed at preferential rates (using 15% as most common bracket)
  const netST = Math.max(0, parseCurrency(displayData.netShortTermGain));
  const netLT = Math.max(0, parseCurrency(displayData.netLongTermGain));
  const estimatedTaxLiability = netST * 0.24 + netLT * 0.15;

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">Tax Reports</h1>
          <div className="flex items-center gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Select year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2021">2021</SelectItem>
                <SelectItem value="2022">2022</SelectItem>
                <SelectItem value="2023">2023</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="icon">
                  <Settings className="h-4 w-4" />
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Tax Settings</DialogTitle>
                  <DialogDescription>
                    Configure your tax preferences and calculation methods.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <h4 className="font-medium">Calculation Method</h4>
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        variant={costBasisMethod === "FIFO" ? "default" : "outline"}
                        className="justify-start"
                        disabled={isSavingSettings}
                        onClick={() => handleMethodChange("FIFO")}
                      >
                        FIFO (First In, First Out)
                      </Button>
                      <Button
                        variant={costBasisMethod === "LIFO" ? "default" : "outline"}
                        className="justify-start"
                        disabled={isSavingSettings}
                        onClick={() => handleMethodChange("LIFO")}
                      >
                        LIFO (Last In, First Out)
                      </Button>
                      <Button
                        variant={costBasisMethod === "HIFO" ? "default" : "outline"}
                        className="justify-start"
                        disabled={isSavingSettings}
                        onClick={() => handleMethodChange("HIFO")}
                      >
                        HIFO (Highest In, First Out)
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium">Tax Jurisdiction</h4>
                    <p className="text-sm text-muted-foreground">United States (IRS)</p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Short-Term Gains
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : displayData.shortTermGains}
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : parseCurrency(displayData.shortTermGains) > 0
                  ? "Short-term capital gains"
                  : "No short-term gains"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Long-Term Gains
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : displayData.longTermGains}
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : parseCurrency(displayData.longTermGains) > 0
                  ? "Long-term capital gains"
                  : "No long-term gains"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Crypto Income
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : displayData.totalIncome}
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : parseCurrency(displayData.totalIncome) > 0
                  ? "Total income from crypto"
                  : "No income data"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Taxable Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : displayData.taxableEvents}
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : displayData.taxableEvents > 0
                  ? "Capital gains/losses events"
                  : "No taxable events"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Income Events
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading ? "..." : displayData.incomeEvents}
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : displayData.incomeEvents > 0
                  ? "Income-generating events"
                  : "No income events"}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Est. Tax Liability
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoading
                  ? "..."
                  : `$${estimatedTaxLiability.toFixed(2)}`}
              </div>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Loading..."
                  : "Estimated (ST 24% / LT 15%)"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="forms" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="forms">Tax Forms</TabsTrigger>
            <TabsTrigger value="summary">Tax Summary</TabsTrigger>
          </TabsList>
          <TabsContent value="forms">
            <Card>
              <CardHeader>
                <CardTitle>Available Tax Forms</CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="all" className="w-full">
                  <TabsList className="mb-4 flex flex-wrap justify-start">
                    <TabsTrigger value="all">All Reports</TabsTrigger>
                    <TabsTrigger value="irs">IRS Forms</TabsTrigger>
                    <TabsTrigger value="csv">CSV Exports</TabsTrigger>
                    <TabsTrigger value="tax-software">Tax Software</TabsTrigger>
                  </TabsList>

                  {['all', 'irs', 'csv', 'tax-software'].map((category) => (
                    <TabsContent key={category} value={category}>
                      <div className="space-y-4">
                        {taxForms
                          .filter(form => category === 'all' || form.category === category)
                          .map((form) => (
                            <div
                              key={form.id}
                              className="flex items-center justify-between rounded-lg border border-border p-4"
                            >
                              <div className="flex items-center gap-4">
                                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                                  <form.icon className="h-5 w-5 text-primary" />
                                </div>
                                <div>
                                  <h3 className="text-sm font-medium">{form.name}</h3>
                                  <p className="text-xs text-muted-foreground">
                                    {form.description}
                                  </p>
                                </div>
                              </div>
                              {form.status === "needs-pdf" ? (
                                <span className="inline-flex items-center rounded-md bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                                  PDF Coming Soon
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleFormDownload(form)}
                                  disabled={isGeneratingReport || isLoading}
                                >
                                  {isGeneratingReport ? (
                                    <>
                                      <div className="mr-1 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                      Generating...
                                    </>
                                  ) : (
                                    <>
                                      <ArrowDownToLine className="mr-1 h-4 w-4" />
                                      Download
                                    </>
                                  )}
                                </Button>
                              )}
                            </div>
                          ))}
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>

              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="summary">
            <Card>
              <CardHeader>
                <CardTitle>Tax Summary for {selectedYear}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="rounded-lg bg-muted p-4">
                  <div className="grid grid-cols-1 gap-y-4 md:grid-cols-2">
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Short-term Capital Gains
                      </div>
                      <div className="text-lg font-bold">
                        {isLoading ? "..." : displayData.shortTermGains}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Long-term Capital Gains
                      </div>
                      <div className="text-lg font-bold">
                        {isLoading ? "..." : displayData.longTermGains}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Total Taxable Events
                      </div>
                      <div className="text-lg font-bold">
                        {isLoading ? "..." : displayData.taxableEvents}
                      </div>
                    </div>
                    <div>
                      <div className="text-sm text-muted-foreground">
                        Income Events
                      </div>
                      <div className="text-lg font-bold">
                        {isLoading ? "..." : displayData.incomeEvents}
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="mb-4 text-lg font-medium">Total Tax Liability</h3>
                  <div className="rounded-lg border border-border p-6">
                    <div className="text-center">
                      <div className="text-3xl font-bold">
                        {isLoading
                          ? "..."
                          : `$${estimatedTaxLiability.toFixed(2)}`}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {isLoading
                          ? "Calculating..."
                          : `Estimated tax based on your activity in ${selectedYear}`}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center">
                  <Button
                    onClick={() => handleDownloadExport("summary-report", `Crypto-Tax-Summary-${selectedYear}.csv`)}
                    disabled={isGeneratingReport || isLoading}
                  >
                    <ArrowDownToLine className="mr-2 h-4 w-4" />
                    Download Tax Summary CSV
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Capital Gains Section */}
        <Card>
          <CardHeader>
            <CardTitle>Capital Gains</CardTitle>
          </CardHeader>
          <CardContent className="h-[400px]">
            {capitalGainsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart
                  data={capitalGainsData}
                  margin={{
                    top: 20,
                    right: 30,
                    left: 20,
                    bottom: 20,
                  }}
                >
                  <CartesianGrid 
                    strokeDasharray="3 3" 
                    stroke="hsl(var(--muted-foreground))"
                    strokeOpacity={0.6}
                  />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <YAxis 
                    tickFormatter={(value) => `$${value.toLocaleString()}`}
                    tick={{ fontSize: 12 }}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value) => [`$${value.toLocaleString()}`, '']}
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      borderColor: 'hsl(var(--border))',
                      color: 'hsl(var(--card-foreground))',
                      borderRadius: 'var(--radius)',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                    }}
                    itemStyle={{
                      color: 'hsl(var(--card-foreground))'
                    }}
                  />
                  <Legend />
                  <Bar dataKey="shortTerm" fill="hsl(var(--primary))" name="Short Term" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="longTerm" fill="hsl(var(--primary)/0.6)" name="Long Term" radius={[4, 4, 0, 0]} />
                </RechartsBarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <BarChart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">No capital gains data</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Connect accounts or add transactions to see your capital gains breakdown.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Income Section */}
        <Card>
          <CardHeader>
            <CardTitle>Income</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {totalIncome > 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-4">
                <div className="text-center">
                  <div className="text-3xl font-bold">
                    ${totalIncome.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    Total crypto income for {selectedYear} ({displayData.incomeEvents} events)
                  </p>
                </div>
                <div className="w-full max-w-sm">
                  <div className="h-3 rounded-full bg-blue-500/20 overflow-hidden">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: "100%" }} />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Includes staking rewards, airdrops, mining, and other income
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">No income data</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Connect accounts or add transactions to see your income breakdown.
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
