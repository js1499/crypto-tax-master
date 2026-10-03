import { Hanken_Grotesk } from "next/font/google";
import { AlternativeHeader } from "@/components/glide-landing/alternative/AlternativeHeader";
import { AlternativeLanding } from "@/components/glide-landing/alternative/AlternativeLanding";
import { RevealOnView } from "@/components/glide-landing/RevealOnView";
import "@/components/glide-landing/glide-landing.css";

const brandFont = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-brand",
});

/** The Glide marketing landing page: served at / (the home page) and at /lp/d. */
export function GlideLandingPage() {
  return (
    <div className={`glide-landing ${brandFont.variable}`}>
      <AlternativeHeader />
      <AlternativeLanding />
      <RevealOnView />
    </div>
  );
}
