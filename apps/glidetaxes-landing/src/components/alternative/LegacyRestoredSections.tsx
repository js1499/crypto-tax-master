import { LegacyFaqFooter } from "@/components/alternative/LegacyFaqFooter";
import { LegacyMethodology } from "@/components/alternative/LegacyMethodology";
import { LegacyPricing } from "@/components/alternative/LegacyPricing";
import { LegacyWorkflowPlatforms } from "@/components/alternative/LegacyWorkflowPlatforms";

export function LegacyRestoredSections() {
  return (
    <div className="legacy-restored overflow-x-clip bg-[#f4f7fb] text-[#0b2447]">
      <LegacyMethodology />
      <LegacyWorkflowPlatforms />
      <LegacyPricing />
      <LegacyFaqFooter />
    </div>
  );
}
