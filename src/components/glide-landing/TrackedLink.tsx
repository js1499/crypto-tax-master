"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import Link from "next/link";

type AnalyticsEvent =
  | { name: "register_click"; properties: { location: string; plan?: string } }
  | { name: "login_click"; properties: { location: string } }
  | { name: "pricing_compare_click"; properties: { location: string } }
  | { name: "resource_click"; properties: { destination: string } };

type TrackedLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "children"> & {
  href: string;
  event: AnalyticsEvent;
  children: ReactNode;
};

// Reports landing-page clicks through the gtag the product already loads (Google Ads / GA4);
// a no-op when it is absent, e.g. in tests or behind an ad blocker.
function report(event: AnalyticsEvent) {
  const gtag = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag;
  if (typeof gtag === "function") gtag("event", event.name, event.properties);
}

export function TrackedLink({ href, event, children, onClick, ...props }: TrackedLinkProps) {
  const handleClick = (clickEvent: React.MouseEvent<HTMLAnchorElement>) => {
    report(event);
    onClick?.(clickEvent);
  };
  if (href.startsWith("#")) {
    return (
      <a href={href} onClick={handleClick} {...props}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} onClick={handleClick} {...props}>
      {children}
    </Link>
  );
}
