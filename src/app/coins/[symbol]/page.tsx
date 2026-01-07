import { CoinDetail } from './coin-detail';

// Mock data for coin details
const coinData = {
  "btc": {
    name: "Bitcoin",
    symbol: "BTC",
    logo: "bitcoin",
    color: "#F7931A",
    currentPrice: "$42,381.54",
    priceChange: "+1.2%",
    marketCap: "$825,614,023,451",
    volume: "$22.4B",
    amount: "0.2 BTC",
    value: "$8,476.31",
    return: "+$421.58",
    returnPercent: "+5.23%",
    taxLots: [
      {
        id: 1,
        date: "2023-11-10",
        amount: "0.12 BTC",
        costBasis: "$4,800.22",
        price: "$40,001.83",
        value: "$4,800.22",
        currentPrice: "$42,381.54",
        currentValue: "$5,085.78",
        gain: "+$285.56",
        gainPercent: "+5.95%"
      },
      {
        id: 2,
        date: "2023-12-15",
        amount: "0.08 BTC",
        costBasis: "$3,250.53",
        price: "$40,631.62",
        value: "$3,250.53",
        currentPrice: "$42,381.54",
        currentValue: "$3,390.52",
        gain: "+$139.99",
        gainPercent: "+4.31%"
      }
    ],
    transactions: [
      {
        id: 1,
        type: "Buy",
        date: "2023-12-15T15:32:41Z",
        amount: "0.08 BTC",
        price: "$40,631.62",
        value: "$3,250.53",
        fee: "$8.99",
        exchange: "Coinbase"
      },
      {
        id: 2,
        type: "Buy",
        date: "2023-11-10T11:22:35Z",
        amount: "0.12 BTC",
        price: "$40,001.83",
        value: "$4,800.22",
        fee: "$12.50",
        exchange: "Coinbase"
      },
      {
        id: 3,
        type: "Receive",
        date: "2023-10-05T09:15:22Z",
        amount: "0.01 BTC",
        price: "$38,450.75",
        value: "$384.51",
        fee: "$0.00",
        exchange: "External Wallet"
      },
      {
        id: 4,
        type: "Send",
        date: "2023-09-22T14:45:18Z",
        amount: "0.01 BTC",
        price: "$39,250.30",
        value: "$392.50",
        fee: "$1.25",
        exchange: "External Wallet"
      }
    ],
    chartData: [] // We'll generate this client-side
  },
  "eth": {
    name: "Ethereum",
    symbol: "ETH",
    logo: "ethereum",
    color: "#627EEA",
    currentPrice: "$2,305.76",
    priceChange: "+0.8%",
    marketCap: "$276,928,476,123",
    volume: "$14.7B",
    amount: "2.0 ETH",
    value: "$4,611.52",
    return: "+$215.92",
    returnPercent: "+4.91%",
    taxLots: [
      {
        id: 1,
        date: "2023-10-22",
        amount: "1.5 ETH",
        costBasis: "$3,300.45",
        price: "$2,200.30",
        value: "$3,300.45",
        currentPrice: "$2,305.76",
        currentValue: "$3,458.64",
        gain: "+$158.19",
        gainPercent: "+4.79%"
      },
      {
        id: 2,
        date: "2023-12-01",
        amount: "0.5 ETH",
        costBasis: "$1,095.15",
        price: "$2,190.30",
        value: "$1,095.15",
        currentPrice: "$2,305.76",
        currentValue: "$1,152.88",
        gain: "+$57.73",
        gainPercent: "+5.27%"
      }
    ],
    transactions: [
      {
        id: 1,
        type: "Buy",
        date: "2023-12-01T10:15:22Z",
        amount: "0.5 ETH",
        price: "$2,190.30",
        value: "$1,095.15",
        fee: "$4.99",
        exchange: "Binance"
      },
      {
        id: 2,
        type: "Buy",
        date: "2023-10-22T14:32:41Z",
        amount: "1.5 ETH",
        price: "$2,200.30",
        value: "$3,300.45",
        fee: "$9.50",
        exchange: "Coinbase"
      },
      {
        id: 3,
        type: "Swap",
        date: "2023-09-15T09:45:18Z",
        amount: "0.2 ETH → 0.01 BTC",
        price: "$2,150.25",
        value: "$430.05",
        fee: "$2.25",
        exchange: "Uniswap"
      }
    ],
    chartData: [] // We'll generate this client-side
  },
  "sol": {
    name: "Solana",
    symbol: "SOL",
    logo: "solana",
    color: "#00FFA3",
    currentPrice: "$129.76",
    priceChange: "+1.47%",
    marketCap: "$66,988,709,099",
    volume: "$4.6B",
    amount: "36.2837 SOL",
    value: "$4,708.18",
    return: "-$52.40",
    returnPercent: "-3.88%",
    taxLots: [
      {
        id: 1,
        date: "2023-11-05",
        amount: "20 SOL",
        costBasis: "$2,740.00",
        price: "$137.00",
        value: "$2,740.00",
        currentPrice: "$129.76",
        currentValue: "$2,595.20",
        gain: "-$144.80",
        gainPercent: "-5.28%"
      },
      {
        id: 2,
        date: "2023-12-10",
        amount: "10 SOL",
        costBasis: "$1,250.00",
        price: "$125.00",
        value: "$1,250.00",
        currentPrice: "$129.76",
        currentValue: "$1,297.60",
        gain: "+$47.60",
        gainPercent: "+3.81%"
      },
      {
        id: 3,
        date: "2024-04-15",
        amount: "3.1891 SOL",
        costBasis: "$502.62",
        price: "$157.60",
        value: "$502.62",
        currentPrice: "$129.76",
        currentValue: "$413.82",
        gain: "-$88.80",
        gainPercent: "-17.67%"
      },
      {
        id: 4,
        date: "2024-04-15",
        amount: "3.0946 SOL",
        costBasis: "$446.21",
        price: "$144.19",
        value: "$446.21",
        currentPrice: "$129.76",
        currentValue: "$401.56",
        gain: "-$44.65",
        gainPercent: "-10.01%"
      }
    ],
    transactions: [
      {
        id: 1,
        type: "Buy",
        date: "2023-11-05T13:45:22Z",
        amount: "20 SOL",
        price: "$137.00",
        value: "$2,740.00",
        fee: "$7.99",
        exchange: "Binance"
      },
      {
        id: 2,
        type: "Buy",
        date: "2023-12-10T16:32:41Z",
        amount: "10 SOL",
        price: "$125.00",
        value: "$1,250.00",
        fee: "$5.50",
        exchange: "Coinbase"
      },
      {
        id: 3,
        type: "Receive",
        date: "2024-04-15T08:22:15Z",
        amount: "3.1891 SOL",
        price: "$157.60",
        value: "$502.62",
        fee: "$0.00", 
        exchange: "System Program"
      },
      {
        id: 4,
        type: "Receive",
        date: "2024-04-15T08:22:15Z",
        amount: "3.0946 SOL",
        price: "$144.19",
        value: "$446.21",
        fee: "$0.00",
        exchange: "System Program"
      }
    ],
    chartData: [] // We'll generate this client-side
  },
  "usdc": {
    name: "USD Coin",
    symbol: "USDC",
    logo: "usdc",
    color: "#2775CA",
    currentPrice: "$1.00",
    priceChange: "0%",
    marketCap: "$33,584,913,882",
    volume: "$1.8B",
    amount: "873.8 USDC",
    value: "$873.80",
    return: "$0.00",
    returnPercent: "0.00%",
    taxLots: [
      {
        id: 1,
        date: "2023-12-20",
        amount: "873.8 USDC",
        costBasis: "$873.80",
        price: "$1.00",
        value: "$873.80",
        currentPrice: "$1.00",
        currentValue: "$873.80",
        gain: "$0.00",
        gainPercent: "0.00%"
      }
    ],
    transactions: [
      {
        id: 1,
        type: "Buy",
        date: "2023-12-20T10:15:22Z",
        amount: "873.8 USDC",
        price: "$1.00",
        value: "$873.80",
        fee: "$1.99",
        exchange: "Coinbase"
      }
    ],
    chartData: [] // We'll generate this client-side
  }
};

// Add generate static params function
export function generateStaticParams() {
  // Generate params for known coin symbols
  return [
    { symbol: 'btc' },
    { symbol: 'eth' },
    { symbol: 'sol' },
    { symbol: 'usdc' }
  ];
}

export default function CoinDetailPage({ params }) {
  const symbol = typeof params.symbol === 'string' ? params.symbol.toLowerCase() : 'sol';
  const coin = coinData[symbol] || coinData.sol;
  
  return <CoinDetail coin={coin} symbol={symbol} />;
} 