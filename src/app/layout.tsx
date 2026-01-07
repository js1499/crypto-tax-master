import "./globals.css"; // Updated import path for globals.css
import type { Metadata } from "next";
import { Outfit, Azeret_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "sonner"; // Added Toaster import

const outfit = Outfit({ 
  subsets: ["latin"], 
  variable: "--font-sans" 
});

const azeretMono = Azeret_Mono({ 
  subsets: ["latin"], 
  variable: "--font-mono",
  // Include multiple weights for better display
  weight: ["400", "500", "600", "700"]
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
          "min-h-screen bg-[#0a0c12] font-sans antialiased leading-relaxed",
          outfit.variable,
          azeretMono.variable
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={true} // Updated to support both light and dark modes
          disableTransitionOnChange
        >
          {children}
          <Toaster theme="system" position="top-right" /> {/* Updated Toaster component */}
        </ThemeProvider>
      </body>
    </html>
  );
}
