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

// Define color schemes for each navigation item
const navItems = [
  {
    title: "Portfolio",
    href: "/",
    icon: BarChart2,
    color: "blue", // Blue
    bgLight: "bg-blue-100",
    bgDark: "dark:bg-blue-900/30",
    textLight: "text-blue-800",
    textDark: "dark:text-blue-400",
    hoverBgLight: "hover:bg-blue-100/70",
    hoverBgDark: "dark:hover:bg-blue-900/20",
    hoverTextLight: "hover:text-blue-800",
    hoverTextDark: "dark:hover:text-blue-400",
  },
  {
    title: "Accounts",
    href: "/accounts",
    icon: Landmark,
    color: "green", // Green
    bgLight: "bg-emerald-100",
    bgDark: "dark:bg-emerald-900/30",
    textLight: "text-emerald-800",
    textDark: "dark:text-emerald-400",
    hoverBgLight: "hover:bg-emerald-100/70",
    hoverBgDark: "dark:hover:bg-emerald-900/20",
    hoverTextLight: "hover:text-emerald-800",
    hoverTextDark: "dark:hover:text-emerald-400",
  },
  {
    title: "Transactions",
    href: "/transactions",
    icon: Wallet,
    color: "purple", // Purple 
    bgLight: "bg-purple-100",
    bgDark: "dark:bg-purple-900/30",
    textLight: "text-purple-800",
    textDark: "dark:text-purple-400",
    hoverBgLight: "hover:bg-purple-100/70",
    hoverBgDark: "dark:hover:bg-purple-900/20",
    hoverTextLight: "hover:text-purple-800",
    hoverTextDark: "dark:hover:text-purple-400",
  },
  {
    title: "Tax Reports",
    href: "/tax-reports",
    icon: FileText,
    color: "red", // Red
    bgLight: "bg-rose-100",
    bgDark: "dark:bg-rose-900/30",
    textLight: "text-rose-800",
    textDark: "dark:text-rose-400",
    hoverBgLight: "hover:bg-rose-100/70",
    hoverBgDark: "dark:hover:bg-rose-900/20",
    hoverTextLight: "hover:text-rose-800",
    hoverTextDark: "dark:hover:text-rose-400",
  },
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    color: "orange", // Orange
    bgLight: "bg-orange-100",
    bgDark: "dark:bg-orange-900/30",
    textLight: "text-orange-800",
    textDark: "dark:text-orange-400",
    hoverBgLight: "hover:bg-orange-100/70",
    hoverBgDark: "dark:hover:bg-orange-900/20",
    hoverTextLight: "hover:text-orange-800",
    hoverTextDark: "dark:hover:text-orange-400",
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
        "flex min-h-screen flex-col border-r border-border bg-white dark:bg-gray-950 pb-12 transition-all duration-200",
        collapsed ? "w-20" : "w-64"
      )}
    >
      <div className="flex h-14 items-center border-b px-4 justify-between">
        {!collapsed && (
          <button
            onClick={() => handleNavigation("/")}
            className="flex items-center font-semibold text-xl text-primary pl-3"
          >
            <span>Crypto Tax</span>
          </button>
        )}
        {collapsed && (
          <div className="flex-1 flex justify-center">
            <button 
              onClick={toggleSidebar}
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}
        
        {!collapsed && (
          <button 
            onClick={toggleSidebar}
            className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
                  "flex items-center gap-3 rounded-md py-2.5 text-md font-medium transition-colors text-left",
                  collapsed ? "justify-center px-2" : "px-3",
                  isActive
                    ? `${item.bgLight} ${item.textLight} ${item.bgDark} ${item.textDark} font-semibold`
                    : `text-muted-foreground ${item.hoverBgLight} ${item.hoverBgDark} ${item.hoverTextLight} ${item.hoverTextDark}`
                )}
                title={collapsed ? item.title : undefined}
                onClick={() => handleNavigation(item.href)}
              >
                <item.icon 
                  className={cn(
                    collapsed ? "h-6 w-6" : "h-5 w-5",
                    isActive 
                      ? `${item.textLight} ${item.textDark}` 
                      : `group-hover:${item.textLight} group-hover:${item.textDark}`
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
          <div className="flex flex-col gap-2 rounded-lg bg-slate-100 dark:bg-primary/10 p-4">
            <div className="text-sm font-medium">Upgrade to Pro</div>
            <div className="text-xs text-muted-foreground">
              Get advanced features and tax reports for multiple years.
            </div>
            <button className="mt-2 rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
              Upgrade now
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-lg bg-slate-100 dark:bg-primary/10 p-3 items-center">
            <button className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
              Upgrade
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
