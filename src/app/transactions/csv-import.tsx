"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Upload, FileText, Check, Link2, RefreshCw, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ImportedData } from "@/types/wallet"; // Updated import
import axios from "axios";

const exchangeTemplates = [
  { id: "coinbase", name: "Coinbase" },
  { id: "binance", name: "Binance" },
  { id: "kraken", name: "Kraken" },
  { id: "kucoin", name: "KuCoin" },
  { id: "gemini", name: "Gemini" },
  { id: "custom", name: "Custom Format" },
];

interface CSVImportProps {
  onImportComplete?: (data: ImportedData) => void; // Updated type
}

export function CSVImport({ onImportComplete }: CSVImportProps) {
  const [selectedExchange, setSelectedExchange] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadComplete, setUploadComplete] = useState(false);

  // Coinbase connection state
  const [coinbaseConnected, setCoinbaseConnected] = useState(false);
  const [coinbaseLoading, setCoinbaseLoading] = useState(false);
  const [isSyncingCoinbase, setIsSyncingCoinbase] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);

  // Coinbase API Key form state
  const [showApiKeyForm, setShowApiKeyForm] = useState(false);
  const [coinbaseApiKey, setCoinbaseApiKey] = useState("");
  const [coinbaseApiSecret, setCoinbaseApiSecret] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  // Gemini connection state
  const [geminiConnected, setGeminiConnected] = useState(false);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [isSyncingGemini, setIsSyncingGemini] = useState(false);
  const [geminiSyncProgress, setGeminiSyncProgress] = useState(0);
  const [showGeminiApiKeyForm, setShowGeminiApiKeyForm] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiApiSecret, setGeminiApiSecret] = useState("");
  const [isConnectingGemini, setIsConnectingGemini] = useState(false);

  // KuCoin connection state
  const [kucoinConnected, setKucoinConnected] = useState(false);
  const [kucoinLoading, setKucoinLoading] = useState(false);
  const [isSyncingKucoin, setIsSyncingKucoin] = useState(false);
  const [kucoinSyncProgress, setKucoinSyncProgress] = useState(0);
  const [showKucoinApiKeyForm, setShowKucoinApiKeyForm] = useState(false);
  const [kucoinApiKey, setKucoinApiKey] = useState("");
  const [kucoinApiSecret, setKucoinApiSecret] = useState("");
  const [kucoinApiPassphrase, setKucoinApiPassphrase] = useState("");
  const [isConnectingKucoin, setIsConnectingKucoin] = useState(false);

  // Check if exchange is already connected when component mounts
  useEffect(() => {
    if (selectedExchange === "coinbase") {
      checkCoinbaseConnection();
    } else if (selectedExchange === "gemini") {
      checkGeminiConnection();
    } else if (selectedExchange === "kucoin") {
      checkKucoinConnection();
    }
  }, [selectedExchange]);

  const checkCoinbaseConnection = async () => {
    setCoinbaseLoading(true);
    try {
      const response = await axios.get("/api/exchanges");
      const exchanges = response.data.exchanges || [];
      const coinbase = exchanges.find((e: any) => e.name.toLowerCase() === "coinbase");
      setCoinbaseConnected(coinbase?.isConnected || false);
    } catch (error) {
      console.error("[CSVImport] Error checking Coinbase connection:", error);
      setCoinbaseConnected(false);
    } finally {
      setCoinbaseLoading(false);
    }
  };

  const handleCoinbaseApiKeyConnect = async () => {
    if (!coinbaseApiKey || !coinbaseApiSecret) {
      toast.error("Please enter both API Key and API Secret");
      return;
    }

    setIsConnecting(true);
    try {
      const response = await axios.post("/api/exchanges/connect", {
        exchange: "coinbase",
        apiKey: coinbaseApiKey,
        apiSecret: coinbaseApiSecret,
      });

      if (response.data.status === "success") {
        toast.success("Coinbase account connected successfully!");
        setCoinbaseConnected(true);
        setShowApiKeyForm(false);
        setCoinbaseApiKey("");
        setCoinbaseApiSecret("");
      } else {
        throw new Error(response.data.error || "Failed to connect");
      }
    } catch (error) {
      console.error("[CSVImport] Coinbase connect error:", error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || error.message
        : error instanceof Error ? error.message : "Failed to connect Coinbase";
      toast.error(errorMessage);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCoinbaseSync = async () => {
    setIsSyncingCoinbase(true);
    setSyncProgress(0);

    try {
      // Simulate progress while syncing
      const progressInterval = setInterval(() => {
        setSyncProgress((prev) => Math.min(prev + 5, 90));
      }, 500);

      // Call the sync API with fullSync to get all historical transactions
      const response = await axios.post("/api/exchanges/sync", {
        fullSync: true, // Get all historical transactions
      });

      clearInterval(progressInterval);
      setSyncProgress(100);

      if (response.data.status === "success") {
        const count = response.data.transactionsAdded || 0;
        const skipped = response.data.transactionsSkipped || 0;

        toast.success(
          `Successfully imported ${count} transaction${count !== 1 ? "s" : ""} from Coinbase${skipped > 0 ? ` (${skipped} duplicates skipped)` : ""}`
        );

        // Call onImportComplete with the result
        if (onImportComplete) {
          onImportComplete({
            source: "Coinbase (API)",
            fileName: "coinbase-api-sync",
            timestamp: new Date().toISOString(),
            transactions: [],
            totalTransactions: count,
          });
        }
      } else {
        throw new Error(response.data.error || "Failed to sync");
      }
    } catch (error) {
      console.error("[CSVImport] Coinbase sync error:", error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.errors?.[0] || error.response?.data?.error || error.message
        : error instanceof Error ? error.message : "Failed to sync Coinbase transactions";

      // Check if it's a reconnect error
      if (errorMessage.includes("reconnect") || errorMessage.includes("expired") || errorMessage.includes("Invalid")) {
        setCoinbaseConnected(false);
        toast.error("Coinbase connection failed. Please reconnect your account.");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSyncingCoinbase(false);
      setSyncProgress(0);
    }
  };

  // Gemini connection functions
  const checkGeminiConnection = async () => {
    setGeminiLoading(true);
    try {
      const response = await axios.get("/api/exchanges");
      const exchanges = response.data.exchanges || [];
      const gemini = exchanges.find((e: any) => e.name.toLowerCase() === "gemini");
      setGeminiConnected(gemini?.isConnected || false);
    } catch (error) {
      console.error("[CSVImport] Error checking Gemini connection:", error);
      setGeminiConnected(false);
    } finally {
      setGeminiLoading(false);
    }
  };

  const handleGeminiApiKeyConnect = async () => {
    if (!geminiApiKey || !geminiApiSecret) {
      toast.error("Please enter both API Key and API Secret");
      return;
    }

    setIsConnectingGemini(true);
    try {
      const response = await axios.post("/api/exchanges/connect", {
        exchange: "gemini",
        apiKey: geminiApiKey,
        apiSecret: geminiApiSecret,
      });

      if (response.data.status === "success") {
        toast.success("Gemini account connected successfully!");
        setGeminiConnected(true);
        setShowGeminiApiKeyForm(false);
        setGeminiApiKey("");
        setGeminiApiSecret("");
      } else {
        throw new Error(response.data.error || "Failed to connect");
      }
    } catch (error) {
      console.error("[CSVImport] Gemini connect error:", error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || error.message
        : error instanceof Error ? error.message : "Failed to connect Gemini";
      toast.error(errorMessage);
    } finally {
      setIsConnectingGemini(false);
    }
  };

  const handleGeminiSync = async () => {
    setIsSyncingGemini(true);
    setGeminiSyncProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setGeminiSyncProgress((prev) => Math.min(prev + 5, 90));
      }, 500);

      const response = await axios.post("/api/exchanges/sync", {
        fullSync: true,
      });

      clearInterval(progressInterval);
      setGeminiSyncProgress(100);

      if (response.data.status === "success") {
        const count = response.data.transactionsAdded || 0;
        const skipped = response.data.transactionsSkipped || 0;

        toast.success(
          `Successfully imported ${count} transaction${count !== 1 ? "s" : ""} from Gemini${skipped > 0 ? ` (${skipped} duplicates skipped)` : ""}`
        );

        if (onImportComplete) {
          onImportComplete({
            source: "Gemini (API)",
            fileName: "gemini-api-sync",
            timestamp: new Date().toISOString(),
            transactions: [],
            totalTransactions: count,
          });
        }
      } else {
        throw new Error(response.data.error || "Failed to sync");
      }
    } catch (error) {
      console.error("[CSVImport] Gemini sync error:", error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.errors?.[0] || error.response?.data?.error || error.message
        : error instanceof Error ? error.message : "Failed to sync Gemini transactions";

      if (errorMessage.includes("reconnect") || errorMessage.includes("expired") || errorMessage.includes("Invalid")) {
        setGeminiConnected(false);
        toast.error("Gemini connection failed. Please reconnect your account.");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSyncingGemini(false);
      setGeminiSyncProgress(0);
    }
  };

  // KuCoin connection functions
  const checkKucoinConnection = async () => {
    setKucoinLoading(true);
    try {
      const response = await axios.get("/api/exchanges");
      const exchanges = response.data.exchanges || [];
      const kucoin = exchanges.find((e: any) => e.name.toLowerCase() === "kucoin");
      setKucoinConnected(kucoin?.isConnected || false);
    } catch (error) {
      console.error("[CSVImport] Error checking KuCoin connection:", error);
      setKucoinConnected(false);
    } finally {
      setKucoinLoading(false);
    }
  };

  const handleKucoinApiKeyConnect = async () => {
    if (!kucoinApiKey || !kucoinApiSecret || !kucoinApiPassphrase) {
      toast.error("Please enter API Key, API Secret, and Passphrase");
      return;
    }

    setIsConnectingKucoin(true);
    try {
      const response = await axios.post("/api/exchanges/connect", {
        exchange: "kucoin",
        apiKey: kucoinApiKey,
        apiSecret: kucoinApiSecret,
        apiPassphrase: kucoinApiPassphrase,
      });

      if (response.data.status === "success") {
        toast.success("KuCoin account connected successfully!");
        setKucoinConnected(true);
        setShowKucoinApiKeyForm(false);
        setKucoinApiKey("");
        setKucoinApiSecret("");
        setKucoinApiPassphrase("");
      } else {
        throw new Error(response.data.error || "Failed to connect");
      }
    } catch (error) {
      console.error("[CSVImport] KuCoin connect error:", error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.error || error.message
        : error instanceof Error ? error.message : "Failed to connect KuCoin";
      toast.error(errorMessage);
    } finally {
      setIsConnectingKucoin(false);
    }
  };

  const handleKucoinSync = async () => {
    setIsSyncingKucoin(true);
    setKucoinSyncProgress(0);

    try {
      const progressInterval = setInterval(() => {
        setKucoinSyncProgress((prev) => Math.min(prev + 5, 90));
      }, 500);

      const response = await axios.post("/api/exchanges/sync", {
        fullSync: true,
      });

      clearInterval(progressInterval);
      setKucoinSyncProgress(100);

      if (response.data.status === "success") {
        const count = response.data.transactionsAdded || 0;
        const skipped = response.data.transactionsSkipped || 0;

        toast.success(
          `Successfully imported ${count} transaction${count !== 1 ? "s" : ""} from KuCoin${skipped > 0 ? ` (${skipped} duplicates skipped)` : ""}`
        );

        if (onImportComplete) {
          onImportComplete({
            source: "KuCoin (API)",
            fileName: "kucoin-api-sync",
            timestamp: new Date().toISOString(),
            transactions: [],
            totalTransactions: count,
          });
        }
      } else {
        throw new Error(response.data.error || "Failed to sync");
      }
    } catch (error) {
      console.error("[CSVImport] KuCoin sync error:", error);
      const errorMessage = axios.isAxiosError(error)
        ? error.response?.data?.errors?.[0] || error.response?.data?.error || error.message
        : error instanceof Error ? error.message : "Failed to sync KuCoin transactions";

      if (errorMessage.includes("reconnect") || errorMessage.includes("expired") || errorMessage.includes("Invalid")) {
        setKucoinConnected(false);
        toast.error("KuCoin connection failed. Please reconnect your account.");
      } else {
        toast.error(errorMessage);
      }
    } finally {
      setIsSyncingKucoin(false);
      setKucoinSyncProgress(0);
    }
  };

  const handleExchangeSelect = (value: string) => {
    setSelectedExchange(value);
    // Reset file selection when changing exchange
    setCsvFile(null);
    setUploadComplete(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setCsvFile(e.target.files[0]);
      setUploadComplete(false);
    }
  };

  const handleDownloadTemplate = () => {
    toast.info(`Template for ${selectedExchange} downloaded`);
  };

  const handleImport = async () => {
    if (!csvFile) {
      toast.error("Please select a CSV file to import");
      return;
    }

    if (!selectedExchange) {
      toast.error("Please select an exchange or platform");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Create FormData to send file
      const formData = new FormData();
      formData.append("file", csvFile);
      formData.append("exchange", selectedExchange);

      // Calculate file size for better progress estimation
      const fileSizeMB = csvFile.size / 1024 / 1024;
      console.log(`[CSV Import] Uploading file: ${csvFile.name}, size: ${fileSizeMB.toFixed(2)}MB`);
      console.log(`[CSV Import] File type: ${csvFile.type}, Last modified: ${new Date(csvFile.lastModified).toISOString()}`);
      
      // Validate file before upload
      if (csvFile.size === 0) {
        throw new Error("The selected file is empty. Please select a valid CSV file.");
      }
      
      if (csvFile.size > 50 * 1024 * 1024) {
        throw new Error(`File size (${fileSizeMB.toFixed(2)}MB) exceeds the maximum allowed size of 50MB. Please split your CSV into smaller files.`);
      }

      let uploadStartTime = Date.now();
      
      // Simulate upload progress (0-70%) since fetch doesn't provide upload progress
      // For large files, this gives user feedback that something is happening
      const progressStep = fileSizeMB > 10 ? 1 : 2; // Smaller steps for large files
      const progressIntervalMs = fileSizeMB > 10 ? 800 : 500; // Slower updates for large files
      
      let progressInterval: NodeJS.Timeout | null = null;
      progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          // Cap at 70% during upload (remaining 30% for processing)
          if (prev >= 70) {
            if (progressInterval) clearInterval(progressInterval);
            return 70;
          }
          return Math.min(70, prev + progressStep);
        });
      }, progressIntervalMs);

      // Make API call with longer timeout for large files
      const controller = new AbortController();
      // Timeout based on file size: 1 minute per MB, minimum 5 minutes, maximum 30 minutes
      const timeoutMs = Math.min(30 * 60 * 1000, Math.max(5 * 60 * 1000, fileSizeMB * 60 * 1000));
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      
      console.log(`[CSV Import] Request timeout set to ${(timeoutMs / 1000 / 60).toFixed(1)} minutes for ${fileSizeMB.toFixed(2)}MB file`);

      let response: Response;
      try {
        // Start the actual upload
        response = await fetch("/api/transactions/import", {
          method: "POST",
          body: formData,
          signal: controller.signal,
          credentials: "include", // Include cookies for authentication
        });
        
        // Upload complete, clear progress interval and move to processing phase
        if (progressInterval) clearInterval(progressInterval);
        setUploadProgress(75); // Upload complete, starting processing
        
        console.log(`[CSV Import] Fetch completed, status: ${response.status}`);
        clearTimeout(timeoutId);
        
        const uploadTime = ((Date.now() - uploadStartTime) / 1000).toFixed(1);
        console.log(`[CSV Import] Upload completed in ${uploadTime}s, now processing...`);
        
        // Simulate processing progress (75% to 95%) - server is processing the file
        const processingInterval = setInterval(() => {
          setUploadProgress((prev) => {
            if (prev >= 95) {
              clearInterval(processingInterval);
              return 95;
            }
            return prev + 0.3; // Slowly increase to 95% during processing
          });
        }, 2000); // Update every 2 seconds
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === 'AbortError') {
          const elapsed = ((Date.now() - uploadStartTime) / 1000 / 60).toFixed(1);
          throw new Error(`Request timed out after ${elapsed} minutes. The file might be too large. Please try splitting it into smaller files or contact support.`);
        }
        throw fetchError;
      }

      // Processing complete, set to 100%
      setUploadProgress(100);

      // Check if response has content
      const contentType = response.headers.get("content-type");
      console.log(`[CSV Import] Response status: ${response.status}, Content-Type: ${contentType}`);
      
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error(`[CSV Import] Non-JSON response:`, text.substring(0, 500));
        throw new Error(`Server returned invalid response: ${text.substring(0, 200)}`);
      }

      // Parse JSON with error handling
      let data;
      try {
        const text = await response.text();
        if (!text || text.trim() === '') {
          console.error(`[CSV Import] Empty response from server`);
          throw new Error("Server returned empty response");
        }
        console.log(`[CSV Import] Response text length: ${text.length} characters`);
        data = JSON.parse(text);
        console.log(`[CSV Import] Parsed response:`, { status: data.status, error: data.error, details: data.details?.substring(0, 100) });
      } catch (parseError) {
        console.error("[CSV Import] JSON parse error:", parseError);
        throw new Error("Failed to parse server response. The import may have partially completed. Please check your transactions.");
      }

      if (!response.ok) {
        // Extract detailed error information
        const errorMsg = data.error || "Failed to import transactions";
        const errorDetails = data.details || "";
        const fullError = errorDetails ? `${errorMsg}: ${errorDetails}` : errorMsg;
        
        console.error(`[CSV Import] Server error (${response.status}):`, {
          error: errorMsg,
          details: errorDetails,
          contentType: data.contentType,
          contentLength: data.contentLength,
        });
        
        throw new Error(fullError);
      }

      setIsUploading(false);
      setUploadComplete(true);

      // Transform API response to ImportedData format
      const importedData: ImportedData = {
        source: data.source || selectedExchange,
        fileName: data.fileName || csvFile.name,
        timestamp: data.timestamp || new Date().toISOString(),
        transactions: [], // Transactions are stored in DB, not returned in detail
        totalTransactions: data.totalTransactions || data.transactionsAdded || 0,
      };

      if (onImportComplete) {
        onImportComplete(importedData);
      }

      const message = `Successfully imported ${data.transactionsAdded} transaction${data.transactionsAdded !== 1 ? "s" : ""} from ${csvFile.name}${data.transactionsSkipped > 0 ? ` (${data.transactionsSkipped} skipped as duplicates)` : ""}`;
      toast.success(message);

      // Reset form after successful import
      setTimeout(() => {
        setCsvFile(null);
        setUploadComplete(false);
        setUploadProgress(0);
      }, 2000);
    } catch (error) {
      setIsUploading(false);
      setUploadProgress(0);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to import transactions. Please try again.";
      toast.error(errorMessage);
      console.error("Import error:", error);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Import Transactions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="exchange-template">Exchange or Platform</Label>
          <Select
            value={selectedExchange}
            onValueChange={handleExchangeSelect}
          >
            <SelectTrigger id="exchange-template">
              <SelectValue placeholder="Select exchange or platform" />
            </SelectTrigger>
            <SelectContent>
              {exchangeTemplates.map((exchange) => (
                <SelectItem key={exchange.id} value={exchange.id}>
                  {exchange.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedExchange && selectedExchange !== "coinbase" && (
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedExchange === "custom"
                ? "Custom format requires mapping columns"
                : `Using ${exchangeTemplates.find(e => e.id === selectedExchange)?.name} format`}
            </div>
          )}
        </div>

        {/* Coinbase API Key Section - Show when Coinbase is selected */}
        {selectedExchange === "coinbase" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-gradient-to-r from-blue-500/10 to-blue-600/10 p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#0052FF]">
                  <svg className="h-6 w-6" viewBox="0 0 1024 1024" fill="none">
                    <path fillRule="evenodd" clipRule="evenodd" d="M512 872C710.823 872 872 710.823 872 512C872 313.177 710.823 152 512 152C313.177 152 152 313.177 152 512C152 710.823 313.177 872 512 872ZM420 396C406.745 396 396 406.745 396 420V604C396 617.255 406.745 628 420 628H604C617.255 628 628 617.255 628 604V420C628 406.745 617.255 396 604 396H420Z" fill="white"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Connect Coinbase Account</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect your Coinbase account using API keys to automatically download all your historical transactions.
                  </p>

                  {coinbaseLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking connection status...
                    </div>
                  ) : coinbaseConnected ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-500">
                        <CheckCircle2 className="h-4 w-4" />
                        Coinbase account connected
                      </div>

                      {isSyncingCoinbase ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Downloading transactions...</span>
                            <span>{syncProgress}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full bg-[#0052FF] transition-all"
                              style={{ width: `${syncProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={handleCoinbaseSync}
                            className="bg-[#0052FF] hover:bg-[#0052FF]/90"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Download All Transactions
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowApiKeyForm(true);
                              setCoinbaseConnected(false);
                            }}
                          >
                            Reconnect
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : showApiKeyForm ? (
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="coinbase-api-key">API Key Name</Label>
                        <Input
                          id="coinbase-api-key"
                          type="text"
                          placeholder="organizations/xxx/apiKeys/xxx"
                          value={coinbaseApiKey}
                          onChange={(e) => setCoinbaseApiKey(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Format: organizations/&#123;org_id&#125;/apiKeys/&#123;key_id&#125;
                        </p>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="coinbase-api-secret">Private Key</Label>
                        <textarea
                          id="coinbase-api-secret"
                          className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 font-mono"
                          placeholder="-----BEGIN EC PRIVATE KEY-----&#10;...&#10;-----END EC PRIVATE KEY-----"
                          value={coinbaseApiSecret}
                          onChange={(e) => setCoinbaseApiSecret(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Paste the full EC Private Key including BEGIN/END lines
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleCoinbaseApiKeyConnect}
                          disabled={isConnecting || !coinbaseApiKey || !coinbaseApiSecret}
                          className="bg-[#0052FF] hover:bg-[#0052FF]/90"
                        >
                          {isConnecting ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Link2 className="mr-2 h-4 w-4" />
                              Connect
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowApiKeyForm(false);
                            setCoinbaseApiKey("");
                            setCoinbaseApiSecret("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="rounded-md bg-amber-900/20 p-3 text-xs text-amber-500">
                        <p className="font-medium">How to get CDP API keys (new method required since Feb 2025):</p>
                        <ol className="mt-1 list-inside list-decimal space-y-1">
                          <li>Go to <a href="https://portal.cdp.coinbase.com/access/api" target="_blank" rel="noopener noreferrer" className="underline">portal.cdp.coinbase.com/access/api</a></li>
                          <li>Click &quot;Create API Key&quot;</li>
                          <li>Select &quot;ECDSA&quot; as the key type (Ed25519 is not supported)</li>
                          <li>Download the JSON file containing your API Key Name and Private Key</li>
                          <li>Copy the &quot;name&quot; field as API Key Name and &quot;privateKey&quot; as Private Key</li>
                        </ol>
                        <p className="mt-2 text-amber-400 font-medium">Note: Legacy API keys (from coinbase.com/settings/api) were deprecated in February 2025.</p>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowApiKeyForm(true)}
                      className="mt-4 bg-[#0052FF] hover:bg-[#0052FF]/90"
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Connect with API Key
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or upload CSV manually
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Gemini API Key Section - Show when Gemini is selected */}
        {selectedExchange === "gemini" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-gradient-to-r from-cyan-500/10 to-teal-600/10 p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#00DCFA]">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none">
                    <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="white"/>
                    <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2"/>
                    <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Connect Gemini Account</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect your Gemini account using API keys to automatically download all your historical transactions.
                  </p>

                  {geminiLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking connection status...
                    </div>
                  ) : geminiConnected ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-500">
                        <CheckCircle2 className="h-4 w-4" />
                        Gemini account connected
                      </div>

                      {isSyncingGemini ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Downloading transactions...</span>
                            <span>{geminiSyncProgress}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full bg-[#00DCFA] transition-all"
                              style={{ width: `${geminiSyncProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={handleGeminiSync}
                            className="bg-[#00DCFA] hover:bg-[#00DCFA]/90 text-black"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Download All Transactions
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowGeminiApiKeyForm(true);
                              setGeminiConnected(false);
                            }}
                          >
                            Reconnect
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : showGeminiApiKeyForm ? (
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="gemini-api-key">API Key</Label>
                        <Input
                          id="gemini-api-key"
                          type="text"
                          placeholder="Enter your Gemini API key"
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="gemini-api-secret">API Secret</Label>
                        <Input
                          id="gemini-api-secret"
                          type="password"
                          placeholder="Enter your Gemini API secret"
                          value={geminiApiSecret}
                          onChange={(e) => setGeminiApiSecret(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleGeminiApiKeyConnect}
                          disabled={isConnectingGemini || !geminiApiKey || !geminiApiSecret}
                          className="bg-[#00DCFA] hover:bg-[#00DCFA]/90 text-black"
                        >
                          {isConnectingGemini ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Link2 className="mr-2 h-4 w-4" />
                              Connect
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowGeminiApiKeyForm(false);
                            setGeminiApiKey("");
                            setGeminiApiSecret("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="rounded-md bg-cyan-900/20 p-3 text-xs text-cyan-500">
                        <p className="font-medium">How to get Gemini API keys:</p>
                        <ol className="mt-1 list-inside list-decimal space-y-1">
                          <li>Log in to your Gemini account</li>
                          <li>Go to Account → Settings → API</li>
                          <li>Click &quot;Create a New API Key&quot;</li>
                          <li>Select &quot;Primary&quot; scope and enable &quot;Fund Management&quot; permissions</li>
                          <li>Copy the API Key and Secret (Secret is only shown once!)</li>
                        </ol>
                        <p className="mt-2 text-cyan-400 font-medium">For testing: Use sandbox.gemini.com for test API keys.</p>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowGeminiApiKeyForm(true)}
                      className="mt-4 bg-[#00DCFA] hover:bg-[#00DCFA]/90 text-black"
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Connect with API Key
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or upload CSV manually
                </span>
              </div>
            </div>
          </div>
        )}

        {/* KuCoin API Key Section - Show when KuCoin is selected */}
        {selectedExchange === "kucoin" && (
          <div className="space-y-4">
            <div className="rounded-lg border bg-gradient-to-r from-green-500/10 to-emerald-600/10 p-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#23AF91]">
                  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="white">
                    <path d="M12 2L2 7v10l10 5 10-5V7L12 2zm0 2.18l6.9 3.45L12 11.27 5.1 7.63 12 4.18zM4 8.81l7 3.5v6.88l-7-3.5V8.81zm9 10.38v-6.88l7-3.5v6.88l-7 3.5z"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Connect KuCoin Account</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Connect your KuCoin account using API keys to automatically download all your historical transactions.
                  </p>
                  <p className="mt-1 text-xs text-amber-500">
                    Note: KuCoin is not available for US residents.
                  </p>

                  {kucoinLoading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Checking connection status...
                    </div>
                  ) : kucoinConnected ? (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center gap-2 text-sm text-green-500">
                        <CheckCircle2 className="h-4 w-4" />
                        KuCoin account connected
                      </div>

                      {isSyncingKucoin ? (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Downloading transactions...</span>
                            <span>{kucoinSyncProgress}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                            <div
                              className="h-full bg-[#23AF91] transition-all"
                              style={{ width: `${kucoinSyncProgress}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Button
                            onClick={handleKucoinSync}
                            className="bg-[#23AF91] hover:bg-[#23AF91]/90"
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Download All Transactions
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => {
                              setShowKucoinApiKeyForm(true);
                              setKucoinConnected(false);
                            }}
                          >
                            Reconnect
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : showKucoinApiKeyForm ? (
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label htmlFor="kucoin-api-key">API Key</Label>
                        <Input
                          id="kucoin-api-key"
                          type="text"
                          placeholder="Enter your KuCoin API key"
                          value={kucoinApiKey}
                          onChange={(e) => setKucoinApiKey(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="kucoin-api-secret">API Secret</Label>
                        <Input
                          id="kucoin-api-secret"
                          type="password"
                          placeholder="Enter your KuCoin API secret"
                          value={kucoinApiSecret}
                          onChange={(e) => setKucoinApiSecret(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="kucoin-api-passphrase">API Passphrase</Label>
                        <Input
                          id="kucoin-api-passphrase"
                          type="password"
                          placeholder="Enter your KuCoin API passphrase"
                          value={kucoinApiPassphrase}
                          onChange={(e) => setKucoinApiPassphrase(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={handleKucoinApiKeyConnect}
                          disabled={isConnectingKucoin || !kucoinApiKey || !kucoinApiSecret || !kucoinApiPassphrase}
                          className="bg-[#23AF91] hover:bg-[#23AF91]/90"
                        >
                          {isConnectingKucoin ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Connecting...
                            </>
                          ) : (
                            <>
                              <Link2 className="mr-2 h-4 w-4" />
                              Connect
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            setShowKucoinApiKeyForm(false);
                            setKucoinApiKey("");
                            setKucoinApiSecret("");
                            setKucoinApiPassphrase("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="rounded-md bg-green-900/20 p-3 text-xs text-green-500">
                        <p className="font-medium">How to get KuCoin API keys:</p>
                        <ol className="mt-1 list-inside list-decimal space-y-1">
                          <li>Log in to your KuCoin account</li>
                          <li>Go to API Management in your account settings</li>
                          <li>Click &quot;Create API&quot;</li>
                          <li>Set a passphrase (you&apos;ll need this!)</li>
                          <li>Enable &quot;General&quot; and &quot;Trade&quot; permissions</li>
                          <li>Copy the API Key, Secret, and remember your Passphrase</li>
                        </ol>
                        <p className="mt-2 text-green-400 font-medium">For testing: Use sandbox.kucoin.com for test API keys.</p>
                      </div>
                    </div>
                  ) : (
                    <Button
                      onClick={() => setShowKucoinApiKeyForm(true)}
                      className="mt-4 bg-[#23AF91] hover:bg-[#23AF91]/90"
                    >
                      <Link2 className="mr-2 h-4 w-4" />
                      Connect with API Key
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">
                  Or upload CSV manually
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="csv-file">Transaction File (CSV)</Label>
            {selectedExchange && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={handleDownloadTemplate}
              >
                <Download className="h-3 w-3" />
                <span>Template</span>
              </Button>
            )}
          </div>

          <div className="flex flex-col items-center space-y-4 rounded-lg border-2 border-dashed border-muted p-6">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <FileText className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-1 text-center">
              <p className="text-sm font-medium">
                Drag and drop your CSV file here
              </p>
              <p className="text-xs text-muted-foreground">
                Or click to browse files
              </p>
            </div>
            <Input
              id="csv-file"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <Button
              variant="outline"
              onClick={() => document.getElementById("csv-file")?.click()}
              className="mt-2"
            >
              Choose File
            </Button>

            {csvFile && (
              <div className="mt-4 flex w-full flex-col space-y-2 text-center">
                <p className="text-sm font-medium">{csvFile.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(csvFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            )}
          </div>
        </div>

        {csvFile &&
          (isUploading ? (
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span>Uploading...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : uploadComplete ? (
            <div className="flex items-center justify-center rounded-md bg-primary/10 p-2 text-sm text-primary">
              <Check className="mr-2 h-4 w-4" />
              <span>Import completed successfully</span>
            </div>
          ) : (
            <Button className="w-full" onClick={handleImport}>
              <Upload className="mr-2 h-4 w-4" />
              Import Transactions
            </Button>
          ))
        }

        <div className="rounded-md bg-amber-900/20 p-3 text-xs text-amber-500">
          <p className="font-medium">Important Notes:</p>
          <ul className="mt-1 list-inside list-disc space-y-1">
            <li>Ensure your CSV file contains all required transaction fields</li>
            <li>The first row should contain column headers</li>
            <li>Date formats should match the exchange format</li>
            <li>Large files may take longer to process</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
