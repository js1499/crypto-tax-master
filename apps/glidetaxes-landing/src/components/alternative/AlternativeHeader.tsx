"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import GlideLogo from "@/components/GlideLogo";
import { MenuIcon, XMarkIcon } from "@/components/icons";
import { TrackedLink } from "@/components/TrackedLink";

const navigation = [
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#pricing" },
  { label: "How it works", href: "#how" },
  { label: "FAQ", href: "#faq" },
] as const;

export function AlternativeHeader() {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    buttonRef.current?.setAttribute("data-hydrated", "true");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !open) return;
      setOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>("a")?.focus();
    }, 100);

    return () => window.clearTimeout(focusTimer);
  }, [open]);

  return (
    <header className="legacy-navigation sticky top-0 z-[100] border-b border-[#7ca8ff]/15 bg-[#071b39]/95 text-white backdrop-blur-xl">
      <div className="mx-auto flex h-[70px] max-w-[1200px] items-center justify-between px-4 sm:px-6">
        <Link href="/alternative" aria-label="Glide alternative design home" className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#8db7ff]">
          <GlideLogo variant="light" size={31} />
        </Link>

        <nav aria-label="Alternative design navigation" className="hidden items-center gap-1 lg:flex">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-medium text-[#d5e3ff] transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#8db7ff]">{item.label}</a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <TrackedLink href="/login" event={{ name: "login_click", properties: { location: "alternative_header" } }} className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-medium text-[#d5e3ff] hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-[#8db7ff]">Sign in</TrackedLink>
          <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "alternative_header" } }} className="legacy-primary-button px-5">Start free</TrackedLink>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <TrackedLink href="/register" event={{ name: "register_click", properties: { location: "alternative_mobile_header" } }} className="inline-flex min-h-11 items-center rounded-[10px] bg-[#2f6df6] px-3.5 text-sm font-semibold text-white focus-visible:outline-2 focus-visible:outline-[#8db7ff]">Start free</TrackedLink>
          <button
            ref={buttonRef}
            type="button"
            aria-label={open ? "Close alternative navigation" : "Open alternative navigation"}
            aria-expanded={open}
            aria-controls="alternative-mobile-navigation"
            data-hydrated="false"
            onClick={() => setOpen((current) => !current)}
            className="inline-flex size-11 items-center justify-center rounded-[10px] border border-white/15 bg-white/10 text-white focus-visible:outline-2 focus-visible:outline-[#8db7ff]"
          >
            {open ? <XMarkIcon aria-hidden="true" className="size-5" /> : <MenuIcon aria-hidden="true" className="size-5" />}
          </button>
        </div>
      </div>

      <div id="alternative-mobile-navigation" ref={panelRef} className={open ? "border-t border-white/10 bg-[#071b39] px-4 pb-5 lg:hidden" : "hidden"}>
        <nav aria-label="Alternative mobile navigation" className="mx-auto max-w-[1200px] pt-2">
          {navigation.map((item) => (
            <a key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-12 items-center border-b border-white/10 text-base font-medium text-[#d5e3ff] focus-visible:outline-2 focus-visible:outline-[#8db7ff]">{item.label}</a>
          ))}
          <TrackedLink href="/login" event={{ name: "login_click", properties: { location: "alternative_mobile_menu" } }} onClick={() => setOpen(false)} className="mt-4 flex min-h-12 items-center justify-center rounded-lg border border-white/15 text-sm font-semibold text-white">Sign in</TrackedLink>
        </nav>
      </div>
    </header>
  );
}
