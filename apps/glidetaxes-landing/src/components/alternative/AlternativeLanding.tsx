import { AlternativeHero } from "@/components/alternative/AlternativeHero";
import { LegacyRestoredSections } from "@/components/alternative/LegacyRestoredSections";

export function AlternativeLanding() {
  return (
    <main id="main-content" className="bg-white text-[#0b2447]">
      <AlternativeHero />
      <LegacyRestoredSections />
    </main>
  );
}
