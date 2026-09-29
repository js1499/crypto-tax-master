"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import GlideLogo from "@/components/GlideLogo";
import { TrackedLink } from "@/components/TrackedLink";
import {
  ChevronDownIcon,
  MenuIcon,
  XMarkIcon,
} from "@/components/icons";
import {
  primaryNavigation,
  resourceNavigation,
  siteConfig,
} from "@/lib/site";

export default function Header() {
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const resourcesButtonRef = useRef<HTMLButtonElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const mobilePanelRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node)) {
        setResourcesOpen(false);
        setMobileOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;

      if (mobileOpen) {
        setMobileOpen(false);
        mobileButtonRef.current?.focus();
      } else if (resourcesOpen) {
        setResourcesOpen(false);
        resourcesButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, resourcesOpen]);

  useEffect(() => {
    if (!mobileOpen) return;
    mobilePanelRef.current
      ?.querySelector<HTMLElement>("a, button")
      ?.focus();
  }, [mobileOpen]);

  const openResources = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    setResourcesOpen(true);
  };

  const scheduleResourcesClose = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setResourcesOpen(false), 160);
  };

  return (
    <header
      ref={headerRef}
      className="sticky inset-x-0 top-0 z-[100] border-b border-border-soft/70 bg-white/95 shadow-[0_8px_28px_rgba(4,47,36,0.06)] backdrop-blur-xl"
    >
      <div className="relative mx-auto flex h-[72px] max-w-[1200px] items-center justify-between px-4">
        <Link
          href="/"
          aria-label="Glide home"
          className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-mid"
        >
          <GlideLogo variant="dark" withWordmark size={31} />
        </Link>

        <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
          {primaryNavigation.map((item) =>
            item.href === "/pricing" ? (
              <Link
                key={item.label}
                href={item.href}
                className="rounded-full px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand-mid"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={item.href}
                className="rounded-full px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand-mid"
              >
                {item.label}
              </a>
            ),
          )}

          <div
            className="relative"
            onMouseEnter={openResources}
            onMouseLeave={scheduleResourcesClose}
          >
            <button
              ref={resourcesButtonRef}
              type="button"
              aria-expanded={resourcesOpen}
              aria-controls="resources-menu"
              onClick={() => setResourcesOpen((open) => !open)}
              className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-ink-soft transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand-mid"
            >
              Resources
              <ChevronDownIcon
                aria-hidden="true"
                className={`ml-2 h-3 w-3 transition-transform ${resourcesOpen ? "rotate-180" : ""}`}
              />
            </button>
            <div
              id="resources-menu"
              className={`absolute top-[calc(100%+10px)] right-0 w-[310px] rounded-2xl border border-border-soft bg-white p-2 shadow-[0_20px_50px_rgba(4,47,36,0.14)] transition ${
                resourcesOpen
                  ? "visible translate-y-0 opacity-100"
                  : "pointer-events-none invisible -translate-y-1 opacity-0"
              }`}
            >
              {resourceNavigation.map((item) => (
                <TrackedLink
                  key={item.label}
                  href={item.href}
                  event={{
                    name: "resource_click",
                    properties: { destination: item.href },
                  }}
                  onClick={() => setResourcesOpen(false)}
                  className="block rounded-xl px-4 py-3 transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand-mid"
                >
                  <span className="block text-sm font-semibold text-ink">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-graymute">
                    {item.description}
                  </span>
                </TrackedLink>
              ))}
            </div>
          </div>
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <TrackedLink
            href={siteConfig.appRoutes.login}
            event={{ name: "login_click", properties: { location: "header" } }}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-ink-soft transition-colors hover:bg-cream focus-visible:outline-2 focus-visible:outline-brand-mid"
          >
            Sign in
          </TrackedLink>
          <TrackedLink
            href={siteConfig.appRoutes.register}
            event={{
              name: "register_click",
              properties: { location: "header" },
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-cocoa px-5 text-sm font-semibold text-white shadow-[0_4px_12px_rgba(4,47,36,0.2)] transition hover:-translate-y-0.5 hover:bg-espresso focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-mid"
          >
            Get started free
          </TrackedLink>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <TrackedLink
            href={siteConfig.appRoutes.register}
            event={{
              name: "register_click",
              properties: { location: "mobile_header" },
            }}
            className="inline-flex min-h-11 items-center justify-center rounded-[10px] bg-cocoa px-3.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-brand-mid sm:px-4"
          >
            Start free
          </TrackedLink>
          <button
            ref={mobileButtonRef}
            type="button"
            aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMobileOpen((open) => !open)}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[10px] border border-border-soft bg-white text-ink focus-visible:outline-2 focus-visible:outline-brand-mid"
          >
            {mobileOpen ? (
              <XMarkIcon aria-hidden="true" className="h-5 w-5" />
            ) : (
              <MenuIcon aria-hidden="true" className="h-5 w-5" />
            )}
          </button>
        </div>
      </div>

      <div
        id="mobile-navigation"
        ref={mobilePanelRef}
        className={`border-t border-border-soft bg-white px-4 pb-5 lg:hidden ${
          mobileOpen ? "block" : "hidden"
        }`}
      >
        <nav aria-label="Mobile navigation" className="mx-auto max-w-[1200px] pt-3">
          {primaryNavigation.map((item) =>
            item.href === "/pricing" ? (
              <Link
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex min-h-12 items-center border-b border-border-soft/60 text-base font-medium text-ink"
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className="flex min-h-12 items-center border-b border-border-soft/60 text-base font-medium text-ink"
              >
                {item.label}
              </a>
            ),
          )}
          <p className="mt-5 text-xs font-semibold tracking-[0.14em] text-graymute uppercase">
            Resources
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {resourceNavigation.map((item) => (
              <TrackedLink
                key={item.label}
                href={item.href}
                event={{
                  name: "resource_click",
                  properties: { destination: item.href },
                }}
                onClick={() => setMobileOpen(false)}
                className="flex min-h-12 items-center rounded-xl bg-cream px-3 text-sm font-medium text-ink"
              >
                {item.label}
              </TrackedLink>
            ))}
          </div>
          <TrackedLink
            href={siteConfig.appRoutes.login}
            event={{
              name: "login_click",
              properties: { location: "mobile_menu" },
            }}
            onClick={() => setMobileOpen(false)}
            className="mt-4 flex min-h-12 items-center justify-center rounded-xl border border-border-soft text-sm font-semibold text-ink"
          >
            Sign in
          </TrackedLink>
        </nav>
      </div>
    </header>
  );
}
