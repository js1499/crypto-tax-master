import "./globals.css"; // Updated import path for globals.css
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { NextAuthSessionProvider } from "@/components/providers/session-provider";
import { ErrorBoundary } from "@/components/error-boundary";
import { OnboardingProvider } from "@/components/onboarding/onboarding-provider";
import { SyncPipelineProvider } from "@/components/sync-pipeline/pipeline-provider";
import { PipelineProgress } from "@/components/sync-pipeline/pipeline-progress";
import { Toaster } from "sonner";
import Script from "next/script";
import { GoogleAds } from "@/components/google-ads";

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

const SITE_URL = "https://glidetaxes.com";
const SITE_NAME = "Glide";
const DEFAULT_TITLE = "Glide — Crypto & Equities Tax Software";
const DEFAULT_DESCRIPTION =
  "Glide is crypto & equities tax software that identifies every transaction and prices it to the exact block. Connect your wallets and exchanges to get accurate, audit-ready tax forms.";

// metadataBase is the gate that lets every relative OG image (opengraph-image.tsx) and per-page
// canonical resolve to absolute production URLs. title.template appends "| Glide" to each page's
// distinct title. openGraph/twitter give social/chat shares a real card (image comes from the
// file-based opengraph-image.tsx / twitter-image.tsx routes, auto-merged by Next). No default
// `alternates.canonical` here on purpose — child pages set their own so they don't all canonicalize
// to the home page; app/auth pages are noindexed via X-Robots-Tag in next.config.js.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: DEFAULT_TITLE, template: `%s | ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  applicationName: SITE_NAME,
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    url: SITE_URL,
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#10b981",
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
        {/* Warm up third-party origins used sitewide (chat + analytics) — cheap CWV win. */}
        <link rel="dns-prefetch" href="https://client.crisp.chat" />
        <link rel="dns-prefetch" href="https://www.clarity.ms" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <ErrorBoundary>
          <NextAuthSessionProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem={false}
              disableTransitionOnChange
            >
              <OnboardingProvider>
                <SyncPipelineProvider>
                  {children}
                  <PipelineProgress />
                  <Toaster theme="light" position="top-right" />
                </SyncPipelineProvider>
              </OnboardingProvider>
            </ThemeProvider>
          </NextAuthSessionProvider>
        </ErrorBoundary>
        <Script id="crisp-chat" strategy="afterInteractive">{`
          window.$crisp=[];window.CRISP_WEBSITE_ID="0e3fe389-7c1c-4d87-828f-46ddfeff34e4";(function(){var d=document;var s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();
        `}</Script>
        {/* Sitewide Google Ads tag (gtag.js) + Google click-ID capture, loaded once
            here so it persists across client-side navigation. The signup conversion
            label is read server-side and stays inert until
            GOOGLE_ADS_SIGNUP_CONVERSION_LABEL is set. */}
        <GoogleAds signupLabel={process.env.GOOGLE_ADS_SIGNUP_CONVERSION_LABEL || ""} />
        {/* Microsoft Clarity (project xema6mwgl2) — independent analytics, loaded once
            sitewide via afterInteractive (mirrors the Crisp pattern). Id inlined to match
            the other tags; does not touch the Google tag / Ads conversions. Fail-safe:
            afterInteractive never blocks render. */}
        <Script id="ms-clarity" strategy="afterInteractive">{`
          (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
          })(window, document, "clarity", "script", "xema6mwgl2");
        `}</Script>
      </body>
    </html>
  );
}
