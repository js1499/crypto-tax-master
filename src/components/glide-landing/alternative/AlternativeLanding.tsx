import { AlternativeHero } from "@/components/glide-landing/alternative/AlternativeHero";
import { LegacyRestoredSections } from "@/components/glide-landing/alternative/LegacyRestoredSections";

export function AlternativeLanding() {
  return (
    <main id="main-content" className="bg-white text-[#0b2447]">
      <AlternativeHero />
      <LegacyRestoredSections />
    </main>
  );
}
