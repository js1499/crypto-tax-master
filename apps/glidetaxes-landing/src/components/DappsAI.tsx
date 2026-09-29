import { ChevronRightIcon } from "@/components/icons";
import {
  BaseMark,
  CoinbaseMark,
  EthereumMark,
  KrakenMark,
  SolanaMark,
} from "@/components/PlatformMarks";
import { TrackedLink } from "@/components/TrackedLink";
import { siteConfig } from "@/lib/site";

const PLATFORMS = [
  { name: "Coinbase", kind: "Exchange", Mark: CoinbaseMark },
  { name: "Kraken", kind: "Exchange", Mark: KrakenMark },
  { name: "Ethereum", kind: "Blockchain", Mark: EthereumMark },
  { name: "Solana", kind: "Blockchain", Mark: SolanaMark },
  { name: "Base", kind: "Blockchain", Mark: BaseMark },
] as const;

export default function DappsAI() {
  return (
    <section id="integrations" className="bg-cream py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="integrations-surface overflow-hidden rounded-[30px] px-5 py-12 sm:px-10 sm:py-16 lg:px-16">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.95fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
                Connected platforms
              </p>
              <h2 className="mt-4 max-w-[680px] font-heading text-[40px] leading-[1.04] text-white sm:text-[58px]">
                All major blockchains and exchanges. One workflow.
              </h2>
              <p className="mt-5 max-w-[560px] text-lg leading-7 text-white/75">
                Connect exchanges, wallets, and blockchain accounts, then
                review your complete crypto activity in one place.
              </p>
              <TrackedLink
                href={siteConfig.appRoutes.register}
                event={{
                  name: "register_click",
                  properties: { location: "integrations" },
                }}
                className="group mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-[11px] bg-brand px-6 text-base font-bold text-espresso transition hover:-translate-y-0.5 hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                Connect your accounts
                <ChevronRightIcon
                  aria-hidden="true"
                  className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
                />
              </TrackedLink>
            </div>

            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-2">
              {PLATFORMS.map(({ name, kind, Mark }, index) => (
                <li
                  key={name}
                  className={`flex min-h-[132px] flex-col justify-between rounded-[20px] border border-white/15 bg-white/10 p-5 backdrop-blur-sm ${
                    index === PLATFORMS.length - 1
                      ? "col-span-2 sm:col-span-1 lg:col-span-2"
                      : ""
                  }`}
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-white shadow-sm">
                    <Mark size={29} />
                  </span>
                  <span className="mt-5">
                    <span className="block text-sm font-semibold text-white">
                      {name}
                    </span>
                    <span className="mt-0.5 block text-xs text-white/60">
                      {kind}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
