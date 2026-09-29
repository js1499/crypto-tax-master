import Image from "next/image";
import { CheckIcon, TaxesIcon } from "@/components/icons";

const CHAINS = [
  {
    name: "Ethereum",
    detail: "214 transactions",
    gain: "+$6,340",
    logo: "/images/logos/ethereum.png",
  },
  {
    name: "Solana",
    detail: "82 transactions",
    gain: "+$3,109",
    logo: "/images/logos/solana.png",
  },
  {
    name: "Base",
    detail: "41 transactions",
    gain: "+$1,890",
    logo: "/images/logos/base.png",
  },
] as const;

export default function HeroProductMockup() {
  return (
    <div
      role="img"
      aria-label="Illustrative Glide tax preview showing reconciled transactions across blockchains, exchanges, and wallets."
      className="relative"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-6 -top-4 bottom-6 -rotate-2 rounded-[24px] bg-white/60 shadow-sm"
      />
      <div className="product-gradient relative overflow-hidden rounded-[26px] p-4 shadow-[0_24px_60px_-20px_rgba(4,47,36,0.45)] sm:p-5">
        <div className="overflow-hidden rounded-[18px] bg-white">
          <div className="flex items-center justify-between border-b border-border-soft/50 px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand/15 text-cocoa">
                <TaxesIcon aria-hidden="true" className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">Your tax preview</p>
                <p className="mt-0.5 text-xs text-graymute">
                  Reconciled from on-chain data
                </p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand/15 px-3 py-1.5 text-xs font-semibold text-cocoa">
              <CheckIcon aria-hidden="true" className="h-3 w-3" />
              Ready
            </span>
          </div>

          <div className="border-b border-border-soft/50 px-5 py-6">
            <p className="text-xs font-semibold tracking-[0.08em] text-graymute uppercase">
              Estimated capital gains
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-3">
              <p className="font-heading text-[52px] leading-none text-ink sm:text-[60px]">
                $11,339
              </p>
              <span className="mb-1 rounded-full bg-brand/15 px-3 py-1.5 text-xs font-semibold text-cocoa">
                Block-priced
              </span>
            </div>
            <p className="mt-2 text-xs text-graymute">
              Long- and short-term gains combined
            </p>
          </div>

          <ul aria-label="Illustrative chain breakdown">
            {CHAINS.map((chain) => (
              <li
                key={chain.name}
                className="flex items-center gap-3 border-b border-border-soft/50 px-5 py-4 last:border-b-0"
              >
                <Image
                  src={chain.logo}
                  alt=""
                  width={28}
                  height={28}
                  className="h-7 w-7 shrink-0 object-contain"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">
                    {chain.name}
                  </span>
                  <span className="block text-xs text-graymute">
                    {chain.detail} · reconciled
                  </span>
                </span>
                <span className="font-heading text-2xl text-ink">
                  {chain.gain}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between bg-cream/70 px-5 py-4">
            <p className="text-sm font-medium text-warmgray">
              Transactions reviewed
            </p>
            <p className="font-heading text-3xl text-brand-mid">337</p>
          </div>
        </div>
      </div>
    </div>
  );
}
