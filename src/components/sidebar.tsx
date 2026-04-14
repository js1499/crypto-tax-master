"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  BarChart2,
  ChevronDown,
  ChevronRight,
  FileText,
  Landmark,
  Settings,
  Sparkles,
  Wallet,
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
  // Securities hidden for now — uncomment when ready to launch
  // {
  //   title: "Securities",
  //   items: [
  //     { title: "Accounts", href: "/securities/accounts", icon: Building },
  //     { title: "Transactions", href: "/securities/transactions", icon: ArrowRightLeft },
  //   ],
  // },
];

const standaloneItems: NavItem[] = [
  { title: "Tax Reports", href: "/tax-reports", icon: FileText, onboarding: "nav-tax-reports" },
  { title: "Tax AI", href: "/tax-ai", icon: Sparkles },
];

const footerItems: NavItem[] = [
  { title: "Settings", href: "/settings", icon: Settings, onboarding: "nav-settings" },
  { title: "Tutorial", href: "/tutorial", icon: GraduationCap },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Crypto: true,
    Securities: true,
  });
  const [planName, setPlanName] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/stripe/status", { credentials: "include" })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.planName) setPlanName(d.planName); })
      .catch(() => {});
  }, []);

  const handleNavigation = (path: string) => {
    router.push(path);
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
      <SidebarHeader className="px-4 py-4">
        <button
          onClick={() => handleNavigation("/")}
          className="flex flex-col items-start"
        >
          <img src="/landing/logos/glide-logo.png" alt="Glide" className="h-14 w-auto" />
          {planName && (
            <span className={`text-[12px] font-bold px-2 py-1 rounded mt-2 ${planName === "Trial" ? "bg-[#F0F0EB] text-[#6B7280]" : "bg-[#EFF6FF] text-[#2563EB]"}`}>
              {planName}
            </span>
          )}
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
                {...(item.onboarding ? { "data-onboarding": item.onboarding } : {})}
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
