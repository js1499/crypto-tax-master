import {
  BaseMark,
  BinanceMark,
  BybitMark,
  CoinbaseMark,
  CryptoComMark,
  EthereumMark,
  GeminiMark,
  HyperliquidMark,
  KrakenMark,
  KuCoinMark,
  OkxMark,
  SolanaMark,
} from "@/components/glide-landing/PlatformMarks";
import { CheckIcon, ChevronRightIcon } from "@/components/glide-landing/icons";
import { TrackedLink } from "@/components/glide-landing/TrackedLink";

const platforms = [
  { name: "Coinbase", Mark: CoinbaseMark, position: "left-[8%] top-[120px] size-[64px]" },
  { name: "Kraken", Mark: KrakenMark, position: "left-[25%] top-[72px] size-[74px]" },
  { name: "Hyperliquid", Mark: HyperliquidMark, position: "right-[26%] top-[74px] size-[78px]" },
  { name: "Base", Mark: BaseMark, position: "right-[8%] top-[128px] size-[72px]" },
  { name: "Solana", Mark: SolanaMark, position: "left-[15%] top-[305px] size-[86px]" },
  { name: "Binance", Mark: BinanceMark, position: "right-[15%] top-[320px] size-[84px]" },
  { name: "Gemini", Mark: GeminiMark, position: "left-[9%] top-[510px] size-[72px]" },
  { name: "Crypto.com", Mark: CryptoComMark, position: "left-[27%] top-[570px] size-[80px]" },
  { name: "Ethereum", Mark: EthereumMark, position: "right-[29%] top-[565px] size-[82px]" },
  { name: "OKX", Mark: OkxMark, position: "right-[9%] top-[525px] size-[72px]" },
  { name: "Bybit", Mark: BybitMark, position: "left-[4%] top-[335px] size-[58px]" },
  { name: "KuCoin", Mark: KuCoinMark, position: "right-[4%] top-[350px] size-[58px]" },
] as const;

function WorkflowCanvas() {
  return (
    <figure
      aria-label="Illustrative Glide workflow from connected accounts to accurate reports"
      className="relative flex aspect-video w-full items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-[#071b39] lg:aspect-[209/135]"
    >
      <div aria-hidden="true" className="absolute inset-0 flex flex-col p-3 lg:p-4">
        <div className="flex items-center gap-1.5 rounded-t-lg bg-white/[0.06] px-3 py-2">
          <span className="size-2 rounded-full bg-white/25" />
          <span className="size-2 rounded-full bg-white/25" />
          <span className="size-2 rounded-full bg-white/25" />
          <span className="ml-2 text-[10px] font-medium leading-none text-white/70">Glide workflow</span>
        </div>
        <div className="flex flex-1 gap-3 rounded-b-lg bg-white/[0.03] p-3">
          <div className="flex w-[22%] flex-col gap-2.5 border-r border-white/10 pt-1 pr-3">
            {[0, 1, 2, 3].map((item) => <span key={item} className="h-2 rounded-full bg-white/10" />)}
          </div>
          <div className="flex flex-1 flex-col gap-2.5 pt-1">
            {[0, 1, 2, 3].map((item) => <span key={item} className="h-2.5 rounded bg-white/[0.07]" />)}
            <div className="mt-auto flex flex-col gap-1.5">
              <span className="text-[10px] font-medium leading-none text-white/75">Preparing your reports</span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full w-[76%] rounded-full bg-[#5ae2aa]" /></span>
            </div>
          </div>
        </div>
      </div>
      <div className="relative z-10 mx-4 rounded-2xl border border-[#8db7ff]/25 bg-[#0b2447]/95 px-5 py-4 text-center shadow-xl backdrop-blur-sm">
        <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-[#5ae2aa] text-[#0b2447]"><CheckIcon aria-hidden="true" className="size-5" /></span>
        <p className="mt-3 text-sm font-semibold text-white">From accounts to reports, faster</p>
        <p className="mt-1 text-xs text-[#b8c7dc]">Connected · calculated · ready</p>
      </div>
    </figure>
  );
}

function AccountIllustration() {
  const accounts = [
    { address: "0x8f…3b21", network: "Ethereum", symbol: "Ξ", state: "✓" },
    { address: "7dK9…mPqR", network: "Solana", symbol: "◎", state: "✓" },
    { address: "0x4c…9aE2", network: "Base", symbol: "B", state: "syncing" },
  ] as const;

  return (
    <figure aria-label="Illustrative connected account list" className="relative mx-auto w-full max-w-[420px]">
      <div aria-hidden="true" className="absolute inset-x-8 -top-5 h-full rotate-[-3deg] rounded-2xl bg-white/75" />
      <div className="relative rounded-2xl bg-white p-5 shadow-[0_12px_32px_rgba(7,27,57,0.18)] sm:p-6">
        <p className="text-sm font-semibold text-[#0b2447]">Your accounts</p>
        <div className="mt-4 space-y-3.5 sm:mt-5 sm:space-y-4">
          {accounts.map((account) => (
            <div key={account.address} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#e8f0ff] text-xs font-semibold text-[#174ea6]">{account.symbol}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-[#0b2447]">{account.address}</span>
                <span className="block text-xs text-[#536176]">{account.network}</span>
              </span>
              <span className={account.state === "syncing" ? "text-xs text-[#536176]" : "font-bold text-[#08764b]"}>{account.state}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-[#e8edf5]"><div className="h-full w-2/3 rounded-full bg-[#2f6df6]" /></div>
      </div>
    </figure>
  );
}

export function LegacyWorkflowPlatforms() {
  return (
    <>
      <div className="textured textured-light bg-[#f4f7fb]">
        <section id="how" className="scroll-mt-20 pt-16 pb-10 lg:pt-20 lg:pb-12">
          <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
            <div className="legacy-polish-card rounded-[24px] border border-[#dce4ee] bg-white p-6 shadow-[0_12px_36px_rgba(27,50,88,0.06)] sm:p-8 lg:p-10">
              <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
                <div className="flex flex-col items-start gap-6">
                  <h2 className="legacy-heading text-[32px] leading-[1.12] font-normal text-[#0b2447] min-[390px]:text-[34px] lg:text-[48px]">Get taxes off your mind.</h2>
                  <p className="max-w-[420px] text-lg leading-[1.6] font-medium text-[#536176]">Connect your accounts and Glide organizes your activity and calculates your result. Review the summary, then download your reports when you are ready.</p>
                  <div className="mt-4 flex items-center gap-4">
                    <div className="relative flex size-[78px] shrink-0 items-center justify-center rounded-2xl bg-[#2f6df6] text-2xl font-semibold text-white sm:size-[90px]">
                      <span className="absolute -top-5 left-3 whitespace-nowrap rounded-full bg-[#5ae2aa] px-3 py-1.5 text-[10px] font-bold tracking-[0.05em] text-[#0b2447] uppercase">Help when you want it</span>
                      G
                    </div>
                    <div>
                      <p className="text-base font-semibold text-[#0b2447]">Real support</p>
                      <p className="text-sm font-medium text-[#536176]">Answers from a person</p>
                    </div>
                  </div>
                </div>
                <WorkflowCanvas />
              </div>
            </div>
          </div>
        </section>

        <section id="integrations" className="relative scroll-mt-20 overflow-hidden pt-8 pb-16 lg:pt-10 lg:pb-20 xl:min-h-[760px] xl:pt-0 xl:pb-0">
          <div aria-hidden="true" className="absolute inset-0 hidden xl:block">
            {platforms.map(({ name, Mark, position }) => (
              <span key={name} className={`legacy-polish-card absolute flex items-center justify-center rounded-2xl border border-[#dce4ee] bg-white shadow-[0_8px_24px_rgba(27,50,88,0.06)] ${position}`}>
                <Mark size={35} />
              </span>
            ))}
          </div>
          <div className="relative z-10 mx-auto max-w-[760px] px-4 sm:px-6 xl:max-w-[680px] xl:pt-[220px]">
            <div className="flex flex-col items-center text-center">
              <div className="mb-8 grid grid-cols-6 gap-2 sm:gap-3 xl:hidden" aria-label="Supported platform examples">
                {platforms.slice(0, 6).map(({ name, Mark }) => (
                  <span key={name} title={name} className="legacy-polish-card flex size-10 items-center justify-center rounded-xl border border-[#dce4ee] bg-white shadow-sm min-[360px]:size-11 sm:size-12"><Mark size={23} /><span className="sr-only">{name}</span></span>
                ))}
              </div>
              <h2 className="legacy-heading mb-5 text-[32px] leading-[1.12] font-normal text-[#0b2447] min-[390px]:text-[36px] lg:text-[56px]">One clear result for your whole portfolio.</h2>
              <p className="max-w-[600px] text-lg leading-[1.6] font-medium text-[#536176]">Bring your supported exchanges, wallets, and chains into one place. See how your whole portfolio adds up, with a clear result to review.</p>
              <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_integrations" } }} className="legacy-primary-button mt-8">See my portfolio <ChevronRightIcon aria-hidden="true" className="size-3" /></TrackedLink>
              <div className="mt-8 grid grid-cols-6 gap-2 sm:gap-3 xl:hidden" aria-hidden="true">
                {platforms.slice(6).map(({ name, Mark }) => (
                  <span key={name} title={name} className="legacy-polish-card flex size-10 items-center justify-center rounded-xl border border-[#dce4ee] bg-white shadow-sm min-[360px]:size-11 sm:size-12"><Mark size={23} /></span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section id="trial" className="textured textured-navy-alt scroll-mt-20 bg-[#071b39] py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="legacy-trial-gradient relative min-h-[430px] overflow-hidden rounded-[24px] border border-white/10 lg:min-h-[450px]">
            <div className="grid h-full items-center gap-10 p-6 sm:p-8 lg:grid-cols-2 lg:gap-12 lg:p-12">
              <div className="order-2 flex items-center pt-5 lg:order-1 lg:h-full lg:pt-0"><AccountIllustration /></div>
              <div className="order-1 flex flex-col items-start justify-center gap-4 text-left lg:order-2">
                <h2 className="legacy-heading text-[34px] leading-[1.1] font-normal text-white min-[390px]:text-[38px] lg:text-[56px]">See your result free. Pay when you are ready to file.</h2>
                <p className="max-w-[500px] text-lg leading-[1.6] font-medium text-[#d5e3ff]">See your portfolio result and review it for free. Pay only when you are ready to download your tax reports.</p>
                <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_trial", plan: "Trial" } }} className="legacy-primary-button mt-3">See my result <ChevronRightIcon aria-hidden="true" className="size-3" /></TrackedLink>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
