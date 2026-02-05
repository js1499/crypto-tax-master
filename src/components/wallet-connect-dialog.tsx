"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { QrCode, Loader2 } from "lucide-react";
import type { ConnectionResult, WalletProvider, ExchangeProvider } from "@/types/wallet";
import { toast } from "sonner";

const walletProviders: WalletProvider[] = [
  {
    id: "metamask",
    name: "MetaMask",
    icon: "/images/tokens/ethereum.png",
    chains: ["Ethereum", "Polygon", "Arbitrum", "Optimism"],
  },
  {
    id: "phantom",
    name: "Phantom",
    icon: "/images/tokens/solana.png",
    chains: ["Solana"],
  },
  {
    id: "keplr",
    name: "Keplr",
    icon: "/images/tokens/ethereum.png",
    chains: ["Cosmos", "Osmosis", "Juno"],
  },
  {
    id: "ledger",
    name: "Ledger",
    icon: "/images/tokens/bitcoin.png",
    chains: ["Bitcoin", "Ethereum", "Solana", "Multiple"],
  },
];

const exchangeProviders: ExchangeProvider[] = [
  {
    id: "coinbase",
    name: "Coinbase",
    icon: "/images/tokens/coinbase.png",
    connection: "API", // CDP API Key authentication
  },
  {
    id: "binance",
    name: "Binance",
    icon: "/images/tokens/binance.png",
    connection: "API",
  },
  {
    id: "kraken",
    name: "Kraken",
    icon: "/images/tokens/ethereum.png",
    connection: "API",
  },
  {
    id: "kucoin",
    name: "KuCoin",
    icon: "/images/tokens/bitcoin.png",
    connection: "API",
  },
  {
    id: "gemini",
    name: "Gemini",
    icon: "/images/tokens/ethereum.png",
    connection: "API",
  },
];

interface WalletConnectDialogProps {
  onConnect?: (provider: string, data: ConnectionResult) => void;
}

export function WalletConnectDialog({ onConnect }: WalletConnectDialogProps) {
  const [open, setOpen] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [apiPassphrase, setApiPassphrase] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnect = async (provider: string) => {
    setSelectedProvider(provider);
    setConnecting(true);
    setConnectionError(null);

    try {
      // For wallet providers, we need an address
      // In a real app, this would come from wallet extension or manual input
      // For now, we'll show a message that manual wallet entry is needed
      toast.info("Please enter your wallet address manually");
      setConnecting(false);
      
      // TODO: Implement actual wallet connection via browser extension
      // For now, wallets need to be added via the transactions/fetch route
      // or manually through an API call with address
    } catch (error) {
      console.error(`[Wallet Connect] Error connecting to ${provider}:`, error);
      setConnecting(false);
      const errorMessage = error instanceof Error ? error.message : "Failed to connect";
      setConnectionError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleOAuthConnect = async (provider: string) => {
    setSelectedProvider(provider);
    setConnecting(true);
    setConnectionError(null);
    
    try {
      console.log(`[Wallet Connect] Initiating OAuth flow for ${provider}`);
      
      // For Coinbase, redirect to our OAuth endpoint
      if (provider === "coinbase") {
        // Start the OAuth flow by redirecting to our API route
        window.location.href = "/api/auth/coinbase";
        return; // No need to reset connecting state as we're redirecting
      }
      
      // For other OAuth providers (future implementation)
      throw new Error(`OAuth not implemented for ${provider}`);
    } catch (error) {
      console.error(`[Wallet Connect] Error initiating OAuth for ${provider}:`, error);
      setConnecting(false);
      setConnectionError(`Failed to connect to ${provider}. Please try again.`);
      toast.error(`Failed to connect to ${provider}`);
    }
  };

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCsvFile(e.target.files[0]);
    }
  };

  const handleCsvSubmit = () => {
    if (!csvFile) return;

    // CSV import is handled by the transactions import page
    // This dialog just triggers the import flow
    setConnecting(false);
    setOpen(false);

    if (onConnect) {
      onConnect("csv", {
        success: true,
        provider: "csv",
        fileName: csvFile.name,
        timestamp: new Date().toISOString(),
      });
    }
  };

  const handleApiConnect = async () => {
    if (!apiKey || !apiSecret) {
      toast.error("Please enter API key and secret");
      return;
    }

    setConnecting(true);
    setConnectionError(null);

    try {
      const body: any = {
        exchange: selectedProvider,
        apiKey,
        apiSecret,
      };

      // KuCoin requires passphrase
      if (selectedProvider === "kucoin") {
        if (!apiPassphrase) {
          setConnecting(false);
          toast.error("API Passphrase is required for KuCoin");
          return;
        }
        body.apiPassphrase = apiPassphrase;
      }

      const response = await fetch("/api/exchanges/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to connect exchange");
      }

      setConnecting(false);
      setOpen(false);
      toast.success(`Successfully connected to ${selectedProvider}`);
      
      if (onConnect) {
        onConnect(selectedProvider, {
          success: true,
          provider: selectedProvider,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error(`[Exchange Connect] Error connecting to ${selectedProvider}:`, error);
      setConnecting(false);
      const errorMessage = error instanceof Error ? error.message : "Failed to connect";
      setConnectionError(errorMessage);
      toast.error(errorMessage);
    }
  };

  // Helper to determine connection method based on provider ID
  const getConnectionMethod = (providerId: string) => {
    const provider = exchangeProviders.find(p => p.id === providerId);
    return provider?.connection || "API";
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Connect Wallet or Exchange</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Connect Account</DialogTitle>
          <DialogDescription>
            Connect your crypto wallets and exchanges to import your transactions
          </DialogDescription>
        </DialogHeader>

        {connecting ? (
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p>Connecting to {selectedProvider}...</p>
            <p className="text-sm text-muted-foreground mt-2">This might take a few moments</p>
          </div>
        ) : (
          <Tabs defaultValue="wallets" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="wallets">Wallets</TabsTrigger>
              <TabsTrigger value="exchanges">Exchanges</TabsTrigger>
              <TabsTrigger value="csv">CSV Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="wallets" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {walletProviders.map((provider) => (
                  <button
                    key={provider.id}
                    className="flex flex-col items-center space-y-2 rounded-lg border p-4 hover:bg-accent transition-colors"
                    onClick={() => handleConnect(provider.id)}
                  >
                    <img
                      src={provider.icon}
                      alt={provider.name}
                      className="h-12 w-12 rounded-full"
                    />
                    <div className="text-center">
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">{provider.chains.join(", ")}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-center space-x-2 pt-2">
                <div className="h-px flex-1 bg-border" />
                <p className="text-xs text-muted-foreground">Or connect manually</p>
                <div className="h-px flex-1 bg-border" />
              </div>
              {selectedProvider === "manual" ? (
                <div className="space-y-3 border rounded-lg p-4">
                  <h3 className="text-sm font-medium">Add Wallet Manually</h3>
                  <div className="space-y-2">
                    <Label htmlFor="wallet-name">Wallet Name</Label>
                    <Input
                      id="wallet-name"
                      placeholder="My Ethereum Wallet"
                      value={apiKey} // Reuse state for wallet name
                      onChange={(e) => setApiKey(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wallet-address">Wallet Address</Label>
                    <Input
                      id="wallet-address"
                      placeholder="0x..."
                      value={apiSecret} // Reuse state for wallet address
                      onChange={(e) => setApiSecret(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wallet-provider">Provider</Label>
                    <Input
                      id="wallet-provider"
                      placeholder="ethereum, solana, etc."
                      value={apiPassphrase} // Reuse state for provider
                      onChange={(e) => setApiPassphrase(e.target.value)}
                    />
                  </div>
                  <Button 
                    className="w-full" 
                    onClick={async () => {
                      if (!apiKey || !apiSecret || !apiPassphrase) {
                        toast.error("Please fill in all fields");
                        return;
                      }
                      setConnecting(true);
                      try {
                        const response = await fetch("/api/wallets", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            name: apiKey,
                            address: apiSecret,
                            provider: apiPassphrase.toLowerCase(),
                          }),
                        });
                        const data = await response.json();
                        if (!response.ok) {
                          throw new Error(data.error || "Failed to create wallet");
                        }
                        toast.success("Wallet added successfully");
                        setOpen(false);
                        if (onConnect) {
                          onConnect(apiPassphrase, {
                            success: true,
                            provider: apiPassphrase,
                            timestamp: new Date().toISOString(),
                          });
                        }
                      } catch (error) {
                        console.error("[Wallet Connect] Error:", error);
                        toast.error(error instanceof Error ? error.message : "Failed to add wallet");
                      } finally {
                        setConnecting(false);
                      }
                    }}
                    disabled={connecting}
                  >
                    {connecting ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Adding...
                      </>
                    ) : (
                      "Add Wallet"
                    )}
                  </Button>
                </div>
              ) : (
                <Button variant="outline" className="w-full" onClick={() => setSelectedProvider("manual")}>
                  <QrCode className="mr-2 h-4 w-4" />
                  Connect with address
                </Button>
              )}
            </TabsContent>

            <TabsContent value="exchanges" className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {exchangeProviders.map((provider) => (
                  <button
                    key={provider.id}
                    className="flex flex-col items-center space-y-2 rounded-lg border p-4 hover:bg-accent transition-colors"
                    onClick={() => {
                      setSelectedProvider(provider.id);

                      // If provider only supports CSV, switch to CSV tab
                      if (provider.connection === "CSV") {
                        const csvTab = document.querySelector('[data-value="csv"]') as HTMLElement;
                        csvTab?.click();
                        return;
                      }
                      
                      // If OAuth, use the OAuth flow
                      if (provider.connection === "OAuth") {
                        handleOAuthConnect(provider.id);
                        return;
                      }
                    }}
                  >
                    <img
                      src={provider.icon}
                      alt={provider.name}
                      className="h-12 w-12 rounded-full"
                    />
                    <div className="text-center">
                      <p className="font-medium">{provider.name}</p>
                      <p className="text-xs text-muted-foreground">Via {provider.connection}</p>
                    </div>
                  </button>
                ))}
              </div>

              {connectionError && (
                <div className="mt-2 text-sm text-red-500 text-center">
                  {connectionError}
                </div>
              )}

              {selectedProvider && ["binance", "kraken", "kucoin", "gemini", "coinbase"].includes(selectedProvider) && (
                <div className="mt-4 space-y-4 border rounded-lg p-4">
                  <h3 className="text-sm font-medium">API Connection for {selectedProvider.charAt(0).toUpperCase() + selectedProvider.slice(1)}</h3>
                  <p className="text-xs text-muted-foreground">
                    {selectedProvider === "kucoin"
                      ? "You'll need your API Key, Secret, and Passphrase from KuCoin API settings."
                      : selectedProvider === "coinbase"
                      ? "Enter your CDP API Key Name and Private Key from the Coinbase Developer Platform."
                      : "Enter your API credentials from your exchange account settings."}
                  </p>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="api-key">
                        {selectedProvider === "coinbase" ? "API Key Name" : "API Key"}
                      </Label>
                      <Input
                        id="api-key"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        placeholder={selectedProvider === "coinbase"
                          ? "organizations/{org_id}/apiKeys/{key_id}"
                          : "Enter your API key"}
                      />
                      {selectedProvider === "coinbase" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Format: organizations/&#123;org_id&#125;/apiKeys/&#123;key_id&#125;
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="api-secret">
                        {selectedProvider === "coinbase" ? "EC Private Key" : "API Secret"}
                      </Label>
                      {selectedProvider === "coinbase" ? (
                        <textarea
                          id="api-secret"
                          className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                          value={apiSecret}
                          onChange={(e) => setApiSecret(e.target.value)}
                          placeholder="-----BEGIN EC PRIVATE KEY-----&#10;...&#10;-----END EC PRIVATE KEY-----"
                        />
                      ) : (
                        <Input
                          id="api-secret"
                          type="password"
                          value={apiSecret}
                          onChange={(e) => setApiSecret(e.target.value)}
                          placeholder="Enter your API secret"
                        />
                      )}
                      {selectedProvider === "coinbase" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Paste the complete private key including BEGIN and END lines
                        </p>
                      )}
                    </div>
                    {selectedProvider === "kucoin" && (
                      <div className="space-y-1">
                        <Label htmlFor="api-passphrase">API Passphrase</Label>
                        <Input
                          id="api-passphrase"
                          type="password"
                          value={apiPassphrase}
                          onChange={(e) => setApiPassphrase(e.target.value)}
                          placeholder="Enter your API passphrase"
                        />
                      </div>
                    )}
                    <Button
                      className="w-full"
                      onClick={handleApiConnect}
                      disabled={!apiKey || !apiSecret || connecting}
                    >
                      {connecting ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Connecting...
                        </>
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="csv" className="mt-4 space-y-4">
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <QrCode className="h-6 w-6 text-primary" />
                </div>
                <h3 className="mb-1 text-lg font-medium">Upload transaction CSV</h3>
                <p className="mb-4 text-sm text-muted-foreground">
                  Drag and drop your transaction CSV file or click to browse
                </p>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="mx-auto max-w-sm cursor-pointer"
                />
                {csvFile && (
                  <div className="mt-4">
                    <p className="text-sm font-medium">Selected file:</p>
                    <p className="text-sm text-muted-foreground">{csvFile.name}</p>
                    <Button
                      className="mt-2"
                      onClick={handleCsvSubmit}
                    >
                      Upload and Import
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
