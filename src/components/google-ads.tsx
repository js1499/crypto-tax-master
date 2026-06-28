"use client";

import { useEffect } from "react";
import Script from "next/script";
import { GOOGLE_ADS_ID, GA4_MEASUREMENT_ID, configureGoogleAds } from "@/lib/google-ads";
import { captureClickIdFromUrl } from "@/lib/click-id";

/**
 * Sitewide gtag.js: Google Ads (AW-) + GA4 (G-) config calls + Google click-ID capture.
 *
 * Rendered once in the root layout, so gtag.js loads a single time and persists
 * across client-side navigation (the App Router root layout does not remount).
 * ONE library load, TWO config calls (Ads + GA4) — never a second gtag.js script.
 * The signup conversion `signupLabel` is read server-side
 * (GOOGLE_ADS_SIGNUP_CONVERSION_LABEL) and passed in; when empty the signup
 * conversion stays inert.
 */
export function GoogleAds({ signupLabel }: { signupLabel: string }) {
  useEffect(() => {
    // Hand the server-provided label to the tracking module and capture any
    // Google click ID from the entry URL. Both are internally fail-safe.
    configureGoogleAds({ signupLabel });
    captureClickIdFromUrl();
  }, [signupLabel]);

  return (
    <>
      <Script
        id="google-ads-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
        strategy="afterInteractive"
      />
      <Script id="google-ads-init" strategy="afterInteractive">{`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${GOOGLE_ADS_ID}');
        gtag('config', '${GA4_MEASUREMENT_ID}');
      `}</Script>
    </>
  );
}
