import { ShieldPlainIcon } from "@/components/glide-landing/icons";

export function MoneyBackGuarantee({ placement }: { placement: "hero" | "pricing" }) {
  const isHero = placement === "hero";
  const Heading = isHero ? "p" : "h3";

  return (
    <div
      data-testid={`${placement}-guarantee`}
      className={
        isHero
          ? "flex min-h-14 items-center gap-2.5 rounded-full border border-[#173b70] bg-[#0b2447] py-2 pr-5 pl-2.5 text-white shadow-[0_20px_44px_-16px_rgba(11,36,71,0.62)] sm:min-h-[72px] sm:gap-4 sm:pr-8 sm:pl-3.5 lg:min-h-[88px] lg:gap-5 lg:pr-11 lg:pl-4"
          : "mx-auto flex max-w-[760px] flex-col items-center gap-4 rounded-2xl border border-[#a6dec4] bg-[#e6f8ef] p-5 text-center text-[#0b2447] shadow-[0_8px_24px_rgba(8,118,75,0.06)] sm:flex-row sm:gap-5 sm:px-7 sm:py-6 sm:text-left"
      }
    >
      <span className={`flex shrink-0 items-center justify-center rounded-full ${isHero ? "size-9 bg-[#5ae2aa] text-[#0b2447] sm:size-12 lg:size-[60px]" : "size-14 bg-[#08764b] text-white"}`}>
        <ShieldPlainIcon aria-hidden="true" className={isHero ? "size-5 sm:size-[26px] lg:size-8" : "size-7"} />
      </span>
      <div className="min-w-0">
        <Heading className={isHero ? "text-[15px] leading-tight font-bold tracking-[-0.01em] sm:text-[23px] lg:text-[30px]" : "text-[23px] leading-tight font-extrabold tracking-[-0.025em] sm:text-[26px]"}>
          {isHero ? "Accurate taxes or your money back." : "Money-back guarantee"}
        </Heading>
        {!isHero && (
          <>
            <p className="mt-2 text-base leading-6 font-semibold text-[#175a40]">Accurate taxes or your money back. On every paid plan.</p>
            <p className="mt-1 text-xs leading-5 text-[#435f53]">Eligibility terms are shown at purchase.</p>
          </>
        )}
      </div>
    </div>
  );
}
