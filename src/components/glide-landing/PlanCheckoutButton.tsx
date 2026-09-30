"use client";

import { useState, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { reportLandingEvent } from "@/components/glide-landing/TrackedLink";

export type PlanKey = "starter" | "active" | "pro" | "prime";

// Mirrors the home page's pricing buttons (public/landing/landing.js): start Stripe checkout for
// the plan; a signed-out visitor is sent to register with the plan carried along, and /register
// resumes checkout from that parameter.
export function PlanCheckoutButton({
  planKey,
  location,
  className,
  children,
}: {
  planKey: PlanKey;
  location: string;
  className?: string;
  children: ReactNode;
}) {
  const { status } = useSession();
  const [pending, setPending] = useState(false);

  const continueWithoutCheckout = () => {
    const plan = encodeURIComponent(planKey);
    window.location.href = status === "authenticated" ? `/settings?tab=billing&plan=${plan}` : `/register?plan=${plan}`;
  };

  const handleClick = async () => {
    reportLandingEvent({ name: "checkout_click", properties: { location, plan: planKey } });
    setPending(true);
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planKey }),
      });
      const data = (await response.json()) as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (response.status === 401) {
        continueWithoutCheckout();
        return;
      }
      window.alert(data.error || "Something went wrong. Please try again.");
      setPending(false);
    } catch {
      continueWithoutCheckout();
    }
  };

  return (
    <button type="button" data-plan={planKey} onClick={handleClick} disabled={pending} aria-busy={pending} className={className}>
      {pending ? "Redirecting…" : children}
    </button>
  );
}
