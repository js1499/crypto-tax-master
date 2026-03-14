"use client";

import { useState, useEffect, Suspense } from "react";
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

// Define transaction type from ImportedData
function TransactionsContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState("all");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [sortOption, setSortOption] = useState("date-desc");
  const [showOnlyUnlabelled, setShowOnlyUnlabelled] = useState(false);
  const [hideZeroTransactions, setHideZeroTransactions] = useState(false);
  const [hideSpamTransactions, setHideSpamTransactions] = useState(false);
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

  // Duplicate detection state
  const [duplicates, setDuplicates] = useState<Array<{ ids: number[]; reason: string; similarity: number }>>([]);
  const [isDuplicatesOpen, setIsDuplicatesOpen] = useState(false);
  const [isLoadingDuplicates, setIsLoadingDuplicates] = useState(false);

  // Delete all transactions state
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // UI mode state
  const [showAdvancedColumns, setShowAdvancedColumns] = useState(false);
  const [showMoreStats, setShowMoreStats] = useState(false);
  const [tableDensity, setTableDensity] = useState<"condensed" | "regular" | "spacious">("regular");

  // Wallet filter state
  const [walletFilter, setWalletFilter] = useState("");
  const [wallets, setWallets] = useState<Array<{ id: string; name: string; address: string; provider: string }>>([]);

  // Date range filter state
  const [dateFrom, setDateFrom] = useState<Date | undefined>(undefined);
  const [dateTo, setDateTo] = useState<Date | undefined>(undefined);

  // Stats state from API
  const [stats, setStats] = useState<{
    buyCount: number;
    sellCount: number;
    otherCount: number;
    unlabelledCount: number;
    identifiedPercentage: number;
    valueIdentifiedPercentage: number;
    pnl: { totalCostBasis: number; totalProceeds: number; netGain: number };
    income: { count: number; totalValueUsd: number };
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
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
          ...(searchTerm && { search: searchTerm }),
          ...(filter !== "all" && { filter }),
          ...(sortOption && { sort: sortOption }),
          ...(showOnlyUnlabelled && { showOnlyUnlabelled: "true" }),
          ...(hideZeroTransactions && { hideZeroTransactions: "true" }),
          ...(hideSpamTransactions && { hideSpamTransactions: "true" }),
          ...(walletFilter && { wallet: walletFilter }),
          ...(dateFrom && { dateFrom: format(dateFrom, "yyyy-MM-dd") }),
          ...(dateTo && { dateTo: format(dateTo, "yyyy-MM-dd") }),
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
          }));

          setTransactions(apiTransactions);
          setFilteredTransactions(apiTransactions); // Keep for compatibility with existing code
          setTotalCount(data.pagination.totalCount);
          setTotalPages(data.pagination.totalPages);
          if (data.stats) {
            setStats(data.stats);
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
    walletFilter,
    dateFrom,
    dateTo,
    router,
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
    sortOption !== "date-desc",
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
      const response = await fetch("/api/cost-basis/compute", { method: "POST" });
      const data = await response.json();
      if (data.status === "success") {
        toast.success(`Cost basis computed for ${data.updatedTransactions} transactions (${data.method})`);
        setCurrentPage(1); // Refresh transactions
      } else {
        toast.error(data.error || "Failed to compute cost basis");
      }
    } catch (error) {
      toast.error("Failed to compute cost basis");
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
        if (response.status === 429) {
          const retryAfter = errorData.retryAfter || errorData.message;
          throw new Error(errorData.message || `Rate limit exceeded. ${retryAfter}`);
        }
        throw new Error(errorData.error || errorData.details || errorData.message || "Failed to delete all transactions");
      }

      const data = await response.json();
      if (data.status === "success") {
        toast.success(`Successfully deleted ${data.deletedCount} transaction${data.deletedCount !== 1 ? "s" : ""}`);
        setIsDeleteAllOpen(false);

        // Reset to page 1 and refresh transactions
        setCurrentPage(1);
        setTransactions([]);
        setFilteredTransactions([]);
        setTotalCount(0);

        // Trigger a refresh by updating a dependency
        // The useEffect will automatically refetch
      } else {
        throw new Error(data.error || "Failed to delete transactions");
      }
    } catch (error) {
      console.error("Error deleting all transactions:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to delete all transactions";
      toast.error(errorMessage);
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
        ...(walletFilter && { wallet: walletFilter }),
        ...(dateFrom && { dateFrom: format(dateFrom, "yyyy-MM-dd") }),
        ...(dateTo && { dateTo: format(dateTo, "yyyy-MM-dd") }),
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
      toast.error(error instanceof Error ? error.message : "Failed to export transactions");
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
      toast.error(error instanceof Error ? error.message : "Failed to update transaction");
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

  // Transaction type options (comprehensive list)
  const transactionTypes = [
    { value: "Buy", label: "Buy" },
    { value: "Sell", label: "Sell" },
    { value: "Swap", label: "Swap" },
    { value: "Send", label: "Send" },
    { value: "Receive", label: "Receive" },
    { value: "Transfer", label: "Transfer" },
    { value: "Stake", label: "Stake" },
    { value: "Unstake", label: "Unstake" },
    { value: "Staking Reward", label: "Staking Reward" },
    { value: "Mining Reward", label: "Mining Reward" },
    { value: "Airdrop", label: "Airdrop" },
    { value: "Interest", label: "Interest" },
    { value: "Payment", label: "Payment" },
    { value: "DCA", label: "DCA" },
    { value: "Bridge", label: "Bridge" },
    { value: "Add Liquidity", label: "Add Liquidity" },
    { value: "Remove Liquidity", label: "Remove Liquidity" },
    { value: "NFT Purchase", label: "NFT Purchase" },
    { value: "NFT Sale", label: "NFT Sale" },
    { value: "Margin Buy", label: "Margin Buy" },
    { value: "Margin Sell", label: "Margin Sell" },
    { value: "Liquidation", label: "Liquidation" },
    { value: "Zero Transaction", label: "Zero Transaction" },
    { value: "Spam", label: "Spam" },
    { value: "Deposit", label: "Deposit" },
    { value: "Withdraw", label: "Withdraw" },
    { value: "Burn", label: "Burn" },
    { value: "Mint", label: "Mint" },
    { value: "Wrap", label: "Wrap" },
    { value: "Unwrap", label: "Unwrap" },
    { value: "Approve", label: "Approve" },
    { value: "Self", label: "Self" },
    { value: "NFT Activity", label: "NFT Activity" },
    { value: "DeFi Setup", label: "DeFi Setup" },
  ];

  // Helper: format amount for display
  const formatAmount = (amount: number | null) => {
    if (amount == null) return null;
    if (amount < 0.01 && amount > 0) return amount.toExponential(2);
    return amount.toLocaleString(undefined, { maximumFractionDigits: 6 });
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
    CB: "bg-gradient-to-br from-blue-500 to-blue-600 text-white",
    BN: "bg-gradient-to-br from-yellow-400 to-amber-500 text-black",
    PH: "bg-gradient-to-br from-purple-400 to-purple-600 text-white",
    JUP: "bg-gradient-to-br from-emerald-400 to-teal-500 text-white",
    RAY: "bg-gradient-to-br from-cyan-400 to-blue-500 text-white",
    ORC: "bg-gradient-to-br from-gray-700 to-gray-900 text-white",
    CSV: "bg-gradient-to-br from-slate-400 to-slate-500 text-white",
    HEL: "bg-gradient-to-br from-orange-500 to-red-500 text-white",
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
      <div className="space-y-6 stagger-section">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Transactions</h1>
          <div className="flex items-center gap-2">
            {isBulkMode && selectedTransactionIds.size > 0 && (
              <>
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

            <Button variant="outline" onClick={handleExport} disabled={isExporting}>
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              <span>{isExporting ? "Exporting..." : "Export"}</span>
            </Button>

            <Button variant="outline" onClick={handleComputeCostBasis} disabled={isComputingCostBasis}>
              {isComputingCostBasis ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CreditCard className="mr-2 h-4 w-4" />
              )}
              <span>{isComputingCostBasis ? "Computing..." : "Cost Basis"}</span>
            </Button>

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

            {/* Add Transaction Dialog */}
            <Dialog open={isAddTransactionOpen} onOpenChange={setIsAddTransactionOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  <span>Add</span>
                </Button>
              </DialogTrigger>
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
                        <CalendarComponent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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

            {/* Overflow menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
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
          </div>
        </div>

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

        {/* ── Stats Row ── */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-lg px-3 py-1.5">
            <span className="text-sm font-semibold font-mono text-emerald-700 dark:text-emerald-400">{stats?.valueIdentifiedPercentage ?? 0}%</span>
            <Progress value={stats?.valueIdentifiedPercentage ?? 0} className="h-3 w-24 bg-emerald-100 dark:bg-emerald-900/30" indicatorClassName="bg-emerald-600 dark:bg-emerald-400" />
            <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">Value</span>
          </div>
          <div className="flex items-center gap-3 border border-orange-200 dark:border-orange-800/40 bg-orange-50/50 dark:bg-orange-950/20 rounded-lg px-3 py-1.5">
            <span className="text-sm font-semibold font-mono text-orange-700 dark:text-orange-400">{stats?.identifiedPercentage ?? 0}%</span>
            <Progress value={stats?.identifiedPercentage ?? 0} className="h-3 w-24 bg-orange-100 dark:bg-orange-900/30" indicatorClassName="bg-orange-600 dark:bg-orange-400" />
            <span className="text-xs text-orange-600/70 dark:text-orange-400/70">Types</span>
          </div>
          <div className="flex items-center gap-2 border border-border rounded-lg px-3 py-1.5">
            <span className="text-sm font-semibold font-mono">{isLoadingTransactions ? "..." : totalCount.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">txns</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowMoreStats(!showMoreStats)}
            className="ml-auto"
          >
            {showMoreStats ? "Less" : "More Stats"}
            <ChevronDown className={cn("ml-1 h-4 w-4 transition-transform", showMoreStats && "rotate-180")} />
          </Button>
        </div>

        {/* ── P&L Summary ── */}
        {stats?.pnl && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold border-l-4 border-primary pl-3">P&L Summary</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="transition-shadow duration-200 hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold">Capital Gains Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Cost Basis</p>
                      <p className="text-xl font-bold text-muted-foreground font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${stats.pnl.totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Proceeds</p>
                      <p className="text-xl font-bold text-muted-foreground font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${stats.pnl.totalProceeds.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        {stats.pnl.netGain >= 0
                          ? <TrendingUp className="h-3.5 w-3.5 text-emerald-500 dark:text-emerald-400" />
                          : <TrendingDown className="h-3.5 w-3.5 text-rose-500 dark:text-rose-400" />}
                        Net Gain / Loss
                      </p>
                      <p className={cn(
                        "text-2xl font-bold font-mono",
                        stats.pnl.netGain >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-rose-600 dark:text-rose-400"
                      )} style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {stats.pnl.netGain >= 0 ? "+" : "-"}${Math.abs(stats.pnl.netGain).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {stats.income && stats.income.count > 0 && (
                <Card className="transition-shadow duration-200 hover:shadow-md">
                  <CardHeader>
                    <CardTitle className="text-lg font-semibold">Ordinary Income</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-muted-foreground">Income Events</p>
                        <p className="text-xl font-bold text-muted-foreground font-mono">{stats.income.count}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Total Income</p>
                        <p className="text-xl font-bold text-amber-600 dark:text-amber-400 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          ${stats.income.totalValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground/60 mt-3 pt-3 border-t border-border/50 italic">
                      Airdrops, staking rewards, and vesting claims taxed as ordinary income at FMV on receipt.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* ── More Stats (collapsible) ── */}
        {showMoreStats && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="border-l-4 border-l-emerald-500 bg-gradient-to-r from-emerald-50/40 to-transparent dark:from-emerald-950/15 dark:to-transparent transition-shadow duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Buy</CardTitle>
                  <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{isLoadingTransactions ? "..." : (stats?.buyCount ?? 0)}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-rose-500 bg-gradient-to-r from-rose-50/40 to-transparent dark:from-rose-950/15 dark:to-transparent transition-shadow duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-rose-700 dark:text-rose-400">Sell</CardTitle>
                  <ArrowDownRight className="h-4 w-4 text-rose-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{isLoadingTransactions ? "..." : (stats?.sellCount ?? 0)}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-blue-500 bg-gradient-to-r from-blue-50/40 to-transparent dark:from-blue-950/15 dark:to-transparent transition-shadow duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-400">Other</CardTitle>
                  <ArrowRightLeft className="h-4 w-4 text-blue-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{isLoadingTransactions ? "..." : (stats?.otherCount ?? 0)}</div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500 bg-gradient-to-r from-amber-50/40 to-transparent dark:from-amber-950/15 dark:to-transparent transition-shadow duration-200 hover:shadow-md">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">Unlabelled</CardTitle>
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-mono">{isLoadingTransactions ? "..." : (stats?.unlabelledCount ?? 0)}</div>
                </CardContent>
              </Card>
            </div>

            {/* Transaction Labeling */}
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="pt-6">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-lg font-semibold">Transaction Labeling</h3>
                      <p className="text-sm text-muted-foreground">
                        {isLoadingTransactions
                          ? "Loading..."
                          : <><span className="font-mono font-medium text-foreground/70">{identifiedCount}</span> of <span className="font-mono font-medium text-foreground/70">{currentPageCount}</span> labeled (page {currentPage} of {totalPages})</>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono">{identificationPercentage}%</span>
                      {identificationPercentage === 100 ? (
                        <Check className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-amber-500" />
                      )}
                    </div>
                  </div>
                  <Progress value={identificationPercentage} className="h-3 w-full" indicatorClassName="bg-emerald-500" />
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                      <span>Labeled: <span className="font-mono font-medium">{identifiedCount}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
                      <span>Need Labeling: <span className="font-mono font-medium">{needsIdentificationCount}</span></span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {/* ── Filters Row: Search + Year + Filters Popover ── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search transactions..."
              className="pl-8 transition-shadow duration-200 focus:shadow-[0_0_0_3px_hsl(var(--primary)/0.1)]"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <Select value={yearValue} onValueChange={handleYearChange}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue placeholder="All Years" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              {Array.from({ length: new Date().getFullYear() - 2020 + 1 }, (_, i) => new Date().getFullYear() - i).map(year => (
                <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("h-9", activeFilterCount > 0 && "bg-primary text-primary-foreground hover:bg-primary/90")}
              >
                <Filter className="mr-2 h-4 w-4" />
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                {/* Type filter */}
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Transaction Type</Label>
                  <Select value={filter} onValueChange={(value) => { setFilter(value); setCurrentPage(1); }}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="All Types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="buy">Buy</SelectItem>
                      <SelectItem value="sell">Sell</SelectItem>
                      <SelectItem value="transfer">Transfers</SelectItem>
                      <SelectItem value="swap">Swaps</SelectItem>
                      <SelectItem value="stake">Staking</SelectItem>
                      <SelectItem value="defi">DeFi</SelectItem>
                      <SelectItem value="nft">NFT</SelectItem>
                      <SelectItem value="income">Income</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

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
        </div>

        {/* ── Table Controls ── */}
        <div className="flex items-center gap-4">
          {/* Advanced toggle */}
          <button
            onClick={() => setShowAdvancedColumns(!showAdvancedColumns)}
            className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Advanced</span>
            <div className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200",
              showAdvancedColumns ? "bg-primary" : "bg-muted"
            )}>
              <span className={cn(
                "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200",
                showAdvancedColumns ? "translate-x-4" : "translate-x-0"
              )} />
            </div>
          </button>

          {/* Density S/M/L */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            {(["condensed", "regular", "spacious"] as const).map((d) => (
              <button
                key={d}
                onClick={() => setTableDensity(d)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors capitalize",
                  tableDensity === d
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                )}
              >
                {d === "condensed" ? "S" : d === "regular" ? "M" : "L"}
              </button>
            ))}
          </div>

          {/* Showing count */}
          <span className="text-xs text-muted-foreground ml-auto">
            {isLoadingTransactions
              ? "Loading..."
              : <>Showing <span className="font-mono font-medium text-foreground/70">{totalCount > 0 ? startIndex + 1 : 0}{"\u2013"}{endIndex}</span> of <span className="font-mono font-medium text-foreground/70">{totalCount.toLocaleString()}</span></>}
          </span>
        </div>

        {/* ── Transaction Table ── */}
        <Card>
          <CardContent className="p-0" data-onboarding="review-transactions">
            <div className="overflow-x-auto">
              <Table className={cn("transaction-table font-mono", `density-${tableDensity}`)}>
                <TableHeader>
                  <TableRow className="h-auto">
                    {showAdvancedColumns && isBulkMode && (
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedTransactionIds.size === transactions.length && transactions.length > 0}
                          onCheckedChange={handleBulkSelectAll}
                        />
                      </TableHead>
                    )}
                    <TableHead className="font-medium font-mono cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleColumnSort("type")}>
                      <span className="inline-flex items-center gap-0.5">Type{getSortIndicator("type")}</span>
                    </TableHead>
                    <TableHead className="font-medium font-mono cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleColumnSort("asset")}>
                      <span className="inline-flex items-center gap-0.5">Asset(s){getSortIndicator("asset")}</span>
                    </TableHead>
                    <TableHead className="font-medium font-mono cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleColumnSort("amount")}>
                      <span className="inline-flex items-center gap-0.5">Amount{getSortIndicator("amount")}</span>
                    </TableHead>
                    <TableHead className="text-right font-medium font-mono cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleColumnSort("gainloss")}>
                      <span className="inline-flex items-center gap-0.5 justify-end w-full">Gain/Loss{getSortIndicator("gainloss")}</span>
                    </TableHead>
                    <TableHead className="text-right font-medium font-mono cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleColumnSort("date")}>
                      <span className="inline-flex items-center gap-0.5 justify-end w-full">Date{getSortIndicator("date")}</span>
                    </TableHead>
                    {showAdvancedColumns && (
                      <TableHead className="text-right font-medium font-mono cursor-pointer select-none hover:text-foreground transition-colors" onClick={() => handleColumnSort("source")}>
                        <span className="inline-flex items-center gap-0.5 justify-end w-full">Source{getSortIndicator("source")}</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentTransactions.map((transaction) => (
                    <TableRow
                      key={transaction.id}
                      className={cn(
                        "h-auto cursor-pointer transition-all duration-150 hover:bg-muted/60 hover:shadow-[inset_3px_0_0_hsl(var(--primary))]",
                        selectedTransactionIds.has(transaction.id) && "bg-muted"
                      )}
                      onClick={() => !isBulkMode && handleOpenDetail(transaction)}
                    >
                      {/* Checkbox (advanced + bulk) */}
                      {showAdvancedColumns && isBulkMode && (
                        <TableCell className="w-12">
                          <Checkbox
                            checked={selectedTransactionIds.has(transaction.id)}
                            onCheckedChange={(checked) => handleBulkSelect(transaction.id, checked as boolean)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>
                      )}

                      {/* Type */}
                      <TableCell className="font-mono">
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
                          <div
                            className="relative group"
                            onMouseEnter={() => handleMouseEnter('type')}
                            onMouseLeave={() => handleMouseLeave('type')}
                          >
                            <div className="flex flex-col gap-1 items-start">
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${getCategoryBadgeColor(transaction.type)}`}>
                                {formatTypeForDisplay(transaction.type)}
                              </span>
                              {transaction.identified ? (
                                <span className="text-[0.65rem] leading-none text-emerald-600 dark:text-emerald-400 pl-0.5">Identified</span>
                              ) : (
                                <span className="text-[0.65rem] leading-none text-rose-500 dark:text-rose-400 pl-0.5">Unidentified</span>
                              )}
                            </div>
                            {editableFields.type && (
                              <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="right" align="start">
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Buy')}>Buy</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Sell')}>Sell</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Receive')}>Receive</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Send')}>Send</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Swap')}>Swap</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Stake')}>Stake</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Bridge')}>Bridge</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'DCA')}>DCA</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'NFT Purchase')}>NFT Purchase</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Transfer')}>Transfer</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Add Liquidity')}>Add Liquidity</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Zero Transaction')}>Zero Transaction</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Spam')}>Spam</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Asset(s) - combined */}
                      <TableCell className="font-mono">
                        {transaction.outAsset && transaction.inAsset ? (
                          <span>
                            <span className="text-rose-600 dark:text-rose-400">{transaction.outAsset}</span>
                            <span className="text-muted-foreground mx-1">{"\u2192"}</span>
                            <span className="text-emerald-600 dark:text-emerald-400">{transaction.inAsset}</span>
                          </span>
                        ) : transaction.outAsset ? (
                          <span className="text-rose-600 dark:text-rose-400">{transaction.outAsset}</span>
                        ) : transaction.inAsset ? (
                          <span className="text-emerald-600 dark:text-emerald-400">{transaction.inAsset}</span>
                        ) : (
                          <span className="text-muted-foreground">{"\u2014"}</span>
                        )}
                      </TableCell>

                      {/* Amount - combined */}
                      <TableCell className="font-mono">
                        {transaction.outAmount != null && transaction.inAmount != null ? (
                          <span>
                            <span className="text-muted-foreground">{formatAmount(transaction.outAmount)}</span>
                            <span className="text-muted-foreground mx-1">{"\u2192"}</span>
                            <span className="text-muted-foreground">{formatAmount(transaction.inAmount)}</span>
                          </span>
                        ) : transaction.outAmount != null ? (
                          <span className="text-muted-foreground">{formatAmount(transaction.outAmount)}</span>
                        ) : transaction.inAmount != null ? (
                          <span className="text-muted-foreground">{formatAmount(transaction.inAmount)}</span>
                        ) : (
                          <span className="text-muted-foreground">{"\u2014"}</span>
                        )}
                      </TableCell>

                      {/* Gain/Loss */}
                      <TableCell className="text-right font-mono">
                        {transaction.gainLossUsd != null ? (
                          <span className={cn(
                            "inline-flex items-center gap-1 justify-end",
                            transaction.gainLossUsd >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          )}>
                            {transaction.gainLossUsd >= 0
                              ? <span className="text-[0.55rem] leading-none">{"\u25B2"}</span>
                              : <span className="text-[0.55rem] leading-none">{"\u25BC"}</span>}
                            ${Math.abs(transaction.gainLossUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">{"\u2014"}</span>
                        )}
                      </TableCell>

                      {/* Date */}
                      <TableCell className="text-right font-mono">
                        {editingTransactionId === transaction.id && editingField === 'date' ? (
                          <div className="flex items-center justify-end space-x-2">
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
                            <div className="flex flex-col items-end">
                              <span>{format(new Date(transaction.date), "h:mm a")}</span>
                              <span className="text-muted-foreground">{format(new Date(transaction.date), "MM/dd/yyyy")}</span>
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

                      {/* Exchange (advanced) */}
                      {showAdvancedColumns && (
                        <TableCell className="text-right font-mono">
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
                            <div
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('exchange')}
                              onMouseLeave={() => handleMouseLeave('exchange')}
                            >
                              <div className="flex items-center justify-end gap-1.5 text-xs">
                                {(() => {
                                  const source = getSourceIcon(transaction.exchange);
                                  if (!source) return null;
                                  if (source.hasLogo && sourceLogoFiles[source.key]) {
                                    return (
                                      <img
                                        src={sourceLogoFiles[source.key]}
                                        alt={source.key}
                                        className="h-5 w-5 rounded-full shrink-0"
                                      />
                                    );
                                  }
                                  return (
                                    <span className={cn("inline-flex items-center justify-center h-5 w-7 rounded text-[0.55rem] font-bold leading-none shrink-0", sourceIconColors[source.key] || "bg-muted text-muted-foreground")}>
                                      {source.key}
                                    </span>
                                  );
                                })()}
                                <span className="truncate max-w-[100px]">{shortenSource(transaction.exchange)}</span>
                              </div>
                              {editableFields.exchange && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="absolute left-0 top-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleStartEditing(transaction.id, 'exchange', transaction.exchange)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                      )}

                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {isLoadingTransactions && (
                <div className="p-4 space-y-1">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-6 py-2.5 px-2 animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                      <div className="h-5 w-16 bg-muted rounded-full" />
                      <div className="h-4 w-20 bg-muted rounded" />
                      <div className="h-4 w-16 bg-muted rounded" />
                      <div className="h-4 w-20 bg-muted rounded ml-auto" />
                      <div className="h-4 w-14 bg-muted rounded" />
                      <div className="h-4 w-24 bg-muted rounded" />
                    </div>
                  ))}
                </div>
              )}
              {!isLoadingTransactions && transactions.length === 0 && (
                <div className="py-16 text-center">
                  <ArrowRightLeft className="h-10 w-10 text-muted-foreground/25 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">No transactions found</p>
                  <p className="text-sm text-muted-foreground/60 mt-1">Try adjusting your filters or import some transactions</p>
                </div>
              )}
            </div>

            {/* Pagination */}
            {!isLoadingTransactions && transactions.length > 0 && (
              <div className="flex items-center justify-center py-4">
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
          </CardContent>
        </Card>

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
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* Cost Basis / Gain-Loss Summary */}
                  {selectedTransaction.costBasisComputed && (
                    <div className="grid grid-cols-2 gap-3">
                      {selectedTransaction.costBasisUsd != null && (
                        <div className="rounded-lg border bg-muted/30 p-3">
                          <p className="text-xs text-muted-foreground">Cost Basis</p>
                          <p className="text-lg font-bold font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            ${Math.abs(selectedTransaction.costBasisUsd).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      )}
                      {selectedTransaction.gainLossUsd != null && (
                        <div className={cn(
                          "rounded-lg border p-3",
                          selectedTransaction.gainLossUsd >= 0
                            ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-800/40 dark:bg-emerald-950/20"
                            : "border-rose-200 bg-rose-50/30 dark:border-rose-800/40 dark:bg-rose-950/20"
                        )}>
                          <p className="text-xs text-muted-foreground">Gain / Loss</p>
                          <p className={cn(
                            "text-lg font-bold font-mono",
                            selectedTransaction.gainLossUsd >= 0
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
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
