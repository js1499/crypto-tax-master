"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-[#1A1A1A]">
      <h1 className="text-[72px] font-bold text-[#DC2626]" style={{ fontVariantNumeric: "tabular-nums" }}>500</h1>
      <p className="text-[18px] text-[#6B7280] mt-2">Something went wrong</p>
      <p className="text-[14px] text-[#9CA3AF] mt-1">An unexpected error occurred. Please try again.</p>
      <button
        onClick={reset}
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors"
      >
        Try Again
      </button>
    </div>
  );
}
