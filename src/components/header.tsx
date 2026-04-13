"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Bell, HelpCircle, LogOut, Settings, RefreshCw, DollarSign, Calculator, AlertCircle, Upload } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { toast } from "sonner";
import { useOnboarding } from "@/components/onboarding/onboarding-provider";
import { getActivityLog, clearActivityLog, formatTimeAgo, type ActivityEntry } from "@/lib/activity-log";

const TYPE_ICONS: Record<string, typeof RefreshCw> = {
  sync: RefreshCw,
  enrich: DollarSign,
  compute: Calculator,
  import: Upload,
  error: AlertCircle,
};

const TYPE_COLORS: Record<string, string> = {
  sync: "text-[#2563EB]",
  enrich: "text-[#16A34A]",
  compute: "text-[#9333EA]",
  import: "text-[#0D9488]",
  error: "text-[#DC2626]",
};

export function Header() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const { startOnboarding } = useOnboarding();
  const isLoading = status === "loading";
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);

  // Refresh activity log when popover opens
  useEffect(() => {
    if (notifOpen) {
      setActivityLog(getActivityLog());
    }
  }, [notifOpen]);

  // Poll for new entries periodically (catches pipeline updates)
  useEffect(() => {
    const interval = setInterval(() => {
      setActivityLog(getActivityLog());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut({ redirect: false });
      toast.success("Logged out successfully");
      router.push("/login");
      router.refresh();
    } catch (error) {
      toast.error("Failed to logout");
    }
  };

  const getInitials = (name: string | null | undefined, email: string | null | undefined) => {
    if (name) {
      return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
    }
    return email?.[0].toUpperCase() || "U";
  };

  const user = session?.user;
  const hasUnread = activityLog.length > 0 && activityLog[0].timestamp > Date.now() - 60 * 60 * 1000; // last hour

  return (
    <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-[#F0F0EB] dark:border-[#2A2A2A] bg-white dark:bg-[#1A1A1A] px-8">
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-2" />
      </div>
      <div className="flex items-center gap-3">
        {!isLoading && user && (
          <>
            {/* Tutorial mode button */}
            <button
              onClick={startOnboarding}
              className="relative overflow-hidden rounded-lg bg-[#2563EB] px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-[#1D4ED8] transition-colors"
            >
              <span className="relative z-10">Tutorial Mode</span>
              <span className="absolute inset-0 z-0" style={{
                background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                animation: "shine 2.5s ease-in-out infinite",
              }} />
              <style>{`@keyframes shine { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }`}</style>
            </button>
        <ThemeToggle />

            {/* Notifications — activity log */}
            <Popover open={notifOpen} onOpenChange={setNotifOpen}>
              <PopoverTrigger asChild>
                <button className="relative rounded-full p-1.5 text-[#9CA3AF] hover:bg-[#F5F5F0] dark:hover:bg-[#222] hover:text-[#6B7280] transition-colors">
                  <Bell className="h-5 w-5" />
                  {hasUnread && (
                    <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-[#2563EB]" />
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[340px] p-0">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[#F0F0EB] dark:border-[#2A2A2A]">
                  <h3 className="text-[14px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">Activity</h3>
                  {activityLog.length > 0 && (
                    <button
                      onClick={() => { clearActivityLog(); setActivityLog([]); }}
                      className="text-[11px] text-[#9CA3AF] hover:text-[#6B7280] transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>
                <div className="max-h-[350px] overflow-y-auto">
                  {activityLog.length === 0 ? (
                    <div className="py-8 text-center">
                      <Bell className="h-8 w-8 text-[#E5E5E0] dark:text-[#333] mx-auto mb-2" />
                      <p className="text-[13px] text-[#9CA3AF]">No activity yet</p>
                      <p className="text-[11px] text-[#C0C0B8] mt-0.5">Sync, price, and compute events will appear here</p>
                    </div>
                  ) : (
                    activityLog.map((entry) => {
                      const Icon = TYPE_ICONS[entry.type] || RefreshCw;
                      const color = TYPE_COLORS[entry.type] || "text-[#9CA3AF]";
                      return (
                        <div key={entry.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-[#F0F0EB] dark:border-[#2A2A2A] last:border-0 hover:bg-[#FAFAF8] dark:hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                          <div className={`mt-0.5 shrink-0 ${color}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[13px] text-[#1A1A1A] dark:text-[#F5F5F5] truncate">{entry.message}</p>
                            {entry.detail && (
                              <p className="text-[11px] text-[#9CA3AF] truncate">{entry.detail}</p>
                            )}
                          </div>
                          <span className="text-[10px] text-[#C0C0B8] shrink-0 mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>
                            {formatTimeAgo(entry.timestamp)}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* User menu — settings + logout only */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={user.image || ""} />
                    <AvatarFallback className="bg-primary/25 text-primary">
                      {getInitials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.name || "User"}</p>
                    <p className="text-xs leading-none text-muted-foreground">{user.email}</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="flex items-center w-full">
                    <Settings className="mr-2 h-4 w-4" />
                    <span>Settings</span>
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
        {!isLoading && !user && (
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link href="/login">Sign In</Link>
            </Button>
            <Button asChild>
              <Link href="/register">Sign Up</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
