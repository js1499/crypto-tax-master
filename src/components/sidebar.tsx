"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import {
  BarChart2,
  ChevronDown,
  ChevronRight,
  FileText,
  Landmark,
  Settings,
  Sparkles,
  Wallet,
  HelpCircle,
  Building,
  ArrowRightLeft,
  GraduationCap,
} from "lucide-react";
import {
  Sidebar as ShadcnSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  onboarding?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: "Crypto",
    items: [
      { title: "Accounts", href: "/accounts", icon: Landmark, onboarding: "nav-accounts" },
      { title: "Transactions", href: "/transactions", icon: Wallet, onboarding: "nav-transactions" },
    ],
  },
  {
    title: "Securities",
    items: [
      { title: "Accounts", href: "/securities/accounts", icon: Building },
      { title: "Transactions", href: "/securities/transactions", icon: ArrowRightLeft },
    ],
  },
];

const standaloneItems: NavItem[] = [
  { title: "Tax Reports", href: "/tax-reports", icon: FileText, onboarding: "nav-tax-reports" },
  { title: "Tax AI", href: "/tax-ai", icon: Sparkles },
  { title: "Tutorial", href: "/tutorial", icon: GraduationCap },
];

const footerItems = [
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Help & Support", href: "#", icon: HelpCircle },
];

export function AppSidebar() {
  const pathname = usePathname();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Crypto: true,
    Securities: true,
  });

  const handleNavigation = (path: string) => {
    const pathWithTrailingSlash = path.endsWith('/') ? path : `${path}/`;
    window.location.href = `${window.location.origin}${pathWithTrailingSlash}`;
  };

  const isActivePath = (itemPath: string, currentPath: string) => {
    if (itemPath === "/") return currentPath === "/";
    return currentPath.startsWith(itemPath);
  };

  const toggleGroup = (title: string) => {
    setOpenGroups((prev) => ({ ...prev, [title]: !prev[title] }));
  };

  return (
    <ShadcnSidebar>
      <SidebarHeader className="px-4 py-5">
        <button
          onClick={() => handleNavigation("/")}
          className="flex items-center gap-2"
        >
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">CT</span>
          </div>
          <div>
            <div className="text-[15px] font-semibold text-sidebar-foreground">Crypto Tax</div>
            <div className="text-xs text-muted-foreground">Tax Calculator</div>
          </div>
        </button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navGroups.map((group) => {
                const isOpen = openGroups[group.title] ?? true;
                return (
                  <div key={group.title}>
                    <SidebarMenuItem>
                      <SidebarMenuButton
                        onClick={() => toggleGroup(group.title)}
                        className="h-9"
                      >
                        {isOpen ? (
                          <ChevronDown className="h-[14px] w-[14px]" />
                        ) : (
                          <ChevronRight className="h-[14px] w-[14px]" />
                        )}
                        <span className="text-[13px] font-medium uppercase tracking-wide text-muted-foreground">
                          {group.title}
                        </span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                    {isOpen &&
                      group.items.map((item) => {
                        const isActive = isActivePath(item.href, pathname);
                        return (
                          <SidebarMenuItem key={item.href}>
                            <SidebarMenuButton
                              isActive={isActive}
                              onClick={() => handleNavigation(item.href)}
                              className="h-9 pl-7"
                              {...(item.onboarding ? { "data-onboarding": item.onboarding } : {})}
                            >
                              <item.icon className="h-[18px] w-[18px]" />
                              <span className="text-[14px]">{item.title}</span>
                            </SidebarMenuButton>
                          </SidebarMenuItem>
                        );
                      })}
                  </div>
                );
              })}

              {standaloneItems.map((item) => {
                const isActive = isActivePath(item.href, pathname);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleNavigation(item.href)}
                      className="h-9"
                      {...(item.onboarding ? { "data-onboarding": item.onboarding } : {})}
                    >
                      <item.icon className="h-[18px] w-[18px]" />
                      <span className="text-[14px]">{item.title}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarSeparator />
        <SidebarMenu>
          {footerItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                onClick={() => handleNavigation(item.href)}
                className="h-9"
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span className="text-[14px]">{item.title}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </ShadcnSidebar>
  );
}
