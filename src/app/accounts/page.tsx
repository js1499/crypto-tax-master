"use client";

import { useState, useEffect, Suspense } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PlusCircle,
  Plus,
  Wallet,
  Building,
  ExternalLink,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  RotateCw,
  Trash2,
  Link2,
  DollarSign,
  Pencil,
  Copy,
  ChevronDown,
  Wrench,
  Upload,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WalletConnectDialog } from "@/components/wallet-connect-dialog";
import type { ConnectionResult } from "@/types/wallet";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useSyncPipeline } from "@/components/sync-pipeline/pipeline-provider";

// Define types
interface BaseAccount {
  id: string;
  name: string;
  type: string;
  provider: string;
  createdAt: string;
  updatedAt: string;
}

interface WalletAccount extends BaseAccount {
  type: "wallet";
  address: string;
  transactionCount: number;
}

interface ExchangeAccount extends BaseAccount {
  type: "exchange";
  isConnected?: boolean;
  lastSyncAt?: string;
}

type Account = WalletAccount | ExchangeAccount;

// Provider logo mapping
const PROVIDER_LOGOS: Record<string, string> = {
  solana: "/logos/SOL.png",
  "solana wallet": "/logos/SOL.png",
  ethereum: "/logos/ETH.png",
  "ethereum wallet": "/logos/ETH.png",
  bitcoin: "/logos/BTC.png",
  "bitcoin wallet": "/logos/BTC.png",
  coinbase: "/logos/coinbase.png",
  binance: "/logos/binance.jpg",
  kraken: "/logos/kraken.svg",
  gemini: "/logos/gemini.png",
  kucoin: "/logos/kucoin.png",
};

function getProviderLogo(provider: string): string | null {
  const key = provider.toLowerCase();
  return PROVIDER_LOGOS[key] || null;
}

// Create a separate component for the accounts page content
function AccountsContent() {
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [addDialogBulk, setAddDialogBulk] = useState(false);
  const {
    startSyncAll,
    isRunning: isPipelineRunning,
    refreshKey,
  } = useSyncPipeline();
  const [exclusiveWallets, setExclusiveWallets] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<{
    success?: boolean;
    error?: string;
  } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [enriching, setEnriching] = useState<string | null>(null);
  const [enrichingAll, setEnrichingAll] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [walletSuggestions, setWalletSuggestions] = useState<
    Array<{
      address: string;
      txnCount: number;
      totalValue: number;
      inCount: number;
      outCount: number;
      chain: string;
    }>
  >([]);

  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  const dispatchPlanStatusRefresh = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("glide:refresh-plan-status"));
    }
  };

  // Function to fetch wallets from API
  const fetchWallets = async () => {
    setLoading(true);
    setError(null);

    try {
      console.log("[Accounts] Fetching wallets and exchanges from API");

      // Add timeout to prevent hanging
      const [walletsResponse, exchangesResponse] = await Promise.all([
        axios.get("/api/wallets", { timeout: 10000 }),
        axios.get("/api/exchanges", { timeout: 10000 }),
      ]);

      // Check for errors in responses
      if (walletsResponse.data.error) {
        throw new Error(walletsResponse.data.error);
      }
      if (exchangesResponse.data.error) {
        throw new Error(exchangesResponse.data.error);
      }

      // Handle 401 - redirect to login (but check session status first to avoid loops)
      if (walletsResponse.status === 401 || exchangesResponse.status === 401) {
        // Only redirect if session is confirmed unauthenticated
        if (sessionStatus === "unauthenticated") {
          router.replace("/login");
        }
        return;
      }

      // Map API response to account objects
      const wallets: WalletAccount[] = (walletsResponse.data.wallets || []).map(
        (wallet: any) => ({
          id: wallet.id,
          name: wallet.name,
          type: "wallet",
          provider: wallet.provider,
          address: wallet.address,
          createdAt: wallet.createdAt,
          updatedAt: wallet.updatedAt,
          transactionCount: wallet.transactionCount || 0,
        }),
      );

      // Map exchanges from API response
      const exchangeAccounts: ExchangeAccount[] = (
        exchangesResponse.data.exchanges || []
      ).map((exchange: any) => ({
        id: exchange.id,
        name: exchange.name,
        type: "exchange",
        provider: exchange.name,
        isConnected: exchange.isConnected,
        lastSyncAt: exchange.lastSyncAt,
        createdAt: exchange.createdAt,
        updatedAt: exchange.updatedAt,
      }));

      setAccounts(wallets);
      setExchanges(exchangeAccounts);
      dispatchPlanStatusRefresh();
      console.log(
        "[Accounts] Loaded",
        wallets.length,
        "wallets and",
        exchangeAccounts.length,
        "exchanges",
      );

      // Fetch wallet suggestions in the background
      fetchSuggestions();
    } catch (err: any) {
      console.error("[Accounts] Error fetching accounts:", err);

      let errorMessage = "Failed to load accounts. Please try again.";

      if (err.code === "ECONNABORTED" || err.message?.includes("timeout")) {
        errorMessage =
          "Request timed out. Please check your connection and try again.";
      } else if (err.response?.status === 401) {
        errorMessage = "Please log in to view your accounts.";
        window.location.href = "/login";
        return;
      } else if (err.response?.data?.error) {
        errorMessage = err.response.data.error;
      } else if (err.message) {
        errorMessage = err.message;
      }

      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Function to fetch wallet suggestions
  const fetchSuggestions = async () => {
    try {
      const res = await fetch("/api/wallets/suggestions");
      if (res.ok) {
        const data = await res.json();
        setWalletSuggestions(data.suggestions || []);
      }
    } catch {
      // Non-critical — silently ignore
    }
  };

  // Function to sync exchange transactions
  const syncExchangeTransactions = async (exchangeId: string) => {
    try {
      const syncResponse = await axios.post("/api/exchanges/sync", {
        exchangeId,
      });
      if (syncResponse.data.status !== "success") {
        throw new Error(syncResponse.data.error || "Failed to sync exchange");
      }
      return syncResponse.data;

      /* legacy flow removed
      const response = await axios.post('/api/exchanges/sync', {
        exchangeId,
      });

      if (response.data.status !== "success") {
        toast.success(`Exchange synced — ${response.data.transactionsAdded} transactions added`);

        // Enrich historical prices silently
        try {
          await fetch("/api/prices/enrich-historical", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          });
        } catch (enrichError) {
          console.warn("[Price Enrich] Error:", enrichError);
        }

        fetchWallets();
      } else {
        throw new Error("Failed to sync");
      }
      */
    } catch (error) {
      console.error("[Accounts] Error syncing exchange:", error);
      throw error;
    }
  };

  // Function to sync wallet transactions
  const syncWalletTransactions = async (walletId: string) => {
    try {
      const walletSyncResponse = await fetch("/api/wallets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId }),
      });
      const walletSyncData = await walletSyncResponse.json();

      if (!walletSyncResponse.ok) {
        throw new Error(walletSyncData.error || "Sync failed");
      }

      return walletSyncData;

      /* legacy flow removed
      toast.info("Syncing wallet transactions...");
      const syncResponse = await fetch("/api/wallets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId }),
      });
      const syncData = await syncResponse.json();

      if (!syncResponse.ok) {
        throw new Error("Sync failed");
      }

      toast.success(`Sync complete — ${syncData.transactionsAdded} new transactions added`);
      fetchWallets();
      */
    } catch (error) {
      console.error("[Accounts] Error syncing wallet:", error);
      throw error;
    }
  };

  // Function to enrich wallet transactions with historical prices
  const runPostSyncProcessing = async (walletId?: string) => {
    setEnriching(walletId || "full");
    try {
      const priceResponse = await fetch("/api/prices/enrich-historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(walletId ? { walletId } : {}),
      });
      const priceData = await priceResponse.json();

      if (!priceResponse.ok) {
        throw new Error(priceData.error || "Price enrichment failed");
      }

      const computeResponse = await fetch("/api/cost-basis/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const computeData = await computeResponse.json();

      if (!computeResponse.ok) {
        throw new Error(computeData.error || "Cost basis computation failed");
      }

      return {
        pricesUpdated: priceData.updated || 0,
        computeMessage: computeData.message || "Cost basis updated",
      };

      /* legacy flow removed

      toast.info("Looking up historical prices — this may take a few minutes...");
      const enrichResponse = await fetch("/api/prices/enrich-historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletId }),
      });
      const enrichData = await enrichResponse.json();
      console.log("[Accounts] Enrich response:", enrichData);
      if (enrichResponse.ok) {
        toast.success(`Prices enriched — ${enrichData.updated} transactions updated`);
      } else {
        toast.error("Price enrichment failed. Please try again.");
      }
      */
    } catch (error) {
      console.error("[Accounts] Enrich error:", error);
      throw error;
    } finally {
      setEnriching(null);
    }
  };

  const handleSyncExchange = async (exchangeId: string) => {
    setSyncing(exchangeId);
    try {
      toast.info(
        "Syncing exchange, pulling prices, and computing cost basis...",
      );
      const syncData = await syncExchangeTransactions(exchangeId);
      const postSyncData = await runPostSyncProcessing();

      toast.success(
        `Full sync complete - ${(syncData.transactionsAdded || 0).toLocaleString()} new transactions added and ${postSyncData.pricesUpdated.toLocaleString()} prices updated`,
      );
      await fetchWallets();
    } catch (error) {
      console.error("[Accounts] Error syncing exchange:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sync exchange. Please try again.",
      );
    } finally {
      setSyncing(null);
    }
  };

  const handleSyncWallet = async (walletId: string) => {
    setSyncing(walletId);
    try {
      toast.info("Syncing wallet, pulling prices, and computing cost basis...");
      const syncData = await syncWalletTransactions(walletId);
      const postSyncData = await runPostSyncProcessing(walletId);

      toast.success(
        `Full sync complete - ${(syncData.transactionsAdded || 0).toLocaleString()} new transactions added and ${postSyncData.pricesUpdated.toLocaleString()} prices updated`,
      );
      await fetchWallets();
    } catch (error) {
      console.error("[Accounts] Error syncing wallet:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sync wallet. Please try again.",
      );
    } finally {
      setSyncing(null);
    }
  };

  // Function to enrich ALL transactions across all wallets
  const handleEnrichAll = async () => {
    setEnrichingAll(true);
    try {
      toast.info(
        "Enriching prices for all transactions — this may take a moment...",
      );
      const enrichResponse = await fetch("/api/prices/enrich-historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const enrichData = await enrichResponse.json();
      if (enrichResponse.ok) {
        toast.success(
          `Prices enriched — ${enrichData.updated} transactions updated`,
        );
      } else {
        toast.error("Price enrichment failed. Please try again.");
      }
    } catch (error) {
      console.error("[Accounts] Enrich All error:", error);
      toast.error("Price enrichment failed. Please try again.");
    } finally {
      setEnrichingAll(false);
    }
  };

  // Function to disconnect exchange
  const handleDisconnectExchange = async (exchangeId: string) => {
    if (!confirm("Are you sure you want to disconnect this exchange?")) {
      return;
    }

    try {
      const response = await axios.delete(
        `/api/exchanges?exchangeId=${exchangeId}`,
      );

      if (response.data.status === "success") {
        toast.success("Exchange disconnected successfully");
        fetchWallets(); // Refresh list
      } else {
        throw new Error(response.data.error || "Failed to disconnect");
      }
    } catch (error) {
      console.error("[Accounts] Error disconnecting exchange:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to disconnect exchange",
      );
    }
  };

  // Function to disconnect wallet
  const handleDisconnectWallet = async (walletId: string) => {
    if (
      !confirm(
        "Are you sure you want to disconnect this wallet? All associated transactions will be deleted.",
      )
    ) {
      return;
    }

    try {
      const response = await axios.delete(`/api/wallets?walletId=${walletId}`);

      if (response.data.status === "success") {
        toast.success(
          `Wallet disconnected. ${response.data.deletedTransactions} transaction(s) removed.`,
        );
        fetchWallets();
      } else {
        throw new Error(response.data.error || "Failed to disconnect");
      }
    } catch (error) {
      console.error("[Accounts] Error disconnecting wallet:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect wallet",
      );
    }
  };

  // Refetch when pipeline completes (sync/enrich/compute done)
  useEffect(() => {
    if (refreshKey > 0) fetchWallets();
  }, [refreshKey]);

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [sessionStatus, router]);

  useEffect(() => {
    setMounted(true);

    // Check for OAuth callback parameters
    const success = searchParams.get("success");
    const coinbaseConnected = searchParams.get("coinbase_connected");
    const error = searchParams.get("error");

    if (success === "true" && coinbaseConnected === "true") {
      setOauthStatus({ success: true });
      toast.success("Successfully connected to Coinbase");
    } else if (error) {
      setOauthStatus({ error });
      toast.error(`Failed to connect: ${error}`);
    }

    if (sessionStatus === "authenticated") {
      fetchWallets();
    }

    if (success || error) {
      router.replace("/accounts", { scroll: false });
    }
  }, [searchParams, sessionStatus, router]);

  const handleAccountConnect = (provider: string, data: ConnectionResult) => {
    toast.success(`Connected to ${provider}`);
    setIsAddDialogOpen(false);
    // Refresh wallet list after connecting
    fetchWallets();

    // Complete onboarding step if active
    try {
      const {
        useOnboarding,
      } = require("@/components/onboarding/onboarding-provider");
      const onboarding = useOnboarding();
      if (onboarding.isActive) {
        onboarding.completeCurrentStep();
      }
    } catch {
      // Onboarding not available, ignore
    }
  };

  const handleRefresh = () => {
    fetchWallets();
  };

  const handleSyncSelected = async () => {
    if (selectedIds.size === 0) return;

    setSyncing("selected");
    try {
      toast.info(
        "Syncing selected accounts, pulling prices, and computing cost basis...",
      );
      let transactionsAdded = 0;

      for (const id of selectedIds) {
        const account = allAccounts.find((entry) => entry.id === id);
        if (!account) continue;

        if (account.type === "wallet") {
          const syncData = await syncWalletTransactions(id);
          transactionsAdded += syncData.transactionsAdded || 0;
          continue;
        }

        const exchange = exchanges.find((entry) => entry.id === id);
        if (exchange?.isConnected) {
          const syncData = await syncExchangeTransactions(id);
          transactionsAdded += syncData.transactionsAdded || 0;
        }
      }

      const postSyncData = await runPostSyncProcessing();
      toast.success(
        `Full sync complete - ${transactionsAdded.toLocaleString()} new transactions added and ${postSyncData.pricesUpdated.toLocaleString()} prices updated`,
      );
      setSelectedIds(new Set());
      await fetchWallets();
    } catch (error) {
      console.error("[Accounts] Error syncing selected accounts:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to sync selected accounts. Please try again.",
      );
    } finally {
      setSyncing(null);
    }
  };

  // Show loading state while mounting or session is loading
  if (!mounted || sessionStatus === "loading") {
    return (
      <Layout>
        <div className="space-y-6">
          <div className="h-8 w-40 skeleton-pulse rounded" />
          <div className="h-12 w-20 skeleton-pulse rounded" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="flex items-center gap-4 h-12 border-b border-[#F0F0EB] dark:border-[#2A2A2A]"
              >
                <div className="h-5 w-5 skeleton-pulse rounded" />
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

  // If not authenticated, show nothing (redirect will happen in useEffect)
  if (sessionStatus === "unauthenticated") {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-[14px] text-[#9CA3AF]">Redirecting to login...</p>
        </div>
      </Layout>
    );
  }

  // Combine wallets and exchanges for display
  const allAccounts: Account[] = [
    ...accounts,
    ...exchanges.map((ex) => ({
      ...ex,
      address: ex.id, // Use exchange ID as address for display
    })),
  ];

  // Filter accounts based on selected tab
  const filteredAccounts = allAccounts.filter((account) => {
    if (filter === "all") return true;
    if (filter === "wallets") return account.type === "wallet";
    if (filter === "exchanges") return account.type === "exchange";
    return true;
  });

  return (
    <Layout>
      <div className="space-y-6 px-0">
        {/* ── Score-First Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[28px] font-light tracking-[-0.02em] text-[#1A1A1A] dark:text-[#F5F5F5]">
              Accounts
            </h1>
            {!loading && (
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className="text-[36px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5]"
                  style={{
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                  }}
                >
                  {allAccounts.length}
                </span>
                <span className="text-[14px] text-[#6B7280]">
                  Connected · {accounts.length} Wallet
                  {accounts.length !== 1 ? "s" : ""} · {exchanges.length}{" "}
                  Exchange{exchanges.length !== 1 ? "s" : ""}
                </span>
              </div>
            )}
            {!loading && (
              <p
                className="text-[13px] text-[#9CA3AF] mt-0.5"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {accounts
                  .reduce(
                    (sum, a) => sum + (a as WalletAccount).transactionCount,
                    0,
                  )
                  .toLocaleString()}{" "}
                total transactions
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Selection bulk actions */}
            {selectedIds.size > 0 && (
              <>
                <span className="text-[13px] text-[#6B7280]">
                  {selectedIds.size} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSyncSelected}
                  disabled={!!syncing || enrichingAll || isPipelineRunning}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  Sync Selected
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[#DC2626] border-[#DC2626]/30 hover:bg-[#FEF2F2] dark:hover:bg-[rgba(220,38,38,0.1)]"
                  onClick={async () => {
                    if (!confirm(`Disconnect ${selectedIds.size} account(s)?`))
                      return;
                    for (const id of selectedIds) {
                      const acct = allAccounts.find((a) => a.id === id);
                      if (acct?.type === "wallet")
                        await handleDisconnectWallet(id);
                      else await handleDisconnectExchange(id);
                    }
                    setSelectedIds(new Set());
                  }}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove Selected
                </Button>
              </>
            )}
            {/* Standard actions in header */}
            {!loading &&
              !error &&
              allAccounts.length > 0 &&
              selectedIds.size === 0 && (
                <>
                  <div className="flex items-center gap-1.5 mr-1">
                    <button
                      onClick={() => setExclusiveWallets(!exclusiveWallets)}
                      className={cn(
                        "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                        exclusiveWallets
                          ? "bg-[#2563EB]"
                          : "bg-[#E5E5E0] dark:bg-[#333]",
                      )}
                      title="When enabled, prevents adding wallets already connected by another user"
                    >
                      <span
                        className={cn(
                          "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                          exclusiveWallets
                            ? "translate-x-[18px]"
                            : "translate-x-[3px]",
                        )}
                      />
                    </button>
                    <span
                      className="text-[11px] text-[#9CA3AF]"
                      title="Prevents adding wallets already connected by another user."
                    >
                      Exclusive
                    </span>
                  </div>

                  {/* Manual Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline">
                        <Wrench className="mr-2 h-4 w-4" />
                        Manual Actions
                        <ChevronDown className="ml-2 h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem
                        onClick={() => {
                          startSyncAll();
                          toast.info(
                            "Pipeline started — sync → pull prices → compute cost basis",
                          );
                        }}
                        disabled={isPipelineRunning}
                      >
                        <RotateCw className="mr-2 h-4 w-4" />
                        Resync All
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={handleEnrichAll}
                        disabled={
                          enrichingAll || !!syncing || isPipelineRunning
                        }
                      >
                        <DollarSign className="mr-2 h-4 w-4" />
                        Repull All Prices
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={handleRefresh}>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Refresh Wallet Page
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}

            {/* Add Account dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button data-onboarding="connect-wallet">
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Account
                  <ChevronDown className="ml-2 h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  data-onboarding="add-one-account"
                  onSelect={() =>
                    setTimeout(() => {
                      setAddDialogBulk(false);
                      setIsAddDialogOpen(true);
                    }, 10)
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add One Account
                </DropdownMenuItem>
                <DropdownMenuItem
                  data-onboarding="add-multiple"
                  onSelect={() =>
                    setTimeout(() => {
                      setAddDialogBulk(true);
                      setIsAddDialogOpen(true);
                    }, 10)
                  }
                >
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Multiple
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* ── Filter Bar + Breakdown + Health ── */}
        <div className="flex items-center gap-4">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[160px] h-9 text-sm font-medium">
              <SelectValue placeholder="All Accounts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Accounts</SelectItem>
              <SelectItem value="wallets">Wallets</SelectItem>
              <SelectItem value="exchanges">Exchanges</SelectItem>
            </SelectContent>
          </Select>

          {!loading &&
            !error &&
            allAccounts.length > 0 &&
            (() => {
              const walletCount = accounts.length;
              const exchangeCount = exchanges.length;
              const total = walletCount + exchangeCount;
              const connectedCount =
                walletCount + exchanges.filter((e) => e.isConnected).length;

              return (
                <>
                  <div className="ml-auto" />

                  {/* Account type split bar */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-[#9CA3AF] tracking-wide uppercase">
                      Account Breakdown
                    </p>
                    <div className="flex h-5 w-[280px] rounded-md overflow-hidden">
                      {walletCount > 0 && (
                        <div
                          className="h-full bg-[#2563EB] flex items-center justify-center"
                          style={{
                            width: `${(walletCount / total) * 100}%`,
                            minWidth: "60px",
                          }}
                          title={`${walletCount} Wallets`}
                        >
                          <span className="text-[10px] font-semibold text-white">
                            {walletCount} Wallet{walletCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                      {exchangeCount > 0 && (
                        <div
                          className="h-full bg-[#9333EA] flex items-center justify-center"
                          style={{
                            width: `${(exchangeCount / total) * 100}%`,
                            minWidth: "70px",
                          }}
                          title={`${exchangeCount} Exchanges`}
                        >
                          <span className="text-[10px] font-semibold text-white">
                            {exchangeCount} Exchange
                            {exchangeCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Health */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold text-[#9CA3AF] tracking-wide uppercase">
                      Health
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "h-2.5 w-2.5 rounded-full",
                          connectedCount === total
                            ? "bg-[#16A34A]"
                            : "bg-[#F97316]",
                        )}
                      />
                      <span className="text-[12px] font-medium text-[#4B5563] dark:text-[#9CA3AF]">
                        {connectedCount === total
                          ? "All connected"
                          : `${connectedCount}/${total} connected`}
                      </span>
                    </div>
                  </div>
                </>
              );
            })()}
        </div>

        {/* OAuth Status Messages */}
        {oauthStatus?.success && (
          <div className="p-3 rounded-lg bg-pill-green-bg dark:bg-[rgba(22,163,74,0.12)] border border-[#E5E5E0] dark:border-[#333] flex items-center gap-3">
            <CheckCircle className="h-4 w-4 text-[#16A34A]" />
            <p className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5]">
              Successfully connected to Coinbase!
            </p>
          </div>
        )}
        {oauthStatus?.error && (
          <div className="p-3 rounded-lg bg-pill-red-bg dark:bg-[rgba(220,38,38,0.12)] border border-[#E5E5E0] dark:border-[#333] flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-[#DC2626]" />
            <p className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5]">
              Failed to connect: {oauthStatus.error}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => setIsAddDialogOpen(true)}
            >
              Try Again
            </Button>
          </div>
        )}
        {error && !loading && (
          <div className="p-3 rounded-lg bg-pill-red-bg dark:bg-[rgba(220,38,38,0.12)] border border-[#E5E5E0] dark:border-[#333] flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-[#DC2626]" />
            <p className="text-[13px]">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleRefresh}
            >
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
                  <TableHead className="w-11 border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    <Checkbox
                      checked={
                        filteredAccounts.length > 0 &&
                        selectedIds.size === filteredAccounts.length
                      }
                      onCheckedChange={(checked) => {
                        if (checked)
                          setSelectedIds(
                            new Set(filteredAccounts.map((a) => a.id)),
                          );
                        else setSelectedIds(new Set());
                      }}
                    />
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block h-4 w-4 rounded-full bg-primary shrink-0" />
                      {loading ? "..." : filteredAccounts.length} Accounts
                    </span>
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Type
                  </TableHead>
                  <TableHead className="text-[14px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Address
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
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow
                      key={i}
                      className="border-b border-[#F0F0EB] dark:border-[#2A2A2A]"
                    >
                      <TableCell colSpan={8}>
                        <div className="flex items-center gap-4 h-10">
                          <div className="h-5 w-5 skeleton-pulse rounded" />
                          <div className="h-4 w-32 skeleton-pulse rounded" />
                          <div className="h-5 w-16 skeleton-pulse rounded-md" />
                          <div className="h-4 w-24 skeleton-pulse rounded" />
                          <div className="h-4 w-12 skeleton-pulse rounded" />
                          <div className="h-4 w-20 skeleton-pulse rounded" />
                          <div className="h-4 w-20 skeleton-pulse rounded" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : !error && filteredAccounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <div className="py-16 text-center">
                        <Wallet className="h-12 w-12 text-[#9CA3AF] mx-auto mb-4" />
                        <p className="text-[17px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                          No accounts connected
                        </p>
                        <p className="text-[15px] text-[#6B7280] mt-2">
                          Connect your first account (wallet or exchange) to get
                          started.
                        </p>
                        <Button
                          className="mt-4"
                          onClick={() => setIsAddDialogOpen(true)}
                          data-onboarding="connect-wallet"
                        >
                          <PlusCircle className="mr-2 h-4 w-4" />
                          Add Account
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAccounts.map((account) => {
                    const isExchange = account.type === "exchange";
                    const exchangeAccount = isExchange
                      ? exchanges.find((e) => e.id === account.id)
                      : null;
                    const isConnected = isExchange
                      ? exchangeAccount?.isConnected
                      : true;
                    const lastSync = isExchange
                      ? exchangeAccount?.lastSyncAt
                      : account.updatedAt;
                    const txCount =
                      account.type === "wallet"
                        ? (account as WalletAccount).transactionCount
                        : null;
                    const address =
                      account.type === "wallet"
                        ? (account as WalletAccount).address
                        : account.id;

                    return (
                      <TableRow
                        key={account.id}
                        className="group cursor-pointer border-b border-[#F0F0EB] dark:border-[#2A2A2A]"
                        onClick={() => {
                          setSelectedAccount(account);
                          setIsDetailOpen(true);
                        }}
                      >
                        {/* Checkbox */}
                        <TableCell className="w-11 border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          <Checkbox
                            checked={selectedIds.has(account.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selectedIds);
                              if (checked) next.add(account.id);
                              else next.delete(account.id);
                              setSelectedIds(next);
                            }}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </TableCell>

                        {/* Account name */}
                        <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          <div className="flex items-center gap-2.5">
                            {(() => {
                              const logo =
                                getProviderLogo(account.provider) ||
                                getProviderLogo(account.name);
                              return logo ? (
                                <img
                                  src={logo}
                                  alt={account.provider}
                                  className="h-[32px] w-[32px] rounded-full object-contain shrink-0 border border-[#E5E5E0] dark:border-[#333] bg-white dark:bg-[#1A1A1A] p-[2px]"
                                />
                              ) : (
                                <span
                                  className={cn(
                                    "inline-flex items-center justify-center h-[32px] w-[32px] rounded-full text-white text-[12px] font-bold shrink-0",
                                    isExchange
                                      ? "bg-[#9333EA]"
                                      : "bg-[#2563EB]",
                                  )}
                                >
                                  {isExchange ? (
                                    <Building className="h-3.5 w-3.5" />
                                  ) : (
                                    <Wallet className="h-3.5 w-3.5" />
                                  )}
                                </span>
                              );
                            })()}
                            <div>
                              <p className="text-[15px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5] capitalize">
                                {account.name}
                              </p>
                              <p className="text-[13px] text-[#9CA3AF] capitalize">
                                {account.provider === "coinbase"
                                  ? "Coinbase"
                                  : account.provider}
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Type pill */}
                        <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-md px-3 py-1 text-[14px] font-medium",
                              isExchange
                                ? "bg-pill-purple-bg text-pill-purple-text dark:bg-[rgba(147,51,234,0.12)] dark:text-[#A855F7]"
                                : "bg-pill-blue-bg text-pill-blue-text dark:bg-[rgba(37,99,235,0.12)] dark:text-[#3B82F6]",
                            )}
                          >
                            {isExchange ? "Exchange" : "Wallet"}
                          </span>
                        </TableCell>

                        {/* Address */}
                        <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          <div className="flex items-center gap-1.5">
                            <span
                              className="text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                              style={{
                                fontFamily: "'SF Mono', 'Fira Code', monospace",
                                fontVariantNumeric: "tabular-nums",
                              }}
                            >
                              {address && address.length > 12
                                ? `${address.slice(0, 6)}...${address.slice(-4)}`
                                : address || "—"}
                            </span>
                            {address && (
                              <button
                                className="p-0.5 rounded hover:bg-[#F0F0EB] dark:hover:bg-[#2A2A2A] opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigator.clipboard.writeText(address);
                                  toast.success("Address copied");
                                }}
                              >
                                <Copy className="h-3 w-3 text-[#9CA3AF]" />
                              </button>
                            )}
                          </div>
                        </TableCell>

                        {/* Transactions */}
                        <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          <span
                            className="text-[15px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]"
                            style={{ fontVariantNumeric: "tabular-nums" }}
                          >
                            {txCount != null ? txCount.toLocaleString() : "—"}
                          </span>
                        </TableCell>

                        {/* Status pill */}
                        <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[13px] font-medium",
                              isConnected
                                ? "bg-pill-green-bg text-pill-green-text dark:bg-[rgba(22,163,74,0.12)] dark:text-[#22C55E]"
                                : "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]",
                            )}
                          >
                            <span
                              className={cn(
                                "h-1.5 w-1.5 rounded-full shrink-0",
                                isConnected
                                  ? "bg-pill-green-text dark:bg-[#22C55E]"
                                  : "bg-pill-orange-text dark:bg-[#F97316]",
                              )}
                            />
                            {isConnected ? "Connected" : "Reconnect"}
                          </span>
                        </TableCell>

                        {/* Last Synced */}
                        <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                          <span className="text-[14px] text-[#6B7280]">
                            {lastSync
                              ? new Date(lastSync).toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                })
                              : "Never"}
                          </span>
                        </TableCell>

                        {/* Actions — always visible, subtle bordered */}
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <button
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-[#E5E5E0] dark:border-[#333] text-[13px] font-medium text-[#4B5563] dark:text-[#9CA3AF] hover:border-[#2563EB] hover:text-[#2563EB] transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isExchange) handleSyncExchange(account.id);
                                else handleSyncWallet(account.id);
                              }}
                              disabled={
                                !!syncing || enrichingAll || isPipelineRunning
                              }
                            >
                              <RefreshCw
                                className={cn(
                                  "h-3 w-3",
                                  syncing === account.id && "animate-spin",
                                )}
                              />
                              Sync
                            </button>
                            <button
                              className="inline-flex items-center px-1.5 py-1 rounded-md border border-[#E5E5E0] dark:border-[#333] text-[#9CA3AF] hover:border-[#DC2626] hover:text-[#DC2626] transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (isExchange)
                                  handleDisconnectExchange(account.id);
                                else handleDisconnectWallet(account.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* ── Suggested Wallets ── */}
        {walletSuggestions.length > 0 && (
          <div className="border border-[#E5E5E0] dark:border-[#333] rounded-xl overflow-hidden bg-white dark:bg-[#1A1A1A]">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <div>
                <h2 className="text-[16px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                  Suggested Wallets
                </h2>
                <p className="text-[12px] text-[#9CA3AF] mt-0.5">
                  Frequently interacting addresses that may belong to you
                </p>
              </div>
              <span className="inline-flex items-center rounded-full bg-[#EFF6FF] dark:bg-[rgba(37,99,235,0.12)] text-[#2563EB] px-2.5 py-0.5 text-[11px] font-medium">
                {walletSuggestions.length} found
              </span>
            </div>
            <Table className="transaction-table">
              <TableHeader>
                <TableRow className="border-b border-[#F0F0EB] dark:border-[#2A2A2A]">
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Chain
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Address
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Transactions
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Volume
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563] border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                    Direction
                  </TableHead>
                  <TableHead className="text-[13px] font-semibold text-[#4B5563]">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {walletSuggestions.map((s) => (
                  <TableRow
                    key={s.address}
                    className="border-b border-[#F0F0EB] dark:border-[#2A2A2A] hover:bg-[#FAFAF7] dark:hover:bg-[rgba(255,255,255,0.03)] transition-colors"
                  >
                    <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                      <div className="flex items-center gap-2">
                        <img
                          src={`/logos/${s.chain === "solana" ? "SOL" : s.chain === "ethereum" ? "ETH" : "SOL"}.png`}
                          className="h-5 w-5 rounded-full"
                          alt=""
                        />
                        <span className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5] capitalize">
                          {s.chain || "solana"}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                      <span className="text-[13px] font-mono text-[#1A1A1A] dark:text-[#F5F5F5]">
                        {s.address.substring(0, 8)}...
                        {s.address.substring(s.address.length - 6)}
                      </span>
                    </TableCell>
                    <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                      <span
                        className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        {s.txnCount.toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                      <span
                        className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                        style={{ fontVariantNumeric: "tabular-nums" }}
                      >
                        $
                        {s.totalValue.toLocaleString(undefined, {
                          maximumFractionDigits: 0,
                        })}
                      </span>
                    </TableCell>
                    <TableCell className="border-r border-[#F0F0EB] dark:border-[#2A2A2A]">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center rounded-md bg-pill-teal-bg text-pill-teal-text px-1.5 py-[1px] text-[11px] font-medium">
                          {s.inCount} in
                        </span>
                        <span className="inline-flex items-center rounded-md bg-pill-indigo-bg text-pill-indigo-text px-1.5 py-[1px] text-[11px] font-medium">
                          {s.outCount} out
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(s.address);
                          toast.success(
                            "Address copied — add it as a new wallet",
                          );
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-[#2563EB] text-[#2563EB] text-[12px] font-medium hover:bg-[#EFF6FF] transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent
          className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto"
          data-onboarding="add-account-dialog"
        >
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
            <DialogDescription>
              Connect a wallet, exchange, or import transactions
            </DialogDescription>
          </DialogHeader>
          <WalletConnectDialog
            onConnect={handleAccountConnect}
            exclusive={exclusiveWallets}
            initialBulk={addDialogBulk}
          />
        </DialogContent>
      </Dialog>

      {/* Account Detail Sheet */}
      <Sheet open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-lg overflow-y-auto"
        >
          {selectedAccount &&
            (() => {
              const isExchange = selectedAccount.type === "exchange";
              const exchangeAccount = isExchange
                ? exchanges.find((e) => e.id === selectedAccount.id)
                : null;
              const isConnected = isExchange
                ? exchangeAccount?.isConnected
                : true;
              const lastSync = isExchange
                ? exchangeAccount?.lastSyncAt
                : selectedAccount.updatedAt;
              const txCount =
                selectedAccount.type === "wallet"
                  ? (selectedAccount as WalletAccount).transactionCount
                  : null;
              const address =
                selectedAccount.type === "wallet"
                  ? (selectedAccount as WalletAccount).address
                  : selectedAccount.id;

              return (
                <>
                  <SheetHeader>
                    <div className="flex items-center gap-3">
                      {(() => {
                        const logo =
                          getProviderLogo(selectedAccount.provider) ||
                          getProviderLogo(selectedAccount.name);
                        return logo ? (
                          <img
                            src={logo}
                            alt={selectedAccount.provider}
                            className="h-[32px] w-[32px] rounded-full object-contain shrink-0 border border-[#E5E5E0] dark:border-[#333] bg-white dark:bg-[#1A1A1A] p-[3px]"
                          />
                        ) : (
                          <span
                            className={cn(
                              "inline-flex items-center justify-center h-[32px] w-[32px] rounded-full text-white text-[12px] font-bold shrink-0",
                              isExchange ? "bg-[#9333EA]" : "bg-[#2563EB]",
                            )}
                          >
                            {isExchange ? (
                              <Building className="h-4 w-4" />
                            ) : (
                              <Wallet className="h-4 w-4" />
                            )}
                          </span>
                        );
                      })()}
                      <div>
                        <SheetTitle className="text-[16px] capitalize">
                          {selectedAccount.name}
                        </SheetTitle>
                        <SheetDescription className="text-[12px]">
                          {selectedAccount.provider === "coinbase"
                            ? "Coinbase"
                            : selectedAccount.provider}
                        </SheetDescription>
                      </div>
                      <span
                        className={cn(
                          "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ml-auto",
                          isExchange
                            ? "bg-pill-purple-bg text-pill-purple-text dark:bg-[rgba(147,51,234,0.12)] dark:text-[#A855F7]"
                            : "bg-pill-blue-bg text-pill-blue-text dark:bg-[rgba(37,99,235,0.12)] dark:text-[#3B82F6]",
                        )}
                      >
                        {isExchange ? "Exchange" : "Wallet"}
                      </span>
                    </div>
                  </SheetHeader>

                  <div className="mt-6 space-y-6">
                    {/* Hero stat */}
                    {txCount != null && (
                      <div>
                        <p
                          className="text-[24px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {txCount.toLocaleString()}
                        </p>
                        <p className="text-[13px] text-[#6B7280]">
                          Transactions
                        </p>
                      </div>
                    )}

                    {/* Status */}
                    <div className="flex items-center justify-between">
                      <span className="text-[12px] text-[#9CA3AF]">Status</span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[12px] font-medium",
                          isConnected
                            ? "bg-pill-green-bg text-pill-green-text dark:bg-[rgba(22,163,74,0.12)] dark:text-[#22C55E]"
                            : "bg-pill-orange-bg text-pill-orange-text dark:bg-[rgba(234,88,12,0.12)] dark:text-[#F97316]",
                        )}
                      >
                        <span
                          className={cn(
                            "h-1.5 w-1.5 rounded-full shrink-0",
                            isConnected
                              ? "bg-pill-green-text dark:bg-[#22C55E]"
                              : "bg-pill-orange-text dark:bg-[#F97316]",
                          )}
                        />
                        {isConnected ? "Connected" : "Needs Reconnect"}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="space-y-3 border-t border-[#F0F0EB] dark:border-[#2A2A2A] pt-4">
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#9CA3AF]">
                          Address
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="text-[14px] text-[#1A1A1A] dark:text-[#F5F5F5]"
                            style={{
                              fontFamily: "'SF Mono', 'Fira Code', monospace",
                            }}
                          >
                            {address && address.length > 16
                              ? `${address.slice(0, 8)}...${address.slice(-6)}`
                              : address || "—"}
                          </span>
                          {address && (
                            <button
                              className="p-1 rounded hover:bg-[#F0F0EB] dark:hover:bg-[#2A2A2A]"
                              onClick={() => {
                                navigator.clipboard.writeText(address);
                                toast.success("Address copied");
                              }}
                            >
                              <Copy className="h-3.5 w-3.5 text-[#9CA3AF]" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#9CA3AF]">
                          Provider
                        </span>
                        <span className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5] capitalize">
                          {selectedAccount.provider}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#9CA3AF]">
                          Connected
                        </span>
                        <span className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5]">
                          {new Date(
                            selectedAccount.createdAt,
                          ).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[12px] text-[#9CA3AF]">
                          Last Synced
                        </span>
                        <span className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5]">
                          {lastSync
                            ? new Date(lastSync).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                                year: "numeric",
                              })
                            : "Never"}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="space-y-2 border-t border-[#F0F0EB] dark:border-[#2A2A2A] pt-4">
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            if (isExchange)
                              handleSyncExchange(selectedAccount.id);
                            else handleSyncWallet(selectedAccount.id);
                          }}
                          disabled={
                            !!syncing || enrichingAll || isPipelineRunning
                          }
                        >
                          <RefreshCw
                            className={cn(
                              "mr-2 h-4 w-4",
                              syncing === selectedAccount.id && "animate-spin",
                            )}
                          />
                          {syncing === selectedAccount.id
                            ? "Running Full Sync..."
                            : "Run Full Sync"}
                        </Button>
                        {isExchange && !isConnected && (
                          <Button
                            className="flex-1"
                            onClick={() => {
                              setIsDetailOpen(false);
                              setIsAddDialogOpen(true);
                            }}
                          >
                            <Link2 className="mr-2 h-4 w-4" />
                            Reconnect
                          </Button>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        className="w-full text-[#DC2626] border-[#DC2626]/30 hover:bg-[#FEF2F2] dark:hover:bg-[rgba(220,38,38,0.1)]"
                        onClick={() => {
                          if (isExchange)
                            handleDisconnectExchange(selectedAccount.id);
                          else handleDisconnectWallet(selectedAccount.id);
                          setIsDetailOpen(false);
                          setSelectedAccount(null);
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Disconnect Account
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()}
        </SheetContent>
      </Sheet>
    </Layout>
  );
}

// Loading component to show when Suspense is active
function AccountsLoading() {
  return (
    <Layout>
      <div className="space-y-6">
        <div className="h-8 w-40 skeleton-pulse rounded" />
        <div className="h-12 w-20 skeleton-pulse rounded" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 h-12 border-b border-[#F0F0EB] dark:border-[#2A2A2A]"
            >
              <div className="h-5 w-5 skeleton-pulse rounded" />
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

// Main exported page component with Suspense boundary
export default function AccountsPage() {
  return (
    <Suspense fallback={<AccountsLoading />}>
      <AccountsContent />
    </Suspense>
  );
}
