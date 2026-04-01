"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { PlusCircle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SecuritiesAccountsPage() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-[#1A1A1A]">Securities Accounts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Connect your brokerage accounts to import securities transactions.
            </p>
          </div>
          <Button className="gap-2">
            <PlusCircle className="h-4 w-4" />
            Add Brokerage
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-[#E5E5E0]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[#1A1A1A]">Name</TableHead>
                <TableHead className="text-[#1A1A1A]">Provider</TableHead>
                <TableHead className="text-[#1A1A1A]">Account Type</TableHead>
                <TableHead className="text-[#1A1A1A]">Status</TableHead>
                <TableHead className="text-[#1A1A1A]">Last Synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                  No brokerage accounts connected yet. Click &quot;Add Brokerage&quot; to get started.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
