"use client";

import { useState, useEffect, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Search,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  AlertTriangle,
  ArrowRightLeft,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WashSale {
  id: number;
  lossTransactionId: number;
  replacementTransactionId: number;
  lossLotId: number | null;
  replacementLotId: number | null;
  disallowedAmount: number;
  isPermanent: boolean;
  basisAdjustment: number;
  holdingPeriodTackDays: number;
  year: number;
  carryForward: boolean;
  symbol: string;
  lossDate: string | null;
  lossAmount: number;
  replacementDate: string | null;
}

interface Summary {
  totalDisallowed: number;
  totalPermanent: number;
  carryForwardCount: number;
}

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

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function WashSalesPage() {
  const [mounted, setMounted] = useState(false);
  const [symbolFilter, setSymbolFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("all");

  // Data state
  const [washSales, setWashSales] = useState<WashSale[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary>({
    totalDisallowed: 0,
    totalPermanent: 0,
    carryForwardCount: 0,
  });

  const limit = 50;

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchWashSales = useCallback(
    async (p: number) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(p),
          limit: String(limit),
        });
        if (symbolFilter.trim()) params.set("symbol", symbolFilter.trim());
        if (yearFilter !== "all") params.set("year", yearFilter);

        const res = await fetch(`/api/securities/wash-sales?${params}`);
        if (!res.ok) throw new Error("Failed to fetch wash sales");
        const data = await res.json();

        setWashSales(data.washSales || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.summary) setSummary(data.summary);
      } catch (error) {
        console.error("Error fetching wash sales:", error);
        toast.error("Failed to load wash sales.");
      } finally {
        setLoading(false);
      }
    },
    [symbolFilter, yearFilter, limit],
  );

  useEffect(() => {
    if (mounted) {
      fetchWashSales(page);
    }
  }, [mounted, page, fetchWashSales]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [symbolFilter, yearFilter]);

  if (!mounted) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  const carryForwardAmount =
    summary.totalDisallowed - summary.totalPermanent;

  // -------------------------------------------------------------------------
  // Status badge helper
  // -------------------------------------------------------------------------
  function getStatusBadge(ws: WashSale) {
    if (ws.isPermanent) {
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
            "bg-red-100 text-red-800",
          )}
        >
          Permanent
        </span>
      );
    }
    if (ws.carryForward) {
      return (
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
            "bg-orange-100 text-orange-800",
          )}
        >
          Carry-Forward
        </span>
      );
    }
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
          "bg-amber-100 text-amber-800",
        )}
      >
        Deferred
      </span>
    );
  }

  // -------------------------------------------------------------------------
  // Pagination
  // -------------------------------------------------------------------------
  const renderPagination = () => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-muted-foreground">
          Page {page} of {totalPages} ({total.toLocaleString()} wash sales)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {Array.from(
            { length: Math.min(5, totalPages) },
            (_, i) => {
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
            },
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A1A]">Wash Sales</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Disallowed losses under the wash sale rule (IRS Pub. 550).
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-[#E5E5E0]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-50">
                  <ShieldAlert className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Disallowed
                  </p>
                  <p className="text-xl font-semibold text-[#1A1A1A]">
                    {formatCurrency(summary.totalDisallowed)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E5E5E0]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-rose-50">
                  <AlertTriangle className="h-5 w-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Permanently Disallowed
                  </p>
                  <p className="text-xl font-semibold text-[#1A1A1A]">
                    {formatCurrency(summary.totalPermanent)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E5E5E0]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50">
                  <ArrowRightLeft className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Carry-Forward
                  </p>
                  <p className="text-xl font-semibold text-[#1A1A1A]">
                    {summary.carryForwardCount} wash sale
                    {summary.carryForwardCount !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-4">
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by symbol..."
              className="pl-9"
              value={symbolFilter}
              onChange={(e) => setSymbolFilter(e.target.value)}
            />
          </div>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-[#E5E5E0] overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[#1A1A1A]">Symbol</TableHead>
                <TableHead className="text-[#1A1A1A]">Loss Date</TableHead>
                <TableHead className="text-[#1A1A1A] text-right">
                  Loss Amount
                </TableHead>
                <TableHead className="text-[#1A1A1A]">
                  Replacement Date
                </TableHead>
                <TableHead className="text-[#1A1A1A] text-right">
                  Disallowed Amount
                </TableHead>
                <TableHead className="text-[#1A1A1A] text-right">
                  Basis Adj.
                </TableHead>
                <TableHead className="text-[#1A1A1A]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-muted-foreground"
                  >
                    <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                    Loading wash sales...
                  </TableCell>
                </TableRow>
              ) : washSales.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No wash sales found.{" "}
                    {total === 0
                      ? "Compute your tax lots to detect wash sales."
                      : "No wash sales match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                washSales.map((ws) => (
                  <TableRow
                    key={ws.id}
                    className={cn(
                      "hover:bg-[#F9F9F8]",
                      ws.isPermanent && "bg-red-50/50",
                    )}
                  >
                    <TableCell className="font-medium text-sm">
                      {ws.symbol}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {ws.lossDate
                        ? format(new Date(ws.lossDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums text-red-600">
                      {formatCurrency(ws.lossAmount)}
                    </TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {ws.replacementDate
                        ? format(
                            new Date(ws.replacementDate),
                            "MMM d, yyyy",
                          )
                        : "-"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums font-medium text-red-600">
                      {formatCurrency(ws.disallowedAmount)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {ws.basisAdjustment > 0
                        ? formatCurrency(ws.basisAdjustment)
                        : "-"}
                    </TableCell>
                    <TableCell>{getStatusBadge(ws)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {renderPagination()}
      </div>
    </Layout>
  );
}
