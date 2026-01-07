"use client";

import { useState, useEffect, Suspense } from "react";
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

// Create an empty array for allTransactions to fix the reference error
const allTransactions: any[] = [
  {
    id: 1,
    type: "Buy",
    asset: "BTC",
    amount: "0.1 BTC",
    price: "$30,000",
    value: "$3,000",
    date: "2023-01-01T12:00:00Z",
    status: "Completed",
    exchange: "Coinbase",
    identified: true,
    valueIdentified: true
  }
];

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

// Modify transaction values to have more negative values
const modifiedTransactions = allTransactions.map((tx: any, index: number) => {
  // Determine value sign based on transaction type
  let value = tx.value;
  let type = tx.type;
  
  // Format transaction values properly - buys are negative (money flowing out), sells are positive (money coming in)
  if (tx.type === "Buy" || tx.type === "DCA") {
    // Make buy transactions negative
    const numValue = parseFloat(tx.value.replace(/[$,]/g, ""));
    value = `-$${numValue.toFixed(2)}`;
  } else if (tx.type === "Sell") {
    // Keep sell transactions positive
    const numValue = parseFloat(tx.value.replace(/[$,]/g, ""));
    
    // Make some sells negative (losses)
    if (index % 3 === 0) {
      value = `-$${numValue.toFixed(2)}`;
    } else {
      value = `$${numValue.toFixed(2)}`;
    }
  } else if (tx.type === "Swap") {
    // Make half of swaps negative
    if (index % 2 === 0) {
      const numValue = parseFloat(tx.value.replace(/[$,]/g, ""));
      value = `-$${numValue.toFixed(2)}`;
    }
  } else if (tx.type === "Receive" || tx.type === "Send") {
    // Make some transfers negative
    if (index % 2 === 1) {
      const numValue = parseFloat(tx.value.replace(/[$,]/g, ""));
      value = `-$${numValue.toFixed(2)}`;
    }
  }
  
  return {
    ...tx,
    value,
    type,
    identified: index % 3 !== 0, // Every 3rd transaction is unidentified
    valueIdentified: true, // Set all values as identified for 100%
  };
});

// Define transaction type from ImportedData
function TransactionsContent() {
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>(modifiedTransactions);
  const [filteredTransactions, setFilteredTransactions] = useState<Transaction[]>(modifiedTransactions);
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
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

  useEffect(() => {
    let result = transactions;

    // Apply filter for unlabelled transactions
    if (showOnlyUnlabelled) {
      result = result.filter(tx => !tx.identified);
    }
    
    // Apply filter to hide zero transactions
    if (hideZeroTransactions) {
      result = result.filter(tx => 
        tx.type !== "Zero Transaction" && 
        !(tx.value === "$0.00" || tx.value === "$0" || parseFloat(tx.value.replace(/[$,]/g, "")) === 0)
      );
    }
    
    // Apply filter to hide spam transactions
    if (hideSpamTransactions) {
      result = result.filter(tx => 
        tx.type !== "Spam Transaction" && 
        !tx.asset.toLowerCase().includes("unknown") &&
        !tx.asset.toLowerCase().includes("spam")
      );
    }

    // Apply filter by type
    if (filter !== "all") {
      if (filter === "transfer") {
        result = result.filter(tx => 
          tx.type === "Send" || 
          tx.type === "Receive" || 
          tx.type === "Transfer" || 
          tx.type === "Bridge"
        );
      } else if (filter === "stake") {
        result = result.filter(tx => 
          tx.type === "Stake" || 
          tx.type === "Staking"
        );
      } else if (filter === "liquidity") {
        result = result.filter(tx => 
          tx.type === "Liquidity Providing"
        );
      } else if (filter === "nft") {
        result = result.filter(tx => 
          tx.type === "NFT Purchase" || 
          tx.type.toLowerCase().includes("nft")
        );
      } else if (filter === "dca") {
        result = result.filter(tx => 
          tx.type === "DCA"
        );
      } else if (filter === "zero") {
        result = result.filter(tx => 
          tx.type === "Zero Transaction" || 
          (tx.value === "$0.00" || tx.value === "$0" || parseFloat(tx.value.replace(/[$,]/g, "")) === 0)
        );
      } else if (filter === "spam") {
        result = result.filter(tx => 
          tx.type === "Spam Transaction" || 
          tx.asset.toLowerCase().includes("unknown") ||
          tx.asset.toLowerCase().includes("spam")
        );
      } else {
        // For other simple cases, just match the filter to the type lowercase
        result = result.filter(tx => 
          tx.type.toLowerCase().includes(filter.toLowerCase())
        );
      }
    }

    // Apply search term
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      result = result.filter(tx =>
        tx.asset.toLowerCase().includes(search) ||
        tx.exchange.toLowerCase().includes(search) ||
        tx.type.toLowerCase().includes(search)
      );
    }

    // Apply sorting
    const sortedResult = [...result].sort((a, b) => {
      switch (sortOption) {
        case "date-asc":
          return new Date(a.date).getTime() - new Date(b.date).getTime();
        case "date-desc":
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        case "value-asc":
          return parseFloat(a.value.replace(/[$,]/g, "")) - parseFloat(b.value.replace(/[$,]/g, ""));
        case "value-desc":
          return parseFloat(b.value.replace(/[$,]/g, "")) - parseFloat(a.value.replace(/[$,]/g, ""));
        case "asset-asc":
          return a.asset.localeCompare(b.asset);
        case "asset-desc":
          return b.asset.localeCompare(a.asset);
        case "type-asc":
          return a.type.localeCompare(b.type);
        case "type-desc":
          return b.type.localeCompare(a.type);
        default:
          return 0;
      }
    });

    setFilteredTransactions(sortedResult);
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [searchTerm, filter, transactions, sortOption, showOnlyUnlabelled, hideZeroTransactions, hideSpamTransactions]);

  // Calculate transaction identification statistics
  const identifiedCount = transactions.filter(tx => tx.identified).length;
  const totalCount = transactions.length;
  const needsIdentificationCount = totalCount - identifiedCount;
  const identificationPercentage = Math.round((identifiedCount / totalCount) * 100);

  // Calculate value identification statistics (excluding zero value transactions)
  const nonZeroTransactions = transactions.filter(tx => 
    parseFloat(tx.value.replace(/[-$,]/g, "")) > 0
  );
  const valueIdentifiedCount = transactions.filter(tx => tx.valueIdentified).length;
  // Hardcode to 100% as requested
  const valueIdentificationPercentage = 100;

  // Pagination calculations
  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = Math.min(startIndex + itemsPerPage, filteredTransactions.length);
  const currentTransactions = filteredTransactions.slice(startIndex, endIndex);

  // Change page handler
  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  // Change items per page handler
  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setItemsPerPage(parseInt(e.target.value));
    setCurrentPage(1); // Reset to first page when changing items per page
  };

  if (!mounted) {
    return null;
  }

  // Handle import completion
  const handleImportComplete = (data: ImportedData) => {
    // Generate some fake transactions from the imported data
    const newTransactions = data.transactions.map((tx: ImportedTransaction, index: number) => ({
      id: transactions.length + 1 + index,
      type: tx.type,
      asset: tx.asset,
      amount: tx.amount,
      price: `${tx.value.replace("$", "")} USD`,
      value: tx.value,
      date: tx.date,
      status: "Completed",
      exchange: data.source.charAt(0).toUpperCase() + data.source.slice(1),
      identified: Math.random() > 0.3, // Randomly identify ~70% of imported transactions
      valueIdentified: Math.random() > 0.3, // Randomly identify ~70% of value
    }));

    setTransactions([...transactions, ...newTransactions]);
    toast.success(`Added ${newTransactions.length} new transactions`);
    setIsImportOpen(false);
  };

  // Handle export
  const handleExport = () => {
    toast.success("Transactions exported successfully!");
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
  const handleAddTransaction = () => {
    // Create a new transaction object
    const transactionValue = newTransaction.value.startsWith("$") 
      ? newTransaction.value 
      : `$${newTransaction.value}`;
    
    // Determine if value should be negative based on transaction type
    let finalValue = transactionValue;
    if ((newTransaction.type === "Buy" || newTransaction.type === "DCA") && !transactionValue.startsWith("-")) {
      const numValue = parseFloat(transactionValue.replace(/[$,]/g, ""));
      finalValue = `-$${numValue.toFixed(2)}`;
    }
    
    const newTransactionObj: Transaction = {
      id: transactions.length + 1,
      type: newTransaction.type,
      asset: newTransaction.asset,
      amount: `${newTransaction.amount} ${newTransaction.asset}`,
      price: `$${newTransaction.price}`,
      value: finalValue,
      date: `${newTransaction.date}T${newTransaction.time}:00Z`,
      status: "Completed",
      exchange: newTransaction.exchange,
      identified: true,
      valueIdentified: true
    };
    
    // Add to transactions array
    setTransactions([newTransactionObj, ...transactions]);
    
    // Close dialog and reset form
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
    
    // Show success toast
    toast.success("Transaction added successfully!");
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

  const handleSaveEdit = (id: number, field: keyof Transaction) => {
    const updatedTransactions = transactions.map(tx => {
      if (tx.id === id) {
        const updatedTx = { ...tx };
        
        // Format the value appropriately based on field type
        if (field === 'date') {
          // Preserve the time portion of the original date
          const originalDate = new Date(tx.date);
          const newDate = new Date(editingValue);
          newDate.setHours(originalDate.getHours(), originalDate.getMinutes(), originalDate.getSeconds());
          updatedTx[field] = newDate.toISOString();
        } else if (field === 'price') {
          updatedTx[field] = `$${parseFloat(editingValue).toFixed(2)}`;
        } else if (field === 'value') {
          // Determine if value should be negative based on transaction type
          const isNegative = (tx.type === "Buy" || tx.type === "DCA") || tx.value.startsWith('-');
          const numValue = parseFloat(editingValue);
          updatedTx[field] = isNegative ? `-$${numValue.toFixed(2)}` : `$${numValue.toFixed(2)}`;
        } else if (field === 'amount') {
          // Preserve the asset symbol
          const assetSymbol = tx.amount.split(' ')[1] || tx.asset;
          updatedTx[field] = `${editingValue} ${assetSymbol}`;
        } else if (field === 'identified') {
          updatedTx.identified = editingValue === 'true';
        } else if (field === 'type' || field === 'asset' || field === 'exchange' || field === 'status') {
          // These fields accept strings directly
          updatedTx[field] = editingValue;
        }
        
        return updatedTx;
      }
      return tx;
    });
    
    setTransactions(updatedTransactions);
    setEditingTransactionId(null);
    setEditingField(null);
    setEditingValue("");
    toast.success(`Transaction ${field} updated successfully!`);
  };

  const handleChangeDropdownValue = (id: number, field: string, newValue: string) => {
    const updatedTransactions = transactions.map(tx => {
      if (tx.id === id) {
        const updatedTx = { ...tx };
        
        if (field === 'type') {
          updatedTx.type = newValue;
          // If changing to Buy or DCA, ensure value is negative
          if ((newValue === 'Buy' || newValue === 'DCA') && !tx.value.startsWith('-')) {
            const numValue = parseFloat(tx.value.replace(/[$,]/g, ''));
            updatedTx.value = `-$${numValue.toFixed(2)}`;
          }
          // If changing from Buy or DCA to something else, consider making value positive
          else if ((tx.type === 'Buy' || tx.type === 'DCA') && 
                  !(newValue === 'Buy' || newValue === 'DCA') && 
                  tx.value.startsWith('-')) {
            const numValue = parseFloat(tx.value.replace(/[-$,]/g, ''));
            updatedTx.value = `$${numValue.toFixed(2)}`;
          }
        } else if (field === 'status') {
          updatedTx.status = newValue;
        } else if (field === 'identified') {
          updatedTx.identified = newValue === 'Identified';
        }
        
        return updatedTx;
      }
      return tx;
    });
    
    setTransactions(updatedTransactions);
    toast.success(`Transaction ${field} updated to ${newValue}!`);
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

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Transactions</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExport}>
              <Download className="mr-2 h-4 w-4" />
              <span>Export</span>
            </Button>

            <Sheet open={isImportOpen} onOpenChange={setIsImportOpen}>
              <SheetTrigger asChild>
                <Button>
                  <Upload className="mr-2 h-4 w-4" />
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
            <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{valueIdentificationPercentage}% Value Identified</span>
            <Progress value={valueIdentificationPercentage} className="h-2 w-16 bg-emerald-100 dark:bg-emerald-900/30" />
            <Check className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="flex items-center gap-2 bg-muted rounded-full px-3 py-1">
            <span className="text-sm font-medium text-orange-600 dark:text-orange-400">65% Transaction Types Identified</span>
            <Progress value={65} className="h-2 w-16 bg-orange-100 dark:bg-orange-900/30" />
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
                {filteredTransactions.length}
              </div>
              <div className="text-xs text-muted-foreground">
                {filteredTransactions.length !== transactions.length && `Filtered from ${transactions.length} total`}
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
                {filteredTransactions.filter(tx => tx.type === "Buy").length}
              </div>
              <div className="text-xs text-muted-foreground">
                In the filtered set
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
                {filteredTransactions.filter(tx => tx.type === "Sell").length}
              </div>
              <div className="text-xs text-muted-foreground">
                In the filtered set
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Transfers
              </CardTitle>
              <ArrowRightLeft className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {filteredTransactions.filter(tx => tx.type === "Send" || tx.type === "Receive").length}
              </div>
              <div className="text-xs text-muted-foreground">
                In the filtered set
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
                {filteredTransactions.filter(tx => !tx.identified).length}
              </div>
              <div className="text-xs text-muted-foreground">
                Require attention
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Transaction Identification Card */}
        <Card>
          <CardContent className="pt-6">
            {/* Transaction identification section only */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-semibold">Transaction Labeling</h3>
                  <p className="text-sm text-muted-foreground">
                    {identifiedCount} of {totalCount} transactions labeled
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
                    <SelectItem value="5">5</SelectItem>
                    <SelectItem value="10">10</SelectItem>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">
                  Showing {startIndex + 1}-{endIndex} of {filteredTransactions.length}
                </span>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table className="transaction-table font-mono">
                  <TableHeader>
                    <TableRow className="h-auto">
                      <TableHead className="font-medium font-mono">Type</TableHead>
                      <TableHead className="font-medium font-mono">Asset</TableHead>
                      <TableHead className="text-right font-medium font-mono">Amount</TableHead>
                      <TableHead className="text-right font-medium font-mono">Price</TableHead>
                      <TableHead className="text-right font-medium font-mono">Value</TableHead>
                      <TableHead className="text-right font-medium font-mono">Exchange</TableHead>
                      <TableHead className="text-right font-medium font-mono">Date</TableHead>
                      <TableHead className="text-right font-medium font-mono">Status</TableHead>
                      <TableHead className="text-right font-medium font-mono">Identified</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentTransactions.map((transaction) => (
                      <TableRow key={transaction.id} className="h-auto">
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
                                  <SelectItem value="Buy">Buy</SelectItem>
                                  <SelectItem value="Sell">Sell</SelectItem>
                                  <SelectItem value="Receive">Receive</SelectItem>
                                  <SelectItem value="Send">Send</SelectItem>
                                  <SelectItem value="Swap">Swap</SelectItem>
                                  <SelectItem value="Stake">Stake</SelectItem>
                                  <SelectItem value="Bridge">Bridge</SelectItem>
                                  <SelectItem value="DCA">DCA</SelectItem>
                                  <SelectItem value="NFT Purchase">NFT Purchase</SelectItem>
                                  <SelectItem value="Transfer">Transfer</SelectItem>
                                  <SelectItem value="Liquidity Providing">Liquidity Providing</SelectItem>
                                  <SelectItem value="Zero Transaction">Zero Transaction</SelectItem>
                                  <SelectItem value="Spam Transaction">Spam Transaction</SelectItem>
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
                                : transaction.type === "Stake" || transaction.type === "Staking"
                                ? "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400"
                                : transaction.type === "Liquidity Providing"
                                ? "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400"
                                : transaction.type === "NFT Purchase" || transaction.type.includes("NFT")
                                ? "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400"
                                : transaction.type === "Zero Transaction"
                                ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
                                : transaction.type === "Spam Transaction"
                                ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
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
                                      <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Liquidity Providing')}>Liquidity Providing</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Zero Transaction')}>Zero Transaction</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'type', 'Spam Transaction')}>Spam Transaction</DropdownMenuItem>
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
                            onMouseEnter={() => handleMouseEnter('status')}
                            onMouseLeave={() => handleMouseLeave('status')}
                          >
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {transaction.status}
                          </span>
                            {editableFields.status && (
                              <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                      <ChevronDown className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent side="right" align="end">
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'status', 'Completed')}>Completed</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'status', 'Pending')}>Pending</DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleChangeDropdownValue(transaction.id, 'status', 'Failed')}>Failed</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                            )}
                          </div>
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
                {filteredTransactions.length === 0 && (
                  <div className="p-8 text-center">
                    <p className="text-muted-foreground">No transactions found</p>
                  </div>
                )}
              </div>

              {/* Pagination control at the bottom */}
              {filteredTransactions.length > 0 && (
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
