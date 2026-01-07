"use client";

import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { ArrowUpRight, ArrowDownRight, Coins, Wallet, ExternalLink, TrendingUp, TrendingDown, FileBadge } from "lucide-react";
import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useRouter } from "next/navigation";

// Empty data structures instead of mock data
const portfolioValueData = [];
const assetsData = [];
const transactionsData = [];
const nftData = [];
const defiData = [];

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [assetType, setAssetType] = useState("coins");
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return null;
  }

  const handleCoinClick = (symbol) => {
    router.push(`/coins/${symbol}`);
  };

  return (
    <Layout>
      <div className="space-y-8">
        <h1 className="text-2xl font-bold">Dashboard</h1>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Total Portfolio Value
              </CardTitle>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$0.00</div>
              <div className="flex items-center text-xs text-muted-foreground">
                No portfolio data
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Unrealized Gains
              </CardTitle>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$0.00</div>
              <div className="flex items-center text-xs text-muted-foreground">
                No gains data
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Taxable Events (2023)
              </CardTitle>
              <FileBadge className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$0.00</div>
              <div className="flex items-center text-xs text-muted-foreground">
                0 transactions
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Tabs defaultValue="portfolio">
            <TabsList>
              <TabsTrigger value="portfolio">Portfolio Value</TabsTrigger>
              <TabsTrigger value="asset">Asset Allocation</TabsTrigger>
              <TabsTrigger value="transactions">Recent Transactions</TabsTrigger>
            </TabsList>

            <TabsContent value="portfolio">
              <Card>
                <CardHeader>
                  <CardTitle>Portfolio Value Over Time</CardTitle>
                </CardHeader>
                <CardContent className="h-[400px]">
                  {portfolioValueData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={portfolioValueData}
                        margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                      >
                        <CartesianGrid 
                          strokeDasharray="3 3" 
                          stroke="hsl(var(--muted-foreground))"
                          strokeOpacity={0.6}
                        />
                        <XAxis 
                          dataKey="date" 
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                        />
                        <YAxis 
                          tickFormatter={(value) => `$${value.toLocaleString()}`}
                          tick={{ fontSize: 12 }}
                          tickLine={false}
                        />
                        <Tooltip 
                          formatter={(value) => [`$${value.toLocaleString()}`, 'Portfolio Value']}
                          labelFormatter={(label) => `Date: ${label}`}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--card-foreground))',
                            borderRadius: 'var(--radius)',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                          }}
                          labelStyle={{
                            color: 'hsl(var(--card-foreground))',
                            fontWeight: 500
                          }}
                          itemStyle={{
                            color: 'hsl(var(--card-foreground))'
                          }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="value" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 6 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">No portfolio data</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                          Connect accounts or add transactions to see your portfolio value over time.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="asset">
              <Card>
                <CardHeader>
                  <CardTitle>Asset Allocation</CardTitle>
                </CardHeader>
                <CardContent className="h-[400px]">
                  {assetsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={assetsData}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={150}
                          fill="#8884d8"
                          dataKey="value"
                          nameKey="name"
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {assetsData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [`${value}%`, 'Allocation']}
                          contentStyle={{
                            backgroundColor: 'hsl(var(--card))',
                            borderColor: 'hsl(var(--border))',
                            color: 'hsl(var(--card-foreground))',
                            borderRadius: 'var(--radius)',
                            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                          }}
                          labelStyle={{
                            color: 'hsl(var(--card-foreground))',
                            fontWeight: 500
                          }}
                          itemStyle={{
                            color: 'hsl(var(--card-foreground))'
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Coins className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">No assets found</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                          Connect accounts or add transactions to see your asset allocation.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="transactions">
              <Card>
                <CardContent className="p-0">
                  {transactionsData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left font-medium text-muted-foreground p-4">Type</th>
                            <th className="text-left font-medium text-muted-foreground p-4">Asset</th>
                            <th className="text-right font-medium text-muted-foreground p-4">Amount</th>
                            <th className="text-right font-medium text-muted-foreground p-4">Value</th>
                            <th className="text-right font-medium text-muted-foreground p-4">Date</th>
                            <th className="text-right font-medium text-muted-foreground p-4">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {transactionsData.map((transaction) => (
                            <tr key={transaction.id} className="border-b last:border-b-0">
                              <td className="p-4">
                                <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
                                  transaction.type === "Buy"
                                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                                    : transaction.type === "Sell"
                                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                }`}>
                                  {transaction.type}
                                </span>
                              </td>
                              <td className="p-4">{transaction.asset}</td>
                              <td className="p-4 text-right">{transaction.amount}</td>
                              <td className="p-4 text-right">{transaction.value}</td>
                              <td className="p-4 text-right">{transaction.date}</td>
                              <td className="p-4 text-right">
                                <span className="inline-flex items-center rounded-full px-2 py-1 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                  {transaction.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-[400px]">
                      <div className="text-center">
                        <ArrowUpRight className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                        <h3 className="text-lg font-medium mb-2">No transactions</h3>
                        <p className="text-muted-foreground max-w-md mx-auto">
                          Connect accounts or add transactions to see your recent activity.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Holdings Section */}
      <div className="mt-10 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-2xl font-bold">Holdings</h2>
          <div className="mt-2 sm:mt-0 flex items-center gap-2">
            <div className="bg-muted rounded-lg p-1 inline-flex">
              <button 
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${assetType === "coins" 
                  ? "bg-background shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setAssetType("coins")}
              >
                Coins
              </button>
              <button 
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${assetType === "nfts" 
                  ? "bg-background shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setAssetType("nfts")}
              >
                NFTs
              </button>
              <button 
                className={`px-3 py-1.5 text-sm font-medium rounded-md ${assetType === "defi" 
                  ? "bg-background shadow-sm" 
                  : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => setAssetType("defi")}
              >
                DeFi
              </button>
            </div>
            <button className="p-1.5 rounded-md hover:bg-muted">
              <ArrowUpRight className="h-5 w-5 text-muted-foreground" />
            </button>
          </div>
        </div>

        {assetType === "coins" && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <Coins className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">No coins found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Connect accounts or add transactions to see your coin holdings.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {assetType === "nfts" && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">No NFTs found</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Connect accounts or add transactions to see your NFT holdings.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {assetType === "defi" && (
          <Card>
            <CardContent className="p-0">
              <div className="flex items-center justify-center h-[400px]">
                <div className="text-center">
                  <Wallet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">No DeFi positions</h3>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    Connect accounts or add transactions to see your DeFi positions.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
