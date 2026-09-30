import { ShieldPlainIcon } from "@/components/glide-landing/icons";

// The same navy seal in both places. Pricing adds the terms line under the statement.
export function MoneyBackGuarantee({ placement }: { placement: "hero" | "pricing" }) {
  const isHero = placement === "hero";
  const Heading = isHero ? "p" : "h3";

  return (
    <div
      data-testid={`${placement}-guarantee`}
      className={
        isHero
          ? "flex min-h-14 items-center gap-2.5 rounded-full border border-[#173b70] bg-[#0b2447] py-2 pr-5 pl-2.5 text-white shadow-[0_20px_44px_-16px_rgba(11,36,71,0.62)] sm:min-h-[72px] sm:gap-4 sm:pr-8 sm:pl-3.5 lg:min-h-[88px] lg:gap-5 lg:pr-11 lg:pl-4"
          : "mx-auto flex w-fit max-w-full items-center gap-3.5 rounded-[28px] border border-[#173b70] bg-[#0b2447] py-3.5 pr-5 pl-3.5 text-left text-white shadow-[0_20px_44px_-16px_rgba(11,36,71,0.62)] sm:gap-4 sm:rounded-full sm:py-3.5 sm:pr-9 sm:pl-3.5 lg:gap-5 lg:py-4 lg:pr-12 lg:pl-4"
      }
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full bg-[#5ae2aa] text-[#0b2447] ${isHero ? "size-9 sm:size-12 lg:size-[60px]" : "size-11 sm:size-14 lg:size-[64px]"}`}>
        <ShieldPlainIcon aria-hidden="true" className={isHero ? "size-5 sm:size-[26px] lg:size-8" : "size-6 sm:size-7 lg:size-[34px]"} />
      </span>
      <div className="min-w-0">
        <Heading className={`leading-tight font-bold tracking-[-0.01em] ${isHero ? "text-[15px] sm:text-[23px] lg:text-[30px]" : "text-[17px] sm:text-[23px] lg:text-[30px]"}`}>
          Accurate taxes or your money back.
        </Heading>
        {!isHero && (
          <p className="mt-1 text-xs leading-5 font-medium text-[#b8c7dc] sm:text-sm lg:text-[15px]">On every paid plan. Eligibility terms are shown at purchase.</p>
        )}
      </div>
    </div>
  );
}
