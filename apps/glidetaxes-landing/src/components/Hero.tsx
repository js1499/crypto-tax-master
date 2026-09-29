import Image from "next/image";
import { ChevronRightIcon, CheckIcon } from "@/components/icons";
import HeroProductMockup from "@/components/HeroProductMockup";
import { TrackedLink } from "@/components/TrackedLink";
import { siteConfig } from "@/lib/site";

const CHAINS = [
  { name: "Ethereum", src: "/images/logos/ethereum.png" },
  { name: "Solana", src: "/images/logos/solana.png" },
  { name: "Base", src: "/images/logos/base.png" },
] as const;

const TRUST_POINTS = [
  "Read-only connections",
  "Major blockchains and exchanges",
  "Tax-ready exports",
] as const;

export default function Hero() {
  return (
    <section className="hero-surface relative overflow-hidden">
      <div className="mx-auto grid max-w-[1200px] grid-cols-1 items-center gap-12 px-4 py-14 sm:py-20 lg:grid-cols-12 lg:gap-16 lg:py-24">
        <div className="lg:col-span-7">
          <p className="text-xs font-semibold tracking-[0.22em] text-brand-mid uppercase">
            Crypto tax software
          </p>
          <h1 className="hero-heading mt-5 max-w-[780px] text-[44px] leading-[0.98] font-normal tracking-[-0.025em] text-ink-soft sm:text-[62px] lg:text-[76px]">
            Every transaction identified,{" "}
            <em className="not-italic text-brand-mid">effortlessly.</em>
          </h1>
          <p className="mt-6 max-w-[610px] text-[17px] leading-7 text-warmgray sm:text-lg">
            Connect activity across major blockchains, exchanges, and wallets.
            Glide organizes the details into one reviewable tax workflow.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <TrackedLink
              href={siteConfig.appRoutes.register}
              event={{
                name: "register_click",
                properties: { location: "hero" },
              }}
              className="group inline-flex min-h-[54px] items-center justify-center gap-3 rounded-[12px] bg-cocoa px-6 text-base font-semibold text-white shadow-[0_12px_28px_-10px_rgba(4,47,36,0.5)] transition hover:-translate-y-0.5 hover:bg-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-mid"
            >
              Get started free
              <ChevronRightIcon
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </TrackedLink>
            <a
              href="#how"
              className="inline-flex min-h-[54px] items-center justify-center rounded-[12px] border border-border-soft bg-white/70 px-6 text-base font-semibold text-ink transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-brand-mid"
            >
              See how it works
            </a>
          </div>

          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2" aria-label="Product assurances">
            {TRUST_POINTS.map((point) => (
              <li
                key={point}
                className="flex items-center gap-2 text-sm font-medium text-warmgray"
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/15 text-brand-mid">
                  <CheckIcon aria-hidden="true" className="h-3 w-3" />
                </span>
                {point}
              </li>
            ))}
          </ul>

          <div className="mt-10 flex items-center gap-4">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-graymute uppercase">
              Featured networks
            </p>
            <div className="flex items-center gap-3">
              {CHAINS.map((chain) => (
                <span
                  key={chain.name}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/70 bg-white/80 shadow-sm"
                  title={chain.name}
                >
                  <Image
                    src={chain.src}
                    alt=""
                    width={24}
                    height={24}
                    className="h-6 w-6 object-contain"
                  />
                  <span className="sr-only">{chain.name}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <HeroProductMockup />
          <p className="mt-4 text-center text-xs leading-5 text-graymute">
            Illustrative account preview. Results vary by transaction history
            and methodology.
          </p>
        </div>
      </div>
    </section>
  );
}
