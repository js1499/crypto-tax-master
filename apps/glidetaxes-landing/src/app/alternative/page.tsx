import type { Metadata } from "next";
import { AlternativeHeader } from "@/components/alternative/AlternativeHeader";
import { AlternativeLanding } from "@/components/alternative/AlternativeLanding";

export const metadata: Metadata = {
  title: "Crypto Taxes Made Simple | Glide",
  description:
    "Finish crypto taxes faster with a clear review and accurate reports. Money-back guarantee applies to paid plans.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AlternativePage() {
  return (
    <>
      <AlternativeHeader />
      <AlternativeLanding />
    </>
  );
}
