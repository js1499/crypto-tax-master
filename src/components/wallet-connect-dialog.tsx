"use client";

import { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { QrCode, Loader2, Wallet, ArrowLeft, Plus, Upload } from "lucide-react";
import type { ConnectionResult } from "@/types/wallet";
import { toast } from "sonner";
import { useSyncPipeline, type WalletJob } from "@/components/sync-pipeline/pipeline-provider";

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

// L2/EVM chains shown as separate entry points in the wallet grid
// All use the same EVM address format and provider
const L2_WALLET_OPTIONS = [
  { id: "evm-polygon", name: "Polygon", logo: "/logos/polygon-placeholder.svg", chains: ["polygon"] },
  { id: "evm-arbitrum", name: "Arbitrum", logo: "/logos/arbitrum-placeholder.svg", chains: ["arbitrum"] },
  { id: "evm-optimism", name: "Optimism", logo: "/logos/optimism-placeholder.svg", chains: ["optimism"] },
  { id: "evm-base", name: "Base", logo: "/logos/base-placeholder.svg", chains: ["base"] },
  { id: "evm-avalanche", name: "Avalanche", logo: "/logos/avalanche-placeholder.svg", chains: ["avalanche"] },
  { id: "evm-bsc", name: "BNB Chain", logo: "/logos/bsc-placeholder.svg", chains: ["bsc"] },
  { id: "evm-linea", name: "Linea", logo: "/logos/linea-placeholder.svg", chains: ["linea"] },
  { id: "evm-fantom", name: "Fantom", logo: "/logos/fantom-placeholder.svg", chains: ["fantom"] },
  { id: "evm-cronos", name: "Cronos", logo: "/logos/cronos-placeholder.svg", chains: ["cronos"] },
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
  initialBulk?: boolean;
}

export function WalletConnectDialog({ onConnect, exclusive, initialBulk }: WalletConnectDialogProps) {
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

  // Bulk wallet add
  const [bulkMode, setBulkMode] = useState(initialBulk || false);
  useEffect(() => { setBulkMode(initialBulk || false); }, [initialBulk]);
  const [bulkRows, setBulkRows] = useState<Array<{ id: number; type: "wallet" | "csv"; provider: string; address: string; name: string; chains: string[]; csvFile?: File | null }>>([
    { id: 1, type: "wallet", provider: "solana", address: "", name: "SOL Wallet 1", chains: ["eth", "polygon", "arbitrum", "optimism", "base"] },
  ]);
  const [bulkNextId, setBulkNextId] = useState(2);
  const { startPipeline, isRunning } = useSyncPipeline();

  const addBulkRow = (rowType: "wallet" | "csv" = "wallet") => {
    const count = bulkRows.length + 1;
    setBulkRows(prev => [...prev, {
      id: bulkNextId,
      type: rowType,
      provider: rowType === "csv" ? "custom" : "solana",
      address: "",
      name: rowType === "csv" ? `CSV Import ${count}` : `SOL Wallet ${count}`,
      chains: ["eth", "polygon", "arbitrum", "optimism", "base"],
      csvFile: null,
    }]);
    setBulkNextId(prev => prev + 1);
  };

  const removeBulkRow = (id: number) => {
    setBulkRows(prev => prev.filter(r => r.id !== id));
  };

  const updateBulkRow = (id: number, field: string, value: string | string[]) => {
    setBulkRows(prev => prev.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      // Auto-update name prefix when provider changes
      if (field === "provider" && r.name.match(/^(SOL|ETH|BTC) Wallet/)) {
        const prefix = value === "solana" ? "SOL" : value === "evm" ? "ETH" : "BTC";
        updated.name = r.name.replace(/^(SOL|ETH|BTC)/, prefix);
      }
      return updated;
    }));
  };

  const handleBulkAdd = async () => {
    const walletRows = bulkRows.filter(r => r.type === "wallet" && r.address.trim().length > 0);
    const csvRows = bulkRows.filter(r => r.type === "csv" && r.csvFile);

    if (walletRows.length === 0 && csvRows.length === 0) {
      toast.error("Enter at least one wallet address or select a CSV file");
      return;
    }

    setConnecting(true);
    setConnectionError(null);
    const addedWallets: WalletJob[] = [];

    try {
      // Process wallet rows
      for (const row of walletRows) {
        const body: Record<string, unknown> = {
          name: row.name.trim() || `Wallet ${addedWallets.length + 1}`,
          address: row.provider === "evm" ? row.address.trim().toLowerCase() : row.address.trim(),
          provider: row.provider,
          exclusive,
        };
        if (row.provider === "evm") body.chains = row.chains.join(",");

        const res = await fetch("/api/wallets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(`${row.name}: ${data.error || "Failed"}`);
          continue;
        }

        addedWallets.push({
          walletId: data.wallet.id,
          name: row.name,
          address: row.address.trim(),
          provider: row.provider,
          chains: row.provider === "evm" ? row.chains : undefined,
        });
      }

      // Process CSV rows
      for (const row of csvRows) {
        if (!row.csvFile) continue;
        const formData = new FormData();
        formData.append("file", row.csvFile);
        formData.append("exchange", row.provider);

        const res = await fetch("/api/transactions/import", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          toast.error(`${row.csvFile.name}: ${data.error || "Import failed"}`);
        } else {
          toast.success(`${row.csvFile.name}: ${data.transactionsAdded || 0} transactions imported`);
        }
      }

      if (addedWallets.length > 0) {
        toast.success(`Added ${addedWallets.length} wallet(s). Starting sync pipeline...`);
        startPipeline(addedWallets);
      }

      resetForm();
      if (onConnect) {
        onConnect("bulk", { success: true, provider: "bulk", address: "bulk", timestamp: new Date().toISOString() });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Bulk add failed";
      setConnectionError(msg);
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const resetForm = () => {
    setSelectedWallet(null);
    setSelectedExchange(null);
    setBulkMode(false);
    setBulkRows([{ id: 1, type: "wallet", provider: "solana", address: "", name: "SOL Wallet 1", chains: ["eth", "polygon", "arbitrum", "optimism", "base"] }]);
    setBulkNextId(2);
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
        // Use pipeline for sync → enrich → compute
        startPipeline([{
          walletId: data.wallet.id,
          name: walletName,
          address: walletAddress,
          provider: selectedWallet === "evm" ? "evm" : selectedWallet!,
          chains: selectedWallet === "evm" ? selectedChains : undefined,
        }]);
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
        ) : bulkMode ? (
          /* ── Bulk Add Mode — row-based ── */
          <div className="space-y-4">
            <button onClick={() => setBulkMode(false)} className="flex items-center gap-1 text-[13px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>

            <div>
              <h3 className="text-[14px] font-semibold">Add Multiple Wallets</h3>
              <p className="text-[12px] text-[#9CA3AF] mt-0.5">Add each wallet below. All will be synced, priced, and computed automatically.</p>
            </div>

            <div className="space-y-3 max-h-[350px] overflow-y-auto pr-1">
              {bulkRows.map((row, idx) => (
                <div key={row.id} className="rounded-lg border border-[#E5E5E0] dark:border-[#333] p-3 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-[#9CA3AF] uppercase tracking-wide">
                      {row.type === "csv" ? `CSV ${idx + 1}` : `Wallet ${idx + 1}`}
                    </span>
                    {bulkRows.length > 1 && (
                      <button onClick={() => removeBulkRow(row.id)} className="text-[11px] text-[#9CA3AF] hover:text-[#DC2626] transition-colors">
                        Remove
                      </button>
                    )}
                  </div>

                  {row.type === "csv" ? (
                    /* ── CSV row ── */
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={row.provider}
                          onChange={(e) => updateBulkRow(row.id, "provider", e.target.value)}
                          className="h-8 rounded-md border border-[#E5E5E0] dark:border-[#333] bg-transparent text-[12px] font-medium px-2 flex-1 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                        >
                          <option value="custom">Custom Format</option>
                          <option value="coinbase">Coinbase</option>
                          <option value="binance">Binance</option>
                          <option value="kraken">Kraken</option>
                          <option value="kucoin">KuCoin</option>
                          <option value="gemini">Gemini</option>
                        </select>
                      </div>
                      <label className="flex items-center justify-center gap-2 h-10 rounded-lg border border-dashed border-[#E5E5E0] dark:border-[#333] cursor-pointer hover:border-[#9CA3AF] transition-colors">
                        <input
                          type="file"
                          accept=".csv"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setBulkRows(prev => prev.map(r => r.id === row.id ? { ...r, csvFile: file, name: file.name } : r));
                            }
                          }}
                        />
                        {row.csvFile ? (
                          <span className="text-[12px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">{row.csvFile.name} ({(row.csvFile.size / 1024).toFixed(0)} KB)</span>
                        ) : (
                          <span className="text-[12px] text-[#9CA3AF]">Click to select CSV file</span>
                        )}
                      </label>
                    </div>
                  ) : (
                    /* ── Wallet row ── */
                    <>
                      <div className="flex gap-2">
                        <select
                          value={row.provider}
                          onChange={(e) => updateBulkRow(row.id, "provider", e.target.value)}
                          className="h-8 rounded-md border border-[#E5E5E0] dark:border-[#333] bg-transparent text-[12px] font-medium px-2 w-[100px] focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
                        >
                          <option value="solana">Solana</option>
                          <option value="evm">EVM (ETH)</option>
                          <option value="bitcoin">Bitcoin</option>
                        </select>
                        <Input
                          value={row.name}
                          onChange={(e) => updateBulkRow(row.id, "name", e.target.value)}
                          placeholder="Wallet name"
                          className="h-8 text-[12px] flex-1"
                        />
                      </div>
                      <Input
                        value={row.address}
                        onChange={(e) => updateBulkRow(row.id, "address", e.target.value)}
                        placeholder={row.provider === "solana" ? "Solana address..." : row.provider === "evm" ? "0x..." : "Bitcoin address..."}
                        className="h-8 text-[12px] font-mono"
                      />
                      {row.provider === "evm" && (
                        <div className="flex flex-wrap gap-1.5">
                          {EVM_CHAINS.map((chain) => (
                            <button
                              key={chain.id}
                              onClick={() => {
                                const next = row.chains.includes(chain.id)
                                  ? row.chains.filter(c => c !== chain.id)
                                  : [...row.chains, chain.id];
                                updateBulkRow(row.id, "chains", next);
                              }}
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                                row.chains.includes(chain.id)
                                  ? "border-[#2563EB] bg-[#EFF6FF] text-[#2563EB] dark:bg-[rgba(37,99,235,0.12)]"
                                  : "border-[#E5E5E0] dark:border-[#333] text-[#9CA3AF]"
                              }`}
                            >
                              {chain.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {/* Add another */}
            <div className="flex gap-2">
              <button
                onClick={() => addBulkRow("wallet")}
                className="flex-1 py-2.5 rounded-lg border-2 border-dashed border-[#2563EB]/40 text-[13px] font-semibold text-[#2563EB] hover:border-[#2563EB] hover:bg-[#EFF6FF] dark:hover:bg-[rgba(37,99,235,0.08)] transition-colors"
              >
                <Plus className="inline h-4 w-4 mr-1 -mt-0.5" />
                Add Wallet
              </button>
              <button
                onClick={() => addBulkRow("csv")}
                className="flex-1 py-2.5 rounded-lg border-2 border-dashed border-[#9333EA]/40 text-[13px] font-semibold text-[#9333EA] hover:border-[#9333EA] hover:bg-[#FAF5FF] dark:hover:bg-[rgba(147,51,234,0.08)] transition-colors"
              >
                <Upload className="inline h-4 w-4 mr-1 -mt-0.5" />
                Add CSV
              </button>
            </div>

            {/* Exchange disclaimer */}
            <p className="text-[11px] text-[#9CA3AF] leading-relaxed">
              Exchange API connections (Coinbase, Binance, etc.) can only be added one at a time via the Add Account &gt; Exchanges tab.
            </p>

            {connectionError && <p className="text-sm text-red-500">{connectionError}</p>}

            <Button
              className="w-full"
              onClick={handleBulkAdd}
              disabled={connecting || isRunning || bulkRows.every(r => r.type === "wallet" ? !r.address.trim() : !r.csvFile)}
            >
              {connecting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" />Add & Sync All ({bulkRows.filter(r => r.type === "wallet" ? r.address.trim() : r.csvFile).length} items)</>
              )}
            </Button>
          </div>
        ) : (
          /* ── Wallet Selection Grid ── */
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {WALLET_OPTIONS.map((option) => (
                <button key={option.id} onClick={() => setSelectedWallet(option.id)} className="aspect-square flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E5E5E0] dark:border-[#333] hover:border-[#9CA3AF] dark:hover:border-[#555] transition-colors">
                  <img src={option.logo} alt={option.name} className="h-10 w-10 rounded-full" />
                  <span className="text-[13px] font-medium">{option.name}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] font-semibold text-[#9CA3AF] tracking-wide uppercase">L2 / EVM Chains</p>
            <div className="grid grid-cols-3 gap-3">
              {L2_WALLET_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  onClick={() => {
                    setSelectedWallet("evm");
                    setSelectedChains(option.chains);
                  }}
                  className="aspect-square flex flex-col items-center justify-center gap-2 rounded-xl border border-[#E5E5E0] dark:border-[#333] hover:border-[#9CA3AF] dark:hover:border-[#555] transition-colors"
                >
                  <div className="h-10 w-10 rounded-full bg-[#F5F5F0] dark:bg-[#222] flex items-center justify-center text-[12px] font-bold text-[#6B7280]">
                    {option.name.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[13px] font-medium">{option.name}</span>
                </button>
              ))}
            </div>

            {/* Bulk add link */}
            <button
              onClick={() => setBulkMode(true)}
              className="w-full py-2.5 rounded-lg border border-dashed border-[#E5E5E0] dark:border-[#333] text-[13px] font-medium text-[#6B7280] hover:border-[#9CA3AF] hover:text-[#4B5563] transition-colors"
            >
              <Plus className="inline h-3.5 w-3.5 mr-1.5 -mt-0.5" />
              Add Multiple Wallets at Once
            </button>
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
