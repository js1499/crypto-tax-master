"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SecuritiesTransactionsPage() {
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
            <h1 className="text-2xl font-semibold text-[#1A1A1A]">Securities Transactions</h1>
            <p className="text-sm text-muted-foreground mt-1">
              View and manage your securities transactions across all brokerage accounts.
            </p>
          </div>
          <Button className="gap-2">
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        </div>

        {/* Table */}
        <div className="rounded-lg border border-[#E5E5E0]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[#1A1A1A]">Date</TableHead>
                <TableHead className="text-[#1A1A1A]">Type</TableHead>
                <TableHead className="text-[#1A1A1A]">Symbol</TableHead>
                <TableHead className="text-[#1A1A1A]">Quantity</TableHead>
                <TableHead className="text-[#1A1A1A]">Price</TableHead>
                <TableHead className="text-[#1A1A1A]">Fees</TableHead>
                <TableHead className="text-[#1A1A1A]">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  No securities transactions yet. Click &quot;Import CSV&quot; to get started.
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
