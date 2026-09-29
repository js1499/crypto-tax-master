import type { Metadata } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { siteConfig } from "@/lib/site";
import "./globals.css";

// Hanken Grotesk is the closest open equivalent of NB International, the face CoinTracker's brand
// font is based on. Self-hosted at build time by next/font; exposed as --font-brand and applied per
// route in globals.css.
const brandFont = Hanken_Grotesk({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-brand",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: "Glide | Crypto Tax Software",
    template: "%s | Glide",
  },
  description: siteConfig.description,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: siteConfig.name,
    title: "Glide | Crypto Tax Software",
    description: siteConfig.description,
    url: "/",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Glide crypto tax software" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Glide | Crypto Tax Software",
    description: siteConfig.description,
    images: ["/opengraph-image"],
  },
  icons: { icon: "/seo/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isVercelDeployment = process.env.VERCEL === "1";

  return (
    <html lang="en" className={`h-full antialiased ${brandFont.variable}`}>
      <body className="flex min-h-full flex-col">
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        {children}
        {isVercelDeployment ? (
          <>
            <Analytics />
            <SpeedInsights />
          </>
        ) : null}
      </body>
    </html>
  );
}
