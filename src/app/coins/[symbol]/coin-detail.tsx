"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { 
  ArrowLeft, 
  Flag, 
  Info, 
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";

interface CoinDetailProps {
  coin: any;
  symbol: string;
}

export function CoinDetail({ coin, symbol }: CoinDetailProps) {
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [dateRange, setDateRange] = useState("1D");
  const [needsReview, setNeedsReview] = useState(false);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    setMounted(true);

    // Generate chart data on the client side
    const generateChartData = () => {
      let basePrice = 0;
      let volatility = 0;

      // Set different base prices and volatility for different coins
      if (symbol === 'btc') {
        basePrice = 40000;
        volatility = 2000;
      } else if (symbol === 'eth') {
        basePrice = 2150;
        volatility = 100;
      } else if (symbol === 'sol') {
        basePrice = 110;
        volatility = 15;
      } else if (symbol === 'usdc') {
        basePrice = 1;
        volatility = 0.001;
      }

      // Generate data points
      const data = Array.from({ length: 30 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (29 - i));
        // Base price with small random variations
        const randomVariation = (Math.random() - 0.5) * volatility;
        return {
          date: format(date, "MMM dd"),
          price: basePrice + (i * (basePrice * 0.002)) + randomVariation
        };
      });

      setChartData(data);
    };

    generateChartData();

    // Determine if this coin needs review based on tax lots
    if (coin.taxLots && coin.taxLots.some(lot => 
      lot.date.includes('2024-04-15') || 
      parseFloat(lot.gainPercent) < -15)
    ) {
      setNeedsReview(true);
    }
  }, [symbol, coin.taxLots]);

  if (!mounted) {
    return null;
  }

  const handleBack = () => {
    router.push('/');
  };

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header with back button and coin info */}
        <div className="flex flex-col gap-6">
          <Button 
            variant="ghost" 
            className="w-fit p-0 hover:bg-transparent" 
            onClick={handleBack}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            <span>Back</span>
          </Button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div 
                className="flex h-12 w-12 items-center justify-center rounded-full" 
                style={{ backgroundColor: `${coin.color}20` }}
              >
                <span className="text-lg font-bold" style={{ color: coin.color }}>
                  {coin.symbol.charAt(0).toUpperCase() + coin.symbol.slice(1, 3)}
                </span>
              </div>
              <div>
                <h1 className="text-2xl font-bold">{coin.name}</h1>
                <div className="text-sm text-muted-foreground">{coin.symbol.toUpperCase()}</div>
              </div>
            </div>

            <Button variant="outline" className="gap-2">
              <Flag className="h-4 w-4" />
              <span>Report</span>
            </Button>
          </div>
        </div>

        {/* Price section */}
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-3">
            <h2 className="text-3xl font-bold">{coin.currentPrice}</h2>
            <div className={`text-sm font-medium ${coin.priceChange.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
              {coin.priceChange}
            </div>
          </div>
        </div>

        {/* Chart section */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              {/* Date range picker */}
              <div className="inline-flex items-center rounded-md bg-muted p-1 text-muted-foreground">
                {["1D", "1W", "1M", "YTD", "1Y", "ALL"].map((range) => (
                  <Button
                    key={range}
                    variant={dateRange === range ? "default" : "ghost"}
                    size="sm"
                    className="text-xs"
                    onClick={() => setDateRange(range)}
                  >
                    {range}
                  </Button>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: coin.color }}></div>
                  <span className="text-xs text-muted-foreground">Price</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.6} />
                <XAxis 
                  dataKey="date" 
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                  padding={{ left: 10, right: 10 }}
                />
                <YAxis 
                  tickFormatter={(value) => `$${value.toLocaleString()}`}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12 }}
                  domain={['auto', 'auto']}
                />
                <Tooltip
                  formatter={(value) => [`$${Number(value).toLocaleString()}`, 'Price']}
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
                  dataKey="price"
                  stroke={coin.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 6, stroke: coin.color, strokeWidth: 2, fill: 'hsl(var(--background))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Details and position grid */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Details section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground">Market cap</div>
                    <div className="font-medium">{coin.marketCap}</div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground">Volume (24h)</div>
                    <div className="font-medium">{coin.volume}</div>
                  </div>
                </div>
                
                <div className="pt-1">
                  <div className="mb-1 text-sm text-muted-foreground">Source</div>
                  <div className="flex items-center gap-2">
                    <div className="rounded-md bg-muted px-2 py-1 text-xs">
                      CoinGecko
                    </div>
                    <button className="rounded-md text-xs text-muted-foreground hover:text-primary">
                      Change source
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Overall position section */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Overall Position</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Amount</div>
                  <div className="flex items-center gap-1">
                    <div className="font-medium">{coin.amount}</div>
                    <Info className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Current Value</div>
                  <div className="font-medium">{coin.value}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Return</div>
                  <div className={`font-medium ${coin.return.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                    {coin.return}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Return %</div>
                  <div className={`font-medium ${coin.returnPercent.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                    {coin.returnPercent}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tax lots section */}
        <div>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold">Tax Lots</h2>
            {needsReview && (
              <div className="flex items-center gap-1 rounded-md bg-yellow-100 px-2 py-1 text-xs text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3" />
                <span>Needs review</span>
              </div>
            )}
          </div>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Cost Basis</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Current Value</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gain/Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coin.taxLots.map((lot) => (
                      <tr key={lot.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3">
                          {format(new Date(lot.date), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 text-right">{lot.amount}</td>
                        <td className="px-4 py-3 text-right">
                          <div>{lot.costBasis}</div>
                          <div className="text-xs text-muted-foreground">@ {lot.price}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div>{lot.currentValue}</div>
                          <div className="text-xs text-muted-foreground">@ {lot.currentPrice}</div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className={`${lot.gain.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                            {lot.gain}
                          </div>
                          <div className={`text-xs ${lot.gainPercent.startsWith('+') ? 'text-green-500' : 'text-red-500'}`}>
                            {lot.gainPercent}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Transactions section */}
        <div>
          <h2 className="mb-4 text-xl font-bold">Transactions</h2>
          
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Price</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Value</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Fee</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Exchange</th>
                    </tr>
                  </thead>
                  <tbody>
                    {coin.transactions.map((transaction) => (
                      <tr key={transaction.id} className="border-b last:border-0 hover:bg-muted/40">
                        <td className="px-4 py-3 text-left">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              transaction.type === "Buy"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
                                : transaction.type === "Sell"
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400"
                                : transaction.type === "Receive"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
                                : transaction.type === "Send"
                                ? "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400"
                                : transaction.type === "Swap"
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
                                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                            }`}
                          >
                            {transaction.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {format(new Date(transaction.date), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 text-right">{transaction.amount}</td>
                        <td className="px-4 py-3 text-right">{transaction.price}</td>
                        <td className="px-4 py-3 text-right">{transaction.value}</td>
                        <td className="px-4 py-3 text-right">{transaction.fee}</td>
                        <td className="px-4 py-3 text-right">{transaction.exchange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
} 