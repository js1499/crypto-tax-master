"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";

export type AnalyticsEvent =
  | { name: "register_click"; properties: { location: string; plan?: string } }
  | { name: "checkout_click"; properties: { location: string; plan: string } }
  | { name: "login_click"; properties: { location: string } }
  | { name: "open_app_click"; properties: { location: string } }
  | { name: "pricing_compare_click"; properties: { location: string } }
  | { name: "resource_click"; properties: { destination: string } };

type TrackedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
  href: string;
  event: AnalyticsEvent;
  children: ReactNode;
};

// Where the home page sends a signed-in visitor ("Open Glide").
export const signedInHome = "/accounts";

// Reports landing-page clicks through the gtag the product already loads (Google Ads / GA4);
// a no-op when it is absent, e.g. in tests or behind an ad blocker.
export function reportLandingEvent(event: AnalyticsEvent) {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") gtag("event", event.name, event.properties);
}

export function TrackedLink({ href, event, children, onClick, ...props }: TrackedLinkProps) {
  const { status } = useSession();
  // Like the home page, a signed-in visitor is taken to the app rather than to sign-up.
  const target = status === "authenticated" && href === "/register" ? signedInHome : href;
  const handleClick = (clickEvent: React.MouseEvent<HTMLAnchorElement>) => {
    reportLandingEvent(event);
    onClick?.(clickEvent);
  };
  if (target.startsWith("#")) {
    return (
      <a href={target} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={target} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
