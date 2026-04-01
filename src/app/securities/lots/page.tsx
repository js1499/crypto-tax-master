"use client";

import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default function SecuritiesLotsPage() {
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
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1A1A]">Tax Lots</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track your open and closed tax lots for securities positions.
          </p>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="open">
          <TabsList>
            <TabsTrigger value="open">Open Lots</TabsTrigger>
            <TabsTrigger value="closed">Closed Lots</TabsTrigger>
          </TabsList>

          <TabsContent value="open">
            <div className="rounded-lg border border-[#E5E5E0]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[#1A1A1A]">Symbol</TableHead>
                    <TableHead className="text-[#1A1A1A]">Quantity</TableHead>
                    <TableHead className="text-[#1A1A1A]">Cost Basis/Share</TableHead>
                    <TableHead className="text-[#1A1A1A]">Total Cost Basis</TableHead>
                    <TableHead className="text-[#1A1A1A]">Date Acquired</TableHead>
                    <TableHead className="text-[#1A1A1A]">Holding Period</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                      No open lots. Import transactions to generate tax lots.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          <TabsContent value="closed">
            <div className="rounded-lg border border-[#E5E5E0]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[#1A1A1A]">Symbol</TableHead>
                    <TableHead className="text-[#1A1A1A]">Quantity</TableHead>
                    <TableHead className="text-[#1A1A1A]">Proceeds</TableHead>
                    <TableHead className="text-[#1A1A1A]">Cost Basis</TableHead>
                    <TableHead className="text-[#1A1A1A]">Gain/Loss</TableHead>
                    <TableHead className="text-[#1A1A1A]">Date Acquired</TableHead>
                    <TableHead className="text-[#1A1A1A]">Date Sold</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      No closed lots yet.
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
