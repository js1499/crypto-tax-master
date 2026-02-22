"use client";

import { useState, useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowRightLeft,
  Download,
  Filter,
  Search,
  ArrowDownRight,
  ArrowUpRight,
  Upload,
  Plus,
  ArrowUpDown,
  Check,
  AlertCircle,
  EyeOff,
  Tag,
  Calendar,
  CreditCard,
  Pencil,
  ChevronDown,
  X,
  FileText,
  Trash2,
  Merge,
  ExternalLink,
  MoreVertical,
  CheckSquare,
  Square,
  Loader2,
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
  [key: string]: any; // Add index signature to allow string-based property access
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
    pnl: { totalInflow: number; totalOutflow: number; netCashFlow: number };
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

  // Change page handler
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Change items per page handler
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  // Handle import completion
  const handleImportComplete = (data: ImportedData) => {
    toast.success(`Added ${data.transactions.length} new transactions`);
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
        const isNegative = (tx.type === "Buy" || tx.type === "DCA");
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
        const outflowTypes = ['Buy', 'DCA', 'Send', 'Withdraw', 'Bridge', 'Swap'];
        if (outflowTypes.includes(newValue)) {
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

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Transactions</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={isBulkMode ? "default" : "outline"}
              onClick={() => {
                setIsBulkMode(!isBulkMode);
                setSelectedTransactionIds(new Set());
              }}
            >
              {isBulkMode ? (
                <>
                  <CheckSquare className="mr-2 h-4 w-4" />
                  <span>Bulk Mode</span>
                </>
              ) : (
                <>
                  <Square className="mr-2 h-4 w-4" />
                  <span>Select</span>
                </>
              )}
            </Button>

            {isBulkMode && selectedTransactionIds.size > 0 && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBulkUpdate({ identified: true })}
                >
                  <Check className="mr-2 h-4 w-4" />
                  Mark Identified ({selectedTransactionIds.size})
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="text-destructive"
                >
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

            <Dialog open={isDeleteAllOpen} onOpenChange={setIsDeleteAllOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  <span>Delete All</span>
                </Button>
              </DialogTrigger>
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
                  <Button
                    variant="outline"
                    onClick={() => setIsDeleteAllOpen(false)}
                    disabled={isDeletingAll}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteAll}
                    disabled={isDeletingAll}
                  >
                    {isDeletingAll ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete All
                      </>
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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
                  <span>Add Transaction</span>
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
                    <Label htmlFor="type" className="text-right col-span-1">
                      Type
                    </Label>
                    <Select
                      name="type"
                      value={newTransaction.type}
                      onValueChange={(value) => handleFormChange({ 
                        target: { name: "type", value } 
                      } as React.ChangeEvent<HTMLSelectElement>)}
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
                    <Label htmlFor="exchange" className="text-right col-span-1">
                      Exchange/Wallet
                    </Label>
                    <Input
                      id="exchange"
                      name="exchange"
                      placeholder="Coinbase, Binance, etc."
                      value={newTransaction.exchange}
                      onChange={handleFormChange}
                      className="col-span-4"
                    />
                  </div>
                  
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="asset" className="text-right col-span-1">
                      Asset
                    </Label>
                    <Input
                      id="asset"
                      name="asset"
                      placeholder="BTC, ETH, etc."
                      value={newTransaction.asset}
                      onChange={handleFormChange}
                      className="col-span-4"
                    />
                  </div>
                  
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="amount" className="text-right col-span-1">
                      Amount
                    </Label>
                    <Input
                      id="amount"
                      name="amount"
                      placeholder="1.5"
                      type="number"
                      step="0.000001"
                      value={newTransaction.amount}
                      onChange={handleFormChange}
                      className="col-span-4"
                    />
                  </div>
                  
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="price" className="text-right col-span-1">
                      Price
                    </Label>
                    <div className="relative col-span-4">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <span className="text-gray-500">$</span>
                      </div>
                      <Input
                        id="price"
                        name="price"
                        placeholder="30000.00"
                        type="number"
                        step="0.01"
                        value={newTransaction.price}
                        onChange={handleFormChange}
                        className="pl-8"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="date" className="text-right col-span-1">
                      Date & Time
                    </Label>
                    <div className="col-span-4 flex gap-2">
                      <div className="relative flex-1">
                        <CalendarComponent className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="date"
                          name="date"
                          type="date"
                          value={newTransaction.date}
                          onChange={handleFormChange}
                          className="pl-8"
                        />
                      </div>
                      <Input
                        id="time"
                        name="time"
                        type="time"
                        value={newTransaction.time}
                        onChange={handleFormChange}
                        className="w-32"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-5 items-center gap-4">
                    <Label htmlFor="value" className="text-right col-span-1">
                      Value
                    </Label>
                    <div className="relative col-span-4">
                      <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                        <span className="text-gray-500">$</span>
                      </div>
                      <Input
                        id="value"
                        name="value"
                        placeholder="1500.00"
                        type="number"
                        step="0.01"
                        value={newTransaction.value}
                        onChange={handleFormChange}
                        className="pl-8"
                      />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsAddTransactionOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleAddTransaction}>
                    Add Transaction
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Transaction Identification Indicators */}
        <div className="flex flex-col gap-2 sm:flex-row items-start sm:items-center">
          <div className="flex items-center gap-2 bg-muted rounded-full px-3 py-1">
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{stats?.valueIdentifiedPercentage ?? 0}% Value Identified</span>
            <Progress value={stats?.valueIdentifiedPercentage ?? 0} className="h-2 w-16 bg-emerald-100 dark:bg-emerald-900/30" />
            <Check className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2 bg-muted rounded-full px-3 py-1">
            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">{stats?.identifiedPercentage ?? 0}% Transaction Types Identified</span>
            <Progress value={stats?.identifiedPercentage ?? 0} className="h-2 w-16 bg-orange-100 dark:bg-orange-900/30" />
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Transactions
              </CardTitle>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingTransactions ? "..." : totalCount}
              </div>
              <div className="text-xs text-muted-foreground">
                Across all pages
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Buy Transactions
              </CardTitle>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingTransactions ? "..." : (stats?.buyCount ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Across all pages
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Sell Transactions
              </CardTitle>
              <ArrowDownRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingTransactions ? "..." : (stats?.sellCount ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Across all pages
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Other
              </CardTitle>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingTransactions ? "..." : (stats?.otherCount ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Across all pages
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Unlabelled
              </CardTitle>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {isLoadingTransactions ? "..." : (stats?.unlabelledCount ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">
                Across all pages
              </div>
            </CardContent>
          </Card>
        </div>

        {/* P&L Summary Card */}
        {stats?.pnl && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-semibold">Cash Flow Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Inflow</p>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                    ${stats.pnl.totalInflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Outflow</p>
                  <p className="text-xl font-bold text-rose-600 dark:text-rose-400">
                    ${stats.pnl.totalOutflow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net Cash Flow</p>
                  <p className={cn(
                    "text-xl font-bold",
                    stats.pnl.netCashFlow >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-rose-600 dark:text-rose-400"
                  )}>
                    {stats.pnl.netCashFlow >= 0 ? "+" : ""}${stats.pnl.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add Transaction Identification Card */}
        <Card>
          <CardContent className="pt-6">
            {/* Transaction identification section only */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">Transaction Labeling</h3>
                  <p className="text-sm text-muted-foreground">
                    {isLoadingTransactions 
                      ? "Loading..." 
                      : `${identifiedCount} of ${currentPageCount} transactions labeled (page ${currentPage} of ${totalPages})`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">{identificationPercentage}%</span>
                  {identificationPercentage === 100 ? (
                    <Check className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-amber-500" />
                  )}
                </div>
              </div>
              <Progress value={identificationPercentage} className="h-2 w-full" />
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-3 w-3 rounded-full bg-emerald-500"></span>
                  <span>Labeled: {identifiedCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="inline-flex h-3 w-3 rounded-full bg-amber-500"></span>
                  <span>Need Labeling: {needsIdentificationCount}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Search, filters, and sorting section */}
          <div className="flex flex-col gap-4">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search transactions..."
                className="pl-8"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            {/* Filters and sorting controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Filter buttons */}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={showOnlyUnlabelled ? "default" : "outline"}
                  size="sm"
                  onClick={toggleUnlabelledFilter}
                  className={cn(
                    "h-9 transition-colors",
                    showOnlyUnlabelled && "bg-primary text-primary-foreground hover:bg-primary/90"
                  )}
                >
                  <Tag className="mr-2 h-4 w-4" />
                  {showOnlyUnlabelled ? "Show All" : "Only Unlabelled"}
                </Button>
                
                <Button
                  variant={hideZeroTransactions ? "default" : "outline"}
                  size="sm"
                  onClick={toggleHideZeroTransactions}
                  className={cn(
                    "h-9 transition-colors",
                    hideZeroTransactions && "bg-orange-500 text-white hover:bg-orange-600"
                  )}
                >
                  <EyeOff className="mr-2 h-4 w-4" />
                  {hideZeroTransactions ? "Show Zero Tx" : "Hide Zero Tx"}
                </Button>
                
                <Button
                  variant={hideSpamTransactions ? "default" : "outline"}
                  size="sm"
                  onClick={toggleHideSpamTransactions}
                  className={cn(
                    "h-9 transition-colors",
                    hideSpamTransactions && "bg-amber-500 text-white hover:bg-amber-600"
                  )}
                >
                  <EyeOff className="mr-2 h-4 w-4" />
                  {hideSpamTransactions ? "Show Spam Tx" : "Hide Spam Tx"}
                </Button>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 transition-colors",
                        dateFrom && "bg-blue-500 text-white hover:bg-blue-600"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateFrom ? format(dateFrom, "MMM d, yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateFrom}
                      onSelect={(date) => {
                        setDateFrom(date);
                        setCurrentPage(1);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        "h-9 transition-colors",
                        dateTo && "bg-blue-500 text-white hover:bg-blue-600"
                      )}
                    >
                      <Calendar className="mr-2 h-4 w-4" />
                      {dateTo ? format(dateTo, "MMM d, yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={dateTo}
                      onSelect={(date) => {
                        setDateTo(date);
                        setCurrentPage(1);
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>

                {(dateFrom || dateTo) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2"
                    onClick={() => {
                      setDateFrom(undefined);
                      setDateTo(undefined);
                      setCurrentPage(1);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}

                {wallets.length > 0 && (
                  <Select value={walletFilter} onValueChange={(value) => {
                    setWalletFilter(value === "all" ? "" : value);
                    setCurrentPage(1);
                  }}>
                    <SelectTrigger className="h-9 w-[200px]">
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
                )}
              </div>
              
              {/* Sorting dropdown */}
              <div className="w-full">
                <Select value={sortOption} onValueChange={setSortOption}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sort by">
                      <div className="flex items-center">
                        <ArrowUpDown className="mr-2 h-3.5 w-3.5" />
                        <span>
                          {sortOption === "date-desc"
                            ? "Newest First"
                            : sortOption === "date-asc"
                            ? "Oldest First"
                            : sortOption === "value-desc"
                            ? "Highest Value"
                            : sortOption === "value-asc"
                            ? "Lowest Value"
                            : sortOption === "asset-asc"
                            ? "Asset A-Z"
                            : sortOption === "asset-desc"
                            ? "Asset Z-A"
                            : sortOption === "type-asc"
                            ? "Type A-Z"
                            : "Type Z-A"}
                        </span>
                      </div>
                    </SelectValue>
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
            </div>
            
            {/* Transaction type tabs in a dedicated line with equal width */}
            <div className="w-full">
              <Tabs defaultValue="all" className="w-full" onValueChange={setFilter} value={filter}>
                <TabsList className="w-full flex justify-between">
                  <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                  <TabsTrigger value="buy" className="flex-1">Buy</TabsTrigger>
                  <TabsTrigger value="sell" className="flex-1">Sell</TabsTrigger>
                  <TabsTrigger value="transfer" className="flex-1">Transfers</TabsTrigger>
                  <TabsTrigger value="swap" className="flex-1">Swaps</TabsTrigger>
                  <TabsTrigger value="stake" className="flex-1">Staking</TabsTrigger>
                  <TabsTrigger value="liquidity" className="flex-1">Liquidity</TabsTrigger>
                  <TabsTrigger value="nft" className="flex-1">NFT</TabsTrigger>
                  <TabsTrigger value="dca" className="flex-1">DCA</TabsTrigger>
                  <TabsTrigger value="zero" className="flex-1">Zero</TabsTrigger>
                  <TabsTrigger value="spam" className="flex-1">Spam</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Pagination and items per page controls */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="itemsPerPage" className="whitespace-nowrap text-xs">Items per page:</Label>
                <Select value={itemsPerPage.toString()} onValueChange={(value) => {
                  setItemsPerPage(parseInt(value));
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="h-8 w-[90px]">
                    <SelectValue placeholder="10" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                    <SelectItem value="250">250</SelectItem>
                    <SelectItem value="500">500</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  {isLoadingTransactions 
                    ? "Loading..." 
                    : `Showing ${startIndex + 1}-${endIndex} of ${totalCount}`}
                </span>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-0" data-onboarding="review-transactions">
              <div className="overflow-x-auto">
                <Table className="transaction-table font-mono">
                  <TableHeader>
                    <TableRow className="h-auto">
                      {isBulkMode && (
                        <TableHead className="w-12">
                          <Checkbox
                            checked={selectedTransactionIds.size === transactions.length && transactions.length > 0}
                            onCheckedChange={handleBulkSelectAll}
                          />
                        </TableHead>
                      )}
                      <TableHead className="font-medium font-mono">Type</TableHead>
                      <TableHead className="font-medium font-mono">Asset</TableHead>
                      <TableHead className="text-right font-medium font-mono">Amount</TableHead>
                      <TableHead className="text-right font-medium font-mono">Price</TableHead>
                      <TableHead className="text-right font-medium font-mono">Value</TableHead>
                      <TableHead className="text-right font-medium font-mono">Exchange</TableHead>
                      <TableHead className="text-right font-medium font-mono">Date</TableHead>
                      <TableHead className="text-right font-medium font-mono">Identified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentTransactions.map((transaction) => (
                      <TableRow 
                        key={transaction.id} 
                        className={cn(
                          "h-auto cursor-pointer hover:bg-muted/50",
                          selectedTransactionIds.has(transaction.id) && "bg-muted"
                        )}
                        onClick={() => !isBulkMode && handleOpenDetail(transaction)}
                      >
                        {isBulkMode && (
                          <TableCell className="w-12">
                            <Checkbox
                              checked={selectedTransactionIds.has(transaction.id)}
                              onCheckedChange={(checked) => 
                                handleBulkSelect(transaction.id, checked as boolean)
                              }
                              onClick={(e) => e.stopPropagation()}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-mono">
                          {editingTransactionId === transaction.id && editingField === 'type' ? (
                            <div className="flex items-center space-x-2">
                              <Select
                                value={editingValue}
                                onValueChange={(value) => setEditingValue(value)}
                              >
                                <SelectTrigger className="h-8 w-full">
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                  {transactionTypes.map((type) => (
                                    <SelectItem key={type.value} value={type.value}>
                                      {type.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Button 
                                onClick={() => handleSaveEdit(transaction.id, 'type')} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                onClick={handleCancelEditing} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('type')}
                              onMouseLeave={() => handleMouseLeave('type')}
                            >
                          <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                              transaction.type === "Buy" || transaction.type === "DCA"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : transaction.type === "Sell"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                                : transaction.type === "Receive" || transaction.type === "Send" || transaction.type === "Transfer"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                : transaction.type === "Swap"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" 
                                : transaction.type === "Bridge"
                                ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                                : transaction.type === "Stake" || transaction.type === "Unstake"
                                ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400"
                                : transaction.type === "Add Liquidity" || transaction.type === "Remove Liquidity"
                                ? "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400"
                                : transaction.type === "NFT Purchase" || transaction.type.includes("NFT")
                                ? "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400"
                                : transaction.type === "Zero Transaction"
                                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                                : transaction.type === "Spam"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
                                : transaction.type === "Deposit"
                                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                : transaction.type === "Withdraw"
                                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                                : transaction.type === "Burn"
                                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                : transaction.type === "Mint"
                                ? "bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400"
                                : transaction.type === "Wrap" || transaction.type === "Unwrap"
                                ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
                                : transaction.type === "Approve" || transaction.type === "Self"
                                ? "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400"
                                : transaction.type === "NFT Activity"
                                ? "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400"
                                : transaction.type === "DeFi Setup"
                                ? "bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-400"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}
                          >
                            {transaction.type}
                          </span>
                              
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
                        
                        <TableCell className="asset-column font-mono text-xs">
                          {editingTransactionId === transaction.id && editingField === 'asset' ? (
                            <div className="flex items-center space-x-2">
                              <Input 
                                value={editingValue} 
                                onChange={(e) => setEditingValue(e.target.value)}
                                className="h-8 w-full text-xs"
                              />
                              <Button 
                                onClick={() => handleSaveEdit(transaction.id, 'asset')} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                onClick={handleCancelEditing} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('asset')}
                              onMouseLeave={() => handleMouseLeave('asset')}
                            >
                              <div className="text-xs">{transaction.asset}</div>
                              {editableFields.asset && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="absolute right-0 top-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleStartEditing(transaction.id, 'asset', transaction.asset)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        
                        <TableCell className="text-right numeric-column crypto-amount font-mono">
                          {editingTransactionId === transaction.id && editingField === 'amount' ? (
                            <div className="flex items-center justify-end space-x-2">
                              <Input 
                                value={editingValue} 
                                onChange={(e) => setEditingValue(e.target.value)}
                                className="h-8 w-24 text-right"
                                type="number"
                                step="0.000001"
                              />
                              <Button 
                                onClick={() => handleSaveEdit(transaction.id, 'amount')} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                onClick={handleCancelEditing} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('amount')}
                              onMouseLeave={() => handleMouseLeave('amount')}
                            >
                              <div className="flex items-center justify-end">
                                <span className="crypto-amount font-mono">{transaction.amount}</span>
                              </div>
                              {editableFields.amount && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="absolute left-0 top-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleStartEditing(transaction.id, 'amount', transaction.amount)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        
                        <TableCell className="text-right numeric-column crypto-amount font-mono">
                          {editingTransactionId === transaction.id && editingField === 'price' ? (
                            <div className="flex items-center justify-end space-x-2">
                              <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                                  <span className="text-gray-500">$</span>
                                </div>
                                <Input 
                                  value={editingValue} 
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  className="h-8 w-24 pl-6 text-right"
                                  type="number"
                                  step="0.01"
                                />
                              </div>
                              <Button 
                                onClick={() => handleSaveEdit(transaction.id, 'price')} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                onClick={handleCancelEditing} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('price')}
                              onMouseLeave={() => handleMouseLeave('price')}
                            >
                              <div className="flex items-center justify-end">
                                <span className="crypto-amount font-mono">{transaction.price}</span>
                              </div>
                              {editableFields.price && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="absolute left-0 top-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleStartEditing(transaction.id, 'price', transaction.price)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        
                        <TableCell className="text-right font-mono">
                          {editingTransactionId === transaction.id && editingField === 'value' ? (
                            <div className="flex items-center justify-end space-x-2">
                              <div className="relative flex-1">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-2 pointer-events-none">
                                  <span className="text-gray-500">$</span>
                                </div>
                                <Input 
                                  value={editingValue} 
                                  onChange={(e) => setEditingValue(e.target.value)}
                                  className="h-8 w-24 pl-6 text-right"
                                  type="number"
                                  step="0.01"
                                />
                              </div>
                              <Button 
                                onClick={() => handleSaveEdit(transaction.id, 'value')} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                onClick={handleCancelEditing} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('value')}
                              onMouseLeave={() => handleMouseLeave('value')}
                            >
                          <div className={cn(
                                "flex items-center justify-end numeric-column",
                            parseFloat(transaction.value.replace(/[-$,]/g, "")) > 0 && !transaction.value.startsWith("-") 
                              ? "text-emerald-600 dark:text-emerald-400" 
                              : "text-rose-600 dark:text-rose-400"
                          )}>
                            {parseFloat(transaction.value.replace(/[-$,]/g, "")) > 0 && !transaction.value.startsWith("-") ? (
                                  <ArrowUpRight className="mr-0.5 h-2.5 w-2.5" />
                            ) : (
                                  <ArrowDownRight className="mr-0.5 h-2.5 w-2.5" />
                            )}
                                <span className="crypto-amount font-mono">{transaction.value}</span>
                          </div>
                              {editableFields.value && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  className="absolute left-0 top-0 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => handleStartEditing(transaction.id, 'value', transaction.value)}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}
                        </TableCell>
                        
                        <TableCell className="text-right font-mono text-xs">
                          {editingTransactionId === transaction.id && editingField === 'exchange' ? (
                            <div className="flex items-center justify-end space-x-2">
                              <Input 
                                value={editingValue} 
                                onChange={(e) => setEditingValue(e.target.value)}
                                className="h-8 w-full text-xs"
                              />
                              <Button 
                                onClick={() => handleSaveEdit(transaction.id, 'exchange')} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                onClick={handleCancelEditing} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('exchange')}
                              onMouseLeave={() => handleMouseLeave('exchange')}
                            >
                              <div className="flex justify-end text-xs">
                                {transaction.exchange}
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
                        
                        <TableCell className="text-right font-mono text-xs">
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
                              <Button 
                                onClick={() => handleSaveEdit(transaction.id, 'date')} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button 
                                onClick={handleCancelEditing} 
                                variant="outline" 
                                size="sm"
                                className="h-8 px-2"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div 
                              className="relative group"
                              onMouseEnter={() => handleMouseEnter('date')}
                              onMouseLeave={() => handleMouseLeave('date')}
                            >
                              <div className="flex justify-end text-xs">
                                {format(new Date(transaction.date), "MM/dd/yyyy")}
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
                        
                        <TableCell className="text-right font-mono">
                          <div className="relative group flex justify-end"
                            onMouseEnter={() => handleMouseEnter('identified')}
                            onMouseLeave={() => handleMouseLeave('identified')}
                          >
                          {transaction.identified ? (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                                <Check className="mr-0.5 h-2.5 w-2.5" />
                              Identified
                            </span>
                          ) : (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                <AlertCircle className="mr-0.5 h-2.5 w-2.5" />
                                Needs ID
                            </span>
                          )}
                            {editableFields.identified && (
                              <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="right" align="end">
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'identified', 'Identified')}>
                                      <Check className="mr-2 h-4 w-4 text-emerald-500" />
                                      Identified
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'identified', 'Needs Review')}>
                                      <AlertCircle className="mr-2 h-4 w-4 text-amber-500" />
                                      Needs Review
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {isLoadingTransactions && (
                  <div className="p-8 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <p className="text-muted-foreground">Loading transactions...</p>
                    </div>
                  </div>
                )}
                {!isLoadingTransactions && transactions.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-muted-foreground">No transactions found</p>
                  </div>
                )}
              </div>

              {/* Pagination control at the bottom */}
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

                      {/* Generate page numbers */}
                      {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                        // For pagination with ellipsis
                        let pageNumber: number;
                        
                        if (totalPages <= 7) {
                          // Less than 7 pages, show all
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          // Near the start
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
                          // Near the end
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
                          // In the middle
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

                        // Return page number link
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
        </div>

        {/* Transaction Detail Sheet */}
        <Sheet open={isDetailSheetOpen} onOpenChange={setIsDetailSheetOpen}>
          <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
            {selectedTransaction && (
              <>
                <SheetHeader>
                  <SheetTitle>Transaction Details</SheetTitle>
                  <SheetDescription>
                    Review and edit transaction information
                  </SheetDescription>
                </SheetHeader>

                <div className="mt-6 space-y-6">
                  {/* Transaction Type */}
                  <div className="space-y-2">
                    <Label>Transaction Type</Label>
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
                      <Label>Asset</Label>
                      <Input
                        value={selectedTransaction.asset}
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
                      <Label>Status</Label>
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
                      <Label>Amount</Label>
                      <Input
                        value={selectedTransaction.amount.split(' ')[0]}
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
                      <Label>Value (USD)</Label>
                      <Input
                        value={selectedTransaction.value.replace(/[$,]/g, '')}
                        onChange={(e) => {
                          const numValue = parseFloat(e.target.value);
                          const isNegative = selectedTransaction.value.startsWith('-');
                          const updated = { ...selectedTransaction, value: `${isNegative ? '-' : ''}$${numValue.toFixed(2)}` };
                          setSelectedTransaction(updated);
                        }}
                        onBlur={() => {
                          const numValue = parseFloat(selectedTransaction.value.replace(/[-$,]/g, ''));
                          if (!isNaN(numValue)) {
                            setEditingValue(numValue.toString());
                            handleSaveEdit(selectedTransaction.id, 'value');
                          }
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Exchange/Source</Label>
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
                    <div className="space-y-2">
                      <Label>Date</Label>
                      <Input
                        type="datetime-local"
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
                      <Label>Notes</Label>
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
                      <div className="p-3 rounded-md bg-muted min-h-[80px]">
                        {selectedTransaction.notes ? (
                          <p className="text-sm whitespace-pre-wrap">{selectedTransaction.notes}</p>
                        ) : (
                          <p className="text-sm text-muted-foreground">No notes added</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Additional Info */}
                  {selectedTransaction.txHash && (
                    <div className="space-y-2">
                      <Label>Transaction Hash</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          value={selectedTransaction.txHash}
                          readOnly
                          className="font-mono text-xs"
                        />
                        {selectedTransaction.chain && (
                          <Button
                            variant="outline"
                            size="sm"
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
                      onClick={() => handleDeleteTransaction(selectedTransaction.id)}
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Transaction
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleChangeDropdownValue(selectedTransaction.id, 'identified', selectedTransaction.identified ? 'Needs Review' : 'Identified');
                      }}
                    >
                      {selectedTransaction.identified ? (
                        <>
                          <AlertCircle className="mr-2 h-4 w-4" />
                          Mark as Unidentified
                        </>
                      ) : (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Mark as Identified
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
                                <div className="font-medium">{tx.type} - {tx.asset}</div>
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
