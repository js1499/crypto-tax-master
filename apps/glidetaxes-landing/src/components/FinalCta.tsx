import { ChevronRightIcon } from "@/components/icons";
import { TrackedLink } from "@/components/TrackedLink";

export default function FinalCta() {
  return (
    <section className="bg-cream px-4 pb-20">
      <div className="cta-surface relative mx-auto max-w-[1200px] overflow-hidden rounded-3xl px-6 py-16 text-center text-white lg:py-20">
        <div className="relative z-10 mx-auto max-w-[720px]">
          <p className="text-sm font-semibold tracking-[0.12em] text-brand uppercase">Ready when you are</p>
          <h2 className="mt-4 font-heading text-[36px] leading-[1.08] font-light md:text-[54px]">
            Every transaction identified, effortlessly.
          </h2>
          <p className="mx-auto mt-5 max-w-[560px] text-base leading-7 text-white/80">
            Connect accounts across your portfolio, review the details, and move toward tax-ready reports with a workflow built for clarity.
          </p>
          <TrackedLink
            href="/register"
            event={{ name: "register_click", properties: { location: "final_cta" } }}
            className="button-brand mt-8"
          >
            Get started free
            <ChevronRightIcon aria-hidden="true" className="text-xs" />
          </TrackedLink>
        </div>
      </div>
    </section>
  );
}
