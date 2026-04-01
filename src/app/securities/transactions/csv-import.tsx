"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Check, Loader2, AlertCircle, Download, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const TEMPLATE_CSV = `date,type,symbol,asset_class,quantity,price,fees,account,account_type,total_amount,notes
2024-03-15,BUY,AAPL,STOCK,10,172.50,4.95,Fidelity,TAXABLE,1729.95,Monthly purchase
2024-04-01,SELL,MSFT,STOCK,5,420.00,4.95,Schwab,TAXABLE,2095.05,Rebalancing
2024-04-15,BUY,VTI,ETF,20,245.00,0,Fidelity,IRA_ROTH,4900.00,IRA contribution
2024-06-15,DIVIDEND,VTI,ETF,0,0,0,Fidelity,TAXABLE,45.23,Quarterly dividend
2024-07-01,SELL_SHORT,TSLA,STOCK,10,250.00,4.95,Schwab,TAXABLE,2495.05,Short position
2024-09-01,SPLIT,NVDA,STOCK,100,0,0,Fidelity,TAXABLE,0,10:1 stock split`;

interface SecuritiesCSVImportProps {
  onImportComplete?: () => void;
}

export function SecuritiesCSVImport({ onImportComplete }: SecuritiesCSVImportProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [showFormat, setShowFormat] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      setUploadComplete(false);
      setImportResult(null);
    }
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "securities-template.csv";
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const handleUpload = async () => {
    if (!csvFile) return;

    setIsUploading(true);
    setImportResult(null);

    try {
      const formData = new FormData();
      formData.append("file", csvFile);

      const response = await fetch("/api/securities/import", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setImportResult({
          imported: 0,
          errors: data.errors || [data.error || "Import failed"],
          warnings: data.warnings || [],
        });
        toast.error("Import failed. Check errors below.");
        return;
      }

      setImportResult({
        imported: data.imported || 0,
        errors: data.errors || [],
        warnings: data.warnings || [],
      });
      setUploadComplete(true);

      if (data.imported > 0) {
        toast.success(`Successfully imported ${data.imported} transactions.`);
        onImportComplete?.();
      } else {
        toast.warning("No new transactions were imported.");
      }
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to upload CSV file.");
      setImportResult({
        imported: 0,
        errors: ["Network error. Please try again."],
        warnings: [],
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setCsvFile(null);
    setUploadComplete(false);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Template download + format info */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={handleDownloadTemplate}
        >
          <Download className="h-3.5 w-3.5" />
          Download Template
        </Button>
        <button
          onClick={() => setShowFormat(!showFormat)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-[#1A1A1A] transition-colors"
        >
          Expected format
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showFormat && "rotate-180")} />
        </button>
      </div>

      {showFormat && (
        <div className="rounded-md border border-[#E5E5E0] bg-[#F5F5F0] p-3 text-xs space-y-2">
          <div>
            <span className="font-medium">Required: </span>
            <code className="text-[10px] bg-white/60 px-1 py-0.5 rounded">date</code>{" "}
            <code className="text-[10px] bg-white/60 px-1 py-0.5 rounded">type</code>{" "}
            <code className="text-[10px] bg-white/60 px-1 py-0.5 rounded">symbol</code>{" "}
            <code className="text-[10px] bg-white/60 px-1 py-0.5 rounded">asset_class</code>{" "}
            <code className="text-[10px] bg-white/60 px-1 py-0.5 rounded">quantity</code>{" "}
            <code className="text-[10px] bg-white/60 px-1 py-0.5 rounded">price</code>
          </div>
          <div>
            <span className="font-medium">Optional: </span>
            <span className="text-muted-foreground">
              fees, account, account_type, total_amount, lot_id, notes, underlying_symbol, option_type, strike_price, expiration_date, dividend_type, is_covered, is_section_1256
            </span>
          </div>
          <div>
            <span className="font-medium">Types: </span>
            <span className="text-muted-foreground">
              BUY, SELL, SELL_SHORT, BUY_TO_COVER, DIVIDEND, DIVIDEND_REINVEST, INTEREST, SPLIT, MERGER, SPINOFF, RETURN_OF_CAPITAL, RSU_VEST, ESPP_PURCHASE, TRANSFER_IN, TRANSFER_OUT
            </span>
          </div>
          <div>
            <span className="font-medium">Asset classes: </span>
            <span className="text-muted-foreground">
              STOCK, ETF, MUTUAL_FUND, OPTION, FUTURE, FOREX, BOND, WARRANT
            </span>
          </div>
          <p className="text-muted-foreground">
            Dates: YYYY-MM-DD, MM/DD/YYYY, or ISO 8601. Values can include $ and commas.
          </p>
        </div>
      )}

      {/* File upload area */}
      <div
        className="border-2 border-dashed border-[#E5E5E0] rounded-lg p-8 text-center cursor-pointer hover:border-[#1A1A1A]/30 transition-colors"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleFileSelect}
        />
        {csvFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileText className="h-8 w-8 text-[#1A1A1A]/60" />
            <div className="text-left">
              <p className="text-sm font-medium text-[#1A1A1A]">{csvFile.name}</p>
              <p className="text-xs text-muted-foreground">
                {(csvFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
          </div>
        ) : (
          <div>
            <Upload className="h-8 w-8 text-[#1A1A1A]/40 mx-auto mb-3" />
            <p className="text-sm text-[#1A1A1A]/70">
              Click to select a CSV file or drag and drop
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Max 10MB. Download the template above for the expected format.
            </p>
          </div>
        )}
      </div>

      {/* Upload button */}
      <div className="flex gap-3">
        <Button
          onClick={handleUpload}
          disabled={!csvFile || isUploading || uploadComplete}
          className="flex-1 gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing...
            </>
          ) : uploadComplete ? (
            <>
              <Check className="h-4 w-4" />
              Imported
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Import
            </>
          )}
        </Button>
        {(csvFile || importResult) && (
          <Button variant="outline" onClick={handleReset}>
            Reset
          </Button>
        )}
      </div>

      {/* Results */}
      {importResult && (
        <div className="space-y-3">
          {importResult.imported > 0 && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 text-green-800 text-sm">
              <Check className="h-4 w-4 flex-shrink-0" />
              <span>
                Successfully imported {importResult.imported} transaction
                {importResult.imported !== 1 ? "s" : ""}.
              </span>
            </div>
          )}

          {importResult.warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-yellow-50 text-yellow-800 text-sm space-y-1">
              <p className="font-medium">Warnings:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {importResult.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {importResult.warnings.length > 10 && (
                  <li>...and {importResult.warnings.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {importResult.errors.length > 0 && (
            <div className="p-3 rounded-lg bg-red-50 text-red-800 text-sm space-y-1">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <p className="font-medium">Errors:</p>
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {importResult.errors.slice(0, 15).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {importResult.errors.length > 15 && (
                  <li>...and {importResult.errors.length - 15} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Tax AI callout */}
      <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-xs">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-blue-900">
              Have a CSV that doesn&apos;t match this format?
            </p>
            <p className="mt-0.5 text-blue-700">
              Tax AI can reformat your CSV automatically — even tens of thousands of rows.
            </p>
            <a
              href="/tax-ai"
              className="mt-1.5 inline-flex items-center text-blue-600 hover:text-blue-800 font-medium"
            >
              Open Tax AI &rarr;
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
