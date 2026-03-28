import "./globals.css"; // Updated import path for globals.css
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { NextAuthSessionProvider } from "@/components/providers/session-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { Toaster } from "sonner"; // Added Toaster import

// Initialize Sentry on the client side
if (typeof window !== "undefined") {
  import("../../instrumentation-client").catch(() => {
    // Silently fail if Sentry config doesn't exist
  });
}

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Crypto Tax Calculator",
  description: "The first crypto tax calculator that actually gets your numbers right. Trust me, we checked.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="light" style={{ colorScheme: "light" }} suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-white dark:bg-[#111111] font-sans antialiased",
          inter.variable
        )}
      >
        <ErrorBoundary>
          <NextAuthSessionProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              <OnboardingProvider>
                {children}
                <Toaster theme="light" position="top-right" />
              </OnboardingProvider>
            </ThemeProvider>
          </NextAuthSessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
