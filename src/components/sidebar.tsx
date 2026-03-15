"use client";

import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BarChart2,
  FileText,
  Landmark,
  Settings,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";

const navItems = [
  { title: "Portfolio", href: "/", icon: BarChart2 },
  { title: "Accounts", href: "/accounts", icon: Landmark },
  { title: "Transactions", href: "/transactions", icon: Wallet },
  { title: "Tax Reports", href: "/tax-reports", icon: FileText },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  const toggleSidebar = () => {
    setCollapsed(!collapsed);
  };

  // Use direct navigation handlers for all pages to ensure consistency with static export
  const handleNavigation = (path: string) => {
    console.log(`Navigating to ${path}`);
    // Ensure there's a trailing slash to match Next.js config (trailingSlash: true)
    const pathWithTrailingSlash = path.endsWith("/") ? path : `${path}/`;
    window.location.href = `${window.location.origin}${pathWithTrailingSlash}`;
  };

  // Check if a path is active, including nested paths
  const isActivePath = (itemPath: string, currentPath: string) => {
    if (itemPath === "/") {
      return currentPath === "/";
    }
    return currentPath.startsWith(itemPath);
  };

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col border-r border-[#F0F0EB] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] pb-12 transition-all duration-200",
        collapsed ? "w-20" : "w-[260px]"
      )}
    >
      {/* Logo block */}
      <div className="flex h-14 items-center border-b border-[#F0F0EB] dark:border-[#2A2A2A] px-4 justify-between">
        {!collapsed && (
          <button
            onClick={() => handleNavigation("/")}
            className="flex items-center text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5] pl-3"
          >
            <span>Crypto Tax</span>
          </button>
        )}
        {collapsed && (
          <div className="flex-1 flex justify-center">
            <button
              onClick={toggleSidebar}
              className="rounded-full p-1 text-[#6B7280] hover:bg-[#F5F5F0] dark:hover:bg-[#222222]"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={toggleSidebar}
            className="rounded-full p-1 text-[#6B7280] hover:bg-[#F5F5F0] dark:hover:bg-[#222222]"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation items */}
      <div className="flex flex-1 flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = isActivePath(item.href, pathname);

            return (
              <button
                key={item.title}
                className={cn(
                  "flex items-center gap-3 rounded-lg h-9 py-2 text-[14px] font-medium transition-colors text-left",
                  collapsed ? "justify-center px-2" : "px-3",
                  isActive
                    ? "bg-[#F0F0EB] dark:bg-[#2A2A2A] text-[#1A1A1A] dark:text-[#F5F5F5] font-semibold"
                    : "text-[#6B7280] hover:bg-[#F5F5F0] dark:hover:bg-[#222222]"
                )}
                title={collapsed ? item.title : undefined}
                onClick={() => handleNavigation(item.href)}
              >
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] flex-shrink-0",
                    isActive
                      ? "text-[#1A1A1A] dark:text-[#F5F5F5]"
                      : "text-[#6B7280]"
                  )}
                />
                {!collapsed && item.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Upgrade card */}
      <div className={cn("mx-4 mt-auto", collapsed && "mx-2")}>
        {!collapsed ? (
          <div className="flex flex-col gap-2 rounded-lg bg-[#F5F5F0] dark:bg-[#222222] p-4">
            <div className="text-[14px] font-medium text-[#1A1A1A] dark:text-[#F5F5F5]">
              Upgrade to Pro
            </div>
            <div className="text-xs text-[#6B7280]">
              Get advanced features and tax reports for multiple years.
            </div>
            <button className="mt-2 rounded-lg bg-primary px-3 py-1 text-xs font-medium text-white">
              Upgrade now
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-[#F5F5F0] dark:bg-[#222222] p-3 items-center">
            <button className="rounded-lg bg-primary px-2 py-1 text-xs font-medium text-white">
              Upgrade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
