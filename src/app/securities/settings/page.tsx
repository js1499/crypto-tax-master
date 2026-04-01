"use client";

import { useState, useEffect, useCallback } from "react";
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Save, Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EquivalenceGroup {
  id: string;
  groupName: string;
  symbols: string[];
  createdAt: string;
}

interface Section1256Symbol {
  id: number;
  symbol: string;
  description: string | null;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function SecuritiesSettingsPage() {
  const [mounted, setMounted] = useState(false);
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [taxStatus, setTaxStatus] = useState("INVESTOR");
  const [costBasisMethod, setCostBasisMethod] = useState("FIFO");
  const [substantiallyIdenticalMethod, setSubstantiallyIdenticalMethod] =
    useState("METHOD_1");
  const [isSaving, setIsSaving] = useState(false);

  // Equivalence groups state
  const [groups, setGroups] = useState<EquivalenceGroup[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupSymbols, setNewGroupSymbols] = useState("");
  const [isAddingGroup, setIsAddingGroup] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);

  // Section 1256 symbols state
  const [s1256Symbols, setS1256Symbols] = useState<Section1256Symbol[]>([]);
  const [s1256Loading, setS1256Loading] = useState(false);
  const [newS1256Symbol, setNewS1256Symbol] = useState("");
  const [newS1256Description, setNewS1256Description] = useState("");
  const [isAddingS1256, setIsAddingS1256] = useState(false);
  const [deletingS1256, setDeletingS1256] = useState<string | null>(null);

  // Section 988 election state
  const [section988Election, setSection988Election] = useState("no");

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch settings when year changes
  useEffect(() => {
    if (!mounted) return;
    fetch(`/api/securities/settings?year=${year}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.status === "success" && data.settings) {
          setTaxStatus(data.settings.taxStatus || "INVESTOR");
          setSubstantiallyIdenticalMethod(
            data.settings.substantiallyIdenticalMethod || "METHOD_1",
          );
          setSection988Election(
            data.settings.section988Election ? "yes" : "no",
          );
        }
      })
      .catch(() => {});
  }, [mounted, year]);

  // Fetch equivalence groups
  const fetchGroups = useCallback(async () => {
    setGroupsLoading(true);
    try {
      const res = await fetch("/api/securities/equivalence-groups");
      const data = await res.json();
      if (data.status === "success") {
        setGroups(data.groups || []);
      }
    } catch {
      // Silently fail on initial load
    } finally {
      setGroupsLoading(false);
    }
  }, []);

  // Fetch Section 1256 symbols
  const fetchS1256Symbols = useCallback(async () => {
    setS1256Loading(true);
    try {
      const res = await fetch("/api/securities/section-1256-symbols");
      const data = await res.json();
      if (data.status === "success") {
        setS1256Symbols(data.symbols || []);
      }
    } catch {
      // Silently fail on initial load
    } finally {
      setS1256Loading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      fetchGroups();
      fetchS1256Symbols();
    }
  }, [mounted, fetchGroups, fetchS1256Symbols]);

  // Save settings
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/securities/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          year: parseInt(year),
          taxStatus,
          substantiallyIdenticalMethod,
          section988Election: section988Election === "yes",
        }),
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

  // Add equivalence group
  const handleAddGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Group name is required.");
      return;
    }

    const symbols = newGroupSymbols
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter((s) => s.length > 0);

    if (symbols.length < 2) {
      toast.error("At least two symbols are required (comma-separated).");
      return;
    }

    setIsAddingGroup(true);
    try {
      const res = await fetch("/api/securities/equivalence-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          groupName: newGroupName.trim(),
          symbols,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        toast.success("Equivalence group created.");
        setNewGroupName("");
        setNewGroupSymbols("");
        fetchGroups();
      } else {
        toast.error(data.error || "Failed to create group.");
      }
    } catch {
      toast.error("Failed to create equivalence group.");
    } finally {
      setIsAddingGroup(false);
    }
  };

  // Delete equivalence group
  const handleDeleteGroup = async (id: string) => {
    setDeletingGroupId(id);
    try {
      const res = await fetch(
        `/api/securities/equivalence-groups?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.status === "success") {
        toast.success("Equivalence group deleted.");
        fetchGroups();
      } else {
        toast.error(data.error || "Failed to delete group.");
      }
    } catch {
      toast.error("Failed to delete equivalence group.");
    } finally {
      setDeletingGroupId(null);
    }
  };

  // Add Section 1256 symbol
  const handleAddS1256Symbol = async () => {
    if (!newS1256Symbol.trim()) {
      toast.error("Symbol is required.");
      return;
    }

    setIsAddingS1256(true);
    try {
      const res = await fetch("/api/securities/section-1256-symbols", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: newS1256Symbol.trim().toUpperCase(),
          description: newS1256Description.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.status === "success") {
        toast.success("Section 1256 symbol added.");
        setNewS1256Symbol("");
        setNewS1256Description("");
        fetchS1256Symbols();
      } else {
        toast.error(data.error || "Failed to add symbol.");
      }
    } catch {
      toast.error("Failed to add Section 1256 symbol.");
    } finally {
      setIsAddingS1256(false);
    }
  };

  // Delete Section 1256 symbol
  const handleDeleteS1256Symbol = async (symbol: string) => {
    setDeletingS1256(symbol);
    try {
      const res = await fetch(
        `/api/securities/section-1256-symbols?symbol=${encodeURIComponent(symbol)}`,
        { method: "DELETE" },
      );
      const data = await res.json();
      if (data.status === "success") {
        toast.success("Section 1256 symbol removed.");
        fetchS1256Symbols();
      } else {
        toast.error(data.error || "Failed to remove symbol.");
      }
    } catch {
      toast.error("Failed to remove Section 1256 symbol.");
    } finally {
      setDeletingS1256(null);
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
          <h1 className="text-2xl font-semibold text-[#1A1A1A]">
            Securities Settings
          </h1>
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
                  <SelectItem value="TRADER_NO_MTM">
                    Trader (No Mark-to-Market)
                  </SelectItem>
                  <SelectItem value="TRADER_MTM">
                    Trader (Mark-to-Market Election)
                  </SelectItem>
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
              <Select
                value={costBasisMethod}
                onValueChange={setCostBasisMethod}
              >
                <SelectTrigger className="w-[320px]">
                  <SelectValue />
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
                  <SelectItem value="SPEC_ID">
                    Specific Identification
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Substantially Identical Method */}
        <Card className="border-[#E5E5E0]">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">
              Substantially Identical Method
            </CardTitle>
            <CardDescription>
              Controls how wash sale detection matches securities as
              &quot;substantially identical&quot; for options and related
              instruments.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[#1A1A1A]">Method</Label>
              <Select
                value={substantiallyIdenticalMethod}
                onValueChange={setSubstantiallyIdenticalMethod}
              >
                <SelectTrigger className="w-[420px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="METHOD_1">
                    Method 1 (Conservative)
                  </SelectItem>
                  <SelectItem value="METHOD_2">Method 2 (Narrow)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {substantiallyIdenticalMethod === "METHOD_1" &&
                  "Conservative: any option on the same underlying is considered substantially identical to the stock and to other options on that underlying. This is the safer approach most tax professionals recommend."}
                {substantiallyIdenticalMethod === "METHOD_2" &&
                  "Narrow: only options with the same underlying, type (call/put), strike price, and expiration date are considered substantially identical. The stock and its options are not matched. More aggressive position."}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Equivalence Groups */}
        <Card className="border-[#E5E5E0]">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">
              Equivalence Groups
            </CardTitle>
            <CardDescription>
              Define groups of symbols that should be treated as substantially
              identical for wash sale detection (e.g., SPY and IVV both track
              the S&P 500).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Existing groups */}
            {groupsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading equivalence groups...
              </div>
            ) : groups.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No equivalence groups defined. Add a group below.
              </p>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => (
                  <div
                    key={group.id}
                    className="flex items-center justify-between rounded-lg border border-[#E5E5E0] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">
                        {group.groupName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {group.symbols.join(", ")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteGroup(group.id)}
                      disabled={deletingGroupId === group.id}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingGroupId === group.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new group */}
            <div className="border-t border-[#E5E5E0] pt-4 space-y-3">
              <p className="text-sm font-medium text-[#1A1A1A]">
                Add New Group
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Group Name
                  </Label>
                  <Input
                    placeholder="e.g., S&P 500 Trackers"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    className="w-[220px]"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs text-muted-foreground">
                    Symbols (comma-separated)
                  </Label>
                  <Input
                    placeholder="e.g., SPY, IVV, VOO"
                    value={newGroupSymbols}
                    onChange={(e) => setNewGroupSymbols(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddGroup}
                    disabled={isAddingGroup}
                    size="sm"
                    className="gap-1.5"
                  >
                    {isAddingGroup ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add Group
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 1256 Symbols */}
        <Card className="border-[#E5E5E0]">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">
              Section 1256 Contracts
            </CardTitle>
            <CardDescription>
              Section 1256 contracts receive 60/40 tax treatment (60%
              long-term, 40% short-term) regardless of holding period.
              Qualifying symbols are marked to market at year end.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Existing symbols */}
            {s1256Loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading Section 1256 symbols...
              </div>
            ) : s1256Symbols.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                No Section 1256 symbols configured. Add symbols below.
              </p>
            ) : (
              <div className="space-y-3">
                {s1256Symbols.map((sym) => (
                  <div
                    key={sym.id}
                    className="flex items-center justify-between rounded-lg border border-[#E5E5E0] px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-[#1A1A1A]">
                        {sym.symbol}
                        {sym.isDefault && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            (default)
                          </span>
                        )}
                      </p>
                      {sym.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {sym.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteS1256Symbol(sym.symbol)}
                      disabled={deletingS1256 === sym.symbol}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingS1256 === sym.symbol ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new symbol */}
            <div className="border-t border-[#E5E5E0] pt-4 space-y-3">
              <p className="text-sm font-medium text-[#1A1A1A]">
                Add Symbol
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Symbol
                  </Label>
                  <Input
                    placeholder="e.g., /ES"
                    value={newS1256Symbol}
                    onChange={(e) => setNewS1256Symbol(e.target.value)}
                    className="w-[140px]"
                  />
                </div>
                <div className="space-y-1.5 flex-1">
                  <Label className="text-xs text-muted-foreground">
                    Description (optional)
                  </Label>
                  <Input
                    placeholder="e.g., E-mini S&P 500 Futures"
                    value={newS1256Description}
                    onChange={(e) => setNewS1256Description(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    onClick={handleAddS1256Symbol}
                    disabled={isAddingS1256}
                    size="sm"
                    className="gap-1.5"
                  >
                    {isAddingS1256 ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4" />
                    )}
                    Add Symbol
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 988 Forex Election */}
        <Card className="border-[#E5E5E0]">
          <CardHeader>
            <CardTitle className="text-[#1A1A1A]">
              Section 988 Forex Election
            </CardTitle>
            <CardDescription>
              By default, forex gains and losses are treated as ordinary
              income/loss under Section 988. You may elect to opt out and treat
              forex gains/losses as capital gains/losses instead. This election
              applies per tax year.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-[#1A1A1A]">
                Opt out of Section 988?
              </Label>
              <Select
                value={section988Election}
                onValueChange={setSection988Election}
              >
                <SelectTrigger className="w-[320px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">
                    No (Default: Ordinary Treatment)
                  </SelectItem>
                  <SelectItem value="yes">
                    Yes (Capital Gains Treatment)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {section988Election === "no" &&
                  "Forex gains/losses reported as ordinary income/loss. This is the default IRS treatment under Section 988."}
                {section988Election === "yes" &&
                  "Forex gains/losses treated as capital gains/losses on Form 8949 / Schedule D. Requires a contemporaneous opt-out election filed before the transaction."}
              </p>
              <p className="text-xs text-muted-foreground">
                Note: Currency futures traded on regulated exchanges are always
                treated as Section 1256 contracts regardless of this election.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Mark-to-Market Info (visible only for TRADER_MTM) */}
        {taxStatus === "TRADER_MTM" && (
          <Card className="border-[#E5E5E0]">
            <CardHeader>
              <CardTitle className="text-[#1A1A1A]">
                Mark-to-Market (Section 475)
              </CardTitle>
              <CardDescription>
                You have elected Section 475(f) mark-to-market accounting. All
                trading gains and losses are reported as ordinary on Form 4797.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                  <p className="text-sm text-blue-900 font-medium">
                    Segregated Investment Positions
                  </p>
                  <p className="text-xs text-blue-800 mt-1">
                    Under Section 475(f), you may segregate certain positions
                    as &quot;investment&quot; holdings that are excluded from
                    mark-to-market treatment. Segregated positions retain
                    capital gain/loss treatment and remain subject to wash sale
                    rules.
                  </p>
                  <p className="text-xs text-blue-800 mt-2">
                    To mark a position as a segregated investment, flag the
                    lot&apos;s &quot;isSegregatedInvestment&quot; field in your
                    brokerage import or lot editor. These positions must be
                    clearly identified in your records before the start of the
                    tax year.
                  </p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
                  <p className="text-sm text-amber-900 font-medium">
                    Section 481(a) Transition Adjustment
                  </p>
                  <p className="text-xs text-amber-800 mt-1">
                    In the first year of your 475(f) election, all positions
                    held on January 1 are deemed sold at fair market value on
                    the last business day of the prior year. This creates a
                    Section 481(a) adjustment that is included in your ordinary
                    income for the election year.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

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
