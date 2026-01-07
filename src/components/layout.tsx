"use client";

import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen bg-white dark:bg-gray-950">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-white dark:bg-gray-950">{children}</main>
      </div>
    </div>
  );
}
