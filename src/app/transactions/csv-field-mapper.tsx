"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Eye, ArrowLeft, FileText, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { getCategory } from "@/lib/transaction-categorizer";
import { cn } from "@/lib/utils";
import type { CsvFieldMapping, CanonicalField } from "@/lib/csv-field-mapper";
import type { ImportedData } from "@/types/wallet";

const FIELDS: { key: CanonicalField; label: string; required?: boolean }[] = [
  { key: "timestamp", label: "Date / Timestamp", required: true },
  { key: "symbol", label: "Asset / Symbol", required: true },
  { key: "quantity", label: "Quantity", required: true },
  { key: "type", label: "Transaction Type" },
  { key: "value", label: "USD Value (net +/-)" },
  { key: "gainLoss", label: "Net gain / loss (USD)" },
  { key: "fee", label: "Fee (USD)" },
  { key: "time", label: "Time (separate column)" },
  { key: "incomingSymbol", label: "Received asset (trades)" },
  { key: "incomingQuantity", label: "Received quantity (trades)" },
  { key: "incomingValue", label: "Received USD value (trades)" },
];

const CATEGORIES = ["buy", "sell", "swap", "income", "transfer", "staking", "nft", "defi", "other"];
const DATE_FORMATS = [
  { v: "auto", l: "Auto-detect" },
  { v: "MDY", l: "MM/DD/YYYY (US)" },
  { v: "DMY", l: "DD/MM/YYYY" },
  { v: "ISO", l: "YYYY-MM-DD" },
  { v: "UNIX", l: "Unix epoch" },
];
const REQUIRED: CanonicalField[] = ["timestamp", "symbol", "quantity"];

const selectClass =
  "w-full rounded-md border border-input bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring";

export function CsvFieldMapper({
  onImportComplete,
  source = "CSV (mapped)",
}: {
  onImportComplete?: (data: ImportedData) => void;
  source?: string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<"upload" | "map">("upload");
  const [busy, setBusy] = useState<null | "analyze" | "preview" | "import">(null);

  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [rowCount, setRowCount] = useState(0);

  const [columns, setColumns] = useState<Partial<Record<CanonicalField, number>>>({});
  const [dateFormat, setDateFormat] = useState("auto");
  const [dateOnly, setDateOnly] = useState(true);
  const [deriveTypeFromSign, setDeriveTypeFromSign] = useState(true);
  const [typeValues, setTypeValues] = useState<string[]>([]);
  const [typeValueMap, setTypeValueMap] = useState<Record<string, string>>({});

  const [preview, setPreview] = useState<any[] | null>(null);
  const [previewSkipped, setPreviewSkipped] = useState(0);

  const distinctTypeValuesFor = (colIdx: number): string[] => {
    const seen = new Set<string>();
    for (const r of sampleRows) {
      const v = (r[colIdx] ?? "").trim();
      if (v) seen.add(v);
    }
    return [...seen];
  };

  const buildMapping = (): CsvFieldMapping => ({
    columns,
    options: {
      dateFormat: dateFormat as NonNullable<CsvFieldMapping["options"]>["dateFormat"],
      dateOnly,
      deriveTypeFromSign: columns.type == null ? deriveTypeFromSign : undefined,
      typeValueMap: columns.type != null ? typeValueMap : undefined,
    },
  });

  /** Which canonical field (if any) is currently assigned to this CSV column. */
  function fieldForColumn(ci: number): CanonicalField | "" {
    return (Object.keys(columns) as CanonicalField[]).find((f) => columns[f] === ci) ?? "";
  }

  /** Assign a CSV column to a canonical field (each field maps to one column). */
  function assignColumn(ci: number, fieldStr: string) {
    const field = fieldStr as CanonicalField | "";
    const next: Partial<Record<CanonicalField, number>> = {};
    for (const [f, c] of Object.entries(columns) as [CanonicalField, number][]) {
      if (c === ci) continue; // unassign whatever was on this column
      if (field && f === field) continue; // a field maps to exactly one column
      next[f] = c;
    }
    if (field) next[field] = ci;
    setColumns(next);
    setPreview(null);

    const typeCol = field === "type" ? ci : next.type ?? null;
    if (typeCol == null) {
      setTypeValues([]);
    } else {
      const vals = distinctTypeValuesFor(typeCol);
      setTypeValues(vals);
      setTypeValueMap((prev) => {
        const n = { ...prev };
        for (const v of vals) if (n[v] == null) n[v] = getCategory(v);
        return n;
      });
    }
  }

  async function analyze() {
    if (!file) {
      toast.error("Choose a CSV file first");
      return;
    }
    setBusy("analyze");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/transactions/import/preview", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to analyze CSV");

      setHeaders(data.headers);
      setSampleRows(data.sampleRows || []);
      setRowCount(data.rowCount || 0);
      setColumns(data.suggestedMapping?.columns || {});
      setDateFormat(data.suggestedMapping?.options?.dateFormat || "auto");
      setDateOnly(data.suggestedMapping?.options?.dateOnly !== false);
      setTypeValues(data.typeValues || []);
      setTypeValueMap(data.typeValueDefaults || {});
      setPreview(null);
      setStep("map");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to analyze CSV");
    } finally {
      setBusy(null);
    }
  }

  async function callMapped(dryRun: boolean) {
    if (!file) return null;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mapping", JSON.stringify(buildMapping()));
    fd.append("source", source);
    if (dryRun) fd.append("dryRun", "true");
    const res = await fetch("/api/transactions/import/mapped", {
      method: "POST",
      body: fd,
      credentials: "include",
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  async function runPreview() {
    setBusy("preview");
    try {
      const data = await callMapped(true);
      setPreview(data.preview || []);
      setPreviewSkipped(data.skippedRows || 0);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setBusy(null);
    }
  }

  async function runImport() {
    const miss = REQUIRED.filter((f) => columns[f] == null);
    if (miss.length) {
      toast.error(`Assign the required field(s): ${miss.join(", ")}`);
      return;
    }
    setBusy("import");
    try {
      const data = await callMapped(false);
      toast.success(
        `Imported ${data.added} transaction${data.added !== 1 ? "s" : ""}${
          data.skippedRows ? ` (${data.skippedRows} rows skipped)` : ""
        }`,
      );
      onImportComplete?.({
        source,
        fileName: file?.name || "mapped.csv",
        timestamp: new Date().toISOString(),
        transactions: [],
        totalTransactions: data.added,
      });
      fetch("/api/prices/enrich-historical", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        credentials: "include",
      }).catch(() => {});
      setStep("upload");
      setFile(null);
      setColumns({});
      setPreview(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  if (step === "upload") {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-dashed border-muted p-6 text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <FileText className="h-6 w-6 text-primary" />
          </div>
          <p className="text-sm font-medium">Upload any CSV — you&apos;ll map the columns next</p>
          <p className="text-xs text-muted-foreground">
            Works with any export. The next step shows your file and lets you tag each column
            (date, asset, quantity, …); values are cleaned automatically.
          </p>
          <input
            id="mapper-file"
            type="file"
            accept=".csv"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />
          <Button variant="outline" onClick={() => document.getElementById("mapper-file")?.click()}>
            Choose File
          </Button>
          {file && <p className="text-sm font-medium">{file.name}</p>}
        </div>
        <Button className="w-full" onClick={analyze} disabled={!file || busy === "analyze"}>
          {busy === "analyze" ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" /> Analyze CSV
            </>
          )}
        </Button>
      </div>
    );
  }

  const missing = REQUIRED.filter((f) => columns[f] == null);

  // The mapping step needs room for the preview table, so it pops out into a
  // near-fullscreen panel (small margin) regardless of the small dialog/sheet it's
  // embedded in. z-[60] sits above Radix Dialog/Sheet (z-50); it's a DOM descendant
  // of the dialog content, so focus-trapping still includes it.
  return (
    <>
      <div className="fixed inset-0 z-[59] bg-black/50" aria-hidden="true" />
      <div className="fixed inset-3 z-[60] flex flex-col overflow-hidden rounded-lg border bg-background shadow-2xl sm:inset-4">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3">
          <button
            onClick={() => setStep("upload")}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </button>
          <span className="text-sm font-semibold">Map CSV columns</span>
          <span className="text-xs text-muted-foreground">
            {rowCount.toLocaleString()} rows · {headers.length} columns
          </span>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div>
            <p className="text-sm font-medium">Tag each column</p>
            <p className="text-xs text-muted-foreground">
              Pick what each column is using the dropdown above it. Required:{" "}
              <span className="font-medium">Date, Asset, Quantity</span>.
            </p>
          </div>

          {missing.length > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Still need to tag: {missing.map((f) => FIELDS.find((x) => x.key === f)?.label).join(", ")}
            </div>
          )}

          {/* CSV preview with a field picker above each column */}
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <table className="text-xs">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  {headers.map((h, ci) => {
                    const assigned = fieldForColumn(ci);
                    return (
                      <th key={ci} className="min-w-[160px] border-b p-2 align-top text-left">
                        <select
                          className={cn(selectClass, assigned && "border-primary ring-1 ring-primary/40")}
                          value={assigned}
                          onChange={(e) => assignColumn(ci, e.target.value)}
                        >
                          <option value="">— Ignore —</option>
                          {FIELDS.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                              {f.required ? " *" : ""}
                            </option>
                          ))}
                        </select>
                        <div className="mt-1 max-w-[220px] truncate font-medium" title={h}>
                          {h || `Column ${ci + 1}`}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row, ri) => (
                  <tr key={ri} className="border-t">
                    {headers.map((_, ci) => (
                      <td
                        key={ci}
                        className={cn(
                          "max-w-[220px] truncate px-2 py-1 font-mono",
                          fieldForColumn(ci) && "bg-primary/5",
                        )}
                        title={row[ci] ?? ""}
                      >
                        {row[ci] ?? ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cleaning options */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Date format</Label>
              <select className={selectClass} value={dateFormat} onChange={(e) => { setDateFormat(e.target.value); setPreview(null); }}>
                {DATE_FORMATS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.l}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-1 text-sm">
              <input type="checkbox" checked={dateOnly} onChange={(e) => { setDateOnly(e.target.checked); setPreview(null); }} />
              Store date only (strip time)
            </label>
          </div>

          {/* Type handling */}
          {columns.type != null ? (
            typeValues.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Map transaction types</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {typeValues.map((v) => (
                    <div key={v} className="flex items-center gap-2">
                      <span className="flex-1 truncate font-mono text-xs" title={v}>
                        {v}
                      </span>
                      <select
                        className={cn(selectClass, "max-w-[140px]")}
                        value={typeValueMap[v] ?? "other"}
                        onChange={(e) => { setTypeValueMap((p) => ({ ...p, [v]: e.target.value })); setPreview(null); }}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={deriveTypeFromSign}
                onChange={(e) => { setDeriveTypeFromSign(e.target.checked); setPreview(null); }}
              />
              No type column — treat positive amounts as buys, negative as sells
            </label>
          )}

          {/* Cleaned preview */}
          {preview && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Showing {preview.length} cleaned rows{previewSkipped ? ` · ${previewSkipped} rows would be skipped` : ""}
              </p>
              <div className="max-h-72 overflow-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {["Date", "Type", "Asset", "Amount", "USD", "Gain/Loss"].map((h) => (
                        <th key={h} className="px-2 py-1.5 text-left font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((p, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 font-mono">{p.timestamp?.slice(0, 10)}</td>
                        <td className="px-2 py-1">{p.type}</td>
                        <td className="px-2 py-1">{p.asset_symbol}</td>
                        <td className="px-2 py-1 text-right font-mono">{p.amount}</td>
                        <td className="px-2 py-1 text-right font-mono">${p.value_usd?.toLocaleString()}</td>
                        <td
                          className={cn(
                            "px-2 py-1 text-right font-mono",
                            p.gain_loss != null && (p.gain_loss >= 0 ? "text-green-600" : "text-red-600"),
                          )}
                        >
                          {p.gain_loss != null
                            ? `${p.gain_loss >= 0 ? "+" : "-"}$${Math.abs(p.gain_loss).toLocaleString()}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sticky footer actions */}
        <div className="flex shrink-0 gap-2 border-t px-4 py-3">
          <Button variant="outline" className="flex-1" onClick={runPreview} disabled={busy != null}>
            {busy === "preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Eye className="mr-2 h-4 w-4" />}
            Preview cleaned
          </Button>
          <Button className="flex-1" onClick={runImport} disabled={busy != null || missing.length > 0}>
            {busy === "import" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Import
          </Button>
        </div>
      </div>
    </>
  );
}
