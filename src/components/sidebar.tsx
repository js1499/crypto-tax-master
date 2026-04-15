"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  FileText,
  Landmark,
  Settings,
  Sparkles,
  Wallet,
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

interface BillingStatus {
  planName?: string;
  usage?: {
    taxYear: number;
    used: number;
    limit: number | null;
    isUnlimited: boolean;
    remaining: number | null;
    percentUsed: number;
    isOverLimit: boolean;
  };
}

const navGroups: NavGroup[] = [
  {
    title: "Crypto",
    items: [
      {
        title: "Accounts",
        href: "/accounts",
        icon: Landmark,
        onboarding: "nav-accounts",
      },
      {
        title: "Transactions",
        href: "/transactions",
        icon: Wallet,
        onboarding: "nav-transactions",
      },
    ],
  },
];

const standaloneItems: NavItem[] = [
  {
    title: "Tax Reports",
    href: "/tax-reports",
    icon: FileText,
    onboarding: "nav-tax-reports",
  },
  { title: "Tax AI", href: "/tax-ai", icon: Sparkles },
];

const footerItems: NavItem[] = [
  {
    title: "Settings",
    href: "/settings",
    icon: Settings,
    onboarding: "nav-settings",
  },
  { title: "Tutorial", href: "/tutorial", icon: GraduationCap },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Crypto: true,
    Securities: true,
  });
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null,
  );

  useEffect(() => {
    let active = true;

    const loadBillingStatus = async () => {
      try {
        const response = await fetch("/api/stripe/status", {
          credentials: "include",
          cache: "no-store",
        });

        if (!response.ok) return;

        const data = await response.json();
        if (active) {
          setBillingStatus(data);
        }
      } catch {
        // Ignore sidebar billing fetch failures.
      }
    };

    const handleRefresh = () => {
      void loadBillingStatus();
    };

    void loadBillingStatus();
    window.addEventListener("glide:refresh-plan-status", handleRefresh);

    return () => {
      active = false;
      window.removeEventListener("glide:refresh-plan-status", handleRefresh);
    };
  }, [pathname]);

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

  const usage = billingStatus?.usage;
  const planName = billingStatus?.planName || null;
  const limitLabel = usage?.isUnlimited
    ? "Unlimited"
    : usage?.limit?.toLocaleString() || "0";
  const usageLabel = usage
    ? `${usage.used.toLocaleString()} txns used of ${limitLabel} limit for ${usage.taxYear}`
    : null;
  const progressWidth = usage
    ? usage.isUnlimited
      ? Math.min(usage.used > 0 ? 28 : 10, 100)
      : Math.min(usage.percentUsed, 100)
    : 0;

  return (
    <ShadcnSidebar>
      <SidebarHeader className="px-4 py-4">
        <button
          onClick={() => handleNavigation("/")}
          className="flex flex-col items-start"
        >
          <img
            src="/landing/logos/glide-logo.png"
            alt="Glide"
            className="w-[75%] h-auto"
          />
          {planName && (
            <span
              className={`text-[12px] font-bold px-2 py-1 rounded mt-2 ${planName === "Trial" ? "bg-[#F0F0EB] text-[#6B7280]" : "bg-[#EFF6FF] text-[#2563EB]"}`}
            >
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
                              {...(item.onboarding
                                ? { "data-onboarding": item.onboarding }
                                : {})}
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
                      {...(item.onboarding
                        ? { "data-onboarding": item.onboarding }
                        : {})}
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

      <SidebarFooter className="gap-0">
        {usageLabel && (
          <div className="px-4 pb-4">
            <div className="relative overflow-hidden rounded-[22px] bg-[linear-gradient(135deg,#143C9A_0%,#1E60D6_36%,#082A6A_68%,#041832_100%)] px-4 py-4 text-white shadow-[0_20px_40px_rgba(3,20,56,0.28)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.35),transparent_34%)]" />
              <div className="pointer-events-none absolute -right-5 top-3 h-24 w-24 rounded-full border border-white/20" />
              <div className="pointer-events-none absolute right-8 top-0 h-20 w-28 rotate-[-18deg] rounded-full bg-white/10 blur-2xl" />

              <div className="relative">
                <p className="max-w-[200px] text-[12px] font-semibold leading-5 text-white">
                  {usageLabel}
                </p>

                <div className="mt-3 h-3 overflow-hidden rounded-full bg-black/20 ring-1 ring-white/15">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${usage?.isOverLimit ? "bg-[linear-gradient(90deg,#FF6B6B_0%,#DC2626_100%)]" : "bg-[linear-gradient(90deg,#34D399_0%,#16A34A_100%)]"}`}
                    style={{ width: `${progressWidth}%` }}
                  />
                </div>

                <button
                  onClick={() => handleNavigation("/#pricing")}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[14px] bg-[linear-gradient(180deg,#FF9F2E_0%,#FF8A1C_100%)] px-3 py-3 text-[14px] font-semibold text-white shadow-[0_14px_24px_rgba(255,138,28,0.35)] transition-transform hover:translate-y-[-1px]"
                >
                  Upgrade Plan
                  <ArrowUpRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        <SidebarSeparator />
        <SidebarMenu>
          {footerItems.map((item) => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                onClick={() => handleNavigation(item.href)}
                className="h-9"
                {...(item.onboarding
                  ? { "data-onboarding": item.onboarding }
                  : {})}
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
