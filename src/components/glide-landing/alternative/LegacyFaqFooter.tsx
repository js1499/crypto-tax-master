import Link from "next/link";
import GlideLogo from "@/components/glide-landing/GlideLogo";
import { ChevronRightIcon } from "@/components/glide-landing/icons";
import { TrackedLink } from "@/components/glide-landing/TrackedLink";
import { faqs } from "@/components/glide-landing/data/faqs";
import { resourceNavigation } from "@/components/glide-landing/lib/site";

const productLinks = [
  { label: "How it works", href: "#how" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const;

const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;

export function LegacyFaq() {
  return (
    <section id="faq" aria-labelledby="legacy-faq-heading" className="scroll-mt-20 pt-10 pb-16 lg:pt-12 lg:pb-20">
      <div className="mx-auto w-full max-w-[900px] px-4 sm:px-6">
        <h2 id="legacy-faq-heading" className="legacy-heading mb-10 text-center text-[32px] leading-[1.15] font-normal text-[#0b2447] min-[390px]:text-[36px] md:mb-12 md:text-[48px]">Questions before you connect?</h2>
        <div className="border-b border-[#d6dee9]">
          {faqs.map((faq) => (
            <details key={faq.question} className="group border-t border-[#d6dee9]">
              <summary className="flex min-h-[72px] cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-2 py-5 text-left transition-colors hover:bg-[#e8f0ff] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2f6df6] sm:min-h-20 sm:px-6 [&::-webkit-details-marker]:hidden">
                <span className="legacy-heading text-[18px] leading-snug font-normal text-[#0b2447] min-[390px]:text-[20px] md:text-[24px] md:leading-9">{faq.question}</span>
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#e8f0ff] text-2xl font-light text-[#174ea6] transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="max-w-[760px] px-2 pt-1 pb-7 text-base leading-7 text-[#536176] sm:px-6">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function LegacyFooter() {
  return (
    <>
      <section className="textured textured-navy-alt bg-[#071b39] py-16 lg:py-20">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="legacy-final-cta relative overflow-hidden rounded-[24px] border border-[#8db7ff]/20 bg-[#071b39] py-12 sm:py-16 lg:py-20">
            <div className="relative z-10 flex flex-col items-center px-6 text-center sm:px-8">
              <p className="text-xs font-semibold tracking-[0.16em] text-[#5ae2aa] uppercase">Start free</p>
              <h2 className="legacy-heading mt-4 mb-4 max-w-[780px] text-[29px] leading-[1.15] font-normal text-white min-[390px]:text-[32px] lg:text-[42px]">Ready to put tax season behind you?</h2>
              <p className="max-w-[620px] text-lg leading-[1.6] text-[#b8c7dc]">Start free, get a clear picture of your result, and take tax prep off your to-do list.</p>
              <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "legacy_final_cta" } }} className="mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#5ae2aa] px-8 text-base font-semibold text-[#0b2447] transition-colors hover:bg-[#8bedc5] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">Get started free <ChevronRightIcon aria-hidden="true" className="size-3" /></TrackedLink>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-[#f4f7fb] py-10 sm:py-12">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-6">
          <div className="rounded-[24px] border border-[#dce4ee] bg-white p-6 text-[#0b2447] sm:p-8 md:p-10">
            <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
              <div>
                <GlideLogo withWordmark size={28} />
                <p className="legacy-heading mt-5 max-w-[360px] text-2xl leading-8 text-[#0b2447]">Crypto taxes, with peace of mind.</p>
              </div>
              <nav aria-label="Restored product navigation">
                <p className="text-xs font-semibold tracking-[0.12em] text-[#536176] uppercase">Product</p>
                <div className="mt-4 flex flex-col items-start gap-1">
                  {productLinks.map((item) => <a key={item.href} href={item.href} className="legacy-footer-link">{item.label}</a>)}
                  <TrackedLink href="/login" event={{ name: "login_click", properties: { location: "legacy_footer" } }} className="legacy-footer-link">Sign in</TrackedLink>
                </div>
              </nav>
              <nav aria-label="Restored resources and legal navigation">
                <p className="text-xs font-semibold tracking-[0.12em] text-[#536176] uppercase">Resources</p>
                <div className="mt-4 flex flex-col items-start gap-1">
                  {resourceNavigation.map((item) => (
                    <TrackedLink key={item.href} href={item.href} event={{ name: "resource_click", properties: { destination: item.href } }} className="legacy-footer-link">{item.label}</TrackedLink>
                  ))}
                  {legalLinks.map((item) => <Link key={item.href} href={item.href} className="legacy-footer-link">{item.label}</Link>)}
                </div>
              </nav>
            </div>
            <div className="mt-10 border-t border-[#dce4ee] pt-6 text-sm leading-6 text-[#536176]">© {new Date().getFullYear()} Glide. All rights reserved.</div>
          </div>
        </div>
      </footer>
    </>
  );
}
