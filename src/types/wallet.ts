// Connection result from wallet or exchange connection
export interface ConnectionResult {
  success: boolean;
  provider: string;
  timestamp: string;
  fileName?: string;
}

// Wallet provider type
export interface WalletProvider {
  id: string;
  name: string;
  icon: string;
  chains: string[];
}

// Exchange provider type
export interface ExchangeProvider {
  id: string;
  name: string;
  icon: string;
  connection: string;
}

// Transaction in imported data
export interface ImportedTransaction {
  id: number;
  type: string;
  asset: string;
  amount: string;
  value: string;
  date: string;
}

// Data returned from CSV import
export interface ImportedData {
  source: string;
  fileName: string;
  timestamp: string;
  transactions: ImportedTransaction[];
  totalTransactions: number;
}
