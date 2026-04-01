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
  TrendingUp,
  TrendingDown,
  Package,
} from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { format, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Lot {
  id: number;
  symbol: string;
  assetClass: string;
  quantity: number;
  originalQuantity: number;
  costBasisPerShare: number;
  totalCostBasis: number;
  dateAcquired: string;
  adjustedAcquisitionDate: string | null;
  dateSold: string | null;
  holdingPeriod: string | null;
  washSaleAdjustment: number;
  isCovered: boolean;
  source: string;
  isSection1256: boolean;
  status: string;
  brokerageId: string | null;
}

interface Summary {
  totalOpenLots: number;
  totalCostBasis: number;
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

function formatHoldingPeriod(dateAcquired: string, dateSold?: string | null): string {
  const acquired = new Date(dateAcquired);
  const end = dateSold ? new Date(dateSold) : new Date();
  const days = differenceInDays(end, acquired);

  if (days < 0) return "-";
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return `${years}y`;
  return `${years}y ${remainingMonths}mo`;
}

function getHoldingLabel(dateAcquired: string, dateSold?: string | null): string {
  const acquired = new Date(dateAcquired);
  const end = dateSold ? new Date(dateSold) : new Date();
  const oneYear = new Date(acquired);
  oneYear.setFullYear(oneYear.getFullYear() + 1);
  return end > oneYear ? "Long-term" : "Short-term";
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SecuritiesLotsPage() {
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState("open");
  const [symbolFilter, setSymbolFilter] = useState("");

  // Open lots state
  const [openLots, setOpenLots] = useState<Lot[]>([]);
  const [openTotal, setOpenTotal] = useState(0);
  const [openPage, setOpenPage] = useState(1);
  const [openTotalPages, setOpenTotalPages] = useState(1);
  const [openLoading, setOpenLoading] = useState(false);

  // Closed lots state
  const [closedLots, setClosedLots] = useState<Lot[]>([]);
  const [closedTotal, setClosedTotal] = useState(0);
  const [closedPage, setClosedPage] = useState(1);
  const [closedTotalPages, setClosedTotalPages] = useState(1);
  const [closedLoading, setClosedLoading] = useState(false);

  // Summary
  const [summary, setSummary] = useState<Summary>({
    totalOpenLots: 0,
    totalCostBasis: 0,
  });

  const limit = 50;

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchLots = useCallback(
    async (status: "OPEN" | "CLOSED", page: number) => {
      const setLoading = status === "OPEN" ? setOpenLoading : setClosedLoading;
      setLoading(true);

      try {
        const params = new URLSearchParams({
          status,
          page: String(page),
          limit: String(limit),
        });
        if (symbolFilter.trim()) params.set("symbol", symbolFilter.trim());

        const res = await fetch(`/api/securities/lots?${params}`);
        if (!res.ok) throw new Error("Failed to fetch lots");
        const data = await res.json();

        if (status === "OPEN") {
          setOpenLots(data.lots || []);
          setOpenTotal(data.total || 0);
          setOpenTotalPages(data.totalPages || 1);
          if (data.summary) setSummary(data.summary);
        } else {
          setClosedLots(data.lots || []);
          setClosedTotal(data.total || 0);
          setClosedTotalPages(data.totalPages || 1);
        }
      } catch (error) {
        console.error(`Error fetching ${status} lots:`, error);
        toast.error(`Failed to load ${status.toLowerCase()} lots.`);
      } finally {
        setLoading(false);
      }
    },
    [symbolFilter, limit],
  );

  useEffect(() => {
    if (mounted) {
      fetchLots("OPEN", openPage);
    }
  }, [mounted, openPage, fetchLots]);

  useEffect(() => {
    if (mounted) {
      fetchLots("CLOSED", closedPage);
    }
  }, [mounted, closedPage, fetchLots]);

  // Reset pages when filter changes
  useEffect(() => {
    setOpenPage(1);
    setClosedPage(1);
  }, [symbolFilter]);

  if (!mounted) {
    return null;
  }

  const renderPagination = (
    currentPage: number,
    totalPagesVal: number,
    totalVal: number,
    setPageFn: (p: number) => void,
  ) => {
    if (totalPagesVal <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-muted-foreground">
          Page {currentPage} of {totalPagesVal} ({totalVal.toLocaleString()}{" "}
          lots)
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPageFn(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>
          {Array.from(
            { length: Math.min(5, totalPagesVal) },
            (_, i) => {
              let pageNum: number;
              if (totalPagesVal <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPagesVal - 2) {
                pageNum = totalPagesVal - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <Button
                  key={pageNum}
                  variant={pageNum === currentPage ? "default" : "outline"}
                  size="sm"
                  onClick={() => setPageFn(pageNum)}
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
            onClick={() =>
              setPageFn(Math.min(totalPagesVal, currentPage + 1))
            }
            disabled={currentPage >= totalPagesVal}
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
          <h1 className="text-2xl font-semibold text-[#1A1A1A]">Tax Lots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your open and closed tax lots for securities positions.
          </p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-[#E5E5E0]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Open Lots</p>
                  <p className="text-xl font-semibold text-[#1A1A1A]">
                    {summary.totalOpenLots.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E5E5E0]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-50">
                  <TrendingUp className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Total Cost Basis
                  </p>
                  <p className="text-xl font-semibold text-[#1A1A1A]">
                    {formatCurrency(summary.totalCostBasis)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[#E5E5E0]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50">
                  <TrendingDown className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">
                    Closed Lots
                  </p>
                  <p className="text-xl font-semibold text-[#1A1A1A]">
                    {closedTotal.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Symbol filter */}
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Filter by symbol..."
            className="pl-9"
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
          />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="open">
              Open Lots
              {openTotal > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({openTotal})
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="closed">
              Closed Lots
              {closedTotal > 0 && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  ({closedTotal})
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Open Lots Tab */}
          <TabsContent value="open">
            <div className="rounded-lg border border-[#E5E5E0] overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[#1A1A1A]">Symbol</TableHead>
                    <TableHead className="text-[#1A1A1A] text-right">
                      Quantity
                    </TableHead>
                    <TableHead className="text-[#1A1A1A] text-right">
                      Cost Basis/Share
                    </TableHead>
                    <TableHead className="text-[#1A1A1A] text-right">
                      Total Cost Basis
                    </TableHead>
                    <TableHead className="text-[#1A1A1A]">
                      Date Acquired
                    </TableHead>
                    <TableHead className="text-[#1A1A1A]">Source</TableHead>
                    <TableHead className="text-[#1A1A1A]">
                      Holding Period
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-32 text-center text-muted-foreground"
                      >
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading open lots...
                      </TableCell>
                    </TableRow>
                  ) : openLots.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No open lots.{" "}
                        {openTotal === 0
                          ? "Import transactions and compute lots to generate tax lots."
                          : "No lots match your filter."}
                      </TableCell>
                    </TableRow>
                  ) : (
                    openLots.map((lot) => {
                      const holdingLabel = getHoldingLabel(lot.dateAcquired);
                      return (
                        <TableRow key={lot.id} className="hover:bg-[#F9F9F8]">
                          <TableCell className="font-medium text-sm">
                            {lot.symbol}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatQuantity(lot.quantity)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(lot.costBasisPerShare)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(lot.totalCostBasis)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(
                              new Date(lot.dateAcquired),
                              "MMM d, yyyy",
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {lot.source.replace(/_/g, " ")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm tabular-nums">
                                {formatHoldingPeriod(lot.dateAcquired)}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                  holdingLabel === "Long-term"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800",
                                )}
                              >
                                {holdingLabel}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {renderPagination(openPage, openTotalPages, openTotal, setOpenPage)}
          </TabsContent>

          {/* Closed Lots Tab */}
          <TabsContent value="closed">
            <div className="rounded-lg border border-[#E5E5E0] overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[#1A1A1A]">Symbol</TableHead>
                    <TableHead className="text-[#1A1A1A] text-right">
                      Quantity
                    </TableHead>
                    <TableHead className="text-[#1A1A1A] text-right">
                      Cost Basis
                    </TableHead>
                    <TableHead className="text-[#1A1A1A] text-right">
                      Gain/Loss
                    </TableHead>
                    <TableHead className="text-[#1A1A1A]">
                      Date Acquired
                    </TableHead>
                    <TableHead className="text-[#1A1A1A]">Date Sold</TableHead>
                    <TableHead className="text-[#1A1A1A]">
                      Holding Period
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedLoading ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-32 text-center text-muted-foreground"
                      >
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading closed lots...
                      </TableCell>
                    </TableRow>
                  ) : closedLots.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="h-32 text-center text-muted-foreground"
                      >
                        No closed lots yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    closedLots.map((lot) => {
                      const holdingLabel = getHoldingLabel(
                        lot.dateAcquired,
                        lot.dateSold,
                      );
                      // Approximate gain/loss from cost basis data on the lot
                      // (full gain/loss comes from taxable events, but we show
                      // the lot-level perspective here)
                      return (
                        <TableRow key={lot.id} className="hover:bg-[#F9F9F8]">
                          <TableCell className="font-medium text-sm">
                            {lot.symbol}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatQuantity(lot.originalQuantity)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {formatCurrency(lot.totalCostBasis)}
                          </TableCell>
                          <TableCell className="text-right text-sm tabular-nums">
                            {/* Gain/loss not directly on lot; show wash sale adjustment if any */}
                            {lot.washSaleAdjustment !== 0 ? (
                              <span className="text-amber-600">
                                W/S: {formatCurrency(lot.washSaleAdjustment)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {format(
                              new Date(lot.dateAcquired),
                              "MMM d, yyyy",
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {lot.dateSold
                              ? format(new Date(lot.dateSold), "MMM d, yyyy")
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span className="text-sm tabular-nums">
                                {formatHoldingPeriod(
                                  lot.dateAcquired,
                                  lot.dateSold,
                                )}
                              </span>
                              <span
                                className={cn(
                                  "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium",
                                  holdingLabel === "Long-term"
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-amber-100 text-amber-800",
                                )}
                              >
                                {holdingLabel}
                              </span>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {renderPagination(
              closedPage,
              closedTotalPages,
              closedTotal,
              setClosedPage,
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
