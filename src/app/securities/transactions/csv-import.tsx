"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Check, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface SecuritiesCSVImportProps {
  onImportComplete?: () => void;
}

export function SecuritiesCSVImport({ onImportComplete }: SecuritiesCSVImportProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
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
    <div className="space-y-6">
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
              Supports the universal securities CSV template
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
    </div>
  );
}
