import { LegacyFaq, LegacyFooter } from "@/components/glide-landing/alternative/LegacyFaqFooter";
import { LegacyAccuracy, LegacyMethodology } from "@/components/glide-landing/alternative/LegacyMethodology";
import { LegacyPricing } from "@/components/glide-landing/alternative/LegacyPricing";
import { LegacyTrial, LegacyWorkflow } from "@/components/glide-landing/alternative/LegacyWorkflowPlatforms";

export function LegacyRestoredSections() {
  return (
    <div className="legacy-restored overflow-x-clip bg-[#f4f7fb] text-[#0b2447]">
      <LegacyMethodology />
      {/* "File with peace of mind", the workflow card and the platform ring share one light band. */}
      <div className="textured textured-light bg-[#f4f7fb]">
        <LegacyAccuracy />
        <LegacyWorkflow />
      </div>
      <LegacyTrial />
      {/* Pricing, the plan comparison and the FAQ read as one light band. */}
      <div className="textured textured-light-alt bg-[#f4f7fb]">
        <LegacyPricing />
        <LegacyFaq />
      </div>
      <LegacyFooter />
    </div>
  );
}
