"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bell,
  CreditCard,
  Save,
  Shield,
  User,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";

type BillingPlanState = {
  billingPlanKey: string;
  planName: string;
  subscriptionStatus: string;
  currentPeriodEnd: string | null;
  hasStripeAccount: boolean;
};

const PLAN_OPTIONS = [
  {
    key: "starter",
    name: "Starter",
    priceLabel: "$49 / year",
    description: "Casual traders",
    transactions: "Up to 300 transactions",
  },
  {
    key: "active",
    name: "Active",
    priceLabel: "$99 / year",
    description: "Active traders",
    transactions: "Up to 1,000 transactions",
  },
  {
    key: "pro",
    name: "Pro",
    priceLabel: "$299 / year",
    description: "Serious traders",
    transactions: "Up to 10,000 transactions",
  },
  {
    key: "prime",
    name: "Prime",
    priceLabel: "$699 / year",
    description: "High volume",
    transactions: "Up to 100,000 transactions",
  },
] as const;

const PLAN_RANK: Record<string, number> = {
  free: 0,
  starter: 1,
  starter_dfy: 1,
  active: 2,
  active_dfy: 2,
  pro: 3,
  pro_dfy: 3,
  prime: 4,
  prime_dfy: 4,
};

export default function SettingsPage() {
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [billingPlan, setBillingPlan] = useState<BillingPlanState | null>(null);
  const [timezone, setTimezone] = useState("America/New_York");
  const [costBasisMethod, setCostBasisMethod] = useState("FIFO");
  const [country, setCountry] = useState("US");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("preferences");
  const [planLoading, setPlanLoading] = useState<string | null>(null);
  const [requestedPlan, setRequestedPlan] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    const urlParams = new URLSearchParams(window.location.search);
    setActiveTab(urlParams.get("tab") || "preferences");
    setRequestedPlan(urlParams.get("plan"));

    // Load settings from API
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success") {
          if (data.timezone) setTimezone(data.timezone);
          if (data.costBasisMethod) setCostBasisMethod(data.costBasisMethod);
          if (data.country) setCountry(data.country);
        }
      })
      .catch(() => {});
    // Load billing status
    fetch("/api/stripe/status", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data)
          setBillingPlan({
            billingPlanKey: data.billingPlanKey,
            planName: data.billingPlanName || data.planName,
            subscriptionStatus: data.subscriptionStatus,
            currentPeriodEnd: data.currentPeriodEnd,
            hasStripeAccount: data.hasStripeAccount,
          });
      })
      .catch(() => {});
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone, costBasisMethod, country }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch {
      // Silently fail
    } finally {
      setIsSaving(false);
    }
  };

  const handlePlanSelection = async (planKey: string) => {
    setPlanLoading(planKey);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ planKey }),
      });

      const data = await res.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/settings?tab=billing")}`;
        return;
      }

      toast.error(data.error || "Failed to open billing flow");
    } catch {
      toast.error("Failed to open billing flow");
    } finally {
      setPlanLoading(null);
    }
  };

  const currentBillingPlanKey = billingPlan?.billingPlanKey || "free";
  const normalizedCurrentPlanKey = currentBillingPlanKey.replace("_dfy", "");
  const currentPlanRank = PLAN_RANK[currentBillingPlanKey] || 0;

  if (!mounted) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-8">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold">Settings</h1>
          <Button
            className="gap-2"
            onClick={handleSave}
            variant={saveSuccess ? "outline" : "default"}
          >
            {saveSuccess ? (
              "Settings Saved!"
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>

        <Tabs className="w-full" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid w-full grid-cols-4">
            <TabsTrigger value="preferences" data-onboarding="select-country">
              <Bell className="mr-2 h-4 w-4" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="billing">
              <CreditCard className="mr-2 h-4 w-4" />
              Billing
            </TabsTrigger>
            <TabsTrigger value="profile">
              <User className="mr-2 h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="mr-2 h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile</CardTitle>
                <CardDescription>Your account information.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <p className="text-sm text-[#1A1A1A] dark:text-[#F5F5F5]">
                    {session?.user?.email || "—"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Name</Label>
                  <p className="text-sm text-[#1A1A1A] dark:text-[#F5F5F5]">
                    {session?.user?.name || "Not set"}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <p className="text-xs text-muted-foreground">
                    Used for tax year boundary determination
                  </p>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger id="timezone">
                      <SelectValue placeholder="Select timezone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="America/New_York">
                        Eastern Time (US & Canada)
                      </SelectItem>
                      <SelectItem value="America/Chicago">
                        Central Time (US & Canada)
                      </SelectItem>
                      <SelectItem value="America/Denver">
                        Mountain Time (US & Canada)
                      </SelectItem>
                      <SelectItem value="America/Los_Angeles">
                        Pacific Time (US & Canada)
                      </SelectItem>
                      <SelectItem value="America/Anchorage">Alaska</SelectItem>
                      <SelectItem value="Pacific/Honolulu">Hawaii</SelectItem>
                      <SelectItem value="Europe/London">London</SelectItem>
                      <SelectItem value="Europe/Paris">
                        Paris / Berlin
                      </SelectItem>
                      <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                      <SelectItem value="Asia/Singapore">Singapore</SelectItem>
                      <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>
                  Customize your application preferences and notification
                  settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Tax Calculation</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="tax-jurisdiction">Tax Jurisdiction</Label>
                      <p className="text-xs text-muted-foreground">
                        Determines which country-specific tax rules are applied
                      </p>
                      <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger id="tax-jurisdiction">
                          <SelectValue placeholder="Select jurisdiction" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US">United States (US)</SelectItem>
                          <SelectItem value="UK">
                            United Kingdom (UK)
                          </SelectItem>
                          <SelectItem value="DE">Germany (DE)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="calculation-method">
                        Cost Basis Method
                      </Label>
                      <Select
                        value={costBasisMethod}
                        onValueChange={setCostBasisMethod}
                      >
                        <SelectTrigger id="calculation-method">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIFO">
                            FIFO (First In, First Out)
                          </SelectItem>
                          <SelectItem value="LIFO">
                            LIFO (Last In, First Out)
                          </SelectItem>
                          <SelectItem value="HIFO">
                            HIFO (Highest In, First Out)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="tax-year">Default Tax Year</Label>
                      <Select defaultValue="2023">
                        <SelectTrigger id="tax-year">
                          <SelectValue placeholder="Select tax year" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="2023">2023</SelectItem>
                          <SelectItem value="2022">2022</SelectItem>
                          <SelectItem value="2021">2021</SelectItem>
                          <SelectItem value="2020">2020</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle>Security</CardTitle>
                <CardDescription>Manage your account security.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Reset Password</h3>
                      <p className="text-sm text-muted-foreground">
                        We&apos;ll send a password reset link to your email
                        address.
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={async () => {
                        const email = session?.user?.email;
                        if (!email) {
                          toast.error("No email address found");
                          return;
                        }
                        try {
                          const res = await fetch("/api/auth/forgot-password", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ email }),
                          });
                          if (res.ok) {
                            toast.success(
                              "Password reset link sent to your email",
                            );
                          } else {
                            toast.info(
                              "If an account exists with that email, a reset link has been sent.",
                            );
                          }
                        } catch {
                          toast.error(
                            "Failed to send reset email. Please try again.",
                          );
                        }
                      }}
                    >
                      Send Reset Email
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium text-[#DC2626]">
                        Delete Account
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all associated data.
                        This cannot be undone.
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      onClick={async () => {
                        if (
                          !confirm(
                            "Are you sure you want to delete your account? This will permanently delete all your data, wallets, transactions, and reports. This cannot be undone.",
                          )
                        )
                          return;
                        if (
                          !confirm(
                            "This is your final warning. Type your email to confirm.",
                          )
                        )
                          return;
                        try {
                          const res = await fetch("/api/auth/delete-account", {
                            method: "DELETE",
                            credentials: "include",
                          });
                          if (res.ok) {
                            toast.success("Account deleted. Redirecting...");
                            window.location.href = "/";
                          } else {
                            const data = await res.json();
                            toast.error(
                              data.error || "Failed to delete account",
                            );
                          }
                        } catch {
                          toast.error("Failed to delete account");
                        }
                      }}
                    >
                      Delete Account
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing">
            <Card>
              <CardHeader>
                <CardTitle>Billing & Subscription</CardTitle>
                <CardDescription>
                  Manage your plan, payment method, and invoices.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 rounded-lg border border-[#E5E5E0] dark:border-[#333]">
                  <div>
                    <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                      Current Plan
                    </p>
                    <p className="text-[13px] text-[#6B7280] mt-0.5">
                      {billingPlan
                        ? `${billingPlan.planName}${billingPlan.subscriptionStatus === "active" && billingPlan.currentPeriodEnd ? ` — renews ${new Date(billingPlan.currentPeriodEnd).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}`
                        : "Loading..."}
                    </p>
                  </div>
                  {billingPlan?.hasStripeAccount ? (
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/stripe/portal", {
                            method: "POST",
                            credentials: "include",
                          });
                          const data = await res.json();
                          if (data.url) window.location.href = data.url;
                          else if (data.error) toast.error(data.error);
                        } catch {
                          toast.error("Failed to open billing portal");
                        }
                      }}
                    >
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Manage Billing
                    </Button>
                  ) : (
                    <Button
                      onClick={() =>
                        document
                          .getElementById("billing-plans")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          })
                      }
                    >
                      Choose Plan
                    </Button>
                  )}
                </div>
                {billingPlan?.hasStripeAccount ? (
                  <p className="text-[13px] text-[#9CA3AF]">
                    Manage your subscription, update payment method, view
                    invoices, or cancel through the Stripe Customer Portal.
                  </p>
                ) : (
                  <p className="text-[13px] text-[#9CA3AF]">
                    You&apos;re on the free trial. Upgrade to unlock all
                    reports, Tax AI, and advanced features.
                  </p>
                )}

                <div
                  className="space-y-4 rounded-xl border border-[#E5E5E0] bg-[#FBFBF8] p-4 dark:border-[#333] dark:bg-[#171717]"
                  id="billing-plans"
                >
                  <div className="space-y-1">
                    <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                      Change Plan
                    </p>
                    <p className="text-[13px] text-[#6B7280]">
                      Upgrades are prorated immediately. Downgrades take effect
                      at the next annual renewal.
                    </p>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {PLAN_OPTIONS.map((plan) => {
                      const isCurrent = normalizedCurrentPlanKey === plan.key;
                      const isHighlighted = requestedPlan === plan.key;
                      const isUpgrade = PLAN_RANK[plan.key] > currentPlanRank;
                      const buttonLabel = isCurrent
                        ? "Manage Plan"
                        : billingPlan?.hasStripeAccount
                          ? isUpgrade
                            ? `Upgrade to ${plan.name}`
                            : `Switch to ${plan.name}`
                          : `Start ${plan.name}`;

                      return (
                        <div
                          key={plan.key}
                          className={`rounded-xl border p-4 transition-all ${
                            isCurrent
                              ? "border-[#10B981] bg-[#F3FBF7] dark:border-[#10B981] dark:bg-[#10241D]"
                              : "border-[#E5E5E0] bg-white dark:border-[#333] dark:bg-[#111]"
                          } ${isHighlighted ? "ring-2 ring-[#F59E0B] ring-offset-2 dark:ring-offset-[#111]" : ""}`}
                        >
                          <div className="mb-4 space-y-1">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-[15px] font-semibold text-[#1A1A1A] dark:text-[#F5F5F5]">
                                {plan.name}
                              </p>
                              {isCurrent ? (
                                <span className="rounded-full bg-[#10B981] px-2 py-0.5 text-[11px] font-semibold text-white">
                                  Current
                                </span>
                              ) : null}
                            </div>
                            <p className="text-[13px] text-[#6B7280]">
                              {plan.description}
                            </p>
                            <p className="text-[20px] font-semibold text-[#111827] dark:text-[#F5F5F5]">
                              {plan.priceLabel}
                            </p>
                            <p className="text-[12px] text-[#6B7280]">
                              {plan.transactions}
                            </p>
                          </div>

                          <Button
                            className="w-full"
                            disabled={planLoading !== null}
                            onClick={() => handlePlanSelection(plan.key)}
                            variant={isCurrent ? "outline" : "default"}
                          >
                            {planLoading === plan.key
                              ? "Opening..."
                              : buttonLabel}
                          </Button>
                        </div>
                      );
                    })}
                  </div>

                  <p className="text-[12px] text-[#9CA3AF]">
                    Done-for-you plans and CPA filing add-ons continue through
                    the hosted billing flow after plan selection.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
