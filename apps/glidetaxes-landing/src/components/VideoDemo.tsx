import { CheckIcon, ChevronRightIcon } from "@/components/icons";
import { TrackedLink } from "@/components/TrackedLink";
import { siteConfig } from "@/lib/site";

const STEPS = [
  {
    number: "01",
    time: "2 minutes",
    title: "Connect your exchanges",
    description:
      "Paste a read-only API key or upload a CSV. Glide handles formatting, parsing, and edge cases.",
  },
  {
    number: "02",
    time: "1 minute",
    title: "Add your wallet addresses",
    description:
      "Enter a public wallet address and Glide imports the on-chain transactions tied to it.",
  },
  {
    number: "03",
    time: "Review",
    title: "See what you owe",
    description:
      "Review capital gains, income, and losses, with each number traceable to its source.",
  },
] as const;

export default function VideoDemo() {
  return (
    <section id="how" className="bg-white py-20 sm:py-28">
      <div className="mx-auto max-w-[1200px] px-4">
        <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-20">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-mid uppercase">
              How it works
            </p>
            <h2 className="mt-4 font-heading text-[40px] leading-[1.05] text-ink-soft sm:text-[58px]">
              Connect. Import. Done.
            </h2>
            <p className="mt-5 max-w-[520px] text-lg leading-7 text-warmgray">
              From account connection to tax-ready reports, Glide keeps the
              workflow focused and every calculation reviewable.
            </p>
            <TrackedLink
              href={siteConfig.appRoutes.register}
              event={{
                name: "register_click",
                properties: { location: "how_it_works" },
              }}
              className="group mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-[11px] bg-cocoa px-6 text-base font-semibold text-white transition hover:-translate-y-0.5 hover:bg-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-mid"
            >
              Start with your accounts
              <ChevronRightIcon
                aria-hidden="true"
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
              />
            </TrackedLink>
          </div>

          <ol className="relative space-y-3">
            {STEPS.map((step, index) => (
              <li
                key={step.number}
                className="group relative grid grid-cols-[52px_1fr] gap-4 rounded-[20px] border border-border-soft/80 bg-cream/45 p-5 transition-colors hover:bg-cream"
              >
                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute top-[70px] bottom-[-18px] left-[45px] w-px bg-border-soft"
                  />
                )}
                <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-white font-mono text-xs font-bold text-cocoa shadow-sm">
                  {step.number}
                </span>
                <span>
                  <span className="text-xs font-semibold tracking-[0.08em] text-brand-mid uppercase">
                    {step.time}
                  </span>
                  <span className="mt-1 block font-heading text-[26px] leading-tight text-ink">
                    {step.title}
                  </span>
                  <span className="mt-2 block text-sm leading-6 text-warmgray">
                    {step.description}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-16 overflow-hidden rounded-[28px] bg-espresso p-5 sm:p-8 lg:p-10">
          <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div className="px-2 py-4">
              <p className="text-xs font-semibold tracking-[0.18em] text-brand uppercase">
                Guided review
              </p>
              <h3 className="mt-4 font-heading text-[34px] leading-[1.08] text-white sm:text-[44px]">
                Resolve what needs attention. Keep moving.
              </h3>
              <p className="mt-4 max-w-[440px] text-base leading-7 text-white/75">
                The workflow surfaces imported accounts, transaction status,
                and report readiness without hiding the source data.
              </p>
            </div>
            <div
              role="img"
              aria-label="Illustrative Guided Mode workflow with connected accounts, reviewed transactions, and tax reports ready to export."
              className="rounded-[20px] bg-white p-4 shadow-[0_24px_70px_rgba(0,0,0,0.25)] sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-border-soft pb-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Guided Mode</p>
                  <p className="mt-1 text-xs text-graymute">
                    Reconciliation progress
                  </p>
                </div>
                <span className="rounded-full bg-brand/15 px-3 py-1.5 text-xs font-semibold text-cocoa">
                  3 of 3 complete
                </span>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {["Accounts connected", "Transactions reviewed", "Reports ready"].map(
                  (label) => (
                    <div
                      key={label}
                      className="rounded-xl border border-border-soft/80 bg-cream/50 p-4"
                    >
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-espresso">
                        <CheckIcon aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <p className="mt-4 text-sm font-semibold leading-5 text-ink">
                        {label}
                      </p>
                    </div>
                  ),
                )}
              </div>
              <div className="mt-5 h-2 overflow-hidden rounded-full bg-cream">
                <div className="h-full w-full rounded-full bg-brand" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
