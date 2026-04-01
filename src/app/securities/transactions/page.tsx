"use client";

import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Upload,
  Search,
  Filter,
  Loader2,
  Calculator,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
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
// Type badge styling
// ---------------------------------------------------------------------------

const TYPE_COLORS: Record<string, string> = {
  BUY: "bg-emerald-100 text-emerald-800",
  SELL: "bg-red-100 text-red-800",
  SELL_SHORT: "bg-red-200 text-red-900",
  BUY_TO_COVER: "bg-emerald-200 text-emerald-900",
  DIVIDEND: "bg-yellow-100 text-yellow-800",
  DIVIDEND_REINVEST: "bg-yellow-200 text-yellow-900",
  INTEREST: "bg-amber-100 text-amber-800",
  SPLIT: "bg-blue-100 text-blue-800",
  MERGER: "bg-indigo-100 text-indigo-800",
  SPINOFF: "bg-violet-100 text-violet-800",
  RETURN_OF_CAPITAL: "bg-orange-100 text-orange-800",
  OPTION_EXERCISE: "bg-purple-100 text-purple-800",
  OPTION_ASSIGNMENT: "bg-purple-200 text-purple-900",
  OPTION_EXPIRATION: "bg-gray-100 text-gray-800",
  RSU_VEST: "bg-teal-100 text-teal-800",
  ESPP_PURCHASE: "bg-cyan-100 text-cyan-800",
  TRANSFER_IN: "bg-sky-100 text-sky-800",
  TRANSFER_OUT: "bg-slate-100 text-slate-800",
  YEAR_END_FMV: "bg-zinc-100 text-zinc-800",
};

const TRANSACTION_TYPES = [
  "BUY",
  "SELL",
  "SELL_SHORT",
  "BUY_TO_COVER",
  "DIVIDEND",
  "DIVIDEND_REINVEST",
  "INTEREST",
  "SPLIT",
  "MERGER",
  "SPINOFF",
  "RETURN_OF_CAPITAL",
  "OPTION_EXERCISE",
  "OPTION_ASSIGNMENT",
  "OPTION_EXPIRATION",
  "RSU_VEST",
  "ESPP_PURCHASE",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "YEAR_END_FMV",
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
    if (mounted) {
      fetchTransactions();
    }
  }, [mounted, fetchTransactions]);

  // Reset page when filters change
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
      toast.error(
        error instanceof Error ? error.message : "Failed to compute lots.",
      );
    } finally {
      setIsComputing(false);
    }
  };

  const handleImportComplete = () => {
    setIsImportOpen(false);
    fetchTransactions();
  };

  if (!mounted) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A1A1A]">
              Securities Transactions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage your securities transactions across all brokerage
              accounts.
              {total > 0 && (
                <span className="ml-1 font-medium">
                  ({total.toLocaleString()} total)
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleComputeLots}
              disabled={isComputing}
              className="gap-2"
            >
              {isComputing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              {isComputing ? "Computing..." : "Compute Lots"}
            </Button>

            <Sheet open={isImportOpen} onOpenChange={setIsImportOpen}>
              <SheetTrigger asChild>
                <Button className="gap-2">
                  <Upload className="h-4 w-4" />
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
                  <SecuritiesCSVImport
                    onImportComplete={handleImportComplete}
                  />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search symbol..."
              className="pl-9"
              value={searchSymbol}
              onChange={(e) => setSearchSymbol(e.target.value)}
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
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
            className="w-[160px]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            placeholder="From date"
          />
          <Input
            type="date"
            className="w-[160px]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            placeholder="To date"
          />

          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date-desc">Newest First</SelectItem>
              <SelectItem value="date-asc">Oldest First</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-[#E5E5E0] overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[#1A1A1A]">Date</TableHead>
                <TableHead className="text-[#1A1A1A]">Type</TableHead>
                <TableHead className="text-[#1A1A1A]">Symbol</TableHead>
                <TableHead className="text-[#1A1A1A]">Asset Class</TableHead>
                <TableHead className="text-[#1A1A1A] text-right">Qty</TableHead>
                <TableHead className="text-[#1A1A1A] text-right">Price</TableHead>
                <TableHead className="text-[#1A1A1A] text-right">
                  Proceeds
                </TableHead>
                <TableHead className="text-[#1A1A1A] text-right">Fees</TableHead>
                <TableHead className="text-[#1A1A1A]">Account</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading transactions...
                  </TableCell>
                </TableRow>
              ) : transactions.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-32 text-center text-muted-foreground"
                  >
                    {total === 0
                      ? 'No securities transactions yet. Click "Import CSV" to get started.'
                      : "No transactions match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                transactions.map((tx) => (
                  <TableRow key={tx.id} className="hover:bg-[#F9F9F8]">
                    <TableCell className="whitespace-nowrap text-sm">
                      {format(new Date(tx.date), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
                          TYPE_COLORS[tx.type] || "bg-gray-100 text-gray-800",
                        )}
                      >
                        {formatType(tx.type)}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {tx.symbol}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.assetClass.replace(/_/g, " ")}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatQuantity(tx.quantity)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(tx.price)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatCurrency(tx.proceeds)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-muted-foreground">
                      {tx.fees > 0 ? formatCurrency(tx.fees) : "-"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {tx.brokerageId ? tx.brokerageId.slice(0, 8) + "..." : "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages} ({total.toLocaleString()} transactions)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              {/* Page number buttons */}
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
                  <Button
                    key={pageNum}
                    variant={pageNum === page ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPage(pageNum)}
                    className="w-9"
                  >
                    {pageNum}
                  </Button>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
