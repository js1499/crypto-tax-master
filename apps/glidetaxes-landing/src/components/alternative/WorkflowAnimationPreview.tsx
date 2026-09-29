import { FilingWorkflowAnimation } from "@/components/alternative/FilingWorkflowAnimation";

export function WorkflowAnimationPreview() {
  return (
    <section
      id="hero-animation-preview"
      aria-labelledby="animation-preview-heading"
      className="scroll-mt-24 bg-[#f6f2e7] px-4 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-[680px]">
        <div className="mb-8 text-center sm:mb-10">
          <p className="text-xs font-semibold tracking-[0.16em] text-[#705f52] uppercase">Alternative concept</p>
          <h2 id="animation-preview-heading" className="mt-3 text-[30px] leading-tight font-bold tracking-[-0.035em] text-[#291d16] sm:text-[40px]">
            New hero animation
          </h2>
        </div>
        <FilingWorkflowAnimation />
      </div>
    </section>
  );
}
