import { useId } from "react";

type MarkProps = { size?: number };

export function CoinbaseMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Coinbase">
      <circle cx="12" cy="12" r="11" fill="#0052FF" />
      <rect x="8" y="8" width="8" height="8" rx="1.6" fill="#fff" />
    </svg>
  );
}

export function KrakenMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Kraken">
      <circle cx="12" cy="12" r="11" fill="#7132F5" />
      <path
        d="M6.5 15.5v-3a5.5 5.5 0 0 1 11 0v3"
        stroke="#fff"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function HyperliquidMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Hyperliquid">
      <circle cx="12" cy="12" r="11" fill="#071A1A" />
      <path
        d="M5.2 12.4c1.8-4.9 4.2-6.5 6.1-3.3 1.6 2.6 2.9 2.3 4.1-.1 1.1-2.2 2.3-1.3 3.4 2.4-1.8 4.9-4.2 6.5-6.1 3.3-1.6-2.6-2.9-2.3-4.1.1-1.1 2.2-2.3 1.3-3.4-2.4Z"
        fill="#7FFFE1"
      />
    </svg>
  );
}

export function BinanceMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Binance">
      <circle cx="12" cy="12" r="11" fill="#F3BA2F" />
      <path d="m12 5 2.2 2.2L12 9.4 9.8 7.2 12 5Zm-3.7 3.7 2.2 2.2-2.2 2.2-2.2-2.2 2.2-2.2Zm7.4 0 2.2 2.2-2.2 2.2-2.2-2.2 2.2-2.2ZM12 12.4l2.2 2.2L12 16.8l-2.2-2.2 2.2-2.2Zm0-2.9 2.9 2.9-2.9 2.9-2.9-2.9L12 9.5Z" fill="#171717" />
    </svg>
  );
}

export function GeminiMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Gemini">
      <circle cx="12" cy="12" r="11" fill="#0B63CE" />
      <path d="M7 9.3h7.7A3.3 3.3 0 0 0 18 6H10.3A3.3 3.3 0 0 0 7 9.3Zm10 5.4H9.3A3.3 3.3 0 0 0 6 18h7.7a3.3 3.3 0 0 0 3.3-3.3Z" fill="#fff" />
      <path d="M9.3 7v7.7A3.3 3.3 0 0 0 12.6 18v-7.7A3.3 3.3 0 0 0 9.3 7Zm5.4-1v7.7A3.3 3.3 0 0 0 18 17V9.3A3.3 3.3 0 0 0 14.7 6Z" fill="#fff" opacity="0.85" />
    </svg>
  );
}

export function CryptoComMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Crypto.com">
      <circle cx="12" cy="12" r="11" fill="#103F91" />
      <path d="m12 5 5.6 3.2v7.6L12 19l-5.6-3.2V8.2L12 5Zm0 2.3L8.4 9.4v5.2l1.7 1 1-1.4h1.8l1 1.4 1.7-1V9.4L12 7.3Zm-2 3.1h4l.8 2.4-1.5.8L12 12.2l-1.3 1.4-1.5-.8.8-2.4Z" fill="#fff" />
    </svg>
  );
}

export function OkxMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="OKX">
      <circle cx="12" cy="12" r="11" fill="#111318" />
      <path d="M6.2 6.2h4.2v4.2H6.2V6.2Zm7.4 0h4.2v4.2h-4.2V6.2Zm-3.7 3.7h4.2v4.2H9.9V9.9Zm-3.7 3.7h4.2v4.2H6.2v-4.2Zm7.4 0h4.2v4.2h-4.2v-4.2Z" fill="#fff" />
    </svg>
  );
}

export function BybitMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Bybit">
      <circle cx="12" cy="12" r="11" fill="#17191F" />
      <path d="M7 7h5.3c2 0 3.3 1 3.3 2.6 0 1-.5 1.8-1.4 2.2 1.2.4 1.8 1.2 1.8 2.5 0 1.8-1.4 2.7-3.7 2.7H7V7Zm3 2.1v1.8h2c.7 0 1.1-.3 1.1-.9s-.4-.9-1.1-.9h-2Zm0 3.8v2h2.3c.8 0 1.2-.3 1.2-1s-.4-1-1.2-1H10Z" fill="#fff" />
      <path d="M16.8 7h1.5v4.8h-1.5V7Z" fill="#F7A600" />
    </svg>
  );
}

export function KuCoinMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="KuCoin">
      <circle cx="12" cy="12" r="11" fill="#23AF91" />
      <path d="M8 7v10m0-5 4.2-4.2M8 12l4.2 4.2m2.2-6.7 2.5 2.5-2.5 2.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export function EthereumMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Ethereum">
      <circle cx="12" cy="12" r="11" fill="#627EEA" />
      <path d="M12 4.5 7.6 11.6 12 14.2l4.4-2.6L12 4.5Z" fill="#fff" />
      <path d="M12 15.3 7.6 12.7 12 19l4.4-6.3-4.4 2.6Z" fill="#fff" opacity="0.75" />
    </svg>
  );
}

export function SolanaMark({ size = 24 }: MarkProps) {
  const gradientId = useId();

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Solana">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="24" x2="24" y2="0">
          <stop offset="0" stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="11" fill="#181A20" />
      <path d="M8 7.8h9.2l-2 2H6l2-2Z" fill={`url(#${gradientId})`} />
      <path d="M8 11h9.2l-2 2H6l2-2Z" fill={`url(#${gradientId})`} opacity="0.85" />
      <path d="M8 14.2h9.2l-2 2H6l2-2Z" fill={`url(#${gradientId})`} />
    </svg>
  );
}

export function BaseMark({ size = 24 }: MarkProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" role="img" aria-label="Base">
      <circle cx="12" cy="12" r="11" fill="#0052FF" />
      <path
        d="M12 4.4a7.6 7.6 0 0 1 0 15.2 7.6 7.6 0 0 1-6.6-3.8H18v-7.6H5.4A7.6 7.6 0 0 1 12 4.4Z"
        fill="#fff"
      />
    </svg>
  );
}
