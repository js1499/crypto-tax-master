/**
 * Custom Coinbase OAuth provider for NextAuth
 * Note: NextAuth doesn't have a built-in Coinbase provider,
 * so we'll handle Coinbase OAuth separately and link accounts
 */

import { OAuthConfig, OAuthUserConfig } from "next-auth/providers";

export interface CoinbaseProfile {
  data: {
    id: string;
    name?: string;
    username?: string;
    email: string;
  };
}

/**
 * Coinbase OAuth provider configuration
 * This is a custom implementation since NextAuth doesn't have Coinbase built-in
 */
export function CoinbaseProvider(
  options: OAuthUserConfig<CoinbaseProfile>
): OAuthConfig<CoinbaseProfile> {
  return {
    id: "coinbase",
    name: "Coinbase",
    type: "oauth",
    authorization: {
      url: "https://login.coinbase.com/oauth2/auth",
      params: {
        scope: "wallet:accounts:read wallet:transactions:read wallet:user:read offline_access",
        response_type: "code",
      },
    },
    token: {
      url: "https://api.coinbase.com/oauth/token",
      async request(context) {
        const { provider, params } = context;
        const response = await fetch(provider.token?.url as string, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            code: params.code as string,
            client_id: provider.clientId as string,
            client_secret: provider.clientSecret as string,
            redirect_uri: provider.callbackUrl,
          }),
        });

        return { tokens: await response.json() };
      },
    },
    userinfo: {
      url: "https://api.coinbase.com/v2/user",
      async request(context) {
        const { tokens, provider } = context;
        const response = await fetch(provider.userinfo?.url as string, {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        });
        return await response.json();
      },
    },
    profile(profile) {
      return {
        id: profile.data.id,
        name: profile.data.name || profile.data.username || "Coinbase User",
        email: profile.data.email,
        image: null,
      };
    },
    ...options,
  };
}
