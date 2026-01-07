import axios from 'axios';

// Types for Coinbase OAuth tokens
export interface CoinbaseTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  expires_at?: number; // Calculated expiration timestamp
  scope: string;
}

// Type for Coinbase account data
export interface CoinbaseAccount {
  id: string;
  name: string;
  primary: boolean;
  type: string;
  currency: {
    code: string;
    name: string;
  };
  balance: {
    amount: string;
    currency: string;
  };
  created_at: string;
  updated_at: string;
  resource: string;
  resource_path: string;
}

// Type for Coinbase user data
export interface CoinbaseUser {
  id: string;
  name: string;
  username: string;
  profile: {
    name: string;
    bio?: string;
    location?: string;
    avatar_url?: string;
    url?: string;
  };
  email: string;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
  resource: string;
  resource_path: string;
}

/**
 * Exchange authorization code for access and refresh tokens
 */
export async function exchangeCodeForTokens(code: string): Promise<CoinbaseTokens> {
  console.log("[Coinbase API] Exchanging code for tokens");
  
  try {
    const clientId = process.env.COINBASE_CLIENT_ID;
    const clientSecret = process.env.COINBASE_CLIENT_SECRET;
    const redirectUri = process.env.COINBASE_REDIRECT_URI;
    
    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Missing OAuth configuration");
    }
    
    console.log("[Coinbase API] Using redirect URI:", redirectUri);
    
    // Use URLSearchParams to properly encode the form data
    const params = new URLSearchParams();
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('redirect_uri', redirectUri);
    
    const response = await axios.post('https://login.coinbase.com/oauth2/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Calculate expiration timestamp for easier validation later
    const tokens: CoinbaseTokens = {
      ...response.data,
      expires_at: Date.now() + response.data.expires_in * 1000
    };
    
    console.log("[Coinbase API] Successfully obtained tokens");
    return tokens;
  } catch (error) {
    console.error("[Coinbase API] Error exchanging code for tokens:", error);
    // Log more detailed error information if available
    if (axios.isAxiosError(error) && error.response) {
      console.error("[Coinbase API] Error response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    throw error;
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<CoinbaseTokens> {
  console.log("[Coinbase API] Refreshing access token");
  
  try {
    const clientId = process.env.COINBASE_CLIENT_ID;
    const clientSecret = process.env.COINBASE_CLIENT_SECRET;
    
    if (!clientId || !clientSecret) {
      throw new Error("Missing OAuth configuration");
    }
    
    // Use URLSearchParams to properly encode the form data
    const params = new URLSearchParams();
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    
    const response = await axios.post('https://login.coinbase.com/oauth2/token', params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    // Calculate expiration timestamp
    const tokens: CoinbaseTokens = {
      ...response.data,
      expires_at: Date.now() + response.data.expires_in * 1000
    };
    
    console.log("[Coinbase API] Successfully refreshed tokens");
    return tokens;
  } catch (error) {
    console.error("[Coinbase API] Error refreshing access token:", error);
    // Log more detailed error information if available
    if (axios.isAxiosError(error) && error.response) {
      console.error("[Coinbase API] Error response:", {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    throw error;
  }
}

/**
 * Check if access token is expired and refresh if needed
 */
export function isTokenExpired(tokens: CoinbaseTokens): boolean {
  if (!tokens.expires_at) return true;
  
  // Consider token expired if less than 5 minutes remaining
  const expirationBuffer = 5 * 60 * 1000; // 5 minutes in milliseconds
  return Date.now() + expirationBuffer > tokens.expires_at;
}

/**
 * Get user information from Coinbase
 */
export async function getCoinbaseUser(accessToken: string): Promise<CoinbaseUser> {
  console.log("[Coinbase API] Fetching user information");
  
  try {
    const response = await axios.get('https://api.coinbase.com/v2/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    console.log("[Coinbase API] Successfully fetched user data");
    return response.data.data;
  } catch (error) {
    console.error("[Coinbase API] Error fetching user data:", error);
    throw error;
  }
}

/**
 * Get accounts from Coinbase
 */
export async function getCoinbaseAccounts(accessToken: string): Promise<CoinbaseAccount[]> {
  console.log("[Coinbase API] Fetching accounts");
  
  try {
    const response = await axios.get('https://api.coinbase.com/v2/accounts', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });
    
    console.log("[Coinbase API] Successfully fetched accounts:", response.data.data.length);
    return response.data.data;
  } catch (error) {
    console.error("[Coinbase API] Error fetching accounts:", error);
    throw error;
  }
}

/**
 * Format Coinbase balance to display format
 */
export function formatCoinbaseBalance(amount: string, currency: string): string {
  if (currency === 'USD') {
    return `$${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  
  return `${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 8 })} ${currency}`;
} 