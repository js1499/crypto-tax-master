import { LegacyFaqFooter } from "@/components/glide-landing/alternative/LegacyFaqFooter";
import { LegacyMethodology } from "@/components/glide-landing/alternative/LegacyMethodology";
import { LegacyPricing } from "@/components/glide-landing/alternative/LegacyPricing";
import { LegacyWorkflowPlatforms } from "@/components/glide-landing/alternative/LegacyWorkflowPlatforms";

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
