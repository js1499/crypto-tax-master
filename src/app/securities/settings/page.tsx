"use client";

import { useState, useEffect } from "react";
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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Save } from "lucide-react";
import { toast } from "sonner";

export default function SecuritiesSettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [taxStatus, setTaxStatus] = useState("INVESTOR");
  const [costBasisMethod, setCostBasisMethod] = useState("FIFO");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    fetch(`/api/securities/settings?year=${year}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && data.settings) {
          setTaxStatus(data.settings.taxStatus || "INVESTOR");
        }
      })
      .catch(() => {});
  }, [mounted, year]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/securities/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: parseInt(year), taxStatus }),
      });
      const data = await res.json();
      if (data.status === "success") {
        toast.success("Securities settings saved.");
      } else {
        toast.error(data.error || "Failed to save settings.");
      }
    } catch {
      toast.error("Failed to save settings.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!mounted) {
    return null;
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => String(currentYear - i));

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A1A]">Securities Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your tax filing preferences for securities.
          </p>
        </div>

        {/* Year selector */}
        <div className="flex items-center gap-4">
          <Label className="text-[#1A1A1A]">Tax Year</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Tax Status */}
        <Card className="border-[#E5E5E0]">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">Tax Status</CardTitle>
            <CardDescription>
              Your filing status affects how gains and losses are reported.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[#1A1A1A]">Filing Status</Label>
              <Select value={taxStatus} onValueChange={setTaxStatus}>
                <SelectTrigger className="w-[320px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="INVESTOR">Investor</SelectItem>
                  <SelectItem value="TRADER_NO_MTM">Trader (No Mark-to-Market)</SelectItem>
                  <SelectItem value="TRADER_MTM">Trader (Mark-to-Market Election)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {taxStatus === "INVESTOR" &&
                  "Standard investor status. Capital gains reported on Form 8949 / Schedule D."}
                {taxStatus === "TRADER_NO_MTM" &&
                  "Trader status without Section 475(f) election. Capital gains on Form 8949, expenses on Schedule C."}
                {taxStatus === "TRADER_MTM" &&
                  "Trader status with Section 475(f) mark-to-market election. Gains/losses reported on Form 4797."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Cost Basis Method */}
        <Card className="border-[#E5E5E0]">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">Cost Basis Method</CardTitle>
            <CardDescription>
              The method used to determine which lots are sold first.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[#1A1A1A]">Method</Label>
              <Select value={costBasisMethod} onValueChange={setCostBasisMethod}>
                <SelectTrigger className="w-[320px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIFO">FIFO (First In, First Out)</SelectItem>
                  <SelectItem value="LIFO">LIFO (Last In, First Out)</SelectItem>
                  <SelectItem value="HIFO">HIFO (Highest In, First Out)</SelectItem>
                  <SelectItem value="SPEC_ID">Specific Identification</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </div>
    </Layout>
  );
}
