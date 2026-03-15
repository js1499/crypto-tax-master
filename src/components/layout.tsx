"use client";

import { AppSidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <Header />
        <main className="flex-1 overflow-y-auto px-8 py-7 bg-white dark:bg-[#1A1A1A]">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
