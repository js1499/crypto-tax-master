"use client";

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { QrCode, Loader2, Wallet, ArrowLeft } from "lucide-react";
import type { ConnectionResult } from "@/types/wallet";
import { toast } from "sonner";

const EVM_CHAINS = [
  { id: "eth", name: "Ethereum" },
  { id: "polygon", name: "Polygon" },
  { id: "bsc", name: "BNB Chain" },
  { id: "avalanche", name: "Avalanche" },
  { id: "arbitrum", name: "Arbitrum" },
  { id: "optimism", name: "Optimism" },
  { id: "base", name: "Base" },
  { id: "linea", name: "Linea" },
  { id: "fantom", name: "Fantom" },
  { id: "cronos", name: "Cronos" },
];

const WALLET_OPTIONS = [
  { id: "solana", name: "SOL Wallet", logo: "/logos/SOL.png", placeholder: "Enter Solana address...", addressPattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/, errorMsg: "Invalid Solana address" },
  { id: "evm", name: "ETH Wallet", logo: "/logos/ETH.png", placeholder: "0x...", addressPattern: /^0x[a-fA-F0-9]{40}$/, errorMsg: "Invalid ETH address (must start with 0x, 42 chars)" },
  { id: "bitcoin", name: "BTC Wallet", logo: "/logos/BTC.svg", placeholder: "Enter Bitcoin address...", addressPattern: /^(1|3|bc1)[a-zA-HJ-NP-Z0-9]{25,62}$/, errorMsg: "Invalid Bitcoin address" },
];

const EXCHANGE_OPTIONS = [
  { id: "coinbase", name: "Coinbase", logo: "/logos/coinbase.png", connection: "OAuth" as const },
  { id: "binance", name: "Binance", logo: "/logos/binance.jpg", connection: "API" as const },
  { id: "kraken", name: "Kraken", logo: "/logos/kraken.svg", connection: "API" as const },
  { id: "gemini", name: "Gemini", logo: "/logos/gemini.png", connection: "API" as const },
  { id: "kucoin", name: "KuCoin", logo: "/logos/kucoin.png", connection: "API" as const },
];

interface WalletConnectDialogProps {
  onConnect?: (provider: string, data: ConnectionResult) => void;
  exclusive?: boolean;
}

export function WalletConnectDialog({ onConnect, exclusive }: WalletConnectDialogProps) {
  const [connecting, setConnecting] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<string | null>(null);
  const [walletName, setWalletName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [selectedChains, setSelectedChains] = useState<string[]>(["eth", "polygon", "arbitrum", "optimism", "base"]);
  const [syncAfterAdd, setSyncAfterAdd] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [apiPassphrase, setApiPassphrase] = useState("");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);

  const resetForm = () => {
    setSelectedWallet(null);
    setSelectedExchange(null);
    setWalletName("");
    setWalletAddress("");
    setApiKey("");
    setApiSecret("");
    setApiPassphrase("");
    setConnectionError(null);
  };

  const handleAddWallet = async () => {
    const option = WALLET_OPTIONS.find(w => w.id === selectedWallet);
    if (!option || !walletName || !walletAddress) {
      toast.error("Please enter wallet name and address");
      return;
    }

    if (!option.addressPattern.test(walletAddress)) {
      toast.error(option.errorMsg);
      return;
    }

    if (selectedWallet === "evm" && selectedChains.length === 0) {
      toast.error("Please select at least one chain");
      return;
    }

    setConnecting(true);
    setConnectionError(null);

    try {
      const body: Record<string, unknown> = {
        name: walletName,
        address: selectedWallet === "evm" ? walletAddress.toLowerCase() : walletAddress,
        provider: selectedWallet === "evm" ? "evm" : selectedWallet,
        exclusive,
      };
      if (selectedWallet === "evm") body.chains = selectedChains.join(",");

      const response = await fetch("/api/wallets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to add wallet");

      toast.success("Wallet added successfully");

      if (syncAfterAdd) {
        toast.info("Syncing transactions...");
        try {
          const syncBody: Record<string, unknown> = { walletId: data.wallet.id };
          if (selectedWallet === "evm") syncBody.chains = selectedChains;
          const syncResponse = await fetch("/api/wallets/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(syncBody),
          });
          const syncData = await syncResponse.json();
          if (syncResponse.ok) {
            toast.success(`Sync complete — ${syncData.transactionsAdded} transactions added`);
          } else {
            toast.error("Wallet added but sync failed. You can sync later.");
          }
        } catch {
          toast.error("Wallet added but sync failed. You can sync later.");
        }
      }

      resetForm();
      if (onConnect) {
        onConnect(selectedWallet, { success: true, provider: selectedWallet, address: walletAddress, timestamp: new Date().toISOString() });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to add wallet";
      setConnectionError(msg);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleApiConnect = async () => {
    if (!apiKey || !apiSecret) {
      toast.error("Please enter API key and secret");
      return;
    }
    if (selectedExchange === "kucoin" && !apiPassphrase) {
      toast.error("API Passphrase is required for KuCoin");
      return;
    }

    setConnecting(true);
    setConnectionError(null);

    try {
      const body: Record<string, unknown> = { exchange: selectedExchange, apiKey, apiSecret };
      if (selectedExchange === "kucoin") body.apiPassphrase = apiPassphrase;

      const response = await fetch("/api/exchanges/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to connect exchange");

      toast.success(`Connected to ${selectedExchange}`);
      resetForm();
      if (onConnect) {
        onConnect(selectedExchange!, { success: true, provider: selectedExchange!, timestamp: new Date().toISOString() });
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Failed to connect";
      setConnectionError(msg);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleOAuthConnect = (provider: string) => {
    if (provider === "coinbase") {
      window.location.href = "/api/auth/coinbase";
    }
  };

  const walletOption = WALLET_OPTIONS.find(w => w.id === selectedWallet);
  const exchangeOption = EXCHANGE_OPTIONS.find(e => e.id === selectedExchange);

  return (
    <Tabs defaultValue="wallets" className="w-full">
      <TabsList className="grid w-full grid-cols-3">
        <TabsTrigger value="wallets">Wallets</TabsTrigger>
        <TabsTrigger value="exchanges">Exchanges</TabsTrigger>
        <TabsTrigger value="csv">CSV Upload</TabsTrigger>
      </TabsList>

      {/* ── Wallets Tab ── */}
      <TabsContent value="wallets" className="mt-4 space-y-4">
        {selectedWallet && walletOption ? (
          <div className="space-y-4">
            <button onClick={resetForm} className="flex items-center gap-1 text-[13px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="flex items-center gap-3">
              <img src={walletOption.logo} alt={walletOption.name} className="h-8 w-8 rounded-full" />
              <h3 className="text-[14px] font-semibold">{walletOption.name}</h3>
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet-name">Wallet Name</Label>
              <Input id="wallet-name" placeholder="My Wallet" value={walletName} onChange={(e) => setWalletName(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="wallet-address">Address</Label>
              <Input id="wallet-address" placeholder={walletOption.placeholder} value={walletAddress} onChange={(e) => setWalletAddress(e.target.value)} className="font-mono text-[13px]" />
            </div>

            {selectedWallet === "evm" && (
              <div className="space-y-2">
                <Label>Chains to Sync</Label>
                <div className="grid grid-cols-2 gap-2">
                  {EVM_CHAINS.map((chain) => (
                    <div key={chain.id} className="flex items-center space-x-2">
                      <Checkbox id={`chain-${chain.id}`} checked={selectedChains.includes(chain.id)} onCheckedChange={() => setSelectedChains(prev => prev.includes(chain.id) ? prev.filter(c => c !== chain.id) : [...prev, chain.id])} />
                      <label htmlFor={`chain-${chain.id}`} className="text-sm cursor-pointer">{chain.name}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Checkbox id="sync-after" checked={syncAfterAdd} onCheckedChange={(c) => setSyncAfterAdd(c === true)} />
              <label htmlFor="sync-after" className="text-sm cursor-pointer">Sync transactions immediately</label>
            </div>

            {connectionError && <p className="text-sm text-red-500">{connectionError}</p>}

            <Button className="w-full" onClick={handleAddWallet} disabled={connecting || !walletName || !walletAddress}>
              {connecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{syncAfterAdd ? "Adding & Syncing..." : "Adding..."}</> : <><Wallet className="mr-2 h-4 w-4" />{syncAfterAdd ? "Add & Sync" : "Add Wallet"}</>}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {WALLET_OPTIONS.map((option) => (
              <button key={option.id} onClick={() => setSelectedWallet(option.id)} className="flex flex-col items-center gap-2.5 rounded-xl border border-[#E5E5E0] dark:border-[#333] p-5 hover:border-[#9CA3AF] dark:hover:border-[#555] transition-colors">
                <img src={option.logo} alt={option.name} className="h-10 w-10 rounded-full" />
                <span className="text-[13px] font-medium">{option.name}</span>
              </button>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── Exchanges Tab ── */}
      <TabsContent value="exchanges" className="mt-4 space-y-4">
        {selectedExchange && exchangeOption ? (
          <div className="space-y-4">
            <button onClick={resetForm} className="flex items-center gap-1 text-[13px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <div className="flex items-center gap-3">
              <img src={exchangeOption.logo} alt={exchangeOption.name} className="h-8 w-8 rounded-full" />
              <h3 className="text-[14px] font-semibold">{exchangeOption.name}</h3>
            </div>

            {exchangeOption.connection === "OAuth" ? (
              <div className="space-y-4">
                <p className="text-[13px] text-muted-foreground">Connect via Coinbase OAuth to securely import your transactions.</p>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label htmlFor="api-key">API Key Name</Label>
                    <Input id="api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="organizations/{org_id}/apiKeys/{key_id}" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="api-secret">EC Private Key</Label>
                    <textarea id="api-secret" className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder={"-----BEGIN EC PRIVATE KEY-----\n...\n-----END EC PRIVATE KEY-----"} />
                  </div>
                  {connectionError && <p className="text-sm text-red-500">{connectionError}</p>}
                  <Button className="w-full" onClick={handleApiConnect} disabled={!apiKey || !apiSecret || connecting}>
                    {connecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting...</> : "Connect"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[13px] text-muted-foreground">Enter your API credentials from your exchange account settings.</p>
                <div className="space-y-1">
                  <Label htmlFor="api-key">API Key</Label>
                  <Input id="api-key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Enter your API key" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="api-secret">API Secret</Label>
                  <Input id="api-secret" type="password" value={apiSecret} onChange={(e) => setApiSecret(e.target.value)} placeholder="Enter your API secret" />
                </div>
                {selectedExchange === "kucoin" && (
                  <div className="space-y-1">
                    <Label htmlFor="api-pass">API Passphrase</Label>
                    <Input id="api-pass" type="password" value={apiPassphrase} onChange={(e) => setApiPassphrase(e.target.value)} placeholder="Enter your API passphrase" />
                  </div>
                )}
                {connectionError && <p className="text-sm text-red-500">{connectionError}</p>}
                <Button className="w-full" onClick={handleApiConnect} disabled={!apiKey || !apiSecret || connecting}>
                  {connecting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Connecting...</> : "Connect"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {EXCHANGE_OPTIONS.map((option) => (
              <button key={option.id} onClick={() => setSelectedExchange(option.id)} className="flex flex-col items-center gap-2.5 rounded-xl border border-[#E5E5E0] dark:border-[#333] p-5 hover:border-[#9CA3AF] dark:hover:border-[#555] transition-colors">
                <img src={option.logo} alt={option.name} className="h-10 w-10 rounded-full object-cover" />
                <span className="text-[13px] font-medium">{option.name}</span>
              </button>
            ))}
          </div>
        )}
      </TabsContent>

      {/* ── CSV Tab ── */}
      <TabsContent value="csv" className="mt-4 space-y-4">
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <QrCode className="h-6 w-6 text-primary" />
          </div>
          <h3 className="mb-1 text-lg font-medium">Upload transaction CSV</h3>
          <p className="mb-4 text-sm text-muted-foreground">Drag and drop your transaction CSV file or click to browse</p>
          <Input id="csv-file" type="file" accept=".csv" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} className="mx-auto max-w-sm cursor-pointer" />
          {csvFile && (
            <div className="mt-4">
              <p className="text-sm font-medium">Selected: {csvFile.name}</p>
              <Button className="mt-2" onClick={() => {
                if (onConnect) onConnect("csv", { success: true, provider: "csv", fileName: csvFile.name, timestamp: new Date().toISOString() });
                setCsvFile(null);
              }}>
                Upload and Import
              </Button>
            </div>
          )}
        </div>
      </TabsContent>
    </Tabs>
  );
}
