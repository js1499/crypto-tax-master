import { MoneyBackGuarantee } from "@/components/glide-landing/alternative/MoneyBackGuarantee";
import { ChevronRightIcon } from "@/components/glide-landing/icons";
import { TrackedLink } from "@/components/glide-landing/TrackedLink";
import { featureGroups, pricingTiers, tierNames } from "@/components/glide-landing/data/pricing";

function FeatureValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="whitespace-nowrap text-xs font-medium text-[#d5e3ff]">{value}</span>;
  }

  return value ? (
    <span className="inline-flex size-5 items-center justify-center rounded-full bg-[#5ae2aa]/15 text-[10px] font-bold text-[#5ae2aa]">
      <span className="sr-only">Included</span>
      <span aria-hidden="true">✓</span>
    </span>
  ) : (
    <span className="text-sm text-[#b8c7dc]">
      <span className="sr-only">Not included</span>
      <span aria-hidden="true">×</span>
    </span>
  );
}

export function LegacyPricing() {
  const [trial, ...paidTiers] = pricingTiers;

  return (
    <>
      <section id="pricing" className="textured textured-light-alt scroll-mt-20 bg-[#f4f7fb] py-16 lg:py-20">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <div className="mx-auto max-w-[720px] text-center">
            <h2 className="legacy-heading text-[34px] leading-[1.08] font-normal text-[#0b2447] min-[390px]:text-[40px] lg:text-[60px]">Pricing</h2>
            <p className="mx-auto mt-5 max-w-[620px] text-lg leading-7 font-medium text-[#536176]">See your result free. Pay only when you are ready to download your reports.</p>
          </div>

          <div className="mt-8 sm:mt-10">
            <MoneyBackGuarantee placement="pricing" />
          </div>

          <article className="legacy-polish-card mt-8 grid gap-6 rounded-2xl border border-[#dce4ee] bg-white p-5 shadow-[0_8px_24px_rgba(27,50,88,0.05)] sm:p-6 md:grid-cols-[1.1fr_1.6fr_auto] md:items-center">
            <div>
              <h3 className="text-base font-semibold text-[#0b2447]">{trial.name}</h3>
              <p className="mt-1 text-[13px] font-medium text-[#64748b]">{trial.audience}</p>
              <p className="mt-3 max-w-[260px] text-[13px] leading-5 text-[#536176]">{trial.blurb}</p>
            </div>
            <ul className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
              {trial.features.map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-[13px] font-medium text-[#334155]"><span className="flex size-4 items-center justify-center rounded-full bg-[#dff8ed] text-[9px] font-bold text-[#08764b]">✓</span>{feature}</li>
              ))}
            </ul>
            <div className="flex items-center gap-5 md:flex-col md:items-end md:gap-3">
              <p className="legacy-heading text-4xl text-[#0b2447]">{trial.price}</p>
              <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_pricing_trial", plan: trial.name } }} className="legacy-primary-button min-w-[132px]">{trial.cta} <ChevronRightIcon aria-hidden="true" className="size-3" /></TrackedLink>
            </div>
          </article>

          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {paidTiers.map((tier) => (
              <article key={tier.name} className={`legacy-polish-card flex flex-col rounded-2xl border p-5 sm:min-h-[324px] sm:p-6 lg:p-5 ${tier.highlighted ? "border-[#7ca8ff]/40 bg-[#123d7a] text-white shadow-[0_16px_40px_-16px_rgba(47,109,246,0.32)]" : "border-[#dce4ee] bg-white text-[#0b2447] shadow-[0_8px_24px_rgba(27,50,88,0.05)]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold">{tier.name}</h3>
                  {tier.highlighted ? <span className="rounded-full bg-[#5ae2aa] px-2.5 py-1 text-[11px] font-semibold text-[#06152d]">Popular</span> : null}
                </div>
                <p className={`mt-1 text-[13px] font-medium ${tier.highlighted ? "text-[#aebed5]" : "text-[#64748b]"}`}>{tier.audience}</p>
                <p className="mt-5 flex items-baseline gap-1"><span className="legacy-heading text-[40px] leading-none">{tier.price}</span><span className={`text-sm font-medium ${tier.highlighted ? "text-[#aebed5]" : "text-[#64748b]"}`}>{tier.cadence}</span></p>
                <ul className="mt-5 flex flex-col gap-3 pb-5">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${tier.highlighted ? "bg-[#5ae2aa]/15 text-[#5ae2aa]" : "bg-[#dff8ed] text-[#08764b]"}`}>✓</span>
                      <span className={`text-[13px] leading-[19px] font-medium ${tier.highlighted ? "text-[#d5e3ff]" : "text-[#334155]"}`}>{feature}</span>
                    </li>
                  ))}
                </ul>
                <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_pricing_card", plan: tier.name } }} className={`mt-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 ${tier.highlighted ? "bg-[#5ae2aa] text-[#06152d] hover:bg-[#80ebbf] focus-visible:outline-white" : "bg-[#2f6df6] text-white hover:bg-[#225bd9] focus-visible:outline-[#2f6df6]"}`}>{tier.cta} <ChevronRightIcon aria-hidden="true" className="size-3" /></TrackedLink>
              </article>
            ))}
          </div>

          <div className="mt-8 text-center">
            <TrackedLink href="#compare" event={{ name: "pricing_compare_click", properties: { location: "legacy_pricing" } }} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-[#174ea6] underline decoration-[#2f6df6] underline-offset-4 hover:text-[#0b2447] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#174ea6]">Compare the complete feature matrix <ChevronRightIcon aria-hidden="true" className="size-3" /></TrackedLink>
          </div>
          <p className="mx-auto mt-5 max-w-[760px] text-center text-xs leading-5 text-[#536176]">Prices and transaction counts are illustrative plan examples. Glide does not provide legal or tax advice.</p>
        </div>
      </section>

      <section id="compare" aria-labelledby="legacy-comparison-heading" className="textured textured-navy bg-[#071b39] py-16 lg:py-20">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <h2 id="legacy-comparison-heading" className="legacy-heading mb-8 text-center text-[30px] leading-[1.12] font-normal text-white min-[390px]:text-[34px] lg:text-[42px]">Choose the plan that fits your portfolio</h2>
          <p id="legacy-comparison-hint" className="mb-3 text-center text-xs font-medium text-[#b8c7dc] md:hidden">Swipe horizontally to compare plans.</p>
          <div data-testid="legacy-pricing-table-scroll" tabIndex={0} aria-describedby="legacy-comparison-hint" className="pricing-table-contained overflow-x-auto rounded-2xl border border-[#28415f] bg-[#0b2447] shadow-[0_12px_36px_rgba(0,0,0,0.12)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8db7ff]">
            <table className="w-full min-w-[790px] border-collapse text-left md:min-w-[900px]">
              <caption className="sr-only">Glide plan feature comparison</caption>
              <thead className="sticky top-0 z-30 bg-[#0d2b54] shadow-[0_1px_0_#28415f]">
                <tr>
                  <th scope="col" className="sticky left-0 z-40 w-[190px] bg-[#0d2b54] px-4 py-4 text-xs font-semibold text-white md:w-[280px] md:px-5">Features</th>
                  {tierNames.map((tier) => <th key={tier} scope="col" className="min-w-[110px] px-3 py-4 text-center text-xs font-semibold text-white md:min-w-[120px] md:px-4">{tier}</th>)}
                </tr>
              </thead>
              {featureGroups.map((group) => (
                <tbody key={group.id} id={`legacy-${group.id}`}>
                  <tr><th colSpan={6} scope="colgroup" className="bg-[#2f6df6] px-4 py-2.5 text-[11px] font-bold tracking-[0.08em] text-white uppercase md:px-5">{group.category}</th></tr>
                  {group.rows.map((row) => (
                    <tr key={row.label} className={`border-b last:border-0 ${row.highlighted ? "border-[#285852] bg-[#103d3f]" : "border-[#28415f]"}`}>
                      <th scope="row" className={`sticky left-0 z-10 px-4 py-3 text-[11px] md:px-5 md:text-xs ${row.highlighted ? "bg-[#103d3f] font-bold text-[#a4f1d0]" : "bg-[#0b2447] font-medium text-[#d5e3ff]"}`}>{row.label}</th>
                      {row.values.map((value, index) => <td key={`${row.label}-${tierNames[index]}`} className="px-3 py-3 text-center md:px-4"><FeatureValue value={value} /></td>)}
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <p className="mx-auto mt-5 max-w-[780px] text-center text-[11px] leading-5 text-[#b8c7dc]">*Trial supports transaction viewing. Paid tiers unlock supported tax forms and exports. See the pricing page for current details.</p>
        </div>
      </section>
    </>
  );
}
