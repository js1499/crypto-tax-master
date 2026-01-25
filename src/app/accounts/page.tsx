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
import { PlusCircle, Wallet, Building, ExternalLink, AlertCircle, CheckCircle, RefreshCw, RotateCw, Trash2, Link2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WalletConnectDialog } from "@/components/wallet-connect-dialog";
import type { ConnectionResult } from "@/types/wallet";
import { toast } from "sonner";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import axios from "axios";
import { cn } from "@/lib/utils";

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
}

interface ExchangeAccount extends BaseAccount {
  type: "exchange";
  isConnected?: boolean;
  lastSyncAt?: string;
}

type Account = WalletAccount | ExchangeAccount;

// Create a separate component for the accounts page content
function AccountsContent() {
  const [mounted, setMounted] = useState(false);
  const [filter, setFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<{ success?: boolean; error?: string } | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [exchanges, setExchanges] = useState<ExchangeAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState<string | null>(null);
  
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();

  // Function to fetch wallets from API
  const fetchWallets = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log("[Accounts] Fetching wallets and exchanges from API");
      
      // Add timeout to prevent hanging
      const [walletsResponse, exchangesResponse] = await Promise.all([
        axios.get('/api/wallets', { timeout: 10000 }),
        axios.get('/api/exchanges', { timeout: 10000 }),
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
          router.replace('/login');
        }
        return;
      }
      
      // Map API response to account objects
      const wallets: WalletAccount[] = (walletsResponse.data.wallets || []).map((wallet: any) => ({
        id: wallet.id,
        name: wallet.name,
        type: "wallet",
        provider: wallet.provider,
        address: wallet.address,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt
      }));

      // Map exchanges from API response
      const exchangeAccounts: ExchangeAccount[] = (exchangesResponse.data.exchanges || []).map((exchange: any) => ({
        id: exchange.id,
        name: exchange.name,
        type: "exchange",
        provider: exchange.name,
        isConnected: exchange.isConnected,
        lastSyncAt: exchange.lastSyncAt,
        createdAt: exchange.createdAt,
        updatedAt: exchange.updatedAt
      }));
      
      setAccounts(wallets);
      setExchanges(exchangeAccounts);
      console.log("[Accounts] Loaded", wallets.length, "wallets and", exchangeAccounts.length, "exchanges");
    } catch (err: any) {
      console.error("[Accounts] Error fetching accounts:", err);
      
      let errorMessage = "Failed to load accounts. Please try again.";
      
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        errorMessage = "Request timed out. Please check your connection and try again.";
      } else if (err.response?.status === 401) {
        errorMessage = "Please log in to view your accounts.";
        window.location.href = '/login';
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

  // Function to sync exchange transactions
  const handleSyncExchange = async (exchangeId: string) => {
    setSyncing(exchangeId);
    try {
      const response = await axios.post('/api/exchanges/sync', {
        exchangeId,
      });

      if (response.data.status === "success") {
        toast.success(
          `Synced ${response.data.transactionsAdded} transaction(s) from exchange`
        );
        fetchWallets(); // Refresh to update lastSyncAt
      } else {
        throw new Error(response.data.error || "Failed to sync");
      }
    } catch (error) {
      console.error("[Accounts] Error syncing exchange:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to sync exchange"
      );
    } finally {
      setSyncing(null);
    }
  };

  // Function to disconnect exchange
  const handleDisconnectExchange = async (exchangeId: string) => {
    if (!confirm("Are you sure you want to disconnect this exchange?")) {
      return;
    }

    try {
      const response = await axios.delete(`/api/exchanges?exchangeId=${exchangeId}`);

      if (response.data.status === "success") {
        toast.success("Exchange disconnected successfully");
        fetchWallets(); // Refresh list
      } else {
        throw new Error(response.data.error || "Failed to disconnect");
      }
    } catch (error) {
      console.error("[Accounts] Error disconnecting exchange:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to disconnect exchange"
      );
    }
  };

  // Redirect unauthenticated users to login
  useEffect(() => {
    if (sessionStatus === "unauthenticated") {
      router.replace("/login");
    }
  }, [sessionStatus, router]);

  useEffect(() => {
    setMounted(true);

    // Check for OAuth callback parameters
    const success = searchParams.get('success');
    const error = searchParams.get('error');

    if (success === 'true') {
      setOauthStatus({ success: true });
      toast.success('Successfully connected to Coinbase');
      // Fetch wallets when successful OAuth callback happens
      fetchWallets();
    } else if (error) {
      setOauthStatus({ error });
      toast.error(`Failed to connect: ${error}`);
    } else {
      // Fetch wallets on initial page load (only if authenticated)
      if (sessionStatus === "authenticated") {
        fetchWallets();
      }
    }
  }, [searchParams, sessionStatus]);

  const handleAccountConnect = (provider: string, data: ConnectionResult) => { 
    toast.success(`Connected to ${provider}`);
    setIsAddDialogOpen(false);
    // Refresh wallet list after connecting
    fetchWallets();
    
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

  const handleRefresh = () => {
    fetchWallets();
  };

  // Show loading state while mounting or session is loading
  if (!mounted || sessionStatus === "loading") {
    return (
      <Layout>
        <div className="container py-6 space-y-8">
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <div className="flex items-center space-x-2">
              <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <h2 className="text-xl font-medium">Loading accounts...</h2>
            </div>
          </div>
        </div>
      </Layout>
    );
  }
  
  // If not authenticated, show nothing (redirect will happen in useEffect)
  if (sessionStatus === "unauthenticated") {
    return (
      <Layout>
        <div className="container py-6 space-y-8">
          <div className="flex flex-col items-center justify-center min-h-[400px]">
            <p className="text-muted-foreground">Redirecting to login...</p>
          </div>
        </div>
      </Layout>
    );
  }

  // Combine wallets and exchanges for display
  const allAccounts: Account[] = [
    ...accounts,
    ...exchanges.map(ex => ({
      ...ex,
      address: ex.id, // Use exchange ID as address for display
    })),
  ];

  // Filter accounts based on selected tab
  const filteredAccounts = allAccounts.filter(account => {
    if (filter === "all") return true;
    if (filter === "wallets") return account.type === "wallet";
    if (filter === "exchanges") return account.type === "exchange";
    return true;
  });

  return (
    <Layout>
      <div className="container py-6 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">Your Accounts</h1>
            <p className="text-muted-foreground">Manage your crypto wallets and exchanges</p>
          </div>
          <div className="flex gap-2">
            <Tabs value={filter} className="w-[400px]">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="all" onClick={() => setFilter("all")}>
                  All
                </TabsTrigger>
                <TabsTrigger value="wallets" onClick={() => setFilter("wallets")}>
                  Wallets
                </TabsTrigger>
                <TabsTrigger value="exchanges" onClick={() => setFilter("exchanges")}>
                  Exchanges
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        {/* OAuth Status Messages */}
        {oauthStatus?.success && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <p>Successfully connected to Coinbase! Your accounts are now available below.</p>
          </div>
        )}
        
        {oauthStatus?.error && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p>Failed to connect to Coinbase: {oauthStatus.error}</p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={() => window.location.href = '/api/auth/coinbase'}>
              Try Again
            </Button>
          </div>
        )}

        {/* Loading state */}
        {loading && (
          <div className="flex justify-center items-center p-12">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2">Loading accounts...</span>
          </div>
        )}

        {/* Error state */}
        {error && !loading && (
          <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <p>{error}</p>
            <Button variant="outline" size="sm" className="ml-auto" onClick={handleRefresh}>
              Try Again
            </Button>
          </div>
        )}

        {/* Empty state - shows when no accounts exist */}
        {!loading && !error && allAccounts.length === 0 && (
          <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed rounded-lg">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-lg font-medium mb-2">No accounts connected</h3>
            <p className="text-muted-foreground mb-6 max-w-md">
              Connect your crypto wallets and exchanges to track your portfolio and calculate tax reports.
            </p>
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              data-onboarding="connect-wallet"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Account
            </Button>
          </div>
        )}

        {/* Account list - shows when accounts exist */}
        {!loading && !error && allAccounts.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAccounts.map((account) => {
              const isExchange = account.type === "exchange";
              const exchangeAccount = isExchange 
                ? exchanges.find(e => e.id === account.id)
                : null;

              return (
                <Card key={account.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg capitalize">{account.name}</CardTitle>
                        <CardDescription>
                          {account.provider === 'coinbase' ? 'Coinbase Account' : account.provider}
                        </CardDescription>
                      </div>
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                        {account.type === "wallet" ? (
                          <Wallet className="h-5 w-5 text-primary" />
                        ) : (
                          <Building className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      {account.type === "wallet" ? (
                        <>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Address</span>
                            <span className="font-mono">
                              {account.address && account.address.length > 10
                                ? `${account.address.slice(0, 6)}...${account.address.slice(-4)}`
                                : account.address || "N/A"}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Connected</span>
                            <span>
                              {new Date(account.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Status</span>
                            <span className={cn(
                              "px-2 py-1 rounded-full text-xs",
                              exchangeAccount?.isConnected
                                ? "bg-green-500/10 text-green-500"
                                : "bg-amber-500/10 text-amber-500"
                            )}>
                              {exchangeAccount?.isConnected ? "Connected" : "Needs Reconnect"}
                            </span>
                          </div>
                          {exchangeAccount?.lastSyncAt && (
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Last Sync</span>
                              <span>
                                {new Date(exchangeAccount.lastSyncAt).toLocaleDateString()}
                              </span>
                            </div>
                          )}
                          <div className="flex gap-2 pt-2">
                            {exchangeAccount?.isConnected ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1"
                                onClick={() => handleSyncExchange(account.id)}
                                disabled={syncing === account.id}
                              >
                                {syncing === account.id ? (
                                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCw className="mr-2 h-4 w-4" />
                                )}
                                Sync
                              </Button>
                            ) : (
                              // PRD UX Requirement: Show "Reconnect" if tokens invalid
                              <Button
                                size="sm"
                                variant="default"
                                className="flex-1"
                                onClick={() => {
                                  // For Coinbase, redirect to OAuth flow
                                  if (account.provider.toLowerCase() === "coinbase") {
                                    window.location.href = "/api/auth/coinbase";
                                  } else {
                                    // For other exchanges, open the connect dialog
                                    setIsAddDialogOpen(true);
                                  }
                                }}
                              >
                                <Link2 className="mr-2 h-4 w-4" />
                                Reconnect
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => handleDisconnectExchange(account.id)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Disconnect
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {/* Add Account Card */}
            <Card
              className="border-dashed flex flex-col items-center justify-center cursor-pointer hover:bg-accent/50 transition-colors"
              onClick={() => setIsAddDialogOpen(true)}
              data-onboarding="connect-wallet"
            >
              <CardContent className="p-6 text-center">
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4 mx-auto">
                  <PlusCircle className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-medium mb-2">Add Account</h3>
                <p className="text-muted-foreground text-sm">
                  Connect another wallet or exchange
                </p>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Action buttons */}
        {!loading && !error && allAccounts.length > 0 && (
          <div className="flex justify-between items-center mt-4">
            <div className="flex gap-2">
              {exchanges.filter(e => e.isConnected).length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    setSyncing("all");
                    try {
                      const response = await axios.post('/api/exchanges/sync', {});
                      if (response.data.status === "success") {
                        toast.success(
                          `Synced ${response.data.transactionsAdded} transaction(s) from ${exchanges.filter(e => e.isConnected).length} exchange(s)`
                        );
                        fetchWallets();
                      }
                    } catch (error) {
                      toast.error("Failed to sync exchanges");
                    } finally {
                      setSyncing(null);
                    }
                  }}
                  disabled={syncing === "all"}
                >
                  {syncing === "all" ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Syncing...
                    </>
                  ) : (
                    <>
                      <RotateCw className="mr-2 h-4 w-4" />
                      Sync All Exchanges
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Accounts
              </Button>
            <Button
              size="sm"
              onClick={() => setIsAddDialogOpen(true)}
              data-onboarding="connect-wallet"
            >
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Account
            </Button>
            </div>
          </div>
        )}
      </div>

      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
            <DialogDescription>
              Connect a wallet, exchange, or import transactions
            </DialogDescription>
          </DialogHeader>
          <WalletConnectDialog onConnect={handleAccountConnect} />
        </DialogContent>
      </Dialog>
    </Layout>
  );
}

// Loading component to show when Suspense is active
function AccountsLoading() {
  return (
    <Layout>
      <div className="container py-6 space-y-8">
        <div className="flex flex-col items-center justify-center min-h-[400px]">
          <div className="flex items-center space-x-2">
            <svg className="animate-spin h-8 w-8 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <h2 className="text-xl font-medium">Loading accounts...</h2>
          </div>
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
