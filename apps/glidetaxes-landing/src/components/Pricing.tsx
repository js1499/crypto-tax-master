import { ChevronRightIcon } from "@/components/icons";
import { TrackedLink } from "@/components/TrackedLink";
import { pricingTiers } from "@/data/pricing";

export default function Pricing({ asPageHeading = false }: { asPageHeading?: boolean }) {
  const [trial, ...paidTiers] = pricingTiers;
  const Heading = asPageHeading ? "h1" : "h2";
  const TierHeading = asPageHeading ? "h2" : "h3";

  return (
    <section id="pricing" className="bg-cream py-20 lg:py-28">
      <div className="mx-auto w-full max-w-[1200px] px-4">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="eyebrow">Straightforward pricing</p>
          <Heading className="mt-3 font-heading text-[36px] leading-[1.08] font-light text-ink-soft md:text-[54px]">
            A plan for every transaction count.
          </Heading>
          <p className="mx-auto mt-5 max-w-[600px] text-lg leading-7 text-warmgray">
            Start by reviewing your activity for free. Upgrade when you are
            ready to generate and export tax reports.
          </p>
        </div>

        <div className="mt-12 flex flex-col gap-5 rounded-2xl border border-border-soft/60 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-baseline gap-3">
              <TierHeading className="text-lg font-semibold text-ink">{trial.name}</TierHeading>
              <span className="font-heading text-3xl text-ink-soft">{trial.price}</span>
            </div>
            <p className="mt-2 max-w-[600px] text-sm leading-6 text-warmgray">
              {trial.blurb}
            </p>
          </div>
          <TrackedLink
            href="/register"
            event={{ name: "register_click", properties: { location: "pricing_trial", plan: "Trial" } }}
            className="button-secondary shrink-0"
          >
            {trial.cta}
            <ChevronRightIcon aria-hidden="true" className="text-xs" />
          </TrackedLink>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {paidTiers.map((tier) => (
            <article
              key={tier.name}
              className={`flex min-h-[410px] flex-col rounded-2xl border p-6 ${
                tier.highlighted
                  ? "border-espresso bg-espresso text-white shadow-[0_24px_55px_-30px_rgba(4,47,36,0.8)]"
                  : "border-border-soft/60 bg-white text-ink shadow-sm"
              }`}
            >
              <div className="flex min-h-7 items-center justify-between gap-2">
                <TierHeading className="text-lg font-semibold">{tier.name}</TierHeading>
                {tier.highlighted ? (
                  <span className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-espresso">
                    Most popular
                  </span>
                ) : null}
              </div>
              <p className={tier.highlighted ? "mt-1 text-sm text-white/75" : "mt-1 text-sm text-graymute"}>
                {tier.audience}
              </p>
              <p className="mt-6 flex items-baseline gap-1">
                <span className="font-heading text-[42px] leading-none">{tier.price}</span>
                <span className={tier.highlighted ? "text-sm text-white/75" : "text-sm text-graymute"}>
                  {tier.cadence}
                </span>
              </p>
              <ul className="mt-7 space-y-3">
                {tier.features.map((feature) => (
                  <li key={feature} className="flex gap-2.5 text-sm leading-5">
                    <span
                      aria-hidden="true"
                      className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                        tier.highlighted ? "bg-brand text-espresso" : "bg-brand/20 text-brand-mid"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={tier.highlighted ? "text-white/85" : "text-warmgray"}>{feature}</span>
                  </li>
                ))}
              </ul>
              <TrackedLink
                href="/register"
                event={{ name: "register_click", properties: { location: "pricing_card", plan: tier.name } }}
                className={tier.highlighted ? "button-brand mt-auto" : "button-secondary mt-auto"}
              >
                {tier.cta}
              </TrackedLink>
            </article>
          ))}
        </div>

        <div className="mt-9 text-center">
          <TrackedLink
            href="/pricing"
            event={{ name: "pricing_compare_click", properties: { location: "homepage_pricing" } }}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-espresso underline decoration-brand-mid/50 underline-offset-4 hover:decoration-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso"
          >
            Compare every feature
            <ChevronRightIcon aria-hidden="true" className="text-xs" />
          </TrackedLink>
        </div>

        <p className="mx-auto mt-8 max-w-[780px] text-center text-xs leading-5 text-graymute">
          Prices and transaction counts are illustrative plan examples. Tax outcomes depend on the
          completeness and accuracy of imported data and your selected accounting treatment. Glide
          does not provide legal or tax advice.
        </p>
      </div>
    </section>
  );
}
