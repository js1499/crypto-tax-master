"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { track } from "@vercel/analytics";
import Link from "next/link";

type AnalyticsEvent =
  | {
      name: "register_click";
      properties: { location: string; plan?: string };
    }
  | { name: "login_click"; properties: { location: string } }
  | { name: "pricing_compare_click"; properties: { location: string } }
  | { name: "resource_click"; properties: { destination: string } };

type TrackedLinkProps = Omit<
  AnchorHTMLAttributes<HTMLAnchorElement>,
  "href" | "children"
> & {
  href: string;
  event: AnalyticsEvent;
  children: ReactNode;
};

export function TrackedLink({
  href,
  event,
  children,
  onClick,
  ...props
}: TrackedLinkProps) {
  const linkProps = {
    href,
    onClick: (clickEvent: React.MouseEvent<HTMLAnchorElement>) => {
      track(event.name, event.properties);
      onClick?.(clickEvent);
    },
    ...props,
  };

  if (href.startsWith("/pricing")) {
    return <Link {...linkProps}>{children}</Link>;
  }

  return (
    <a {...linkProps}>{children}</a>
  );
}
