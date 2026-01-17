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
        refetchInterval={0} // Disable automatic refetch to prevent flashing
        refetchOnWindowFocus={false} // Disable refetch on focus to prevent flashing
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
