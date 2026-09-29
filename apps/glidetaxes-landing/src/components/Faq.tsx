import { faqs } from "@/data/faqs";

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-heading" className="bg-cream py-20 lg:py-28">
      <div className="mx-auto w-full max-w-[900px] px-4">
        <p className="eyebrow text-center">Questions, answered</p>
        <h2 id="faq-heading" className="mt-3 mb-10 text-center font-heading text-[36px] leading-tight font-light text-ink-soft md:text-[50px]">
          The essentials before you start
        </h2>
        <div className="divide-y divide-border-soft border-y border-border-soft">
          {faqs.map((faq) => (
            <details key={faq.question} className="group">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 rounded-md px-3 py-5 font-heading text-xl text-ink-soft transition-colors hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-espresso md:text-2xl [&::-webkit-details-marker]:hidden">
                {faq.question}
                <span aria-hidden="true" className="text-2xl font-light text-graymute transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="max-w-[760px] px-3 pb-6 text-base leading-7 text-warmgray">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
