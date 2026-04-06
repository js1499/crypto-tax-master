"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Bell, Key, Lock, Save, Shield, User } from "lucide-react";

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [timezone, setTimezone] = useState("America/New_York");
  const [costBasisMethod, setCostBasisMethod] = useState("FIFO");
  const [country, setCountry] = useState("US");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load settings from API
    fetch("/api/settings")
      .then(res => res.json())
      .then(data => {
        if (data.status === "success") {
          if (data.timezone) setTimezone(data.timezone);
          if (data.costBasisMethod) setCostBasisMethod(data.costBasisMethod);
          if (data.country) setCountry(data.country);
        }
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

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="mb-6 grid w-full grid-cols-4">
            <TabsTrigger value="profile">
              <User className="mr-2 h-4 w-4" />
              Profile
            </TabsTrigger>
            <TabsTrigger value="account">
              <Key className="mr-2 h-4 w-4" />
              Account
            </TabsTrigger>
            <TabsTrigger value="preferences">
              <Bell className="mr-2 h-4 w-4" />
              Preferences
            </TabsTrigger>
            <TabsTrigger value="security">
              <Shield className="mr-2 h-4 w-4" />
              Security
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle>Profile Information</CardTitle>
                <CardDescription>
                  Update your personal information and profile settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col items-center space-y-4 sm:flex-row sm:items-start sm:space-x-6 sm:space-y-0">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src="" />
                    <AvatarFallback className="text-lg">TR</AvatarFallback>
                  </Avatar>
                  <div className="space-y-2">
                    <h3 className="text-lg font-medium">Profile Photo</h3>
                    <p className="text-sm text-muted-foreground">
                      Upload a photo to personalize your account.
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline">
                        Upload
                      </Button>
                      <Button size="sm" variant="outline">
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="first-name">First Name</Label>
                      <Input id="first-name" defaultValue="Theodore" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="last-name">Last Name</Label>
                      <Input id="last-name" defaultValue="Rosen" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <Input id="email" type="email" defaultValue="theodore.rosen@example.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" defaultValue="+1 (555) 123-4567" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="timezone">Timezone</Label>
                    <p className="text-xs text-muted-foreground">Used for tax year boundary determination</p>
                    <Select value={timezone} onValueChange={setTimezone}>
                      <SelectTrigger id="timezone">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="America/New_York">Eastern Time (US & Canada)</SelectItem>
                        <SelectItem value="America/Chicago">Central Time (US & Canada)</SelectItem>
                        <SelectItem value="America/Denver">Mountain Time (US & Canada)</SelectItem>
                        <SelectItem value="America/Los_Angeles">Pacific Time (US & Canada)</SelectItem>
                        <SelectItem value="America/Anchorage">Alaska</SelectItem>
                        <SelectItem value="Pacific/Honolulu">Hawaii</SelectItem>
                        <SelectItem value="Europe/London">London</SelectItem>
                        <SelectItem value="Europe/Paris">Paris / Berlin</SelectItem>
                        <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                        <SelectItem value="Asia/Singapore">Singapore</SelectItem>
                        <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="account">
            <Card>
              <CardHeader>
                <CardTitle>Account Settings</CardTitle>
                <CardDescription>
                  Manage your account settings and connected services.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Connected Services</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-blue-500 to-blue-600 flex items-center justify-center text-white">G</div>
                        <div>
                          <h4 className="text-sm font-medium">Google</h4>
                          <p className="text-xs text-muted-foreground">Connected</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Disconnect</Button>
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center space-x-4">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-gray-800 to-gray-900 flex items-center justify-center text-white">X</div>
                        <div>
                          <h4 className="text-sm font-medium">X (Twitter)</h4>
                          <p className="text-xs text-muted-foreground">Not connected</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">Connect</Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Billing Information</h3>
                  <p className="text-sm text-muted-foreground">
                    You are currently on the <strong>Free Plan</strong>. Upgrade to unlock advanced tax calculation features.
                  </p>
                  <Button>Upgrade to Pro</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preferences">
            <Card>
              <CardHeader>
                <CardTitle>Preferences</CardTitle>
                <CardDescription>
                  Customize your application preferences and notification settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Tax Calculation</h3>
                  <div className="space-y-4">
                    <div className="space-y-2" data-onboarding="select-country">
                      <Label htmlFor="tax-jurisdiction">Tax Jurisdiction</Label>
                      <p className="text-xs text-muted-foreground">Determines which country-specific tax rules are applied</p>
                      <Select value={country} onValueChange={setCountry}>
                        <SelectTrigger id="tax-jurisdiction">
                          <SelectValue placeholder="Select jurisdiction" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US">United States (US)</SelectItem>
                          <SelectItem value="UK">United Kingdom (UK)</SelectItem>
                          <SelectItem value="DE">Germany (DE)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="calculation-method">Cost Basis Method</Label>
                      <Select value={costBasisMethod} onValueChange={setCostBasisMethod}>
                        <SelectTrigger id="calculation-method">
                          <SelectValue placeholder="Select method" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FIFO">FIFO (First In, First Out)</SelectItem>
                          <SelectItem value="LIFO">LIFO (Last In, First Out)</SelectItem>
                          <SelectItem value="HIFO">HIFO (Highest In, First Out)</SelectItem>
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

                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Notifications</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">Email Notifications</h4>
                        <p className="text-xs text-muted-foreground">
                          Receive important updates via email
                        </p>
                      </div>
                      <div className="ml-auto flex h-6 items-center space-x-2">
                        <input
                          id="email-notifications"
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          defaultChecked
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">Tax Deadline Reminders</h4>
                        <p className="text-xs text-muted-foreground">
                          Get notified about upcoming tax deadlines
                        </p>
                      </div>
                      <div className="ml-auto flex h-6 items-center space-x-2">
                        <input
                          id="deadline-reminders"
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          defaultChecked
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-medium">New Features Announcements</h4>
                        <p className="text-xs text-muted-foreground">
                          Stay updated about new features and improvements
                        </p>
                      </div>
                      <div className="ml-auto flex h-6 items-center space-x-2">
                        <input
                          id="feature-announcements"
                          type="checkbox"
                          className="h-4 w-4 rounded border-gray-300"
                          defaultChecked
                        />
                      </div>
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
                <CardDescription>
                  Manage your account security and privacy settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Change Password</h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="current-password">Current Password</Label>
                      <Input id="current-password" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-password">New Password</Label>
                      <Input id="new-password" type="password" />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm-password">Confirm New Password</Label>
                      <Input id="confirm-password" type="password" />
                    </div>
                    <Button>Update Password</Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Two-Factor Authentication</h3>
                      <p className="text-sm text-muted-foreground">
                        Add an extra layer of security to your account
                      </p>
                    </div>
                    <Button variant="outline">Enable</Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-medium">Delete Account</h3>
                      <p className="text-sm text-muted-foreground">
                        Permanently delete your account and all associated data
                      </p>
                    </div>
                    <Button variant="destructive">Delete</Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
