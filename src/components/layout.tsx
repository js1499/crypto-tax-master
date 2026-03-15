"use client";

import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-[#F5F5F0] dark:bg-[#111111]">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto px-8 py-7 bg-white dark:bg-[#1A1A1A]">{children}</main>
      </div>
    </div>
  );
}
