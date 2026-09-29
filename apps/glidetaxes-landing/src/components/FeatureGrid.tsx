import { featureGroups, tierNames } from "@/data/pricing";

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="whitespace-nowrap text-sm font-semibold text-ink">{value}</span>;
  }

  return value ? (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-brand/20 text-xs font-bold text-brand-mid">
      <span className="sr-only">Included</span>
      <span aria-hidden="true">✓</span>
    </span>
  ) : (
    <span className="text-lg text-graymute">
      <span className="sr-only">Not included</span>
      <span aria-hidden="true">×</span>
    </span>
  );
}

export default function FeatureGrid() {
  return (
    <section aria-labelledby="comparison-heading" className="bg-cream pb-24">
      <div className="mx-auto w-full max-w-[1200px] px-4">
        <div className="mx-auto max-w-[760px] text-center">
          <p className="eyebrow">Full plan details</p>
          <h2 id="comparison-heading" className="mt-3 font-heading text-[34px] leading-tight font-light text-ink-soft md:text-[48px]">
            Compare every feature
          </h2>
        </div>

        <nav aria-label="Pricing comparison categories" className="mt-8 flex flex-wrap justify-center gap-2">
          {featureGroups.map((group) => (
            <a key={group.id} href={`#${group.id}`} className="inline-flex min-h-11 items-center rounded-full border border-border-soft bg-white px-4 text-xs font-semibold text-ink transition-colors hover:bg-brand/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso">
              {group.category}
            </a>
          ))}
        </nav>

        <p id="comparison-scroll-hint" className="mt-7 text-center text-xs font-medium text-graymute md:hidden">
          Swipe horizontally to compare plans.
        </p>
        <div
          data-testid="pricing-table-scroll"
          tabIndex={0}
          aria-describedby="comparison-scroll-hint"
          className="pricing-table-contained mt-3 overflow-x-auto rounded-2xl border border-border-soft bg-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-espresso md:mt-8"
        >
          <table className="w-full min-w-[960px] border-collapse text-left">
            <caption className="sr-only">Glide plan feature comparison</caption>
            <thead className="sticky top-0 z-30 bg-white shadow-[0_1px_0_rgba(27,54,38,0.14)]">
              <tr>
                <th scope="col" className="sticky left-0 z-40 w-[280px] bg-white px-6 py-5 text-sm font-semibold text-graymute">
                  Feature
                </th>
                {tierNames.map((tier) => (
                  <th key={tier} scope="col" className="min-w-[132px] px-4 py-5 text-center text-sm font-semibold text-ink">
                    {tier}
                  </th>
                ))}
              </tr>
            </thead>
            {featureGroups.map((group) => (
              <tbody key={group.id} id={group.id} className="scroll-mt-36">
                <tr>
                  <th colSpan={6} scope="colgroup" className="bg-brand/20 px-6 py-3 text-xs font-bold tracking-[0.11em] text-espresso uppercase">
                    {group.category}
                  </th>
                </tr>
                {group.rows.map((row) => (
                  <tr key={row.label} className={`border-b border-border-soft/60 last:border-0 ${row.highlighted ? "bg-[#e6f8ef]" : "hover:bg-cream/45"}`}>
                    <th scope="row" className={`sticky left-0 z-10 px-6 py-3.5 text-sm ${row.highlighted ? "bg-[#e6f8ef] font-bold text-espresso" : "bg-white font-medium text-warmgray"}`}>
                      {row.label}
                    </th>
                    {row.values.map((value, index) => (
                      <td key={`${row.label}-${tierNames[index]}`} className="px-4 py-3.5 text-center">
                        <FeatureValue value={value} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
        <p className="mx-auto mt-5 max-w-[780px] text-center text-xs leading-5 text-graymute">
          *The Trial tier allows unlimited transaction viewing. Paid tiers unlock tax forms and
          exports. Prices and transaction examples are illustrative. Glide does not provide legal
          or tax advice.
        </p>
      </div>
    </section>
  );
}
