"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  PlusCircle, Building, RefreshCw, Trash2, Upload, AlertCircle,
  Loader2, ChevronDown,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SecuritiesCSVImport } from "../transactions/csv-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Brokerage {
  id: string;
  name: string;
  provider: string;
  accountNumber: string | null;
  accountType: string;
  isConnected: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  transactionCount: number;
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  TAXABLE: "Taxable",
  IRA_TRADITIONAL: "Traditional IRA",
  IRA_ROTH: "Roth IRA",
  "401K": "401(k)",
  HSA: "HSA",
  "529": "529 Plan",
};

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  TAXABLE: "bg-pill-blue-bg text-pill-blue-text dark:bg-[rgba(37,99,235,0.12)] dark:text-[#3B82F6]",
  IRA_TRADITIONAL: "bg-pill-purple-bg text-pill-purple-text dark:bg-[rgba(147,51,234,0.12)] dark:text-[#A855F7]",
  IRA_ROTH: "bg-pill-green-bg text-pill-green-text dark:bg-[rgba(22,163,74,0.12)] dark:text-[#22C55E]",
  "401K": "bg-pill-teal-bg text-pill-teal-text dark:bg-[rgba(13,148,136,0.12)] dark:text-[#14B8A6]",
  HSA: "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]",
  "529": "bg-pill-indigo-bg text-pill-indigo-text dark:bg-[rgba(79,70,229,0.12)] dark:text-[#818CF8]",
};

const PROVIDERS = [
  "Fidelity", "Charles Schwab", "TD Ameritrade", "E*TRADE", "Vanguard",
  "Robinhood", "Interactive Brokers", "Merrill Edge", "Webull",
  "Tastytrade", "TradeStation", "Ally Invest", "Other",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SecuritiesAccountsPage() {
  const [mounted, setMounted] = useState(false);
  const [brokerages, setBrokerages] = useState<Brokerage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");

  // Add dialog
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<"manual" | "csv">("manual");
  const [addName, setAddName] = useState("");
  const [addProvider, setAddProvider] = useState("");
  const [addAccountType, setAddAccountType] = useState("TAXABLE");
  const [addAccountNumber, setAddAccountNumber] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // CSV import sheet
  const [isImportOpen, setIsImportOpen] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const fetchBrokerages = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/securities/brokerages");
      if (!res.ok) throw new Error("Failed to load");
      const data = await res.json();
      setBrokerages(data.brokerages || []);
    } catch (err) {
      setError("Failed to load brokerage accounts.");
      toast.error("Failed to load accounts.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (mounted) fetchBrokerages();
  }, [mounted]);

  const handleCreate = async () => {
    if (!addName.trim() || !addProvider.trim()) {
      toast.error("Name and provider are required.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await fetch("/api/securities/brokerages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: addName.trim(),
          provider: addProvider.trim(),
          accountType: addAccountType,
          accountNumber: addAccountNumber.trim() || null,
        }),
      });
      if (!res.ok) throw new Error("Failed to create");
      toast.success("Brokerage account added.");
      setIsAddOpen(false);
      setAddName("");
      setAddProvider("");
      setAddAccountType("TAXABLE");
      setAddAccountNumber("");
      fetchBrokerages();
    } catch {
      toast.error("Failed to add brokerage.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Remove "${name}" and all its transactions?`)) return;
    try {
      const res = await fetch(`/api/securities/brokerages?brokerageId=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      toast.success(`Removed "${name}". ${data.deletedTransactions} transaction(s) deleted.`);
      fetchBrokerages();
    } catch {
      toast.error("Failed to remove brokerage.");
    }
  };

  const filteredBrokerages = brokerages.filter((b) => {
    if (filter === "all") return true;
    return b.accountType === filter;
  });

  const totalTxns = brokerages.reduce((s, b) => s + b.transactionCount, 0);

  if (!mounted) return null;

  // Loading skeleton
  if (loading && brokerages.length === 0) {
    return (
      <Layout>
        <div className="space-y-6 px-0">
          <div className="h-8 w-48 skeleton-pulse rounded" />
          <div className="h-12 w-20 skeleton-pulse rounded" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 h-12 border-b border-[#F0F0EB] dark:border-[#2A2A2A]">
                <div className="h-7 w-7 skeleton-pulse rounded-lg" />
                <div className="h-4 w-32 skeleton-pulse rounded" />
                <div className="h-5 w-16 skeleton-pulse rounded-md" />
                <div className="h-4 w-24 skeleton-pulse rounded" />
              </div>
            ))}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6 px-0">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-light tracking-[-0.02em] text-[#1A1A1A] dark:text-[#F5F5F5]">
              Securities Accounts
            </h1>
            {!loading && (
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className="text-[36px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5]"
                  style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}
                >
                  {brokerages.length}
                </span>
                <span className="text-[14px] text-[#6B7280]">
                  Brokerage{brokerages.length !== 1 ? "s" : ""} Connected
                </span>
              </div>
            )}
            {!loading && (
              <p
                className="text-[13px] text-[#9CA3AF] mt-0.5"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {totalTxns.toLocaleString()} total transactions
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {brokerages.length > 0 && (
              <Button variant="outline" onClick={fetchBrokerages}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            )}
            <Button onClick={() => setIsAddOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Brokerage
            </Button>
          </div>
        </div>

        {/* ── Filter bar ── */}
        {brokerages.length > 0 && (
          <div className="flex items-center gap-4">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px] h-9 text-sm font-medium">
                <SelectValue placeholder="All Accounts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Accounts</SelectItem>
                <SelectItem value="TAXABLE">Taxable</SelectItem>
                <SelectItem value="IRA_TRADITIONAL">Traditional IRA</SelectItem>
                <SelectItem value="IRA_ROTH">Roth IRA</SelectItem>
                <SelectItem value="401K">401(k)</SelectItem>
                <SelectItem value="HSA">HSA</SelectItem>
              </SelectContent>
            </Select>

            <div className="ml-auto" />

            {/* Account type breakdown bar */}
            {(() => {
              const typeCounts: Record<string, number> = {};
              for (const b of brokerages) {
                typeCounts[b.accountType] = (typeCounts[b.accountType] || 0) + 1;
              }
              const total = brokerages.length;
              const types = Object.entries(typeCounts);
              const barColors: Record<string, string> = {
                TAXABLE: "#2563EB",
                IRA_TRADITIONAL: "#9333EA",
                IRA_ROTH: "#16A34A",
                "401K": "#0D9488",
                HSA: "#EA580C",
                "529": "#4F46E5",
              };
              return (
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-[#9CA3AF] tracking-wide uppercase">
                    Account Breakdown
                  </p>
                  <div className="flex h-5 w-[280px] rounded-md overflow-hidden">
                    {types.map(([type, count]) => (
                      <div
                        key={type}
                        className="h-full flex items-center justify-center"
                        style={{
                          width: `${(count / total) * 100}%`,
                          minWidth: "60px",
                          backgroundColor: barColors[type] || "#6B7280",
                        }}
                        title={`${count} ${ACCOUNT_TYPE_LABELS[type] || type}`}
                      >
                        <span className="text-[10px] font-semibold text-white">
                          {count} {ACCOUNT_TYPE_LABELS[type] || type}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="p-3 rounded-lg bg-pill-red-bg dark:bg-[rgba(220,38,38,0.12)] border border-[#E5E5E0] dark:border-[#333] flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-[#DC2626]" />
            <p className="text-[13px]">{error}</p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={fetchBrokerages}>
              Try Again
            </Button>
          </div>
        )}

        {/* ── Accounts Table ── */}
        <div className="border border-[#E5E5E0] dark:border-[#333] rounded-lg">
          <div className="overflow-auto max-h-[calc(100vh-340px)] rounded-lg">
            <Table className="transaction-table">
              <TableHeader className="sticky top-0 z-10 bg-[#FAFAF8] dark:bg-[#161616]">
                <TableRow className="border-b border-[#E5E5E0] dark:border-[#333]">
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-4 w-4 rounded-full bg-primary shrink-0" />
                      {filteredBrokerages.length} Account{filteredBrokerages.length !== 1 ? "s" : ""}
                    </span>
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Account Type
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Account #
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Transactions
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Status
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Last Synced
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563]">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredBrokerages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>
                      <div className="py-16 text-center">
                        <Building className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
                        <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                          No brokerage accounts
                        </p>
                        <p className="text-sm text-[#6B7280] mt-2">
                          Add a brokerage to start importing securities transactions.
                        </p>
                        <Button className="mt-4" onClick={() => setIsAddOpen(true)}>
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add Brokerage
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredBrokerages.map((b) => (
                    <TableRow
                      key={b.id}
                      className="group cursor-pointer border-b border-[#F0F0EB] dark:border-[#2A2A2A] hover:bg-[#FAFAF7] dark:hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    >
                      {/* Name + Provider */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <div className="flex items-center gap-2.5">
                          <span className="inline-flex items-center justify-center h-[32px] w-[32px] rounded-full bg-[#9333EA] text-white text-[12px] font-bold shrink-0">
                            <Building className="h-3.5 w-3.5" />
                          </span>
                          <div>
                            <p className="text-[15px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">
                              {b.name}
                            </p>
                            <p className="text-[13px] text-[#9CA3AF]">{b.provider}</p>
                          </div>
                        </div>
                      </TableCell>

                      {/* Account Type pill */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2.5 py-1 text-[13px] font-medium",
                            ACCOUNT_TYPE_COLORS[b.accountType] || "bg-pill-gray-bg text-pill-gray-text",
                          )}
                        >
                          {ACCOUNT_TYPE_LABELS[b.accountType] || b.accountType}
                        </span>
                      </TableCell>

                      {/* Account # */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span
                          className="text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                          style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }}
                        >
                          {b.accountNumber || "—"}
                        </span>
                      </TableCell>

                      {/* Transactions */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span
                          className="text-[15px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {b.transactionCount.toLocaleString()}
                        </span>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium",
                            b.transactionCount > 0
                              ? "bg-pill-green-bg text-pill-green-text dark:bg-[rgba(22,163,74,0.12)] dark:text-[#22C55E]"
                              : "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              b.transactionCount > 0
                                ? "bg-pill-green-text dark:bg-[#22C55E]"
                                : "bg-pill-orange-text dark:bg-[#F97316]",
                            )}
                          />
                          {b.transactionCount > 0 ? "Active" : "No Data"}
                        </span>
                      </TableCell>

                      {/* Last Synced */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span className="text-[14px] text-[#6B7280]">
                          {b.lastSyncAt
                            ? new Date(b.lastSyncAt).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Never"}
                        </span>
                      </TableCell>

                      {/* Actions */}
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          <button
                            className="inline-flex items-center px-1.5 py-1 rounded-md border border-[#E5E5E0] dark:border-[#333] text-[#9CA3AF] hover:border-[#DC2626] hover:text-[#DC2626] transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(b.id, b.name);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* ── Add Brokerage Dialog ── */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Brokerage Account</DialogTitle>
            <DialogDescription>
              Add a brokerage account manually or import transactions from CSV.
            </DialogDescription>
          </DialogHeader>

          {/* Tab selector */}
          <div className="flex items-center gap-1 bg-[#F5F5F0] dark:bg-[#222] rounded-md p-0.5 mb-4">
            <button
              className={cn(
                "flex-1 px-3 py-1.5 text-[13px] font-medium rounded transition-colors",
                addTab === "manual"
                  ? "bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#F5F5F5] shadow-sm"
                  : "text-[#6B7280]",
              )}
              onClick={() => setAddTab("manual")}
            >
              Manual Setup
            </button>
            <button
              className={cn(
                "flex-1 px-3 py-1.5 text-[13px] font-medium rounded transition-colors",
                addTab === "csv"
                  ? "bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#F5F5F5] shadow-sm"
                  : "text-[#6B7280]",
              )}
              onClick={() => setAddTab("csv")}
            >
              CSV Import
            </button>
          </div>

          {addTab === "manual" ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="brokerage-name">Account Name</Label>
                <Input
                  id="brokerage-name"
                  placeholder="e.g., My Fidelity Taxable"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Provider</Label>
                <Select value={addProvider} onValueChange={setAddProvider}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select brokerage..." />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDERS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Account Type</Label>
                <Select value={addAccountType} onValueChange={setAddAccountType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TAXABLE">Taxable</SelectItem>
                    <SelectItem value="IRA_TRADITIONAL">Traditional IRA</SelectItem>
                    <SelectItem value="IRA_ROTH">Roth IRA</SelectItem>
                    <SelectItem value="401K">401(k)</SelectItem>
                    <SelectItem value="HSA">HSA</SelectItem>
                    <SelectItem value="529">529 Plan</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="account-number">Account Number (optional)</Label>
                <Input
                  id="account-number"
                  placeholder="e.g., ****1234"
                  value={addAccountNumber}
                  onChange={(e) => setAddAccountNumber(e.target.value)}
                />
              </div>
              <Button className="w-full" onClick={handleCreate} disabled={isCreating}>
                {isCreating ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <PlusCircle className="mr-2 h-4 w-4" />
                )}
                {isCreating ? "Creating..." : "Add Brokerage"}
              </Button>
            </div>
          ) : (
            <div className="mt-2">
              <SecuritiesCSVImport
                onImportComplete={() => {
                  setIsAddOpen(false);
                  fetchBrokerages();
                }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
