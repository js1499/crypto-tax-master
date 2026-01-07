"use client";

import { useState } from "react";
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
import { Download, Upload, FileText, Check } from "lucide-react";
import { toast } from "sonner";
import type { ImportedData } from "@/types/wallet"; // Updated import

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

  const handleExchangeSelect = (value: string) => {
    setSelectedExchange(value);
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

  const handleImport = () => {
    if (!csvFile) {
      toast.error("Please select a CSV file to import");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress((prev) => {
        const newProgress = prev + 5;
        if (newProgress >= 100) {
          clearInterval(interval);

          // Simulate processing
          setTimeout(() => {
            setIsUploading(false);
            setUploadComplete(true);

            // Simulate parsed transaction data
            const mockImportedData: ImportedData = {
              source: selectedExchange,
              fileName: csvFile.name,
              timestamp: new Date().toISOString(),
              transactions: [
                {
                  id: 1,
                  type: "Buy",
                  asset: "Bitcoin",
                  amount: "0.05 BTC",
                  value: "$2,150.75",
                  date: "2023-12-15T15:32:41Z",
                },
                {
                  id: 2,
                  type: "Sell",
                  asset: "Ethereum",
                  amount: "1.2 ETH",
                  value: "$2,880.40",
                  date: "2023-12-10T09:15:22Z",
                },
                // More transactions would be here in a real implementation
              ],
              totalTransactions: 24,
            };

            if (onImportComplete) {
              onImportComplete(mockImportedData);
            }

            toast.success(`Successfully imported ${mockImportedData.totalTransactions} transactions from ${csvFile.name}`);
          }, 1000);
        }
        return newProgress > 100 ? 100 : newProgress;
      });
    }, 100);
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

          {selectedExchange && (
            <div className="mt-1 text-xs text-muted-foreground">
              {selectedExchange === "custom"
                ? "Custom format requires mapping columns"
                : `Using ${exchangeTemplates.find(e => e.id === selectedExchange)?.name} format`}
            </div>
          )}
        </div>

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
