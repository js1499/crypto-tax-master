"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ArrowRightLeft,
  Download,
  Filter,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  Plus,
  ArrowUpDown,
  Check,
  AlertCircle,
  EyeOff,
  Calendar,
  CreditCard,
  Pencil,
  ChevronDown,
  X,
  Trash2,
  Merge,
  ExternalLink,
  MoreVertical,
  CheckSquare,
  Square,
  Loader2,
  ArrowUp,
  ArrowDown,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { CSVImport } from "./csv-import";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import type { ImportedData, ImportedTransaction } from "@/types/wallet"; // Fixed import
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useSyncPipeline } from "@/components/sync-pipeline/pipeline-provider";
import { PnLBreakdownChart } from "@/components/pnl-breakdown-chart";
import { YearHeatmap } from "@/components/year-heatmap";
import { getCategoryBadgeColor, formatTypeForDisplay, isOutflow, getCategory } from "@/lib/transaction-categorizer";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { CalendarIcon } from "@/components/icons/calendar-icon";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

// Empty initial transactions - will be loaded from API
const allTransactions: any[] = [];

interface Transaction {
  id: number;
  type: string;
  // Structured out/in fields
  outAsset: string | null;
  outAmount: number | null;
  outPricePerUnit: number | null;
  inAsset: string | null;
  inAmount: number | null;
  inPricePerUnit: number | null;
  valueUsd: number;
  // Cost basis tracking
  costBasisUsd: number | null;
  gainLossUsd: number | null;
  costBasisComputed: boolean;
  // Legacy fields (detail sheet / edit)
  asset: string;
  amount: string;
  price: string;
  value: string;
  date: string;
  status: string;
  exchange: string;
  identified?: boolean;
  valueIdentified?: boolean;
  notes?: string;
  chain?: string;
  txHash?: string;
  incomingAsset?: string | null;
  incomingAmount?: number | null;
  incomingValueUsd?: number | null;
  editVersion?: number;
  [key: string]: any;
}

// Add interface for editable fields
interface EditableFields {
  type: boolean;
  asset: boolean;
  amount: boolean;
  price: boolean;
  value: boolean;
  exchange: boolean;
  date: boolean;
  status: boolean;
  identified: boolean;
}

// Transactions will be loaded from API - no need for mock data

function extractSignature(txHash: string): string {
  // tx_hash suffixes: -native-, -token-, -swap, -main, -nftsale, -nftsale-seller, etc.
  // Solana signatures are base58 (no dashes), so the signature is everything before the first dash.
  const dashIdx = txHash.indexOf('-');
  return dashIdx >= 0 ? txHash.substring(0, dashIdx) : txHash;
}

function getExplorerUrl(chain: string | undefined, txHash: string): string {
  const sig = extractSignature(txHash);

  switch (chain?.toLowerCase()) {
    case "solana":
      return `https://solscan.io/tx/${sig}`;
    case "ethereum":
    case "eth":
      return `https://etherscan.io/tx/${sig}`;
    case "polygon":
      return `https://polygonscan.com/tx/${sig}`;
    case "arbitrum":
      return `https://arbiscan.io/tx/${sig}`;
    case "optimism":
      return `https://optimistic.etherscan.io/tx/${sig}`;
    case "base":
      return `https://basescan.org/tx/${sig}`;
    case "bsc":
      return `https://bscscan.com/tx/${sig}`;
    case "avalanche":
      return `https://snowtrace.io/tx/${sig}`;
    default:
      return `https://solscan.io/tx/${sig}`;
  }
}

// Define transaction type from ImportedData
function TransactionsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { refreshKey } = useSyncPipeline();
  const [mounted, setMounted] = useState(false);
  const [isPaidPlan, setIsPaidPlan] = useState<boolean | null>(null); // null = loading
  const [searchTerm, setSearchTerm] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState("all");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [sortOption, setSortOption] = useState("date-desc");
  const [showOnlyUnlabelled, setShowOnlyUnlabelled] = useState(false);
  const [hideZeroTransactions, setHideZeroTransactions] = useState(false);
  const [advancedView, setAdvancedView] = useState(false);
  const [perWalletTracking, setPerWalletTracking] = useState(true);
  const [hideSpamTransactions, setHideSpamTransactions] = useState(false);
  const [onlyWithGainLoss, setOnlyWithGainLoss] = useState(false);
  const [isAddTransactionOpen, setIsAddTransactionOpen] = useState(false);
  const [isComputingCostBasis, setIsComputingCostBasis] = useState(false);

  // Added states for transaction editing
  const [editingTransactionId, setEditingTransactionId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>("");
  const [editableFields, setEditableFields] = useState<EditableFields>({
    type: false,
    asset: false,
    amount: false,
    price: false,
    value: false,
    exchange: false,
    date: false,
    status: false,
    identified: false
  });

  // Transaction detail sheet state
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [isDetailSheetOpen, setIsDetailSheetOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");

  // Bulk selection state
  const [selectedTransactionIds, setSelectedTransactionIds] = useState<Set<number>>(new Set());
  const [isBulkMode, setIsBulkMode] = useState(false);

  // Edit history state
  const [editHistory, setEditHistory] = useState<Array<{
    version: number;
    editedAt: string;
    isRevert: boolean;
    changes: Array<{ fieldName: string; oldValue: string | null; newValue: string | null }>;
  }>>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<Array<{ ids: number[]; reason: string; similarity: number }>>([]);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);

  // Delete all transactions state
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // UI mode state
  const [showAdvancedColumns, setShowAdvancedColumns] = useState(true);
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [groupBy, setGroupBy] = useState<"none" | "month" | "asset" | "type" | "source">("none");
  const [pnlView, setPnlView] = useState<"summary" | "detailed">("summary");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [tableDensity, setTableDensity] = useState<"condensed" | "regular" | "spacious">("regular");

  // Wallet filter state
  const [walletFilter, setWalletFilter] = useState("");
  const [wallets, setWallets] = useState<Array<{ id: string; name: string; address: string; provider: string }>>([]);

  // Date range filter state
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Chain, source, and value range filter state
  const [chainFilter, setChainFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [valueMin, setValueMin] = useState("");
  const [valueMax, setValueMax] = useState("");
  const [availableChains, setAvailableChains] = useState<string[]>([]);
  const [availableSources, setAvailableSources] = useState<string[]>([]);

  // Stats state from API
  const [stats, setStats] = useState<{
    buyCount: number;
    sellCount: number;
    transferInCount: number;
    transferOutCount: number;
    swapCount: number;
    otherCount: number;
    unlabelledCount: number;
    identifiedPercentage: number;
    valueIdentifiedPercentage: number;
    pnl: { totalCostBasis: number; totalProceeds: number; netGain: number; gainsByAsset: Array<{ asset: string; amount: number }>; lossesByAsset: Array<{ asset: string; amount: number }> };
    income: { count: number; totalValueUsd: number; byAsset: Array<{ asset: string; amount: number }> };
    weeklyActivity: Array<{ weekStart: string; count: number; netGainLoss: number }>;
  } | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // New transaction form state
  const [newTransaction, setNewTransaction] = useState({
    exchange: "",
    asset: "",
    amount: "",
    price: "",
    date: format(new Date(), "yyyy-MM-dd"),
    time: format(new Date(), "HH:mm"),
    value: "",
    type: "Buy"
  });

  useEffect(() => {
    console.log("TransactionsPage component mounted");
    setMounted(true);
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
  }, [status, router]);

  // Fetch wallets for filter dropdown
  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/wallets")
      .then(res => res.json())
      .then(data => {
        if (data.wallets) {
          setWallets(data.wallets.map((w: any) => ({
            id: w.id,
            name: w.name,
            address: w.address,
            provider: w.provider,
          })));
        }
      })
      .catch(() => {});
  }, [status]);

  // Fetch transactions from API
  useEffect(() => {
    // Don't fetch if not authenticated or still loading
    if (status !== "authenticated" || !mounted) {
      return;
    }

    const fetchTransactions = async () => {
      setIsLoadingTransactions(true);
      try {
        // When grouping, fetch more rows so collapsing groups still shows data
        const fetchLimit = groupBy !== "none" ? 500 : itemsPerPage;
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: fetchLimit.toString(),
          ...(searchTerm && { search: searchTerm }),
          ...(filter !== "all" && { filter }),
          ...(sortOption && { sort: sortOption }),
          ...(showOnlyUnlabelled && { showOnlyUnlabelled: "true" }),
          ...(hideZeroTransactions && { hideZeroTransactions: "true" }),
          ...(hideSpamTransactions && { hideSpamTransactions: "true" }),
          ...(onlyWithGainLoss && { onlyWithGainLoss: "true" }),
          ...(walletFilter && { wallet: walletFilter }),
          ...(dateFrom && { dateFrom: format(dateFrom, "yyyy-MM-dd") }),
          ...(dateTo && { dateTo: format(dateTo, "yyyy-MM-dd") }),
          ...(chainFilter && { chain: chainFilter }),
          ...(sourceFilter && { source: sourceFilter }),
          ...(valueMin && { valueMin }),
          ...(valueMax && { valueMax }),
        });

        const response = await fetch(`/api/transactions?${params.toString()}`);
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          // Handle authentication errors
          if (response.status === 401) {
            toast.error("Please log in to view transactions");
            router.push("/login");
            return;
          }

          throw new Error(errorData.details || errorData.error || "Failed to fetch transactions");
        }

        const data = await response.json();
        if (data.status === "success") {
          // Convert API response to Transaction format
          const apiTransactions: Transaction[] = data.transactions.map((tx: any) => ({
            id: tx.id,
            type: tx.type,
            // Structured out/in fields
            outAsset: tx.outAsset ?? null,
            outAmount: tx.outAmount ?? null,
            outPricePerUnit: tx.outPricePerUnit ?? null,
            inAsset: tx.inAsset ?? null,
            inAmount: tx.inAmount ?? null,
            inPricePerUnit: tx.inPricePerUnit ?? null,
            valueUsd: tx.valueUsd ?? 0,
            // Cost basis tracking
            costBasisUsd: tx.costBasisUsd ?? null,
            gainLossUsd: tx.gainLossUsd ?? null,
            costBasisComputed: tx.costBasisComputed ?? false,
            // Legacy fields
            asset: tx.asset,
            amount: tx.amount,
            price: tx.price,
            value: tx.value,
            date: tx.date,
            status: tx.status,
            exchange: tx.exchange,
            identified: tx.identified || false,
            valueIdentified: tx.valueIdentified || false,
            notes: tx.notes || "",
            chain: tx.chain,
            txHash: tx.txHash,
            incomingAsset: tx.incomingAsset ?? null,
            incomingAmount: tx.incomingAmount ?? null,
            incomingValueUsd: tx.incomingValueUsd ?? null,
            editVersion: tx.editVersion ?? tx.edit_version ?? 0,
          }));

          setTransactions(apiTransactions);
          setFilteredTransactions(apiTransactions);
          if (data.plan) setIsPaidPlan(data.plan.isPaid);
          setTotalCount(data.pagination.totalCount);
          setTotalPages(data.pagination.totalPages);
          if (data.stats) {
            setStats(data.stats);
            if (data.stats.chains) setAvailableChains(data.stats.chains);
            if (data.stats.sources) setAvailableSources(data.stats.sources);
          }

          // Reset to page 1 if current page is beyond total pages
          // Use a ref to prevent infinite loop
          if (currentPage > data.pagination.totalPages && data.pagination.totalPages > 0 && currentPage !== 1) {
            // Use setTimeout to avoid state update during render
            setTimeout(() => setCurrentPage(1), 0);
          }
        } else {
          throw new Error(data.error || "Failed to load transactions");
        }
      } catch (error) {
        if (process.env.NODE_ENV === "development") {
          console.error("Error fetching transactions:", error);
        }
        const errorMessage = error instanceof Error ? error.message : "Failed to load transactions";
        toast.error(errorMessage);
        // Keep existing transactions on error
      } finally {
        setIsLoadingTransactions(false);
      }
    };

    fetchTransactions();
  }, [
    status,
    mounted,
    currentPage,
    itemsPerPage,
    searchTerm,
    filter,
    sortOption,
    showOnlyUnlabelled,
    hideZeroTransactions,
    hideSpamTransactions,
    onlyWithGainLoss,
    groupBy,
    walletFilter,
    dateFrom,
    dateTo,
    chainFilter,
    sourceFilter,
    valueMin,
    valueMax,
    router,
    refreshKey, // refetch when pipeline completes
  ]);

  // Note: Filtering, sorting, and search are now handled server-side via API
  // The transactions state contains the current page of filtered/sorted results
  // When filters/search/sort change, the useEffect will refetch from API

  // Show loading state while checking authentication
  if (status === "loading" || !mounted) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Show message if not authenticated (will redirect, but show something in the meantime)
  if (status === "unauthenticated") {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Calculate transaction identification statistics (from current page)
  const identifiedCount = transactions.filter(tx => tx.identified).length;
  const currentPageCount = transactions.length;
  // Note: For accurate stats, we'd need a separate API call, but for now use current page data
  const needsIdentificationCount = currentPageCount - identifiedCount;
  const identificationPercentage = currentPageCount > 0
    ? Math.round((identifiedCount / currentPageCount) * 100)
    : 0;

  // Calculate value identification statistics
  const valueIdentifiedCount = transactions.filter(tx => tx.valueIdentified).length;
  const valueIdentificationPercentage = currentPageCount > 0
    ? Math.round((valueIdentifiedCount / currentPageCount) * 100)
    : 100;

  // Pagination calculations (now using server-side pagination)
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + transactions.length, totalCount);
  const currentTransactions = transactions; // Already paginated from server

  // Group transactions (when "none", single group with no header)
  const groupedTransactions = (() => {
    if (groupBy === "none") return [{ key: "__all__", label: "", transactions: currentTransactions, totalGainLoss: 0 }];

    const groups = new Map<string, { key: string; label: string; transactions: Transaction[]; totalGainLoss: number }>();

    currentTransactions.forEach(tx => {
      let key: string;
      let label: string;

      switch (groupBy) {
        case "month": {
          const d = new Date(tx.date);
          key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
          break;
        }
        case "asset":
          key = (tx.outAsset || tx.inAsset || "Unknown").toUpperCase();
          label = key;
          break;
        case "type":
          key = tx.type;
          label = formatTypeForDisplay(tx.type);
          break;
        case "source":
          key = tx.exchange || "Unknown";
          label = shortenSource(tx.exchange || "Unknown");
          break;
        default:
          key = "all";
          label = "All";
      }

      if (!groups.has(key)) {
        groups.set(key, { key, label, transactions: [], totalGainLoss: 0 });
      }
      const group = groups.get(key)!;
      group.transactions.push(tx);
      group.totalGainLoss += tx.gainLossUsd ?? 0;
    });

    return Array.from(groups.values());
  })();

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // Year selector computed value
  const yearValue = dateFrom && dateTo
    && dateFrom.getMonth() === 0 && dateFrom.getDate() === 1
    && dateTo.getMonth() === 11 && dateTo.getDate() === 31
    && dateFrom.getFullYear() === dateTo.getFullYear()
    ? dateFrom.getFullYear().toString()
    : "all";

  const handleYearChange = (value: string) => {
    if (value === "all") {
      setDateFrom(undefined);
      setDateTo(undefined);
    } else {
      const year = parseInt(value);
      setDateFrom(new Date(year, 0, 1));
      setDateTo(new Date(year, 11, 31));
    }
    setCurrentPage(1);
  };

  // Active filter count for the Filters button badge
  const activeFilterCount = [
    filter !== "all",
    walletFilter !== "",
    showOnlyUnlabelled,
    hideZeroTransactions,
    hideSpamTransactions,
    onlyWithGainLoss,
    sortOption !== "date-desc",
    chainFilter !== "",
    sourceFilter !== "",
    valueMin !== "",
    valueMax !== "",
  ].filter(Boolean).length;

  // Change page handler
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Change items per page handler
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Handle cost basis computation
  const handleComputeCostBasis = async () => {
    setIsComputingCostBasis(true);
    try {
      const response = await fetch("/api/cost-basis/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ perWallet: perWalletTracking }),
      });
      const data = await response.json();
      if (data.status === "success") {
        toast.success(`Cost basis computed successfully (${data.method})`);
        setCurrentPage(1);
      } else {
        toast.error("Failed to compute cost basis. Please try again.");
      }
    } catch (error) {
      toast.error("Failed to compute cost basis. Please try again.");
    } finally {
      setIsComputingCostBasis(false);
    }
  };

  // Handle import completion
  const handleImportComplete = (data: ImportedData) => {
    const count = typeof data.transactions === "number" ? data.transactions : data.transactions.length;
    toast.success(`Added ${count} new transactions`);
    setIsImportOpen(false);
    // Refresh transactions from API
    setCurrentPage(1);
    // The useEffect will automatically refetch

    // Complete onboarding step if active
    try {
      const { useOnboarding } = require("@/components/onboarding/onboarding-provider");
      const onboarding = useOnboarding();
      if (onboarding.isActive) {
        onboarding.completeCurrentStep();
      }
    } catch {
      // Onboarding not available, ignore
    }
  };

  // Handle export
  // Delete all transactions
  const handleDeleteAll = async () => {
    setIsDeletingAll(true);
    try {
      const response = await fetch("/api/transactions/delete-all", {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        // Handle rate limiting with better error message
        throw new Error("Failed to delete transactions");
      }

      const data = await response.json();
      if (data.status === "success") {
        toast.success("All transactions deleted successfully");
        setIsDeleteAllOpen(false);
        setCurrentPage(1);
        setTransactions([]);
        setFilteredTransactions([]);
        setTotalCount(0);
      } else {
        throw new Error("Failed to delete transactions");
      }
    } catch (error) {
      console.error("Error deleting all transactions:", error);
      toast.error("Failed to delete transactions. Please try again.");
    } finally {
      setIsDeletingAll(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams({
        ...(searchTerm && { search: searchTerm }),
        ...(filter !== "all" && { filter }),
        ...(sortOption && { sort: sortOption }),
        ...(showOnlyUnlabelled && { showOnlyUnlabelled: "true" }),
        ...(hideZeroTransactions && { hideZeroTransactions: "true" }),
        ...(hideSpamTransactions && { hideSpamTransactions: "true" }),
        ...(onlyWithGainLoss && { onlyWithGainLoss: "true" }),
        ...(walletFilter && { wallet: walletFilter }),
        ...(dateFrom && { dateFrom: format(dateFrom, "yyyy-MM-dd") }),
        ...(dateTo && { dateTo: format(dateTo, "yyyy-MM-dd") }),
        ...(chainFilter && { chain: chainFilter }),
        ...(sourceFilter && { source: sourceFilter }),
        ...(valueMin && { valueMin }),
        ...(valueMax && { valueMax }),
      });

      const response = await fetch(`/api/transactions/export?${params.toString()}`);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || "Export failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "transactions.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      toast.success("Transactions exported successfully!");
    } catch (error) {
      toast.error("Failed to export transactions");
    } finally {
      setIsExporting(false);
    }
  };

  // Toggle filter handlers
  const toggleUnlabelledFilter = () => {
    setShowOnlyUnlabelled(!showOnlyUnlabelled);
  };

  const toggleHideZeroTransactions = () => {
    setHideZeroTransactions(!hideZeroTransactions);
  };

  const toggleHideSpamTransactions = () => {
    setHideSpamTransactions(!hideSpamTransactions);
  };

  // Handle form changes
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setNewTransaction(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // Handle transaction addition
  const handleAddTransaction = async () => {
    try {
      // TODO: Create API endpoint for adding transactions
      // For now, just show a message
      toast.success("Transaction addition will be implemented via API endpoint");
      setIsAddTransactionOpen(false);
      setNewTransaction({
        exchange: "",
        asset: "",
        amount: "",
        price: "",
        date: format(new Date(), "yyyy-MM-dd"),
        time: format(new Date(), "HH:mm"),
        value: "",
        type: "Buy"
      });
      // Refresh transactions from API
      setCurrentPage(1);
    } catch (error) {
      toast.error("Failed to add transaction");
    }
  };

  // Add new handlers for editing transactions
  const handleStartEditing = (id: number, field: string, currentValue: string) => {
    setEditingTransactionId(id);
    setEditingField(field);

    // Format the value appropriately for editing based on field type
    if (field === 'date') {
      // Convert date string to just the date portion for the date input
      const dateObj = new Date(currentValue);
      setEditingValue(format(dateObj, 'yyyy-MM-dd'));
    } else if (field === 'price' || field === 'value') {
      // Strip currency symbols for numeric inputs
      setEditingValue(currentValue.replace(/[$,]/g, '').replace('-', ''));
    } else if (field === 'amount') {
      // Extract just the numeric part of the amount
      const numericPart = currentValue.split(' ')[0];
      setEditingValue(numericPart);
    } else {
      setEditingValue(currentValue);
    }
  };

  const handleCancelEditing = () => {
    setEditingTransactionId(null);
    setEditingField(null);
    setEditingValue("");
  };

  const handleSaveEdit = async (id: number, field: keyof Transaction) => {
    try {
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;

      // Prepare update payload
      let updatePayload: any = {};

      if (field === 'type') {
        updatePayload.type = editingValue;
      } else if (field === 'asset') {
        updatePayload.asset_symbol = editingValue;
      } else if (field === 'amount') {
        const amountValue = parseFloat(editingValue);
        updatePayload.amount_value = amountValue;
      } else if (field === 'price') {
        updatePayload.price_per_unit = parseFloat(editingValue);
      } else if (field === 'value') {
        const numValue = parseFloat(editingValue);
        const isNegative = isOutflow(tx.type);
        updatePayload.value_usd = isNegative ? -numValue : numValue;
      } else if (field === 'date') {
        const originalDate = new Date(tx.date);
        const newDate = new Date(editingValue);
        newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds());
        updatePayload.tx_timestamp = newDate.toISOString();
      } else if (field === 'exchange') {
        updatePayload.source = editingValue;
      } else if (field === 'status') {
        updatePayload.status = editingValue;
      } else if (field === 'identified') {
        updatePayload.identified = editingValue === 'true';
      }

      // Call API to update
      const response = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update transaction");
      }

      const data = await response.json();
      if (data.status === "success") {
        // Update local state
        const updatedTransactions = transactions.map(t =>
          t.id === id ? data.transaction : t
        );
        setTransactions(updatedTransactions);
        setFilteredTransactions(updatedTransactions);

        setEditingTransactionId(null);
        setEditingField(null);
        setEditingValue("");
        toast.success(`Transaction ${field} updated successfully!`);

        // Refresh if detail sheet is open
        if (selectedTransaction?.id === id) {
          setSelectedTransaction(data.transaction);
        }
      }
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("Failed to update transaction");
    }
  };

  const handleChangeDropdownValue = async (id: number, field: string, newValue: string) => {
    try {
      const tx = transactions.find(t => t.id === id);
      if (!tx) return;

      let updatePayload: any = {};

      if (field === 'type') {
        updatePayload.type = newValue;
        // Adjust value sign if needed based on transaction type
        // OUTFLOWS (money/crypto leaving): Buy, DCA, Send, Withdraw, Bridge, Swap - stored as negative
        // INFLOWS (money/crypto coming in): Sell, Receive - stored as positive
        const currentValue = parseFloat(tx.value.replace(/[-$,]/g, ''));
        if (isOutflow(newValue)) {
          updatePayload.value_usd = -Math.abs(currentValue);
        } else {
          updatePayload.value_usd = Math.abs(currentValue);
        }
      } else if (field === 'status') {
        updatePayload.status = newValue;
      } else if (field === 'identified') {
        updatePayload.identified = newValue === 'Identified';
      }

      const response = await fetch(`/api/transactions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updatePayload),
      });

      if (!response.ok) {
        throw new Error("Failed to update transaction");
      }

      const data = await response.json();
      if (data.status === "success") {
        const updatedTransactions = transactions.map(t =>
          t.id === id ? data.transaction : t
        );
        setTransactions(updatedTransactions);
        setFilteredTransactions(updatedTransactions);
        toast.success(`Transaction ${field} updated to ${newValue}!`);

        if (selectedTransaction?.id === id) {
          setSelectedTransaction(data.transaction);
        }
      }
    } catch (error) {
      console.error("Error updating transaction:", error);
      toast.error("Failed to update transaction");
    }
  };

  // Toggle hovering state for editable fields
  const handleMouseEnter = (field: keyof EditableFields) => {
    setEditableFields(prev => ({
      ...prev,
      [field]: true
    }));
  };

  const handleMouseLeave = (field: keyof EditableFields) => {
    setEditableFields(prev => ({
      ...prev,
      [field]: false
    }));
  };

  // Open transaction detail sheet
  const handleOpenDetail = (transaction: Transaction) => {
    setSelectedTransaction(transaction);
    setNotesValue(transaction.notes || "");
    setEditHistory([]);
    setShowHistory(false);
    setIsDetailSheetOpen(true);
  };

  // Save notes
  const handleSaveNotes = async () => {
    if (!selectedTransaction) return;

    try {
      const response = await fetch(`/api/transactions/${selectedTransaction.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: notesValue }),
      });

      if (!response.ok) {
        throw new Error("Failed to save notes");
      }

      const data = await response.json();
      if (data.status === "success") {
        const updatedTransactions = transactions.map(t =>
          t.id === selectedTransaction.id ? data.transaction : t
        );
        setTransactions(updatedTransactions);
        setFilteredTransactions(updatedTransactions);
        setSelectedTransaction(data.transaction);
        setEditingNotes(false);
        toast.success("Notes saved successfully!");
      }
    } catch (error) {
      console.error("Error saving notes:", error);
      toast.error("Failed to save notes");
    }
  };

  // Fetch edit history for a transaction
  const fetchEditHistory = async (transactionId: number) => {
    setIsHistoryLoading(true);
    try {
      const response = await fetch(`/api/transactions/${transactionId}/history`);
      if (response.ok) {
        const data = await response.json();
        setEditHistory(data.history || []);
      }
    } catch (error) {
      console.error("Error fetching history:", error);
    } finally {
      setIsHistoryLoading(false);
    }
  };

  // Undo last edit
  const handleUndoLastEdit = async (transactionId: number) => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ undo: true }),
      });
      if (response.ok) {
        const data = await response.json();
        toast.success("Edit reverted successfully");
        // Refresh the transaction in the list
        setCurrentPage(currentPage);
        if (selectedTransaction?.id === transactionId) {
          setSelectedTransaction(data.transaction);
        }
      } else {
        const err = await response.json();
        toast.error(err.error || "Failed to revert");
      }
    } catch {
      toast.error("Failed to revert edit");
    }
  };

  // Revert to a specific version
  const handleRevertToVersion = async (transactionId: number, version: number) => {
    try {
      const response = await fetch(`/api/transactions/${transactionId}/revert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion: version }),
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Reverted to version ${version}`);
        setCurrentPage(currentPage);
        if (selectedTransaction?.id === transactionId) {
          setSelectedTransaction(data.transaction);
          fetchEditHistory(transactionId);
        }
      } else {
        toast.error("Failed to revert");
      }
    } catch {
      toast.error("Failed to revert");
    }
  };

  // Delete transaction
  const handleDeleteTransaction = async (id: number) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    try {
      const response = await fetch(`/api/transactions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete transaction");
      }

      toast.success("Transaction deleted successfully!");
      setIsDetailSheetOpen(false);
      setSelectedTransaction(null);

      // Refresh transactions
      setCurrentPage(1);
    } catch (error) {
      console.error("Error deleting transaction:", error);
      toast.error("Failed to delete transaction");
    }
  };

  // Bulk operations
  const handleBulkSelect = (id: number, checked: boolean) => {
    const newSelected = new Set(selectedTransactionIds);
    if (checked) {
      newSelected.add(id);
    } else {
      newSelected.delete(id);
    }
    setSelectedTransactionIds(newSelected);
  };

  const handleBulkSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedTransactionIds(new Set(transactions.map(t => t.id)));
    } else {
      setSelectedTransactionIds(new Set());
    }
  };

  const handleBulkUpdate = async (updates: any) => {
    if (selectedTransactionIds.size === 0) {
      toast.error("No transactions selected");
      return;
    }

    try {
      const response = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "update",
          transactionIds: Array.from(selectedTransactionIds),
          updates,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update transactions");
      }

      const data = await response.json();
      toast.success(data.message || "Transactions updated successfully!");
      setSelectedTransactionIds(new Set());
      setIsBulkMode(false);
      setCurrentPage(1); // Refresh
    } catch (error) {
      console.error("Error updating transactions:", error);
      toast.error("Failed to update transactions");
    }
  };

  const handleBulkDelete = async () => {
    if (selectedTransactionIds.size === 0) {
      toast.error("No transactions selected");
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedTransactionIds.size} transaction(s)?`)) {
      return;
    }

    try {
      const response = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "delete",
          transactionIds: Array.from(selectedTransactionIds),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to delete transactions");
      }

      const data = await response.json();
      toast.success(data.message || "Transactions deleted successfully!");
      setSelectedTransactionIds(new Set());
      setIsBulkMode(false);
      setCurrentPage(1); // Refresh
    } catch (error) {
      console.error("Error deleting transactions:", error);
      toast.error("Failed to delete transactions");
    }
  };

  // Merge duplicates
  const handleMergeDuplicates = async (ids: number[], keepId: number) => {
    try {
      const response = await fetch("/api/transactions/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "merge",
          transactionIds: ids,
          mergeIntoId: keepId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to merge transactions");
      }

      const data = await response.json();
      toast.success(data.message || "Transactions merged successfully!");
      setIsDuplicatesOpen(false);
      setCurrentPage(1); // Refresh
    } catch (error) {
      console.error("Error merging transactions:", error);
      toast.error("Failed to merge transactions");
    }
  };

  // Transaction type options organized by category
  const typeCategories = [
    { label: "Trading", types: ["Buy", "Sell", "Swap", "DCA"] },
    { label: "Transfers", types: ["Send", "Receive", "Transfer", "Bridge", "Deposit", "Withdraw"] },
    { label: "NFTs", types: ["NFT Purchase", "NFT Sale", "NFT Activity", "Mint", "Burn"] },
    { label: "DeFi", types: ["Add Liquidity", "Remove Liquidity", "Wrap", "Unwrap", "DeFi Setup", "Margin Buy", "Margin Sell", "Liquidation"] },
    { label: "Income", types: ["Staking Reward", "Mining Reward", "Airdrop", "Interest", "Payment"] },
    { label: "Staking", types: ["Stake", "Unstake"] },
    { label: "Gambling", types: ["Place Bet", "Place Sol Bet", "Create Bet", "Create Raffle", "Buy Tickets"] },
    { label: "Other", types: ["Zero Transaction", "Spam", "Self", "Approve"] },
  ];
  // Flat list for Select components (detail sheet, etc.)
  const transactionTypes = typeCategories.flatMap(c => c.types.map(t => ({ value: t, label: t })));

  // Blur wrapper for monetary values on free plan
  const BlurValue = ({ children }: { children: React.ReactNode }) => {
    if (isPaidPlan !== false) return <>{children}</>;
    return <span className="blur-md select-none">{children}</span>;
  };

  // Helper: format amount for display
  const formatAmount = (amount: number | null) => {
    if (amount == null) return null;
    if (amount === 0) return "0";
    if (amount < 0.000001 && amount > 0) return "<0.000001";
    if (amount < 1) return amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    if (amount >= 1000000) return amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
  };

  // Asset bar segment color helper (solid colors for the stacked bar)
  const getAssetBarColor = (symbol: string): string => {
    const s = (symbol || "").toUpperCase();
    if (s === "SOL" || s === "WSOL") return "#9333EA";
    if (s === "ETH" || s === "WETH") return "#2563EB";
    if (s === "BTC" || s === "WBTC") return "#EA580C";
    if (s === "USDC") return "#0D9488";
    if (s === "USDT") return "#16A34A";
    if (s === "JUP") return "#16A34A";
    if (s === "BONK") return "#DB2777";
    if (s === "WIF") return "#F472B6";
    // Deterministic color for unknown assets based on hash
    const hash = s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const colors = ["#2563EB", "#9333EA", "#EA580C", "#0D9488", "#DB2777", "#CA8A04", "#4F46E5", "#16A34A"];
    return colors[hash % colors.length];
  };

  // Asset icon: 18px colored circle with first letter
  const getAssetIconColor = (symbol: string): string => {
    const s = (symbol || "").toUpperCase();
    if (s === "SOL" || s === "WSOL") return "#9333EA";
    if (s === "ETH" || s === "WETH") return "#2563EB";
    if (s === "BTC" || s === "WBTC") return "#EA580C";
    if (s === "USDC" || s === "USDT" || s === "PYUSD" || s === "DAI") return "#0D9488";
    if (s === "JUP") return "#16A34A";
    if (s === "BONK" || s === "WIF" || s === "FWOG") return "#DB2777";
    const hash = s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const colors = ["#2563EB", "#9333EA", "#EA580C", "#0D9488", "#DC2626", "#CA8A04", "#4F46E5", "#16A34A", "#DB2777"];
    return colors[hash % colors.length];
  };

  const AssetIcon = ({ symbol }: { symbol: string }) => (
    <span
      className="inline-flex items-center justify-center h-[18px] w-[18px] rounded-full text-[8px] font-bold text-white shrink-0"
      style={{ backgroundColor: getAssetIconColor(symbol) }}
    >
      {(symbol || "?")[0]}
    </span>
  );

  // Asset symbol color helper
  const getAssetColor = (symbol: string): string => {
    const s = (symbol || "").toUpperCase();
    if (s === "SOL" || s === "WSOL") return "text-pill-purple-text dark:text-[#A855F7]";
    if (s === "ETH" || s === "WETH") return "text-pill-blue-text dark:text-[#3B82F6]";
    if (s === "BTC" || s === "WBTC") return "text-pill-orange-text dark:text-[#F97316]";
    if (s === "USDC" || s === "USDT" || s === "PYUSD" || s === "DAI") return "text-pill-teal-text dark:text-[#14B8A6]";
    if (s === "JUP") return "text-pill-green-text dark:text-[#22C55E]";
    if (s === "BONK" || s === "WIF" || s === "FWOG") return "text-pill-pink-text dark:text-[#F472B6]";
    return "text-[#1A1A1A] dark:text-[#F5F5F5]";
  };

  // Source/exchange icon helper
  // Sources with logo files in /public/logos/ get <img> badges
  // Others fall back to gradient text badges
  // Shorten source display names
  const shortenSource = (source: string): string => {
    const map: Record<string, string> = {
      "Solana Wallet": "Solana",
      "Ethereum Wallet": "Ethereum",
      "Bitcoin Wallet": "Bitcoin",
      "Coinbase Exchange": "Coinbase",
      "Binance Exchange": "Binance",
      "CSV Import": "CSV",
    };
    return map[source] || source.replace(/ Wallet$/i, "").replace(/ Exchange$/i, "");
  };

  const sourceLogoFiles: Record<string, string> = {
    SOL: "/logos/SOL.png",
    ETH: "/logos/ETH.png",
    BTC: "/logos/BTC.png",
  };

  const getSourceIcon = (exchange: string): { key: string; hasLogo: boolean } | null => {
    const src = (exchange || "").toLowerCase();
    if (src.includes("solana") || src.includes("sol")) return { key: "SOL", hasLogo: true };
    if (src.includes("ethereum") || src.includes("eth")) return { key: "ETH", hasLogo: true };
    if (src.includes("bitcoin") || src.includes("btc")) return { key: "BTC", hasLogo: true };
    if (src.includes("coinbase")) return { key: "CB", hasLogo: false };
    if (src.includes("binance")) return { key: "BN", hasLogo: false };
    if (src.includes("phantom")) return { key: "PH", hasLogo: false };
    if (src.includes("jupiter") || src.includes("jup")) return { key: "JUP", hasLogo: false };
    if (src.includes("raydium")) return { key: "RAY", hasLogo: false };
    if (src.includes("orca")) return { key: "ORC", hasLogo: false };
    if (src.includes("csv")) return { key: "CSV", hasLogo: false };
    if (src.includes("helius")) return { key: "HEL", hasLogo: false };
    return null;
  };

  const sourceIconColors: Record<string, string> = {
    CB: "bg-pill-blue-bg text-pill-blue-text",
    BN: "bg-pill-yellow-bg text-pill-yellow-text",
    PH: "bg-pill-purple-bg text-pill-purple-text",
    JUP: "bg-pill-teal-bg text-pill-teal-text",
    RAY: "bg-pill-blue-bg text-pill-blue-text",
    ORC: "bg-pill-gray-bg text-pill-gray-text",
    CSV: "bg-pill-gray-bg text-pill-gray-text",
    HEL: "bg-pill-orange-bg text-pill-orange-text",
  };

  // Source pill color mapping (Horizon pill style)
  const getSourcePillColor = (exchange: string): string => {
    const src = (exchange || "").toLowerCase();
    if (src.includes("solana") || src.includes("sol")) return "bg-pill-purple-bg text-pill-purple-text dark:bg-[rgba(147,51,234,0.12)] dark:text-[#A855F7]";
    if (src.includes("ethereum") || src.includes("eth")) return "bg-pill-blue-bg text-pill-blue-text dark:bg-[rgba(37,99,235,0.12)] dark:text-[#3B82F6]";
    if (src.includes("bitcoin") || src.includes("btc")) return "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]";
    if (src.includes("coinbase")) return "bg-pill-blue-bg text-pill-blue-text dark:bg-[rgba(37,99,235,0.12)] dark:text-[#3B82F6]";
    if (src.includes("binance")) return "bg-pill-yellow-bg text-pill-yellow-text dark:bg-[rgba(202,138,4,0.12)] dark:text-[#EAB308]";
    if (src.includes("helius")) return "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]";
    if (src.includes("csv")) return "bg-pill-gray-bg text-pill-gray-text dark:bg-[rgba(75,85,99,0.12)] dark:text-[#9CA3AF]";
    return "bg-pill-gray-bg text-pill-gray-text dark:bg-[rgba(75,85,99,0.12)] dark:text-[#9CA3AF]";
  };

  // Table density classes
  const densityClasses = {
    condensed: "py-[0.2rem] text-[0.72rem]",
    regular: "py-[0.425rem]",
    spacious: "py-3",
  };

  // Column sort handler
  const handleColumnSort = (column: string) => {
    const currentDir = sortOption.startsWith(column + "-") ? sortOption.split("-")[1] : null;
    const newDir = currentDir === "asc" ? "desc" : currentDir === "desc" ? "asc" : "asc";
    setSortOption(`${column}-${newDir}`);
    setCurrentPage(1);
  };

  const getSortIndicator = (column: string) => {
    if (!sortOption.startsWith(column + "-")) return null;
    return sortOption.endsWith("-asc")
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* ── Score-First Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-[28px] font-light tracking-[-0.02em] text-[#1A1A1A] dark:text-[#F5F5F5]">Transactions</h1>
              {stats && (
                stats.unlabelledCount === 0 ? (
                  <span className="inline-flex items-center gap-1 rounded-md bg-pill-green-bg dark:bg-[rgba(22,163,74,0.12)] text-pill-green-text dark:text-[#22C55E] px-2.5 py-1 text-xs font-medium">
                    <Check className="h-3 w-3" />
                    All Identified
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-pill-orange-bg dark:bg-[rgba(234,88,12,0.12)] text-pill-orange-text dark:text-[#F97316] px-2.5 py-1 text-xs font-medium">
                    <AlertCircle className="h-3 w-3" />
                    {stats.unlabelledCount} Unidentified
                  </span>
                )
              )}
            </div>
          </div>
          <div className="flex items-start gap-2">
            {isBulkMode && selectedTransactionIds.size > 0 && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Pencil className="mr-2 h-4 w-4" />
                      Reclassify ({selectedTransactionIds.size})
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[280px] max-h-[350px] overflow-y-auto p-2">
                    {typeCategories.map((cat) => (
                      <div key={cat.label} className="mb-2 last:mb-0">
                        <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider px-2 py-1">{cat.label}</div>
                        <div className="flex flex-wrap gap-1 px-1">
                          {cat.types.map((t) => (
                            <button
                              key={t}
                              onClick={() => handleBulkUpdate({ type: t })}
                              className={`inline-flex items-center rounded-md px-2 py-[3px] text-[11px] font-medium cursor-pointer hover:opacity-70 transition-opacity ${getCategoryBadgeColor(t)}`}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" onClick={() => handleBulkUpdate({ identified: true })}>
                  <Check className="mr-2 h-4 w-4" />
                  Mark Identified ({selectedTransactionIds.size})
                </Button>
                <Button variant="outline" size="sm" onClick={handleBulkDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedTransactionIds.size})
                </Button>
              </>
            )}

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={isComputingCostBasis}>
                  {isComputingCostBasis ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CreditCard className="mr-2 h-4 w-4" />
                  )}
                  <span>{isComputingCostBasis ? "Computing..." : "Cost Basis"}</span>
                  <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[260px]">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider">2025+ (IRS Required)</div>
                <DropdownMenuItem onClick={() => { setPerWalletTracking(true); handleComputeCostBasis(); }}>
                  <div>
                    <div className="text-[13px] font-medium">Per-Wallet FIFO</div>
                    <div className="text-[11px] text-[#9CA3AF]">Each wallet tracks its own lots (IRS 2025+)</div>
                  </div>
                </DropdownMenuItem>
                <div className="px-2 py-1.5 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider mt-1">Pre-2025 / Legacy</div>
                <DropdownMenuItem onClick={() => { setPerWalletTracking(false); handleComputeCostBasis(); }}>
                  <div>
                    <div className="text-[13px] font-medium">Universal FIFO</div>
                    <div className="text-[11px] text-[#9CA3AF]">Lots shared across all wallets</div>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Sheet open={isImportOpen} onOpenChange={setIsImportOpen}>
              <SheetTrigger asChild>
                <Button data-onboarding="import-transactions">
                  <Download className="mr-2 h-4 w-4" />
                  <span>Import</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-full sm:max-w-xl">
                <SheetHeader>
                  <SheetTitle>Import Transactions</SheetTitle>
                  <SheetDescription>
                    Import transactions from exchanges, wallets, or CSV files.
                  </SheetDescription>
                </SheetHeader>
                <div className="mt-8">
                  <CSVImport onImportComplete={handleImportComplete} />
                </div>
              </SheetContent>
            </Sheet>

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsAddTransactionOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Transaction
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleExport} disabled={isExporting}>
                  <Download className="mr-2 h-4 w-4" />
                  {isExporting ? "Exporting..." : "Export CSV"}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setIsBulkMode(!isBulkMode); setSelectedTransactionIds(new Set()); }}>
                  {isBulkMode ? <CheckSquare className="mr-2 h-4 w-4" /> : <Square className="mr-2 h-4 w-4" />}
                  {isBulkMode ? "Exit Bulk Mode" : "Bulk Select"}
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={() => setIsDeleteAllOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete All
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={() => setAdvancedView(!advancedView)}
              className={cn(
                advancedView && "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] dark:bg-[rgba(37,99,235,0.12)] hover:bg-[#EFF6FF] hover:text-[#2563EB]"
              )}
            >
              {advancedView ? "Simple View" : "Advanced View"}
            </Button>
          </div>
        </div>

        {/* Add Transaction Dialog (rendered at page level to avoid focus trap conflicts) */}
        <Dialog open={isAddTransactionOpen} onOpenChange={setIsAddTransactionOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Add New Transaction</DialogTitle>
              <DialogDescription>
                Enter the details of your transaction below.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-5 items-center gap-4">
                <Label htmlFor="type" className="text-right col-span-1">Type</Label>
                <Select
                  name="type"
                  value={newTransaction.type}
                  onValueChange={(value) => handleFormChange({ target: { name: "type", value } } as React.ChangeEvent<HTMLSelectElement>)}
                >
                  <SelectTrigger className="col-span-4">
                    <SelectValue placeholder="Select transaction type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Buy">Buy</SelectItem>
                    <SelectItem value="Sell">Sell</SelectItem>
                    <SelectItem value="Send">Send</SelectItem>
                    <SelectItem value="Receive">Receive</SelectItem>
                    <SelectItem value="Swap">Swap</SelectItem>
                    <SelectItem value="Stake">Stake</SelectItem>
                    <SelectItem value="Unstake">Unstake</SelectItem>
                    <SelectItem value="DCA">DCA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-5 items-center gap-4">
                <Label htmlFor="exchange" className="text-right col-span-1">Exchange/Wallet</Label>
                <Input id="exchange" name="exchange" placeholder="Coinbase, Binance, etc." value={newTransaction.exchange} onChange={handleFormChange} className="col-span-4" />
              </div>
              <div className="grid grid-cols-5 items-center gap-4">
                <Label htmlFor="asset" className="text-right col-span-1">Asset</Label>
                <Input id="asset" name="asset" placeholder="BTC, ETH, etc." value={newTransaction.asset} onChange={handleFormChange} className="col-span-4" />
              </div>
              <div className="grid grid-cols-5 items-center gap-4">
                <Label htmlFor="amount" className="text-right col-span-1">Amount</Label>
                <Input id="amount" name="amount" placeholder="1.5" type="number" step="0.000001" value={newTransaction.amount} onChange={handleFormChange} className="col-span-4" />
              </div>
              <div className="grid grid-cols-5 items-center gap-4">
                <Label htmlFor="price" className="text-right col-span-1">Price</Label>
                <div className="relative col-span-4">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <span className="text-gray-500">$</span>
                  </div>
                  <Input id="price" name="price" placeholder="30000.00" type="number" step="0.01" value={newTransaction.price} onChange={handleFormChange} className="pl-8" />
                </div>
              </div>
              <div className="grid grid-cols-5 items-center gap-4">
                <Label htmlFor="date" className="text-right col-span-1">Date & Time</Label>
                <div className="col-span-4 flex gap-2">
                  <div className="relative flex-1">
                    <Calendar className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <Input id="date" name="date" type="date" value={newTransaction.date} onChange={handleFormChange} className="pl-8" />
                  </div>
                  <Input id="time" name="time" type="time" value={newTransaction.time} onChange={handleFormChange} className="w-32" />
                </div>
              </div>
              <div className="grid grid-cols-5 items-center gap-4">
                <Label htmlFor="value" className="text-right col-span-1">Value</Label>
                <div className="relative col-span-4">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                    <span className="text-gray-500">$</span>
                  </div>
                  <Input id="value" name="value" placeholder="1500.00" type="number" step="0.01" value={newTransaction.value} onChange={handleFormChange} className="pl-8" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsAddTransactionOpen(false)}>Cancel</Button>
              <Button type="button" onClick={handleAddTransaction}>Add Transaction</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete All Dialog */}
        <Dialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete All Transactions</DialogTitle>
              <DialogDescription>
                This will permanently delete all transactions associated with your wallets and CSV imports.
                This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                You are about to delete <strong>{totalCount}</strong> transaction{totalCount !== 1 ? "s" : ""}.
                This includes:
              </p>
              <ul className="mt-2 ml-4 list-disc text-sm text-muted-foreground space-y-1">
                <li>All transactions from connected wallets</li>
                <li>All transactions imported via CSV files</li>
              </ul>
              <p className="mt-4 text-sm font-medium text-destructive">
                Are you absolutely sure?
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteAllOpen(false)} disabled={isDeletingAll}>Cancel</Button>
              <Button variant="destructive" onClick={handleDeleteAll} disabled={isDeletingAll}>
                {isDeletingAll ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
                ) : (
                  <><Trash2 className="mr-2 h-4 w-4" />Delete All</>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Stats Zone: single horizontal row, all vertically centered ── */}
        {stats?.pnl && (
          <div className="flex items-center justify-between">

            {/* Left group — glowing border */}
            <div className={cn("glow-border", isPaidPlan === false && "blur-lg select-none")}>
            <div className="flex items-center px-5 py-4">
            <div className="pr-7">
              <p className={cn(
                "text-[36px] font-bold tracking-tight",
                stats.pnl.netGain >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"
              )} style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                {stats.pnl.netGain >= 0 ? "+" : "-"}${Math.abs(stats.pnl.netGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-[13px] text-[#6B7280] mt-1">
                Net Capital {stats.pnl.netGain >= 0 ? "Gain" : "Loss"} · {yearValue !== "all" ? yearValue : "All Time"}
              </p>
            </div>

            <div className="w-px h-12 bg-[#E5E5E0] dark:bg-[#333]" />

            {/* Income */}
            {stats.income && stats.income.count > 0 && (<>
              <div className="px-7">
                <p className="text-[28px] font-bold text-[#16A34A]" style={{ fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
                  +${stats.income.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
                <p className="text-[13px] text-[#6B7280] mt-1">
                  Ordinary Income · {stats.income.count} events
                </p>
              </div>
              <div className="w-px h-12 bg-[#E5E5E0] dark:bg-[#333]" />
            </>)}

            {/* Cost Basis + Proceeds + Total stacked */}
            <div className="px-7 space-y-0.5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[11px] text-[#9CA3AF]">Cost Basis</p>
                <p className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ${stats.pnl.totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[11px] text-[#9CA3AF]">Proceeds</p>
                <p className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  ${stats.pnl.totalProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              {stats.income && stats.income.count > 0 && (
                <div className="flex items-baseline justify-between gap-4 pt-0.5 border-t border-[#F0F0EB] dark:border-[#2A2A2A]">
                  <p className="text-[11px] text-[#9CA3AF]">Total Impact</p>
                  <p className={cn("text-[14px] font-semibold", (stats.pnl.netGain + stats.income.totalValueUsd) >= 0 ? "text-[#16A34A]" : "text-[#DC2626]")} style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {(stats.pnl.netGain + stats.income.totalValueUsd) >= 0 ? "+" : "-"}${Math.abs(stats.pnl.netGain + stats.income.totalValueUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              )}
            </div>
            </div>
            </div>

            {/* Right group — Activity heatmap */}
            {stats?.weeklyActivity && stats.weeklyActivity.length > 0 && (
              <div className={cn("flex-1", isPaidPlan === false && "blur-lg select-none pointer-events-none")}>
                <YearHeatmap
                  weeklyActivity={stats.weeklyActivity}
                  year={yearValue !== "all" ? parseInt(yearValue) : undefined}
                  onCellClick={(weekStart) => {
                    const start = new Date(weekStart);
                    const end = new Date(start);
                    end.setDate(end.getDate() + 6);
                    setDateFrom(start);
                    setDateTo(end);
                  }}
                />
              </div>
            )}

          </div>
        )}

        {/* ── P&L Breakdown by Asset ── */}
        {stats?.pnl && (stats.pnl.gainsByAsset.length > 0 || stats.pnl.lossesByAsset.length > 0) && (
          <div className={cn("space-y-2", isPaidPlan === false && "blur-lg select-none pointer-events-none")}>
            <div className="flex items-center gap-3">
              <h2 className="text-[13px] font-semibold text-[#4B5563] tracking-wide uppercase">P&L + Income by Asset</h2>
              <div className="flex items-center gap-1 bg-[#F5F5F0] dark:bg-[#222] rounded-md p-0.5">
                <button
                  onClick={() => setPnlView("summary")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${pnlView === "summary" ? "bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#F5F5F5] shadow-xs" : "text-[#6B7280]"}`}
                >
                  Summary
                </button>
                <button
                  onClick={() => setPnlView("detailed")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors ${pnlView === "detailed" ? "bg-white dark:bg-[#333] text-[#1A1A1A] dark:text-[#F5F5F5] shadow-xs" : "text-[#6B7280]"}`}
                >
                  Detailed
                </button>
              </div>
            </div>
            {pnlView === "detailed" ? (
              <div key="detailed" className="pnl-animate">
              <PnLBreakdownChart
                gainsByAsset={stats.pnl.gainsByAsset}
                lossesByAsset={stats.pnl.lossesByAsset}
                netGain={stats.pnl.netGain}
                incomeByAsset={stats.income?.byAsset || []}
                totalIncome={stats.income?.totalValueUsd || 0}
              />
              </div>
            ) : (
              <div key="summary" className="pnl-animate flex items-center gap-4 max-w-[33%]">
                {(() => {
                  const totalGains = stats.pnl.gainsByAsset.reduce((s, a) => s + a.amount, 0);
                  const totalLosses = stats.pnl.lossesByAsset.reduce((s, a) => s + a.amount, 0);
                  const maxVal = Math.max(totalGains, totalLosses, 1);
                  return (
                    <>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#6B7280]">GAINS</span>
                          <span className="text-[12px] font-semibold text-[#16A34A]" style={{ fontVariantNumeric: 'tabular-nums' }}>+${totalGains.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="h-5 w-full rounded-md bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                          <div className="h-full rounded-md bg-[#16A34A] opacity-90" style={{ width: `${(totalGains / maxVal) * 100}%` }} />
                        </div>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-[#6B7280]">LOSSES</span>
                          <span className="text-[12px] font-semibold text-[#DC2626]" style={{ fontVariantNumeric: 'tabular-nums' }}>-${totalLosses.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                        </div>
                        <div className="h-5 w-full rounded-md bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                          <div className="h-full rounded-md bg-[#DC2626] opacity-90" style={{ width: `${(totalLosses / maxVal) * 100}%` }} />
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}


        {/* ── Filter Bar ── */}
        <div className="flex items-center gap-2">
          <Select value={filter === "all" ? "all" : filter} onValueChange={(value) => { setFilter(value); setCurrentPage(1); }}>
            <SelectTrigger className="w-[160px] h-9 text-sm font-medium">
              <SelectValue placeholder="All Transactions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Transactions</SelectItem>
              <SelectItem value="buy">Buy</SelectItem>
              <SelectItem value="sell">Sell</SelectItem>
              <SelectItem value="transfer">Transfers</SelectItem>
              <SelectItem value="swap">Swaps</SelectItem>
              <SelectItem value="stake">Staking</SelectItem>
              <SelectItem value="defi">DeFi</SelectItem>
              <SelectItem value="nft">NFT</SelectItem>
              <SelectItem value="income">Income</SelectItem>
              <SelectItem value="gambling">Gambling</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select value={yearValue} onValueChange={handleYearChange}>
            <SelectTrigger className={cn("w-[120px] h-9 text-sm", yearValue !== "all" && "bg-primary text-white border-primary hover:bg-primary/90")}>
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {Array.from({ length: new Date().getFullYear() - 2020 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={groupBy} onValueChange={(v) => { setGroupBy(v as typeof groupBy); setCollapsedGroups(new Set()); }}>
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue placeholder="No Grouping" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="month">By Month</SelectItem>
              <SelectItem value="asset">By Asset</SelectItem>
              <SelectItem value="type">By Type</SelectItem>
              <SelectItem value="source">By Source</SelectItem>
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-9 text-sm font-medium gap-1.5">
                <Filter className="h-4 w-4 text-[#6B7280]" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1 inline-flex items-center justify-center h-[18px] min-w-[18px] rounded-full bg-primary text-white text-[11px] font-medium px-1">{activeFilterCount}</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[360px]" align="end">
              <div className="space-y-3">
                {/* Wallet filter */}
                {wallets.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Wallet</Label>
                    <Select value={walletFilter || "all"} onValueChange={(value) => { setWalletFilter(value === "all" ? "" : value); setCurrentPage(1); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All Wallets" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Wallets</SelectItem>
                        {wallets.map((w) => (
                          <SelectItem key={w.id} value={w.address}>
                            {w.name} ({w.address.slice(0, 6)}...{w.address.slice(-4)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Chain filter */}
                {availableChains.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Chain</Label>
                    <Select value={chainFilter || "all"} onValueChange={(value) => { setChainFilter(value === "all" ? "" : value); setCurrentPage(1); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All Chains" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Chains</SelectItem>
                        {availableChains.map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Source filter */}
                {availableSources.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Source</Label>
                    <Select value={sourceFilter || "all"} onValueChange={(value) => { setSourceFilter(value === "all" ? "" : value); setCurrentPage(1); }}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="All Sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        {availableSources.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Value range filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Value Range (USD)</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Min"
                      className="h-9"
                      value={valueMin}
                      onChange={(e) => { setValueMin(e.target.value); setCurrentPage(1); }}
                    />
                    <span className="text-xs text-[#9CA3AF]">–</span>
                    <Input
                      type="number"
                      placeholder="Max"
                      className="h-9"
                      value={valueMax}
                      onChange={(e) => { setValueMax(e.target.value); setCurrentPage(1); }}
                    />
                    {(valueMin || valueMax) && (
                      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => { setValueMin(""); setValueMax(""); setCurrentPage(1); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Toggle filters */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Only Unlabelled</Label>
                    <Checkbox checked={showOnlyUnlabelled} onCheckedChange={() => toggleUnlabelledFilter()} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Hide $0 Transactions</Label>
                    <Checkbox checked={hideZeroTransactions} onCheckedChange={() => toggleHideZeroTransactions()} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Hide Spam</Label>
                    <Checkbox checked={hideSpamTransactions} onCheckedChange={() => toggleHideSpamTransactions()} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Only with Gain/Loss</Label>
                    <Checkbox checked={onlyWithGainLoss} onCheckedChange={() => { setOnlyWithGainLoss(!onlyWithGainLoss); setCurrentPage(1); }} />
                  </div>
                </div>

                {/* Sort */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Sort By</Label>
                  <Select value={sortOption} onValueChange={setSortOption}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="date-desc">Newest First</SelectItem>
                      <SelectItem value="date-asc">Oldest First</SelectItem>
                      <SelectItem value="value-desc">Highest Value</SelectItem>
                      <SelectItem value="value-asc">Lowest Value</SelectItem>
                      <SelectItem value="asset-asc">Asset A-Z</SelectItem>
                      <SelectItem value="asset-desc">Asset Z-A</SelectItem>
                      <SelectItem value="type-asc">Type A-Z</SelectItem>
                      <SelectItem value="type-desc">Type Z-A</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Date range */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Date Range</Label>
                  <div className="flex items-center gap-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("h-9 flex-1 justify-start text-left font-normal", dateFrom && "text-foreground")}>
                          <Calendar className="mr-2 h-4 w-4" />
                          {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={dateFrom}
                          onSelect={(date) => { setDateFrom(date); setCurrentPage(1); }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm" className={cn("h-9 flex-1 justify-start text-left font-normal", dateTo && "text-foreground")}>
                          <Calendar className="mr-2 h-4 w-4" />
                          {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <CalendarComponent
                          mode="single"
                          selected={dateTo}
                          onSelect={(date) => { setDateTo(date); setCurrentPage(1); }}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    {(dateFrom || dateTo) && (
                      <Button variant="ghost" size="sm" className="h-9 px-2" onClick={() => { setDateFrom(undefined); setDateTo(undefined); setCurrentPage(1); }}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Items per page */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Items Per Page</Label>
                  <Select value={itemsPerPage.toString()} onValueChange={(value) => { setItemsPerPage(parseInt(value)); setCurrentPage(1); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                      <SelectItem value="250">250</SelectItem>
                      <SelectItem value="500">500</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          <Select value={itemsPerPage.toString()} onValueChange={(value) => { setItemsPerPage(parseInt(value)); setCurrentPage(1); }}>
            <SelectTrigger className="w-[80px] h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
              <SelectItem value="250">250</SelectItem>
              <SelectItem value="500">500</SelectItem>
            </SelectContent>
          </Select>

          {/* Search icon button */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9">
                <Search className="h-4 w-4 text-[#6B7280]" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-2" align="end">
              <Input
                type="search"
                placeholder="Search transactions..."
                className="h-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                autoFocus
              />
            </PopoverContent>
          </Popover>

          {/* Progress bars — inline with filters */}
          {stats && (
            <>
              <div className="ml-auto" />
              <span className="text-[11px] font-semibold text-[#9CA3AF] tracking-wide uppercase shrink-0">Transaction Identification</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-[#6B7280] shrink-0">Transaction Values</span>
                <div className="w-[80px]">
                  <div className="h-1.5 w-full rounded-full bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                    <div className="h-full rounded-full bg-[#16A34A]" style={{ width: '100%' }} />
                  </div>
                </div>
                <span className="text-[11px] font-bold text-[#16A34A]" style={{ fontVariantNumeric: 'tabular-nums' }}>100%</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-[#6B7280] shrink-0">Transaction Types</span>
                <div className="w-[80px]">
                  <div className="h-1.5 w-full rounded-full bg-[#F0F0EB] dark:bg-[#2A2A2A] overflow-hidden">
                    <div className="h-full rounded-full bg-[#2563EB]" style={{ width: `${stats.identifiedPercentage}%` }} />
                  </div>
                </div>
                <span className={cn("text-[11px] font-bold", stats.identifiedPercentage === 100 ? "text-[#2563EB]" : "text-[#CA8A04]")} style={{ fontVariantNumeric: 'tabular-nums' }}>{stats.identifiedPercentage}%</span>
              </div>
            </>
          )}
        </div>

        {/* ── Active Filter Chips ── */}
        {(filter !== "all" || walletFilter || showOnlyUnlabelled || hideZeroTransactions || hideSpamTransactions || onlyWithGainLoss || (dateFrom || dateTo) || groupBy !== "none" || chainFilter || sourceFilter || valueMin || valueMax) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {filter !== "all" && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Type: {filter}
                <button onClick={() => { setFilter("all"); setCurrentPage(1); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {walletFilter && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Wallet
                <button onClick={() => { setWalletFilter(""); setCurrentPage(1); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {showOnlyUnlabelled && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Unlabelled only
                <button onClick={() => setShowOnlyUnlabelled(false)} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {hideZeroTransactions && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                No $0
                <button onClick={() => setHideZeroTransactions(false)} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {hideSpamTransactions && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                No spam
                <button onClick={() => setHideSpamTransactions(false)} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {onlyWithGainLoss && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Has gain/loss
                <button onClick={() => { setOnlyWithGainLoss(false); setCurrentPage(1); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(dateFrom || dateTo) && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                {dateFrom ? format(dateFrom, "MMM d") : "..."} – {dateTo ? format(dateTo, "MMM d") : "..."}
                <button onClick={() => { setDateFrom(undefined); setDateTo(undefined); setCurrentPage(1); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {groupBy !== "none" && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Grouped: {groupBy}
                <button onClick={() => { setGroupBy("none"); setCollapsedGroups(new Set()); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {chainFilter && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Chain: {chainFilter}
                <button onClick={() => { setChainFilter(""); setCurrentPage(1); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {sourceFilter && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Source: {sourceFilter}
                <button onClick={() => { setSourceFilter(""); setCurrentPage(1); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
            {(valueMin || valueMax) && (
              <span className="inline-flex items-center gap-1 bg-pill-gray-bg dark:bg-[rgba(75,85,99,0.12)] text-pill-gray-text dark:text-[#9CA3AF] rounded-md px-2 py-0.5 text-[12px] font-medium">
                Value: {valueMin ? `$${valueMin}` : "..."} – {valueMax ? `$${valueMax}` : "..."}
                <button onClick={() => { setValueMin(""); setValueMax(""); setCurrentPage(1); }} className="ml-0.5 hover:text-[#1A1A1A] dark:hover:text-white"><X className="h-3 w-3" /></button>
              </span>
            )}
          </div>
        )}

        {/* ── Transaction Table (no card wrapper — Horizon spec) ── */}
        {/* Upgrade banner for free users */}
        {isPaidPlan === false && (
          <div className="rounded-lg bg-[#EFF6FF] dark:bg-[rgba(37,99,235,0.08)] border border-[#BFDBFE] dark:border-[#1E3A5F] px-5 py-4 flex items-center justify-between">
            <div>
              <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Unlock full transaction data</p>
              <p className="text-[13px] text-[#6B7280] mt-0.5">Upgrade to see exact values, cost basis, gain/loss, and download tax reports.</p>
            </div>
            <button
              onClick={() => window.open("/#pricing", "_blank")}
              className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors"
            >
              View Plans
            </button>
          </div>
        )}

        <div data-onboarding="review-transactions" className="border border-[#E5E5E0] dark:border-[#333333] rounded-lg">
          <div className="overflow-auto max-h-[calc(100vh-280px)] rounded-lg table-scroll-shadow">
            <Table className={cn("transaction-table", `density-${tableDensity}`)}>
              <TableHeader className="sticky top-0 z-10 bg-[#FAFAF8] dark:bg-[#161616]">
                <TableRow className="border-b border-[#E5E5E0] dark:border-[#333333]">
                  <TableHead className="w-11 border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    <Checkbox
                      checked={selectedTransactionIds.size === transactions.length && transactions.length > 0}
                      onCheckedChange={handleBulkSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-[140px] text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] cursor-pointer select-none hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors" onClick={() => handleColumnSort("type")}>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-4 w-4 rounded-full bg-primary shrink-0" />
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{isLoadingTransactions ? "..." : totalCount.toLocaleString()}</span> Transactions{getSortIndicator("type")}
                    </span>
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] cursor-pointer select-none hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors" onClick={() => handleColumnSort("asset")}>
                    <span className="inline-flex items-center gap-0.5">Asset{getSortIndicator("asset")}</span>
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] cursor-pointer select-none hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors" onClick={() => handleColumnSort("amount")}>
                    <span className="inline-flex items-center gap-0.5">Amount{getSortIndicator("amount")}</span>
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] cursor-pointer select-none hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors" onClick={() => handleColumnSort("gainloss")}>
                    <span className="inline-flex items-center gap-0.5">Gain/Loss{getSortIndicator("gainloss")}</span>
                  </TableHead>
                  {advancedView && (
                    <>
                      <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        Price
                      </TableHead>
                      <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        Cost Basis
                      </TableHead>
                      <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        Proceeds
                      </TableHead>
                    </>
                  )}
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] cursor-pointer select-none hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors" onClick={() => handleColumnSort("date")}>
                    <span className="inline-flex items-center gap-0.5">Date{getSortIndicator("date")}</span>
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A] cursor-pointer select-none hover:text-[#1A1A1A] dark:hover:text-[#F5F5F5] transition-colors" onClick={() => handleColumnSort("source")}>
                    <span className="inline-flex items-center gap-0.5">Source{getSortIndicator("source")}</span>
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Status
                  </TableHead>
                  <TableHead className="w-10" />
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
                <TableBody>
                  {groupedTransactions.map((group) => (
                    <React.Fragment key={group.key}>
                      {/* Group header (skip for ungrouped) */}
                      {group.key !== "__all__" && (
                        <TableRow
                          className="cursor-pointer bg-[#FAFAF8] dark:bg-[#161616] hover:bg-[#F5F5F0] dark:hover:bg-[#1A1A1A] border-b border-[#E5E5E0] dark:border-[#333333]"
                          onClick={() => toggleGroup(group.key)}
                        >
                          <TableCell colSpan={advancedView ? 13 : 10} className="py-2.5">
                            <div className="flex items-center gap-3">
                              <ChevronDown className={cn("h-4 w-4 text-[#6B7280] transition-transform duration-200", collapsedGroups.has(group.key) && "-rotate-90")} />
                              <span className="text-[14px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">{group.label}</span>
                              <span className="text-[13px] text-[#9CA3AF]">·</span>
                              <span className="text-[13px] text-[#6B7280]" style={{ fontVariantNumeric: 'tabular-nums' }}>{group.transactions.length} transaction{group.transactions.length !== 1 ? "s" : ""}</span>
                              {group.totalGainLoss !== 0 && (
                                <>
                                  <span className="text-[13px] text-[#9CA3AF]">·</span>
                                  <span className={cn("text-[13px] font-medium", group.totalGainLoss >= 0 ? "text-[#16A34A]" : "text-[#DC2626]")} style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    {group.totalGainLoss >= 0 ? "+" : "-"}${Math.abs(group.totalGainLoss).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                  </span>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      {/* Group rows (collapsible, or always visible when ungrouped) */}
                      {(group.key === "__all__" || !collapsedGroups.has(group.key)) && group.transactions.map((transaction) => (
                    <TableRow
                      key={transaction.id}
                      className={cn(
                        "group cursor-pointer border-b border-[#F0F0EB] dark:border-[#2A2A2A]",
                        selectedTransactionIds.has(transaction.id) && "bg-[#EFF6FF] dark:bg-[rgba(59,130,246,0.1)]"
                      )}
                      onClick={() => !isBulkMode && handleOpenDetail(transaction)}
                    >
                      {/* Checkbox — always visible */}
                      <TableCell className="w-11 border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <div className="opacity-30 group-hover:opacity-100 transition-opacity">
                          <Checkbox
                            checked={selectedTransactionIds.has(transaction.id)}
                            onCheckedChange={(checked) => handleBulkSelect(transaction.id, checked as boolean)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </TableCell>

                      {/* Type */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        {editingTransactionId === transaction.id && editingField === 'type' ? (
                          <div className="flex items-center space-x-2">
                            <Select value={editingValue} onValueChange={(value) => setEditingValue(value)}>
                              <SelectTrigger className="h-8 w-full">
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                              <SelectContent>
                                {transactionTypes.map((type) => (
                                  <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Button onClick={() => handleSaveEdit(transaction.id, 'type')} variant="outline" size="sm" className="h-8 px-2">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button onClick={handleCancelEditing} variant="outline" size="sm" className="h-8 px-2">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className={`inline-flex items-center gap-1 rounded-md px-3 py-[5px] text-[13px] font-medium whitespace-nowrap cursor-pointer hover:opacity-80 transition-opacity ${getCategoryBadgeColor(transaction.type)}`}>
                                {formatTypeForDisplay(transaction.type)}
                                <ChevronDown className="h-3 w-3 opacity-50" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent side="bottom" align="start" className="w-[280px] max-h-[350px] overflow-y-auto p-2">
                              {typeCategories.map((cat) => (
                                <div key={cat.label} className="mb-2 last:mb-0">
                                  <div className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider px-2 py-1">{cat.label}</div>
                                  <div className="flex flex-wrap gap-1 px-1">
                                    {cat.types.map((t) => (
                                      <button
                                        key={t}
                                        onClick={() => { handleChangeDropdownValue(transaction.id, 'type', t); }}
                                        className={`inline-flex items-center rounded-md px-2 py-[3px] text-[11px] font-medium cursor-pointer hover:opacity-70 transition-opacity ${getCategoryBadgeColor(t)}`}
                                      >
                                        {t}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>

                      {/* Asset */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        {transaction.outAsset && transaction.inAsset ? (
                          <span className="text-sm inline-flex items-center gap-1.5">
                            <AssetIcon symbol={transaction.outAsset} />
                            <span className={cn("font-semibold", getAssetColor(transaction.outAsset))}>{transaction.outAsset}</span>
                            <span className="text-[#9CA3AF]">{"\u2192"}</span>
                            <AssetIcon symbol={transaction.inAsset} />
                            <span className={cn("font-semibold", getAssetColor(transaction.inAsset))}>{transaction.inAsset}</span>
                          </span>
                        ) : transaction.outAsset ? (
                          <span className="text-sm inline-flex items-center gap-1.5">
                            <AssetIcon symbol={transaction.outAsset} />
                            <span className={cn("font-semibold", getAssetColor(transaction.outAsset))}>{transaction.outAsset}</span>
                          </span>
                        ) : transaction.inAsset ? (
                          <span className="text-sm inline-flex items-center gap-1.5">
                            <AssetIcon symbol={transaction.inAsset} />
                            <span className={cn("font-semibold", getAssetColor(transaction.inAsset))}>{transaction.inAsset}</span>
                          </span>
                        ) : (
                          <span className="text-[#9CA3AF]">{"\u2014"}</span>
                        )}
                      </TableCell>

                      {/* Amount */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        {transaction.outAmount != null && transaction.inAmount != null ? (
                          <span className="text-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            <span className="text-[#1A1A1A] dark:text-[#F5F5F5]">{formatAmount(transaction.outAmount)}</span>
                            <span className="text-[#9CA3AF] mx-1">{"\u2192"}</span>
                            <span className="text-[#1A1A1A] dark:text-[#F5F5F5]">{formatAmount(transaction.inAmount)}</span>
                          </span>
                        ) : transaction.outAmount != null ? (
                          <span className="text-sm text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(transaction.outAmount)}</span>
                        ) : transaction.inAmount != null ? (
                          <span className="text-sm text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatAmount(transaction.inAmount)}</span>
                        ) : (
                          <span className="text-[#9CA3AF]">{"\u2014"}</span>
                        )}
                      </TableCell>

                      {/* Gain/Loss */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        <BlurValue>
                        {transaction.gainLossUsd != null ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 rounded-md px-2.5 py-[4px] text-[13px] font-medium",
                            transaction.gainLossUsd >= 0
                              ? "bg-[#F0FDF4] text-[#16A34A] dark:bg-[rgba(22,163,74,0.12)]"
                              : "bg-[#FEF2F2] text-[#DC2626] dark:bg-[rgba(220,38,38,0.12)]"
                          )} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {transaction.gainLossUsd >= 0
                              ? <span className="text-[0.6rem] leading-none">{"\u25B2"}</span>
                              : <span className="text-[0.6rem] leading-none">{"\u25BC"}</span>}
                            ${Math.abs(transaction.gainLossUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-md px-2.5 py-[4px] text-[13px] bg-pill-gray-bg text-pill-gray-text dark:bg-[rgba(75,85,99,0.12)] dark:text-[#9CA3AF]">N/A</span>
                        )}
                        </BlurValue>
                      </TableCell>

                      {/* Advanced columns */}
                      {advancedView && (
                        <>
                          <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                            <BlurValue>
                            <span className="text-[13px] text-[#6B7280]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {transaction.outPricePerUnit != null
                                ? `$${transaction.outPricePerUnit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`
                                : transaction.price && transaction.price !== "$0.00" ? transaction.price : "—"}
                            </span>
                            </BlurValue>
                          </TableCell>
                          <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                            <BlurValue>
                            <span className="text-[13px] text-[#6B7280]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {transaction.costBasisUsd != null && transaction.costBasisUsd > 0
                                ? `$${transaction.costBasisUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : "—"}
                            </span>
                            </BlurValue>
                          </TableCell>
                          <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                            <BlurValue>
                            <span className="text-[13px] text-[#6B7280]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {transaction.valueUsd != null && transaction.valueUsd !== 0
                                ? `$${Math.abs(transaction.valueUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : "—"}
                            </span>
                            </BlurValue>
                          </TableCell>
                        </>
                      )}

                      {/* Date */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                        {editingTransactionId === transaction.id && editingField === 'date' ? (
                          <div className="flex items-center space-x-2">
                            <Popover>
                              <PopoverTrigger asChild>
                                <Button variant="outline" className="h-8 pl-3 text-left font-normal w-full text-xs">
                                  <CalendarIcon className="mr-2 h-4 w-4" />
                                  {editingValue ? format(new Date(editingValue), "MM/dd/yyyy") : "Select date"}
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-0" align="start">
                                <CalendarComponent
                                  mode="single"
                                  selected={editingValue ? new Date(editingValue) : undefined}
                                  onSelect={(date: Date | undefined) => date && setEditingValue(format(date, 'yyyy-MM-dd'))}
                                  initialFocus
                                />
                              </PopoverContent>
                            </Popover>
                            <Button onClick={() => handleSaveEdit(transaction.id, 'date')} variant="outline" size="sm" className="h-8 px-2">
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button onClick={handleCancelEditing} variant="outline" size="sm" className="h-8 px-2">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <div
                            className="relative group"
                            onMouseEnter={() => handleMouseEnter('date')}
                            onMouseLeave={() => handleMouseLeave('date')}
                          >
                            <div className="flex flex-col">
                              <span className="text-sm text-[#1A1A1A] dark:text-[#F5F5F5]">{format(new Date(transaction.date), "h:mm a")}</span>
                              <span className="text-xs text-[#6B7280]">{format(new Date(transaction.date), "MMM d, yyyy")}</span>
                            </div>
                            {editableFields.date && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute left-0 top-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleStartEditing(transaction.id, 'date', transaction.date)}
                              >
                                <CalendarIcon className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Source */}
                      <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          {editingTransactionId === transaction.id && editingField === 'exchange' ? (
                            <div className="flex items-center justify-end space-x-2">
                              <Input
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                className="h-8 w-full text-xs"
                              />
                              <Button onClick={() => handleSaveEdit(transaction.id, 'exchange')} variant="outline" size="sm" className="h-8 px-2">
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button onClick={handleCancelEditing} variant="outline" size="sm" className="h-8 px-2">
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap", getSourcePillColor(transaction.exchange))}>
                              {(() => {
                                const source = getSourceIcon(transaction.exchange);
                                if (source?.hasLogo && sourceLogoFiles[source.key]) {
                                  return <img src={sourceLogoFiles[source.key]} alt={source.key} className="h-4 w-4 rounded-full shrink-0" />;
                                }
                                return null;
                              })()}
                              {shortenSource(transaction.exchange)}
                            </span>
                          )}
                        </TableCell>

                      {/* Status */}
                      <TableCell>
                        {transaction.identified ? (
                          <span className="inline-flex items-center gap-1.5 text-sm text-[#16A34A]">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A] shrink-0" />
                            Identified
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sm text-[#DC2626]">
                            <span className="h-2.5 w-2.5 rounded-full bg-[#DC2626] shrink-0" />
                            Unidentified
                          </span>
                        )}
                      </TableCell>

                      {/* Row hover actions */}
                      <TableCell className="w-10">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
                          <button className="p-1 rounded hover:bg-[#F0F0EB] dark:hover:bg-[#2A2A2A]" onClick={(e) => { e.stopPropagation(); handleOpenDetail(transaction); }}>
                            <Pencil className="h-3.5 w-3.5 text-[#9CA3AF] hover:text-[#1A1A1A]" />
                          </button>
                          <button className="p-1 rounded hover:bg-[#FEF2F2] dark:hover:bg-[rgba(220,38,38,0.1)]" onClick={(e) => { e.stopPropagation(); handleDeleteTransaction(transaction.id); }}>
                            <Trash2 className="h-3.5 w-3.5 text-[#9CA3AF] hover:text-[#DC2626]" />
                          </button>
                        </div>
                      </TableCell>

                      {/* Block explorer link */}
                      <TableCell className="w-10">
                        {transaction.txHash && (
                          <a
                            href={getExplorerUrl(transaction.chain, transaction.txHash)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </TableCell>

                    </TableRow>
                  ))}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
              {isLoadingTransactions && (
                <div className="px-4">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 h-12 border-b border-[#F0F0EB] dark:border-[#2A2A2A]">
                      <div className="h-6 w-20 skeleton-pulse rounded-md" />
                      <div className="h-4 w-28 skeleton-pulse rounded" />
                      <div className="h-4 w-16 skeleton-pulse rounded ml-auto" />
                      <div className="h-3 w-12 skeleton-pulse rounded" />
                      <div className="h-3 w-14 skeleton-pulse rounded" />
                    </div>
                  ))}
                </div>
              )}
              {!isLoadingTransactions && transactions.length === 0 && (
                <div className="py-20 text-center">
                  <ArrowRightLeft className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
                  <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">No transactions found</p>
                  <p className="text-sm text-[#6B7280] mt-2">Try adjusting your filters or import your first transactions.</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {!isLoadingTransactions && transactions.length > 0 && (
              <div className="flex items-center justify-between px-4 h-12 border-t border-[#E5E5E0] dark:border-[#333333] bg-[#FAFAF8] dark:bg-[#161616]">
                <span className="text-xs text-[#6B7280]">
                  Showing <span style={{ fontVariantNumeric: 'tabular-nums' }}>{totalCount > 0 ? startIndex + 1 : 0}–{endIndex}</span> of <span className="font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">{totalCount.toLocaleString()}</span>
                </span>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                        className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>

                    {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                      let pageNumber: number;

                      if (totalPages <= 7) {
                        pageNumber = i + 1;
                      } else if (currentPage <= 3) {
                        if (i < 5) {
                          pageNumber = i + 1;
                        } else if (i === 5) {
                          return (
                            <PaginationItem key="ellipsis-end">
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        } else {
                          pageNumber = totalPages;
                        }
                      } else if (currentPage >= totalPages - 2) {
                        if (i === 0) {
                          pageNumber = 1;
                        } else if (i === 1) {
                          return (
                            <PaginationItem key="ellipsis-start">
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        } else {
                          pageNumber = totalPages - (6 - i);
                        }
                      } else {
                        if (i === 0) {
                          pageNumber = 1;
                        } else if (i === 1) {
                          return (
                            <PaginationItem key="ellipsis-start">
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        } else if (i === 5) {
                          return (
                            <PaginationItem key="ellipsis-end">
                              <PaginationEllipsis />
                            </PaginationItem>
                          );
                        } else if (i === 6) {
                          pageNumber = totalPages;
                        } else {
                          pageNumber = currentPage + (i - 3);
                        }
                      }

                      if (typeof pageNumber === 'number') {
                        return (
                          <PaginationItem key={pageNumber}>
                            <PaginationLink
                              onClick={() => handlePageChange(pageNumber)}
                              isActive={currentPage === pageNumber}
                            >
                              {pageNumber}
                            </PaginationLink>
                          </PaginationItem>
                        );
                      }
                      return null;
                    })}

                    <PaginationItem>
                      <PaginationNext
                        onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                        className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            )}
        </div>

        {/* Transaction Detail Sheet */}
        <Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            {selectedTransaction && (
              <>
                <SheetHeader>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${getCategoryBadgeColor(selectedTransaction.type)}`}>
                      {formatTypeForDisplay(selectedTransaction.type)}
                    </span>
                    <SheetTitle className="text-lg">Transaction Details</SheetTitle>
                  </div>
                  <SheetDescription>
                    {format(new Date(selectedTransaction.date), "MMM d, yyyy 'at' h:mm a")} · {selectedTransaction.exchange}
                  </SheetDescription>
                  {/* Hero dollar value in sheet header */}
                  <p className="text-[24px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    ${Math.abs(selectedTransaction.valueUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* Cost Basis / Gain-Loss Summary */}
                  {selectedTransaction.costBasisComputed && (
                    <div className="grid grid-cols-2 gap-3">
                      {selectedTransaction.costBasisUsd != null && (
                        <div className="rounded-lg border border-[#E5E5E0] dark:border-[#333] bg-[#FAFAF7] dark:bg-[#1A1A1A] p-3">
                          <p className="text-xs text-[#6B7280]">Cost Basis</p>
                          <p className="text-[18px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            ${Math.abs(selectedTransaction.costBasisUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      )}
                      {selectedTransaction.gainLossUsd != null && (
                        <div className={cn(
                          "rounded-lg border p-3",
                          selectedTransaction.gainLossUsd >= 0
                            ? "border-l-4 border-l-[#16A34A] border-[#E5E5E0] dark:border-[#333] dark:border-l-[#16A34A] bg-[#FAFAF7] dark:bg-[#1A1A1A]"
                            : "border-l-4 border-l-[#DC2626] border-[#E5E5E0] dark:border-[#333] dark:border-l-[#DC2626] bg-[#FAFAF7] dark:bg-[#1A1A1A]"
                        )}>
                          <p className="text-xs text-[#6B7280]">Gain / Loss</p>
                          <p className={cn(
                            "text-[20px] font-semibold",
                            selectedTransaction.gainLossUsd >= 0 ? "text-[#16A34A]" : "text-[#DC2626]"
                          )} style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {selectedTransaction.gainLossUsd >= 0 ? "+" : "-"}${Math.abs(selectedTransaction.gainLossUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Transaction Type */}
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">Type</Label>
                    <Select
                      value={selectedTransaction.type}
                      onValueChange={(value) => handleChangeDropdownValue(selectedTransaction.id, 'type', value)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {transactionTypes.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Basic Info Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Asset</Label>
                      <Input
                        value={selectedTransaction.asset}
                        className="font-mono"
                        onChange={(e) => {
                          const updated = { ...selectedTransaction, asset: e.target.value };
                          setSelectedTransaction(updated);
                        }}
                        onBlur={() => {
                          if (selectedTransaction.asset !== transactions.find(t => t.id === selectedTransaction.id)?.asset) {
                            handleSaveEdit(selectedTransaction.id, 'asset');
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Status</Label>
                      <Select
                        value={selectedTransaction.status}
                        onValueChange={(value) => handleChangeDropdownValue(selectedTransaction.id, 'status', value)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Completed">Completed</SelectItem>
                          <SelectItem value="Pending">Pending</SelectItem>
                          <SelectItem value="Failed">Failed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Amount</Label>
                      <Input
                        value={selectedTransaction.amount.split(' ')[0]}
                        className="font-mono"
                        onChange={(e) => {
                          const assetSymbol = selectedTransaction.amount.split(' ')[1] || selectedTransaction.asset;
                          const updated = { ...selectedTransaction, amount: `${e.target.value} ${assetSymbol}` };
                          setSelectedTransaction(updated);
                        }}
                        onBlur={() => {
                          const amountValue = parseFloat(selectedTransaction.amount.split(' ')[0]);
                          if (!isNaN(amountValue)) {
                            setEditingValue(amountValue.toString());
                            handleSaveEdit(selectedTransaction.id, 'amount');
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Exchange / Source</Label>
                      <Input
                        value={selectedTransaction.exchange}
                        onChange={(e) => {
                          const updated = { ...selectedTransaction, exchange: e.target.value };
                          setSelectedTransaction(updated);
                        }}
                        onBlur={() => {
                          if (selectedTransaction.exchange !== transactions.find(t => t.id === selectedTransaction.id)?.exchange) {
                            handleSaveEdit(selectedTransaction.id, 'exchange');
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label className="text-xs text-muted-foreground">Date & Time</Label>
                      <Input
                        type="datetime-local"
                        className="font-mono"
                        value={format(new Date(selectedTransaction.date), "yyyy-MM-dd'T'HH:mm")}
                        onChange={(e) => {
                          const newDate = new Date(e.target.value);
                          setEditingValue(format(newDate, "yyyy-MM-dd"));
                          handleSaveEdit(selectedTransaction.id, 'date');
                        }}
                      />
                    </div>
                  </div>

                  {/* Notes Section */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">Notes</Label>
                      {!editingNotes && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingNotes(true)}
                        >
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Button>
                      )}
                    </div>
                    {editingNotes ? (
                      <div className="space-y-2">
                        <Textarea
                          value={notesValue}
                          onChange={(e) => setNotesValue(e.target.value)}
                          placeholder="Add notes about this transaction (e.g., 'This was payment for consulting work')"
                          rows={4}
                        />
                        <div className="flex gap-2">
                          <Button size="sm" onClick={handleSaveNotes}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setNotesValue(selectedTransaction.notes || "");
                              setEditingNotes(false);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg bg-muted/30 border min-h-[60px]">
                        {selectedTransaction.notes ? (
                          <p className="text-sm whitespace-pre-wrap">{selectedTransaction.notes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground/50 italic">No notes</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Transaction Hash */}
                  {selectedTransaction.txHash && (
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Transaction Hash</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={selectedTransaction.txHash}
                          readOnly
                          className="font-mono text-xs bg-muted/30"
                        />
                        {selectedTransaction.chain && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="shrink-0"
                            onClick={() => {
                              const explorerUrl = selectedTransaction.chain === 'ethereum'
                                ? `https://etherscan.io/tx/${selectedTransaction.txHash}`
                                : selectedTransaction.chain === 'solana'
                                ? `https://solscan.io/tx/${selectedTransaction.txHash}`
                                : '#';
                              window.open(explorerUrl, '_blank');
                            }}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Edit History */}
                  <div className="border-t pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={() => {
                          setShowHistory(!showHistory);
                          if (!showHistory && editHistory.length === 0) {
                            fetchEditHistory(selectedTransaction.id);
                          }
                        }}
                        className="text-[13px] font-medium text-[#6B7280] hover:text-[#1A1A1A] transition-colors flex items-center gap-1"
                      >
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showHistory && "rotate-180")} />
                        Edit History
                      </button>
                      {(selectedTransaction.editVersion ?? 0) > 0 && (
                        <button
                          onClick={() => handleUndoLastEdit(selectedTransaction.id)}
                          className="text-[12px] text-[#2563EB] hover:underline"
                        >
                          Undo last edit
                        </button>
                      )}
                    </div>
                    {showHistory && (
                      <div className="space-y-3">
                        {isHistoryLoading ? (
                          <div className="text-[12px] text-[#9CA3AF]">Loading history...</div>
                        ) : editHistory.length === 0 ? (
                          <div className="text-[12px] text-[#9CA3AF]">No edit history</div>
                        ) : (
                          editHistory.map((entry) => (
                            <div key={entry.version} className="border rounded-lg p-3 text-[12px]">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-[#9CA3AF]">
                                    {new Date(entry.editedAt).toLocaleDateString()} {new Date(entry.editedAt).toLocaleTimeString()}
                                  </span>
                                  {entry.isRevert && (
                                    <span className="inline-flex items-center rounded-full bg-[#FFF7ED] text-[#EA580C] px-2 py-0.5 text-[10px] font-medium">
                                      Revert
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => handleRevertToVersion(selectedTransaction.id, entry.version - 1)}
                                  className="text-[11px] text-[#9CA3AF] hover:text-[#2563EB] transition-colors"
                                >
                                  Revert to before this
                                </button>
                              </div>
                              <div className="space-y-1">
                                {entry.changes.map((change, i) => (
                                  <div key={i} className="text-[#6B7280]">
                                    <span className="font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">
                                      {change.fieldName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                                    </span>
                                    {': '}
                                    <span className="text-[#DC2626] line-through">{change.oldValue ?? 'null'}</span>
                                    {' → '}
                                    <span className="text-[#16A34A]">{change.newValue ?? 'null'}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-4 border-t">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteTransaction(selectedTransaction.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        handleChangeDropdownValue(selectedTransaction.id, 'identified', selectedTransaction.identified ? 'Needs Review' : 'Identified');
                      }}
                    >
                      {selectedTransaction.identified ? (
                        <>
                          <AlertCircle className="mr-2 h-4 w-4" />
                          Mark Unidentified
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Mark Identified
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </>
            )}
          </SheetContent>
        </Sheet>

        {/* Duplicates Dialog */}
        <Dialog open={isDuplicatesOpen} onOpenChange={setIsDuplicatesOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Duplicate Transactions</DialogTitle>
              <DialogDescription>
                Review and merge duplicate transactions
              </DialogDescription>
            </DialogHeader>

            {isLoadingDuplicates ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : duplicates.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No duplicates found
              </div>
            ) : (
              <div className="space-y-4">
                {duplicates.map((group, index) => (
                  <Card key={index}>
                    <CardHeader>
                      <CardTitle className="text-sm">{group.reason}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {group.ids.map((id) => {
                          const tx = transactions.find(t => t.id === id);
                          if (!tx) return null;
                          return (
                            <div key={id} className="flex items-center justify-between p-2 border rounded">
                              <div className="flex-1">
                                <div className="font-medium">{formatTypeForDisplay(tx.type)} - {tx.asset}</div>
                                <div className="text-sm text-muted-foreground">
                                  {tx.amount} • {tx.value} • {format(new Date(tx.date), "MMM dd, yyyy")}
                                </div>
                              </div>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleMergeDuplicates(group.ids, id)}
                              >
                                <Merge className="mr-2 h-4 w-4" />
                                Keep This
                              </Button>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}

// Loading component to show when Suspense is active
function TransactionsLoading() {
  return (
    <Layout>
      <div className="container py-6 space-y-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="flex items-center space-x-2">
            <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <h2 className="text-xl font-medium">Loading transactions...</h2>
          </div>
        </div>
      </div>
    </Layout>
  );
}

// Main exported page component with Suspense boundary
export default function TransactionsPage() {
  return (
    <Suspense fallback={<TransactionsLoading />}>
      <TransactionsContent />
    </Suspense>
  );
}
