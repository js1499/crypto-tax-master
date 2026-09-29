import Link from "next/link";
import GlideLogo from "@/components/GlideLogo";
import { TrackedLink } from "@/components/TrackedLink";
import { resourceNavigation } from "@/lib/site";

const legalLinks = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
] as const;

export default function Footer() {
  return (
    <footer className="bg-cream px-4 pb-6">
      <div className="mx-auto max-w-[1200px] rounded-3xl bg-espresso px-7 py-12 text-white md:px-10">
        <div className="grid gap-10 md:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <GlideLogo variant="light" withWordmark size={26} />
            <p className="mt-5 max-w-[330px] font-heading text-2xl leading-8 text-cream">
              Crypto tax organization for every portfolio and level of activity.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">Product</p>
            <div className="mt-4 flex flex-col items-start gap-2">
              <Link href="/#how" className="footer-link">How it works</Link>
              <Link href="/#integrations" className="footer-link">Integrations</Link>
              <Link href="/pricing" className="footer-link">Pricing</Link>
              <TrackedLink href="/login" event={{ name: "login_click", properties: { location: "footer" } }} className="footer-link">Sign in</TrackedLink>
            </div>
          </nav>
          <nav aria-label="Resources and legal">
            <p className="text-xs font-semibold tracking-[0.12em] text-white/70 uppercase">Resources</p>
            <div className="mt-4 flex flex-col items-start gap-2">
              {resourceNavigation.map((item) => (
                <TrackedLink key={item.href} href={item.href} event={{ name: "resource_click", properties: { destination: item.href } }} className="footer-link">
                  {item.label}
                </TrackedLink>
              ))}
              {legalLinks.map((item) => (
                <a key={item.href} href={item.href} className="footer-link">{item.label}</a>
              ))}
            </div>
          </nav>
        </div>
        <div className="mt-12 border-t border-white/20 pt-6 text-sm text-white/70">
          © {new Date().getFullYear()} Glide. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
