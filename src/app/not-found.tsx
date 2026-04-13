import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white dark:bg-[#1A1A1A]">
      <h1 className="text-[72px] font-bold text-[#1A1A1A] dark:text-[#F5F5F5]" style={{ fontVariantNumeric: "tabular-nums" }}>404</h1>
      <p className="text-[18px] text-[#6B7280] mt-2">Page not found</p>
      <p className="text-[14px] text-[#9CA3AF] mt-1">The page you're looking for doesn't exist or has been moved.</p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2563EB] text-white text-[14px] font-medium hover:bg-[#1D4ED8] transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
