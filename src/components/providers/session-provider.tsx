"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";

export function NextAuthSessionProvider({
  children,
}: {
  children: ReactNode;
}) {
  // Wrap in error boundary to prevent crashes if NextAuth fails
  try {
    return (
      <SessionProvider
        basePath="/api/auth"
        refetchInterval={5 * 60} // Refetch session every 5 minutes
        refetchOnWindowFocus={true}
      >
        {children}
      </SessionProvider>
    );
  } catch (error) {
    // Fallback if SessionProvider fails
    console.error("SessionProvider error:", error);
    return <>{children}</>;
  }
}
