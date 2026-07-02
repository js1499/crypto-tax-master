"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export interface UnmappedType {
  type: string;
  count: number;
}

const CATEGORY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Select category…" },
  { value: "buy", label: "Buy (acquisition)" },
  { value: "sell", label: "Sell (disposal)" },
  { value: "income", label: "Income (reward / airdrop / interest)" },
  { value: "swap", label: "Swap / trade" },
  { value: "transfer", label: "Transfer (non-taxable move)" },
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
  { value: "ignore", label: "Ignore (not taxable)" },
];

/**
 * Prompts the user to classify transaction types we don't recognize (surfaced after an exchange
 * sync). On save it maps each type to a tax category and re-runs cost basis. Rendered by the
 * pipeline provider when the post-sync unmapped-types check finds any.
 */
export function UnmappedTypesDialog({
  types,
  onClose,
  onDone,
}: {
  types: UnmappedType[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const mappings = Object.entries(choices)
    .filter(([, category]) => category)
    .map(([rawType, category]) => ({ rawType, category }));

  const handleSave = async () => {
    if (mappings.length === 0) {
      toast.error("Choose a category for at least one type, or skip.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/transactions/map-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mappings }),
      });
      const data = await res.json();
      if (!res.ok || data.status !== "success") {
        toast.error(data.error || "Failed to apply mappings");
        return;
      }
      toast.success(`Mapped ${mappings.length} type${mappings.length === 1 ? "" : "s"} and recomputed cost basis.`);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to apply mappings");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#161616] border border-[#E5E5E0] dark:border-[#333] shadow-xl max-h-[85vh] flex flex-col">
        <div className="px-6 pt-5 pb-3 border-b border-[#E5E5E0] dark:border-[#333]">
          <h2 className="text-[17px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
            Classify unrecognized transaction types
          </h2>
          <p className="mt-1 text-[13px] text-[#6B7280] dark:text-[#9CA3AF]">
            We found {types.length} transaction type{types.length === 1 ? "" : "s"} we don&apos;t recognize. They currently get no tax treatment. Assign each a category so cost basis and P&amp;L are correct — you can skip and do it later on the Transactions page.
          </p>
        </div>

        <div className="px-6 py-3 overflow-y-auto space-y-2.5">
          {types.map((t) => (
            <div key={t.type} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]" title={t.type}>
                  {t.type || "(blank)"}
                </div>
                <div className="text-[11px] text-[#9CA3AF]">{t.count.toLocaleString()} transaction{t.count === 1 ? "" : "s"}</div>
              </div>
              <select
                value={choices[t.type] || ""}
                onChange={(e) => setChoices((prev) => ({ ...prev, [t.type]: e.target.value }))}
                className="h-9 w-[220px] shrink-0 rounded-md border border-[#E5E5E0] dark:border-[#333] bg-transparent text-[13px] px-2.5 focus:outline-none focus:ring-1 focus:ring-[#2563EB]"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="px-6 py-4 border-t border-[#E5E5E0] dark:border-[#333] flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={submitting}
            className="text-[13px] font-medium text-[#6B7280] hover:text-[#1A1A1A] dark:hover:text-white disabled:opacity-50"
          >
            Skip for now
          </button>
          <button
            onClick={handleSave}
            disabled={submitting || mappings.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[#2563EB] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-50"
          >
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin" />Applying…</> : `Save & recompute${mappings.length ? ` (${mappings.length})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
