import { AnimatedHeroWorkflow } from "@/components/alternative/AnimatedHeroWorkflow";

export function ImmersiveHeroScene() {
  return (
    <figure
      aria-labelledby="alternative-hero-visual-label"
      className="alternative-hero-scene relative mx-auto h-[440px] w-full max-w-[900px] sm:h-[560px] lg:h-[570px]"
    >
      <figcaption id="alternative-hero-visual-label" className="sr-only">
        Illustrative Glide portfolio calculation showing accounts syncing, profit and loss calculated for each account, and a combined portfolio profit.
      </figcaption>
      <AnimatedHeroWorkflow />
    </figure>
  );
}
