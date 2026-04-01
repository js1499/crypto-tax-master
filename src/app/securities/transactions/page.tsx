"use client";

import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload, Search, Loader2, Calculator, ChevronLeft, ChevronRight,
  Building, FileText,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SecuritiesCSVImport } from "./csv-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Transaction {
  id: number;
  date: string;
  type: string;
  symbol: string;
  assetClass: string;
  quantity: number;
  price: number;
  fees: number;
  totalAmount: number | null;
  proceeds: number;
  lotId: string | null;
  brokerageId: string | null;
  notes: string | null;
}

// ---------------------------------------------------------------------------
// Horizon pill-based type badge styling
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  BUY: "bg-pill-green-bg text-pill-green-text dark:bg-[rgba(22,163,74,0.12)] dark:text-[#22C55E]",
  SELL: "bg-pill-red-bg text-pill-red-text dark:bg-[rgba(220,38,38,0.12)] dark:text-[#EF4444]",
  SELL_SHORT: "bg-pill-red-bg text-pill-red-text dark:bg-[rgba(220,38,38,0.12)] dark:text-[#EF4444]",
  BUY_TO_COVER: "bg-pill-green-bg text-pill-green-text dark:bg-[rgba(22,163,74,0.12)] dark:text-[#22C55E]",
  DIVIDEND: "bg-pill-yellow-bg text-pill-yellow-text dark:bg-[rgba(202,138,4,0.12)] dark:text-[#EAB308]",
  DIVIDEND_REINVEST: "bg-pill-yellow-bg text-pill-yellow-text dark:bg-[rgba(202,138,4,0.12)] dark:text-[#EAB308]",
  INTEREST: "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]",
  SPLIT: "bg-pill-blue-bg text-pill-blue-text dark:bg-[rgba(37,99,235,0.12)] dark:text-[#3B82F6]",
  MERGER: "bg-pill-indigo-bg text-pill-indigo-text dark:bg-[rgba(79,70,229,0.12)] dark:text-[#818CF8]",
  SPINOFF: "bg-pill-purple-bg text-pill-purple-text dark:bg-[rgba(147,51,234,0.12)] dark:text-[#A855F7]",
  RETURN_OF_CAPITAL: "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]",
  OPTION_EXERCISE: "bg-pill-purple-bg text-pill-purple-text dark:bg-[rgba(147,51,234,0.12)] dark:text-[#A855F7]",
  OPTION_ASSIGNMENT: "bg-pill-purple-bg text-pill-purple-text dark:bg-[rgba(147,51,234,0.12)] dark:text-[#A855F7]",
  OPTION_EXPIRATION: "bg-pill-gray-bg text-pill-gray-text dark:bg-[rgba(75,85,99,0.12)] dark:text-[#9CA3AF]",
  RSU_VEST: "bg-pill-teal-bg text-pill-teal-text dark:bg-[rgba(13,148,136,0.12)] dark:text-[#14B8A6]",
  ESPP_PURCHASE: "bg-pill-teal-bg text-pill-teal-text dark:bg-[rgba(13,148,136,0.12)] dark:text-[#14B8A6]",
  TRANSFER_IN: "bg-pill-blue-bg text-pill-blue-text dark:bg-[rgba(37,99,235,0.12)] dark:text-[#3B82F6]",
  TRANSFER_OUT: "bg-pill-indigo-bg text-pill-indigo-text dark:bg-[rgba(79,70,229,0.12)] dark:text-[#818CF8]",
  YEAR_END_FMV: "bg-pill-gray-bg text-pill-gray-text dark:bg-[rgba(75,85,99,0.12)] dark:text-[#9CA3AF]",
};

const TRANSACTION_TYPES = [
  "BUY", "SELL", "SELL_SHORT", "BUY_TO_COVER", "DIVIDEND", "DIVIDEND_REINVEST",
  "INTEREST", "SPLIT", "MERGER", "SPINOFF", "RETURN_OF_CAPITAL",
  "OPTION_EXERCISE", "OPTION_ASSIGNMENT", "OPTION_EXPIRATION",
  "RSU_VEST", "ESPP_PURCHASE", "TRANSFER_IN", "TRANSFER_OUT", "YEAR_END_FMV",
];

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatQuantity(value: number): string {
  if (value >= 1) {
    return new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 4,
    }).format(value);
  }
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  }).format(value);
}

function formatType(type: string): string {
  return type.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SecuritiesTransactionsPage() {
  const [mounted, setMounted] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isComputing, setIsComputing] = useState(false);

  // Filters
  const [searchSymbol, setSearchSymbol] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortOrder, setSortOrder] = useState("date-desc");

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 50;

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort: sortOrder,
      });
      if (searchSymbol.trim()) params.set("symbol", searchSymbol.trim());
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const res = await fetch(`/api/securities/transactions?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();

      setTransactions(data.transactions || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error("Error fetching transactions:", error);
      toast.error("Failed to load transactions.");
    } finally {
      setLoading(false);
    }
  }, [page, limit, searchSymbol, typeFilter, dateFrom, dateTo, sortOrder]);

  useEffect(() => {
    if (mounted) fetchTransactions();
  }, [mounted, fetchTransactions]);

  useEffect(() => {
    setPage(1);
  }, [searchSymbol, typeFilter, dateFrom, dateTo, sortOrder]);

  const handleComputeLots = async () => {
    setIsComputing(true);
    try {
      const res = await fetch("/api/securities/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Compute failed");
      }
      const data = await res.json();
      toast.success(
        `Computed: ${data.lotsCreated} lots, ${data.eventsCreated} tax events, ${data.dividendsCreated} dividends.`,
      );
    } catch (error) {
      console.error("Compute error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to compute lots.");
    } finally {
      setIsComputing(false);
    }
  };

  const handleImportComplete = () => {
    setIsImportOpen(false);
    fetchTransactions();
  };

  if (!mounted) return null;

  return (
    <Layout>
      <div className="space-y-6 px-0">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-light tracking-[-0.02em] text-[#1A1A1A] dark:text-[#F5F5F5]">
              Securities Transactions
            </h1>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className="text-[36px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5]"
                style={{ fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}
              >
                {total.toLocaleString()}
              </span>
              <span className="text-[14px] text-[#6B7280]">
                Transaction{total !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleComputeLots}
              disabled={isComputing}
            >
              {isComputing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="mr-2 h-4 w-4" />
              )}
              {isComputing ? "Computing..." : "Compute Lots"}
            </Button>

            <Sheet open={isImportOpen} onOpenChange={setIsImportOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
                  Import CSV
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-xl">
                <SheetHeader>
                  <SheetTitle>Import Securities Transactions</SheetTitle>
                  <SheetDescription>
                    Upload a CSV file with your securities transactions.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-8">
                  <SecuritiesCSVImport onImportComplete={handleImportComplete} />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9CA3AF]" />
            <Input
              placeholder="Search symbol..."
              className="pl-9 h-9 text-sm"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] h-9 text-sm font-medium">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TRANSACTION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {formatType(t)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            type="date"
            className="w-[150px] h-9 text-sm"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            type="date"
            className="w-[150px] h-9 text-sm"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />

          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-[150px] h-9 text-sm font-medium">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest First</SelectItem>
              <SelectItem value="date-asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* ── Table ── */}
        <div className="border border-[#E5E5E0] dark:border-[#333] rounded-lg">
          <div className="overflow-auto max-h-[calc(100vh-340px)] rounded-lg">
            <Table className="transaction-table">
              <TableHeader className="sticky top-0 z-10 bg-[#FAFAF8] dark:bg-[#161616]">
                <TableRow className="border-b border-[#E5E5E0] dark:border-[#333]">
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Date
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Type
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Symbol
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Asset Class
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                    Qty
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                    Price
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                    Proceeds
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                    Fees
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563]">
                    Account
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i} className="border-b border-[#F0F0EB] dark:border-[#2A2A2A]">
                      <TableCell colSpan={9}>
                        <div className="flex items-center gap-4 h-10">
                          <div className="h-4 w-20 skeleton-pulse rounded" />
                          <div className="h-5 w-16 skeleton-pulse rounded-md" />
                          <div className="h-4 w-12 skeleton-pulse rounded" />
                          <div className="h-4 w-16 skeleton-pulse rounded" />
                          <div className="h-4 w-14 skeleton-pulse rounded" />
                          <div className="h-4 w-16 skeleton-pulse rounded" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <div className="py-16 text-center">
                        <FileText className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
                        <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                          {total === 0
                            ? "No securities transactions yet"
                            : "No transactions match your filters"}
                        </p>
                        <p className="text-sm text-[#6B7280] mt-2">
                          {total === 0
                            ? "Import a CSV from your brokerage to get started."
                            : "Try adjusting your filters."}
                        </p>
                        {total === 0 && (
                          <Button className="mt-4" onClick={() => setIsImportOpen(true)}>
                            <Upload className="mr-2 h-4 w-4" />
                            Import CSV
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((tx) => (
                    <TableRow
                      key={tx.id}
                      className="group cursor-pointer border-b border-[#F0F0EB] dark:border-[#2A2A2A] hover:bg-[#FAFAF7] dark:hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                    >
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A] whitespace-nowrap">
                        <span className="text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5]">
                          {format(new Date(tx.date), "MMM d, yyyy")}
                        </span>
                      </TableCell>
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md px-2.5 py-0.5 text-[12px] font-medium",
                            TYPE_COLORS[tx.type] || "bg-pill-gray-bg text-pill-gray-text",
                          )}
                        >
                          {formatType(tx.type)}
                        </span>
                      </TableCell>
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span className="text-[15px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">
                          {tx.symbol}
                        </span>
                      </TableCell>
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <span className="text-[13px] text-[#6B7280]">
                          {tx.assetClass.replace(/_/g, " ")}
                        </span>
                      </TableCell>
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                        <span
                          className="text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatQuantity(tx.quantity)}
                        </span>
                      </TableCell>
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                        <span
                          className="text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatCurrency(tx.price)}
                        </span>
                      </TableCell>
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                        <span
                          className="text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {formatCurrency(tx.proceeds)}
                        </span>
                      </TableCell>
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A] text-right">
                        <span
                          className="text-[14px] text-[#6B7280]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {tx.fees > 0 ? formatCurrency(tx.fees) : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-[13px] text-[#6B7280]">
                          {tx.brokerageId
                            ? tx.brokerageId.slice(0, 8) + "..."
                            : "—"}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-[13px] text-[#6B7280]" style={{ fontVariantNumeric: "tabular-nums" }}>
              Page {page} of {totalPages} ({total.toLocaleString()} transactions)
            </p>
            <div className="flex items-center gap-1.5">
              <button
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E0] dark:border-[#333] text-[13px] font-medium text-[#4B5563] dark:text-[#9CA3AF] hover:border-[#2563EB] hover:text-[#2563EB] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    className={cn(
                      "inline-flex items-center justify-center w-8 h-8 rounded-md text-[13px] font-medium transition-colors",
                      pageNum === page
                        ? "bg-[#1A1A1A] dark:bg-[#F5F5F5] text-white dark:text-[#1A1A1A]"
                        : "border border-[#E5E5E0] dark:border-[#333] text-[#4B5563] dark:text-[#9CA3AF] hover:border-[#2563EB] hover:text-[#2563EB]",
                    )}
                    onClick={() => setPage(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-[#E5E5E0] dark:border-[#333] text-[13px] font-medium text-[#4B5563] dark:text-[#9CA3AF] hover:border-[#2563EB] hover:text-[#2563EB] transition-colors disabled:opacity-40 disabled:pointer-events-none"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
