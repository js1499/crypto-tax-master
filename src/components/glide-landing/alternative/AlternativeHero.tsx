import { FilingWorkflowAnimation } from "@/components/glide-landing/alternative/FilingWorkflowAnimation";
import { MoneyBackGuarantee } from "@/components/glide-landing/alternative/MoneyBackGuarantee";
import { RotatingWord } from "@/components/glide-landing/alternative/RotatingWord";
import { ChevronRightIcon } from "@/components/glide-landing/icons";
import { TrackedLink } from "@/components/glide-landing/TrackedLink";

export function AlternativeHero() {
  return (
    <section id="hero" className="alternative-hero-surface relative isolate overflow-hidden text-[#0b2447]">
      <div className="relative mx-auto flex max-w-[1320px] flex-col items-center gap-10 px-4 pt-9 pb-12 sm:gap-12 sm:pt-12 sm:pb-16 lg:gap-14 lg:px-8 lg:pt-14 lg:pb-16 xl:pt-16 xl:pb-20">
        <div className="alternative-hero-copy relative z-20 flex w-full min-w-0 flex-col items-center text-center">
          <div className="mb-5 sm:mb-6 lg:mb-7">
            <MoneyBackGuarantee placement="hero" />
          </div>
          <h1 className="max-w-[1100px] text-[40px] leading-[1.02] font-bold tracking-[-0.025em] text-balance text-[#0b2447] min-[360px]:text-[44px] sm:text-[48px] md:text-[56px] lg:text-[64px] lg:leading-none xl:text-[76px]">
            Crypto taxes, made{" "}
            <span className="sr-only">simple.</span>
            <RotatingWord />
          </h1>
          <p
            data-testid="hero-supporting-copy"
            className="mt-4 max-w-[640px] text-[20px] leading-[1.4] font-semibold text-[#0b2447] sm:mt-5 sm:text-[23px] lg:mt-6 lg:max-w-[820px] lg:text-[27px] lg:leading-[1.4] xl:max-w-[980px] xl:text-[32px] xl:leading-[1.3]"
          >
            Spend up to 95% less time on crypto taxes, accurately.
          </p>

          <div className="mt-7 w-full sm:mt-8 sm:w-auto lg:mt-9">
            <TrackedLink
              href="/register"
              event={{ name: "register_click", properties: { location: "alternative_hero" } }}
              className="inline-flex min-h-[52px] w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-xl bg-[#2f6df6] px-7 text-[17px] font-bold text-white shadow-[0_12px_26px_-12px_rgba(19,64,156,0.4)] transition-colors hover:bg-[#225bd9] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#174ea6] sm:w-auto lg:min-h-[56px] lg:px-8 lg:text-[18px]"
            >
              Get started free <ChevronRightIcon aria-hidden="true" className="size-4" />
            </TrackedLink>
          </div>
        </div>

        <div className="alternative-hero-visual relative z-10 w-full max-w-[1080px] min-w-0 rounded-[18px] shadow-[0_32px_80px_-32px_rgba(11,36,71,0.45)] sm:rounded-[24px]">
          <FilingWorkflowAnimation />
        </div>
      </div>
    </section>
  );
}
