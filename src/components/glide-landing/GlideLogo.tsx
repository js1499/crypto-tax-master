export function GlideMark({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="#2e90fa" />
      <text
        x="15"
        y="24"
        textAnchor="middle"
        fontFamily="Arial, sans-serif"
        fontWeight="800"
        fontSize="22"
        fill="#ffffff"
      >
        G
      </text>
      <path
        d="M21 8.6l2.2 2.2 4-4.4"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function GlideLogo({
  variant = "dark",
  withWordmark = true,
  size = 28,
  className,
}: {
  variant?: "dark" | "light";
  withWordmark?: boolean;
  size?: number;
  className?: string;
}) {
  const sizeClass =
    size >= 40
      ? "h-10 text-[40px] sm:h-[52px] sm:text-[52px]"
      : size >= 31
      ? "h-[31px] text-[31px]"
      : size >= 28
        ? "h-7 text-[28px]"
        : "h-[26px] text-[26px]";

  if (!withWordmark) {
    return <GlideMark size={size} className={className} />;
  }

  return (
    <span
      role="img"
      aria-label="Glide"
      className={`inline-flex items-center leading-none font-bold tracking-[-0.04em] ${sizeClass} ${className ?? ""}`}
    >
      <span aria-hidden="true" className="text-[#2e90fa]">
        G
      </span>
      <span aria-hidden="true" className={variant === "light" ? "text-white" : "text-[#047857]"}>
        lide
      </span>
    </span>
  );
}
