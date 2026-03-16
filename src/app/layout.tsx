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
  description: "A modern crypto tax calculator inspired by awaken.tax",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
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
              defaultTheme="dark"
              enableSystem={true} // Updated to support both light and dark modes
              disableTransitionOnChange
            >
              <OnboardingProvider>
                {children}
                <Toaster theme="system" position="top-right" /> {/* Updated Toaster component */}
              </OnboardingProvider>
            </ThemeProvider>
          </NextAuthSessionProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
