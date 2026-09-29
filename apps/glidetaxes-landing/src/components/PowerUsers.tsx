import {
  CheckIcon,
  ShieldIcon,
  TargetIcon,
  TaxesIcon,
} from "@/components/icons";

const METHOD_CARDS = [
  {
    eyebrow: "Block timestamp",
    title: "Price the moment, not the hour.",
    description:
      "Glide uses the on-chain block timestamp so each transaction can be traced back to the market data used.",
    Icon: TargetIcon,
    visual: (
      <div className="rounded-2xl bg-white p-5 shadow-[0_18px_40px_-24px_rgba(4,47,36,0.5)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-ink">100 SOL swap</p>
            <p className="mt-1 text-xs text-graymute">Illustrative example</p>
          </div>
          <span className="rounded-full bg-brand/15 px-3 py-1.5 text-xs font-semibold text-cocoa">
            Repriced
          </span>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-cream p-4">
            <p className="text-xs font-medium text-graymute">Hourly candle</p>
            <p className="mt-2 font-heading text-2xl text-warmgray line-through">
              $148.50
            </p>
          </div>
          <div className="rounded-xl bg-brand/15 p-4">
            <p className="text-xs font-medium text-cocoa">Exact block</p>
            <p className="mt-2 font-heading text-2xl text-cocoa">$147.88</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Verifiable methodology",
    title: "Follow every number to its source.",
    description:
      "Review transaction classifications and the source data behind a calculation before exporting a report.",
    Icon: ShieldIcon,
    visual: (
      <div className="rounded-2xl bg-white p-5 shadow-[0_18px_40px_-24px_rgba(4,47,36,0.5)]">
        <p className="text-sm font-semibold text-ink">Transaction verification</p>
        <div className="mt-4 space-y-3">
          {[
            ["Wallet activity", "Imported"],
            ["Transaction label", "Reviewed"],
            ["On-chain source", "Verified"],
          ].map(([label, state]) => (
            <div
              key={label}
              className="flex items-center justify-between rounded-xl border border-border-soft/70 px-4 py-3"
            >
              <span className="text-sm font-medium text-warmgray">{label}</span>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-cocoa">
                <CheckIcon aria-hidden="true" className="h-3.5 w-3.5" />
                {state}
              </span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    eyebrow: "Tax-ready workflow",
    title: "Review once. Export with confidence.",
    description:
      "Bring activity from blockchains, exchanges, and wallets into one workflow, resolve issues, then generate tax-ready reports.",
    Icon: TaxesIcon,
    visual: (
      <div className="rounded-2xl bg-white p-5 shadow-[0_18px_40px_-24px_rgba(4,47,36,0.5)]">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-ink">Reconciliation</p>
          <span className="text-xs font-semibold text-cocoa">Complete</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-cream">
          <div className="h-full w-full rounded-full bg-brand" />
        </div>
        <div className="mt-5 flex items-center justify-between rounded-xl bg-espresso px-4 py-3 text-white">
          <span className="text-sm font-medium">Tax reports</span>
          <span className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-espresso">
            Ready to export
          </span>
        </div>
      </div>
    ),
  },
] as const;

export default function PowerUsers() {
  return (
    <section id="methodology" className="bg-cream py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="mx-auto max-w-[820px] text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-mid uppercase">
            Verifiable methodology
          </p>
          <h2 className="mt-4 font-heading text-[38px] leading-[1.08] font-normal text-cocoa sm:text-[56px]">
            Block-timestamp precision. Effortless from the start.
          </h2>
          <p className="mx-auto mt-5 max-w-[650px] text-lg leading-7 text-warmgray">
            Glide applies fair market value using the on-chain timestamp, then
            keeps the calculation connected to its source.
          </p>
        </div>

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
          {METHOD_CARDS.map(({ eyebrow, title, description, Icon, visual }) => (
            <article
              key={title}
              className="flex flex-col overflow-hidden rounded-[24px] border border-white/70 bg-white/55 p-5 shadow-[0_12px_36px_rgba(4,47,36,0.06)] sm:p-6"
            >
              <div className="method-card-surface rounded-[18px] p-4 sm:p-5">
                {visual}
              </div>
              <div className="px-1 pt-6 pb-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-cocoa">
                  <Icon aria-hidden="true" className="h-4 w-4" />
                  {eyebrow}
                </p>
                <h3 className="mt-3 font-heading text-[30px] leading-[1.08] text-ink-soft">
                  {title}
                </h3>
                <p className="mt-3 text-[15px] leading-6 text-warmgray">
                  {description}
                </p>
              </div>
            </article>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-[760px] text-center text-xs leading-5 text-graymute">
          Pricing examples are illustrative. Actual differences vary by asset,
          market conditions, transaction history, and methodology selected.
        </p>
      </div>
    </section>
  );
}
