"use client";

import Link from "next/link";
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
  {
    title: "Portfolio",
    href: "/",
    icon: BarChart2,
    activeClasses: "bg-blue-500/15 text-blue-400",
  },
  {
    title: "Accounts",
    href: "/accounts",
    icon: Landmark,
    activeClasses: "bg-emerald-500/15 text-emerald-400",
  },
  {
    title: "Transactions",
    href: "/transactions",
    icon: Wallet,
    activeClasses: "bg-purple-500/15 text-purple-400",
  },
  {
    title: "Tax Reports",
    href: "/tax-reports",
    icon: FileText,
    activeClasses: "bg-rose-500/15 text-rose-400",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    activeClasses: "bg-orange-500/15 text-orange-400",
  },
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
    const pathWithTrailingSlash = path.endsWith('/') ? path : `${path}/`;
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
        "flex min-h-screen flex-col border-r border-[#252d3d] bg-[#1B2130] pb-12 transition-all duration-200",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="flex h-14 items-center border-b border-[#252d3d] px-4 justify-between">
        {!collapsed && (
          <button
            onClick={() => handleNavigation("/")}
            className="flex items-center font-semibold text-xl pl-3"
          >
            <span className="text-[#10B981]">Crypto</span>
            <span className="text-white ml-1">Tax</span>
          </button>
        )}
        {collapsed && (
          <div className="flex-1 flex justify-center">
            <button
              onClick={toggleSidebar}
              className="rounded-full p-1 text-[#8B95A5] hover:text-white hover:bg-white/5"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={toggleSidebar}
            className="rounded-full p-1 text-[#8B95A5] hover:text-white hover:bg-white/5"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4 px-4 py-6">
        <div className="flex flex-col gap-1">
          {navItems.map((item) => {
            const isActive = isActivePath(item.href, pathname);

            return (
              <button
                key={item.title}
                className={cn(
                  "flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium transition-all duration-200 text-left",
                  collapsed ? "justify-center px-2" : "px-3",
                  isActive
                    ? `${item.activeClasses} font-semibold`
                    : "text-[#8B95A5] hover:text-white hover:bg-white/5"
                )}
                title={collapsed ? item.title : undefined}
                onClick={() => handleNavigation(item.href)}
              >
                <item.icon
                  className={cn(
                    collapsed ? "h-5 w-5" : "h-[18px] w-[18px]"
                  )}
                />
                {!collapsed && item.title}
              </button>
            );
          })}
        </div>
      </div>

      <div className={cn("mx-4 mt-auto", collapsed && "mx-2")}>
        {!collapsed ? (
          <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-4">
            <div className="text-sm font-medium text-white">Upgrade to Pro</div>
            <div className="text-xs text-[#8B95A5]">
              Get advanced features and tax reports for multiple years.
            </div>
            <button className="mt-2 rounded-full bg-[#10B981] hover:bg-[#059669] px-3 py-1.5 text-xs font-medium text-white transition-colors">
              Upgrade now
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 items-center">
            <button className="rounded-full bg-[#10B981] hover:bg-[#059669] px-2 py-1 text-xs font-medium text-white transition-colors">
              Pro
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
