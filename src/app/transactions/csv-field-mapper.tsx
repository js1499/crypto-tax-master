"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
  { key: "value", label: "Amount (USD, net +/-)" },
  { key: "proceeds", label: "Proceeds (USD)" },
  { key: "costBasis", label: "Cost basis (USD)" },
  { key: "fee", label: "Fee (USD)" },
  { key: "time", label: "Time (separate column)" },
  { key: "incomingSymbol", label: "Received asset (trades)" },
  { key: "incomingQuantity", label: "Received quantity (trades)" },
  { key: "incomingValue", label: "Received USD value (trades)" },
];

const CATEGORIES = ["buy", "sell", "swap", "income", "staking", "transfer", "deposit", "withdrawal", "nft", "defi", "gambling", "other"];
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

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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
  const [pnlMethod, setPnlMethod] = useState<"net" | "gross">("net");
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
      pnlMethod,
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

  /** Map a canonical field to one of the user's CSV columns (field-first picker used by
   *  the P&L method selectors). Clears any prior column for this field and vice-versa. */
  function setFieldColumn(field: CanonicalField, ci: number | null) {
    setColumns((prev) => {
      const next: Partial<Record<CanonicalField, number>> = {};
      for (const [f, c] of Object.entries(prev) as [CanonicalField, number][]) {
        if (f === field) continue; // clear the field's current column
        if (ci != null && c === ci) continue; // clear whatever was on the target column
        next[f] = c;
      }
      if (ci != null) next[field] = ci;
      return next;
    });
    setPreview(null);
  }

  /** Switch P&L method, dropping the other method's USD columns (keep them exclusive). */
  function changePnlMethod(m: "net" | "gross") {
    setPnlMethod(m);
    setColumns((prev) => {
      const next = { ...prev };
      if (m === "net") {
        delete next.proceeds;
        delete next.costBasis;
      } else {
        delete next.value;
      }
      return next;
    });
    setPreview(null);
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
      const suggested = { ...(data.suggestedMapping?.columns || {}) };
      // Auto-pick the P&L method from what was detected, then keep only that method's
      // USD columns so the two methods can never be mixed.
      const method: "net" | "gross" =
        suggested.costBasis != null || suggested.proceeds != null ? "gross" : "net";
      if (method === "gross") {
        delete suggested.value;
      } else {
        delete suggested.proceeds;
        delete suggested.costBasis;
      }
      setPnlMethod(method);
      setColumns(suggested);
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
    // Use the file name as the source so each imported CSV is its own "account"
    // on the Accounts page (grouped by source), instead of merging into one "CSV" row.
    fd.append("source", file?.name || source);
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
    if (pnlMethod === "gross") {
      const missPnl = (["proceeds", "costBasis"] as CanonicalField[]).filter((f) => columns[f] == null);
      if (missPnl.length) {
        toast.error("The Proceeds + Cost basis method needs BOTH columns mapped (or switch to Net gain/loss).");
        return;
      }
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

  const missing = REQUIRED.filter((f) => columns[f] == null);
  // Only the selected P&L method's USD fields are offered in the column picker, so a
  // user can never map both "Amount (net)" and "Proceeds/Cost basis".
  const visibleFields = FIELDS.filter((f) =>
    pnlMethod === "gross"
      ? f.key !== "value"
      : f.key !== "proceeds" && f.key !== "costBasis",
  );

  // Field-first column picker for the active P&L method — the explicit place to map your
  // CSV's Proceeds / Cost basis / net-Amount column. Writes into `columns` (same state as
  // the per-column dropdowns), which on import feeds value_usd / cost_basis_usd /
  // gain_loss_usd in the transactions DB.
  const renderPnlCol = (field: CanonicalField, label: string) => (
    <label key={field} className="block space-y-1 text-xs">
      <span className="font-medium">{label}</span>
      <select
        className={cn(selectClass, columns[field] != null && "border-primary ring-1 ring-primary/40")}
        value={columns[field] ?? ""}
        onChange={(e) => setFieldColumn(field, e.target.value === "" ? null : Number(e.target.value))}
      >
        <option value="">— Select your CSV column —</option>
        {headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Column ${i + 1}`}
          </option>
        ))}
      </select>
    </label>
  );

  // The upload step lives inline in the CSV tab; the mapping step needs far more
  // room (preview tables), so it opens as a NESTED Radix dialog. Radix renders that
  // dialog through its own portal to <body>, which escapes the host dialog's CSS
  // transform (translate-based centering). A position:fixed panel here would instead
  // size to that transformed ancestor — which is why the old fixed-inset panel
  // rendered tiny inside the Accounts "Add Account" dialog.
  return (
    <>
      {/* Upload step — always mounted so closing the mapper returns here */}
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

      {/* Mapping step — nested dialog sized to the viewport (its own portal escapes
          the host dialog's transform). Closing it (X / Esc / overlay) returns to upload. */}
      <Dialog open={step === "map"} onOpenChange={(o) => { if (!o) setStep("upload"); }}>
        <DialogContent
          aria-describedby={undefined}
          className="flex h-[90vh] max-h-[90vh] w-[96vw] max-w-[96vw] flex-col gap-0 overflow-hidden p-0 [&>button]:hidden"
        >
          <DialogTitle className="sr-only">Map CSV columns</DialogTitle>
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

          {/* P&L method — MUTUALLY EXCLUSIVE: net gain/loss OR proceeds + cost basis */}
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium">How is profit / loss provided?</p>
            <div className="inline-flex rounded-md border border-input p-0.5 text-xs">
              <button
                type="button"
                onClick={() => changePnlMethod("net")}
                className={cn(
                  "rounded px-3 py-1 font-medium transition-colors",
                  pnlMethod === "net"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Net gain / loss
              </button>
              <button
                type="button"
                onClick={() => changePnlMethod("gross")}
                className={cn(
                  "rounded px-3 py-1 font-medium transition-colors",
                  pnlMethod === "gross"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Proceeds + Cost basis
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {pnlMethod === "net" ? (
                <>
                  Map one <span className="font-medium">Amount (USD, net +/-)</span> column — it is
                  each row&apos;s realized gain/loss.
                </>
              ) : (
                <>
                  Map <span className="font-medium">Proceeds</span> and{" "}
                  <span className="font-medium">Cost basis</span> columns — gain/loss = proceeds −
                  cost basis.
                </>
              )}{" "}
              <span className="font-medium">Income</span>/<span className="font-medium">staking</span>{" "}
              rows book as ordinary income; <span className="font-medium">deposit</span>/
              <span className="font-medium">withdrawal</span> are always $0.
            </p>
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              {pnlMethod === "net" ? (
                renderPnlCol("value", "Amount (USD, net +/-) column")
              ) : (
                <>
                  {renderPnlCol("proceeds", "Proceeds (USD) column")}
                  {renderPnlCol("costBasis", "Cost basis (USD) column")}
                </>
              )}
            </div>
          </div>

          {missing.length > 0 && (
            <div className="flex items-center gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Still need to tag: {missing.map((f) => FIELDS.find((x) => x.key === f)?.label).join(", ")}
            </div>
          )}

          {/* Tag columns: your CSV preview with a field picker above each column */}
          <div className="max-h-[50vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {headers.map((h, ci) => {
                    const assigned = fieldForColumn(ci);
                    return (
                      <TableHead
                        key={ci}
                        className="sticky top-0 z-10 min-w-[170px] border-b bg-muted align-top"
                      >
                        <select
                          className={cn(selectClass, assigned && "border-primary ring-1 ring-primary/40")}
                          value={assigned}
                          onChange={(e) => assignColumn(ci, e.target.value)}
                        >
                          <option value="">— Ignore —</option>
                          {visibleFields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label}
                              {f.required ? " *" : ""}
                            </option>
                          ))}
                        </select>
                        <div
                          className="mt-1.5 max-w-[220px] truncate font-medium text-foreground"
                          title={h}
                        >
                          {h || `Column ${ci + 1}`}
                        </div>
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {sampleRows.map((row, ri) => (
                  <TableRow key={ri}>
                    {headers.map((_, ci) => (
                      <TableCell
                        key={ci}
                        className={cn(
                          "max-w-[220px] truncate font-mono text-xs",
                          fieldForColumn(ci) && "bg-primary/5",
                        )}
                        title={row[ci] ?? ""}
                      >
                        {row[ci] ?? ""}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                <div>
                  <p className="text-sm font-medium">Map transaction types</p>
                  <p className="text-xs text-muted-foreground">
                    These are the distinct values in your{" "}
                    <span className="font-medium">Transaction Type</span> column. Choose the tax
                    category each one represents.
                  </p>
                </div>
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Value in your CSV</TableHead>
                        <TableHead className="w-[220px]">Tax category</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {typeValues.map((v) => (
                        <TableRow key={v}>
                          <TableCell className="font-mono text-xs" title={v}>
                            {v}
                          </TableCell>
                          <TableCell>
                            <select
                              className={selectClass}
                              value={typeValueMap[v] ?? "other"}
                              onChange={(e) => { setTypeValueMap((p) => ({ ...p, [v]: e.target.value })); setPreview(null); }}
                            >
                              {CATEGORIES.map((c) => (
                                <option key={c} value={c}>
                                  {titleCase(c)}
                                </option>
                              ))}
                            </select>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="sticky top-0 z-10 bg-muted">Date</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted">Type</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted">Asset</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted text-right">Amount</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted text-right">USD</TableHead>
                      <TableHead className="sticky top-0 z-10 bg-muted text-right">Gain / Loss</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-mono text-xs">{p.timestamp?.slice(0, 10)}</TableCell>
                        <TableCell className="capitalize">{p.type}</TableCell>
                        <TableCell>{p.asset_symbol}</TableCell>
                        <TableCell className="text-right font-mono">{p.amount}</TableCell>
                        <TableCell className="text-right font-mono">${p.value_usd?.toLocaleString()}</TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono",
                            p.is_income
                              ? "text-blue-600 dark:text-blue-400"
                              : p.gain_loss != null && (p.gain_loss >= 0 ? "text-green-600" : "text-red-600"),
                          )}
                        >
                          {p.is_income
                            ? `+$${Number(p.value_usd ?? 0).toLocaleString()} income`
                            : p.gain_loss != null
                            ? `${p.gain_loss >= 0 ? "+" : "-"}$${Math.abs(p.gain_loss).toLocaleString()}`
                            : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
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
        </DialogContent>
      </Dialog>
    </>
  );
}
