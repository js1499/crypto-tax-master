"use client";

import { usePathname } from "next/navigation";
import {
  BarChart2,
  FileText,
  Landmark,
  Settings,
  Sparkles,
  Wallet,
  HelpCircle,
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

const navItems = [
  // { title: "Portfolio", href: "/", icon: BarChart2 },
  { title: "Accounts", href: "/accounts", icon: Landmark },
  { title: "Transactions", href: "/transactions", icon: Wallet },
  { title: "Tax Reports", href: "/tax-reports", icon: FileText },
  { title: "Tax AI", href: "/tax-ai", icon: Sparkles },
];

const footerItems = [
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Help & Support", href: "#", icon: HelpCircle },
];

export function AppSidebar() {
  const pathname = usePathname();

  const handleNavigation = (path: string) => {
    const pathWithTrailingSlash = path.endsWith('/') ? path : `${path}/`;
    window.location.href = `${window.location.origin}${pathWithTrailingSlash}`;
  };

  const isActivePath = (itemPath: string, currentPath: string) => {
    if (itemPath === "/") return currentPath === "/";
    return currentPath.startsWith(itemPath);
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
              {navItems.map((item) => {
                const isActive = isActivePath(item.href, pathname);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => handleNavigation(item.href)}
                      className="h-9"
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
