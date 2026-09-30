import { CheckIcon, ShieldIcon, TargetIcon, TaxesIcon } from "@/components/glide-landing/icons";
import { PortfolioReviewGraphic } from "@/components/glide-landing/alternative/PortfolioReviewGraphic";
import { TrackedLink } from "@/components/glide-landing/TrackedLink";

const methodTabs = [
  { href: "#methodology-pricing", label: "Finish faster", Icon: TaxesIcon },
  { href: "#methodology-audit", label: "Review easily", Icon: ShieldIcon },
  { href: "#methodology-accuracy", label: "File accurately", Icon: TargetIcon },
] as const;

function MethodologyPricingVisual() {
  return (
    <figure
      aria-label="Illustrative trade valuation showing an accurate result"
      className="legacy-method-visual-one flex min-h-[330px] w-full max-w-[520px] items-center rounded-[20px] p-3 min-[360px]:p-4 sm:min-h-[420px] sm:rounded-[24px] sm:p-8 lg:min-h-[500px]"
    >
      <div className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-14px_rgba(7,27,57,0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-[#dce4ee] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e8f0ff] text-sm font-semibold text-[#174ea6]">◎</span>
            <div>
              <p className="text-sm font-semibold text-[#0b2447]">100 SOL swap</p>
              <p className="mt-0.5 text-xs text-[#536176]">Illustrative transaction</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[#e4f8ef] px-3 py-1 text-xs font-semibold text-[#08764b]">Accurate</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-[#dce4ee] px-4 py-4 sm:px-5">
          <div>
            <p className="text-sm font-semibold text-[#0b2447]">Market estimate</p>
            <p className="mt-0.5 text-xs text-[#536176]">Broad hourly value</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="legacy-heading text-xl text-[#536176] line-through decoration-red-600/50">$148.50</p>
            <span className="hidden rounded-full bg-red-600/10 px-2.5 py-1 text-[10px] font-semibold text-red-700 sm:block">Estimate</span>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-[#dce4ee] px-4 py-4 sm:px-5">
          <div>
            <p className="text-sm font-semibold text-[#0b2447]">Glide value</p>
            <p className="mt-0.5 text-xs text-[#536176]">Matched to the trade</p>
          </div>
          <div className="flex items-center gap-2">
            <p className="legacy-heading text-xl text-[#0b2447]">$147.88</p>
            <span className="hidden shrink-0 rounded-full bg-[#e4f8ef] px-2.5 py-1 text-xs font-semibold text-[#08764b] min-[390px]:inline-flex">✓ Accurate</span>
          </div>
        </div>
        <div className="flex items-center justify-between bg-[#f4f7fb] px-4 py-4 sm:px-5">
          <p className="text-sm font-medium text-[#536176]">Value difference</p>
          <p className="legacy-heading text-2xl text-[#08764b]">$62.00</p>
        </div>
      </div>
    </figure>
  );
}

function AccuracyVisual() {
  const candles = [29, 63, 97, 131, 165, 233, 267] as const;

  return (
    <figure
      aria-label="Illustrative price check supporting an accurate tax result"
      className="legacy-method-visual-three relative flex min-h-[410px] w-full max-w-[520px] items-center rounded-[20px] px-3 py-8 min-[360px]:px-5 sm:min-h-[460px] sm:rounded-[24px] sm:px-8 lg:min-h-[500px]"
    >
      <div className="relative w-full max-w-[420px]">
        <div data-testid="sol-hourly-chart" className="rounded-2xl bg-white p-5 shadow-[0_18px_40px_-14px_rgba(7,27,57,0.45)]">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[#0b2447]">SOL / USDC</p>
            <span className="rounded-full bg-[#f4f7fb] px-3 py-1 text-xs font-semibold text-[#536176]">1h candles</span>
          </div>
          <svg viewBox="0 0 300 150" className="mt-3 w-full" aria-hidden="true">
            {candles.map((x, index) => (
              <g key={x}>
                <line x1={x} y1={index % 2 ? 36 : 44} x2={x} y2={index % 2 ? 96 : 104} stroke="#b8c7dc" strokeWidth="2" />
                <rect x={x - 7} y={index % 2 ? 50 : 58} width="14" height={index % 2 ? 34 : 30} rx="3" fill={index % 2 ? "#b8c7dc" : "#91a4c0"} />
              </g>
            ))}
            <line x1="199" y1="30" x2="199" y2="106" stroke="#dc2626" strokeWidth="2" />
            <rect x="192" y="44" width="14" height="44" rx="3" fill="rgba(220,38,38,0.14)" stroke="#dc2626" strokeWidth="2" strokeDasharray="4 3" />
            <circle cx="199" cy="66" r="3.2" fill="#dc2626" />
          </svg>
        </div>
        <div data-testid="exact-second-card" className="relative z-10 -mt-6 ml-auto w-[200px] rounded-2xl bg-white p-4 shadow-[0_18px_40px_-10px_rgba(7,27,57,0.45)] ring-4 ring-[#5ae2aa]/35 min-[360px]:w-[220px] sm:-mt-8 sm:w-[240px]">
          <div className="flex items-center justify-between gap-2 text-[11px]">
            <span className="flex items-center gap-1.5 font-semibold text-[#08764b]"><TargetIcon aria-hidden="true" className="size-3.5" />Price confirmed</span>
            <span className="font-medium text-[#536176]">Checked</span>
          </div>
          <svg viewBox="0 0 200 90" className="mt-2 w-full" aria-hidden="true">
            <polyline points="4,58 22,52 38,60 54,48 70,54 86,42 102,50 118,38 134,46 150,40 166,48 182,44 196,50" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="118" y1="6" x2="118" y2="84" stroke="#0b2447" strokeWidth="1.2" strokeDasharray="3 3" />
            <line x1="8" y1="38" x2="192" y2="38" stroke="#0b2447" strokeWidth="1.2" strokeDasharray="3 3" />
            <circle cx="118" cy="38" r="8" fill="none" stroke="#0b2447" strokeWidth="1.6" />
            <circle cx="118" cy="38" r="3" fill="#0b2447" />
          </svg>
          <p className="mt-1 text-center text-xs font-semibold text-[#0b2447]">14:32:08 · $147.88</p>
        </div>
        <span className="absolute -top-4 right-3 inline-flex items-center gap-1.5 rounded-full bg-[#0b2447] px-3 py-1.5 text-[11px] font-medium text-white shadow-lg sm:right-5">
          Source matched <span className="flex size-4 items-center justify-center rounded-full bg-[#5ae2aa] text-[9px] font-bold text-[#0b2447]">✓</span>
        </span>
      </div>
    </figure>
  );
}

// What Glide does to arrive at a number. Statements about Glide only; no comparisons.
const accuracyPoints = [
  { title: "Priced at the exact second", body: "Each trade is valued at its on-chain timestamp." },
  { title: "Unlisted tokens covered", body: "Valued through the liquid side of the swap." },
  { title: "Every figure traceable", body: "Each number links back to its transaction hash." },
] as const;

// Seven blocks on the chain; the trade sits in the fifth. Its x-position is shared with the pin on
// the price curve below, so the drop-line reads as "this block, this price".
const chainBlocks = [0, 1, 2, 3, 4, 5, 6] as const;
const tradeBlock = 4;
const tradeX = 228;
const tradeY = 132;

function HowAccurateVisual() {
  return (
    <figure
      aria-label="Illustration: the block a trade landed in is matched to the market price at that exact moment, giving a cost basis that links back to its source"
      className="legacy-method-visual-one flex min-h-[330px] w-full max-w-[520px] items-center rounded-[20px] p-3 min-[360px]:p-4 sm:min-h-[420px] sm:rounded-[24px] sm:p-8 lg:min-h-[500px]"
    >
      <div className="w-full overflow-hidden rounded-2xl bg-white shadow-[0_18px_40px_-14px_rgba(7,27,57,0.45)]">
        <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5">
          <p className="text-sm font-semibold text-[#0b2447]">From block to price</p>
          <span className="shrink-0 rounded-full bg-[#f4f7fb] px-3 py-1 text-xs font-semibold text-[#536176]">Illustrative</span>
        </div>

        <svg viewBox="0 0 360 232" className="mt-2 block w-full" aria-hidden="true">
          <defs>
            <linearGradient id="how-accurate-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#2f6df6" stopOpacity="0.3" />
              <stop offset="1" stopColor="#2f6df6" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* The chain: linked blocks, the trade's block picked out. */}
          <line x1="20" y1="37" x2="340" y2="37" stroke="#c9d5e6" strokeWidth="2" strokeDasharray="3 5" />
          {chainBlocks.map((block) => {
            const x = 20 + block * 48;
            const active = block === tradeBlock;
            return (
              <g key={block}>
                <rect x={x} y="21" width="32" height="32" rx="8" fill={active ? "#0b2447" : "#eef3fa"} stroke={active ? "#5ae2aa" : "#c9d5e6"} strokeWidth={active ? 3 : 1.5} />
                <rect x={x + 10} y="31" width="12" height="12" rx="3" fill={active ? "#5ae2aa" : "#c9d5e6"} />
              </g>
            );
          })}
          <text x={tradeX} y="70" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0b2447">14:32:08</text>

          {/* The market at that moment. */}
          {[108, 140, 172, 204].map((y) => <line key={y} x1="12" y1={y} x2="348" y2={y} stroke="#e9eef5" strokeWidth="1" />)}
          <path d="M12 168 40 160 68 172 96 150 124 158 152 138 180 146 208 126 228 132 256 118 284 128 312 110 348 120V204H12Z" fill="url(#how-accurate-area)" />
          <polyline points="12,168 40,160 68,172 96,150 124,158 152,138 180,146 208,126 228,132 256,118 284,128 312,110 348,120" fill="none" stroke="#2f6df6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

          {/* Block meets price. */}
          <line x1={tradeX} y1="76" x2={tradeX} y2="204" stroke="#0b2447" strokeWidth="1.4" strokeDasharray="3 4" />
          <circle cx={tradeX} cy={tradeY} r="11" fill="#5ae2aa" fillOpacity="0.28" />
          <circle cx={tradeX} cy={tradeY} r="6" fill="#ffffff" stroke="#0b2447" strokeWidth="2" />
          <circle cx={tradeX} cy={tradeY} r="2.4" fill="#0b2447" />
          <rect x="244" y="84" width="82" height="28" rx="14" fill="#0b2447" />
          <text x="285" y="102.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffffff">$147.88</text>
          <text x="12" y="224" fontSize="9" fontWeight="600" fill="#8a97a8">SOL / USDC</text>
        </svg>

        {/* Wraps rather than widening the card: the chain and clock steps only appear once there is room. */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-[#f4f7fb] px-4 py-4 sm:px-5">
          <div className="flex items-center gap-1.5 text-[#0b2447]">
            <span className="hidden size-8 items-center justify-center rounded-full border border-[#dce4ee] bg-white sm:flex">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.1 1.1" /><path d="M14 10a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.1-1.1" /></svg>
            </span>
            <span aria-hidden="true" className="hidden h-px w-3 bg-[#b8c7dc] sm:block" />
            <span className="hidden size-8 items-center justify-center rounded-full border border-[#dce4ee] bg-white sm:flex">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4" aria-hidden="true"><circle cx="12" cy="12" r="8" /><path d="M12 8v4l2.5 2" /></svg>
            </span>
            <span aria-hidden="true" className="hidden h-px w-3 bg-[#b8c7dc] sm:block" />
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#5ae2aa]">
              <CheckIcon aria-hidden="true" className="size-4" />
            </span>
            <span className="ml-1.5 text-xs font-semibold whitespace-nowrap text-[#08764b]">Source linked</span>
          </div>
          <div className="ml-auto text-right">
            <p className="text-[11px] font-medium text-[#536176]">Cost basis</p>
            <p className="legacy-heading text-xl leading-tight text-[#08764b] sm:text-2xl">$14,788.00</p>
          </div>
        </div>
      </div>
    </figure>
  );
}

export function LegacyMethodology() {
  return (
    <>
      <section id="product-alt" aria-labelledby="methodology-heading" className="textured textured-navy scroll-mt-20 bg-[#071b39] py-16 lg:py-20">
        <div className="mx-auto w-full max-w-[800px] px-4 text-center sm:px-6">
          <h2 id="methodology-heading" className="legacy-heading mb-5 text-[32px] leading-[1.15] font-normal text-white min-[390px]:text-[36px] lg:text-[60px] lg:leading-[1.12]">
            Less time on taxes. More peace of mind.
          </h2>
          <p className="mx-auto mb-8 max-w-[620px] text-lg leading-[1.6] font-medium text-[#b8c7dc]">
            A clear result, a quick review, and tax-ready reports. Glide helps you get on with the rest of your day.
          </p>
        </div>

        <nav aria-label="Methodology sections" className="mx-auto w-fit max-w-[calc(100%-24px)] rounded-full border border-[#d7e0eb] bg-white p-1 shadow-[0_12px_30px_rgba(27,50,88,0.12)]">
          <div className="flex items-center justify-center gap-1 sm:gap-2">
            {methodTabs.map(({ href, label, Icon }, index) => (
              <a
                key={href}
                href={href}
                className={`inline-flex min-h-11 items-center rounded-full px-3 text-xs font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6df6] sm:text-sm ${index === 0 ? "bg-[#e8f0ff] text-[#174ea6]" : "text-[#536176] hover:bg-[#f1f5fb] hover:text-[#0b2447]"}`}
              >
                {label}
                <span className={`ml-1.5 hidden size-6 items-center justify-center rounded-full sm:flex ${index === 0 ? "bg-[#5ae2aa]" : "bg-[#e8edf5]"}`}>
                  <Icon aria-hidden="true" className={`size-3.5 ${index === 0 ? "text-[#06152d]" : "text-[#536176]"}`} />
                </span>
              </a>
            ))}
          </div>
        </nav>
      </section>

      <section id="methodology-pricing" aria-labelledby="methodology-pricing-heading" className="textured textured-light scroll-mt-20 bg-[#f4f7fb] py-16 lg:py-20">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <article className="legacy-polish-card grid w-full overflow-hidden rounded-[24px] border border-[#dce4ee] bg-white shadow-[0_12px_36px_rgba(27,50,88,0.06)] lg:min-h-[564px] lg:grid-cols-2">
            <div className="flex flex-col items-start justify-center gap-4 p-6 text-left sm:p-8 lg:p-12">
              <h3 id="methodology-pricing-heading" className="legacy-heading max-w-[488px] text-[34px] leading-[1.1] font-normal text-[#0b2447] sm:text-[40px] lg:text-[56px]">Feel sure about your numbers.</h3>
              <p className="max-w-[420px] text-lg leading-[1.6] font-medium text-[#536176]">Glide values supported trades at the time they happened, giving your tax calculations a precise starting point.</p>
              <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_methodology" } }} className="legacy-primary-button mt-3">Get my tax result</TrackedLink>
            </div>
            <div className="flex items-center justify-center p-4 pb-8 lg:h-[564px] lg:p-8"><MethodologyPricingVisual /></div>
          </article>
        </div>
      </section>

      <section id="methodology-audit" aria-labelledby="methodology-audit-heading" className="textured textured-navy-alt scroll-mt-20 bg-[#071b39] py-16 lg:py-20">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <article className="legacy-polish-card grid w-full overflow-hidden rounded-[24px] border border-white/10 bg-[#0b2447] shadow-[0_12px_36px_rgba(0,0,0,0.12)] lg:min-h-[564px] lg:grid-cols-2">
            <div className="flex flex-col items-start justify-center gap-4 p-6 text-left sm:p-8 lg:order-2 lg:p-12">
              <h3 id="methodology-audit-heading" className="legacy-heading max-w-[488px] text-[34px] leading-[1.1] font-normal text-white sm:text-[40px] lg:text-[56px]">Get your time back.</h3>
              <p className="max-w-[420px] text-lg leading-[1.6] font-medium text-[#b8c7dc]">Your accounts come together in one clear summary, so you can review your result quickly and get on with your day.</p>
              <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_audit" } }} className="legacy-primary-button mt-3">Finish faster</TrackedLink>
            </div>
            <div className="flex items-center justify-center p-4 pb-8 lg:order-1 lg:h-[564px] lg:p-8"><PortfolioReviewGraphic /></div>
          </article>
        </div>
      </section>

      <section id="methodology-accuracy" aria-labelledby="methodology-accuracy-heading" className="textured textured-light-alt scroll-mt-20 bg-[#f4f7fb] py-16 lg:py-20">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <article className="legacy-polish-card grid w-full overflow-hidden rounded-[24px] border border-[#dce4ee] bg-white shadow-[0_12px_36px_rgba(27,50,88,0.06)] lg:min-h-[564px] lg:grid-cols-2">
            <div className="flex flex-col items-start justify-center gap-4 p-6 text-left sm:p-8 lg:p-12">
              <h3 id="methodology-accuracy-heading" className="legacy-heading max-w-[488px] text-[34px] leading-[1.1] font-normal text-[#0b2447] sm:text-[40px] lg:text-[56px]">File with peace of mind.</h3>
              <p className="max-w-[420px] text-lg leading-[1.6] font-medium text-[#536176]">Glide keeps the calculations and supporting details together, so you can understand your result and feel ready to file.</p>
              <TrackedLink href="#compare" event={{ name: "pricing_compare_click", properties: { location: "legacy_accuracy" } }} className="legacy-primary-button mt-3">See plans</TrackedLink>
            </div>
            <div className="flex items-center justify-center p-4 pb-8 lg:h-[564px] lg:p-8"><AccuracyVisual /></div>
          </article>
        </div>
        <p className="mx-auto mt-8 max-w-[760px] px-4 text-center text-xs leading-5 text-[#536176] sm:px-6">
          Dollar figures are illustrative. Actual results vary by asset, market conditions, transaction history, and selected methodology. Glide does not provide legal or tax advice.
        </p>
      </section>

      <section id="methodology-how" aria-labelledby="methodology-how-heading" className="textured textured-navy-alt scroll-mt-20 bg-[#071b39] py-16 lg:py-20">
        <div className="mx-auto w-full max-w-[1200px] px-4 sm:px-6">
          <article className="legacy-polish-card grid w-full overflow-hidden rounded-[24px] border border-white/10 bg-[#0b2447] shadow-[0_12px_36px_rgba(0,0,0,0.12)] lg:min-h-[564px] lg:grid-cols-2">
            <div className="flex flex-col items-start justify-center gap-4 p-6 text-left sm:p-8 lg:order-2 lg:p-12">
              <h3 id="methodology-how-heading" className="legacy-heading max-w-[488px] text-[34px] leading-[1.1] font-normal text-white sm:text-[40px] lg:text-[56px]">Accurate by design.</h3>
              <p className="max-w-[440px] text-lg leading-[1.6] font-medium text-[#b8c7dc]">Glide reads each transaction from its source, prices it at the second it happened, and keeps the link so you can check any number yourself.</p>
              <ul className="mt-1 flex max-w-[440px] flex-col gap-3">
                {accuracyPoints.map(({ title, body }) => (
                  <li key={title} className="flex items-start gap-3">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-[#5ae2aa] text-[#06152d]"><CheckIcon aria-hidden="true" className="size-3" /></span>
                    <span className="text-[15px] leading-6 text-[#b8c7dc]"><strong className="font-semibold text-white">{title}.</strong> {body}</span>
                  </li>
                ))}
              </ul>
              <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_how_accurate" } }} className="legacy-primary-button mt-3">Get my tax result</TrackedLink>
            </div>
            <div className="flex items-center justify-center p-4 pb-8 lg:order-1 lg:h-[564px] lg:p-8"><HowAccurateVisual /></div>
          </article>
        </div>
      </section>
    </>
  );
}
