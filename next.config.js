// Injected content via Sentry wizard below
const { withSentryConfig } = require("@sentry/nextjs");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  basePath: '',
  images: {
    // Serve modern formats where the browser supports them (smaller LCP images).
    formats: ["image/avif", "image/webp"],
    domains: [
      "source.unsplash.com",
      "images.unsplash.com",
      "ext.same-assets.com",
      "ugc.same-assets.com",
    ],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "source.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "images.unsplash.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ext.same-assets.com",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "ugc.same-assets.com",
        pathname: "/**",
      },
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Bundle the unlinked /lp/* landing-page HTML (lives in apps/, outside src) into the
  // serverless function — belt-and-braces alongside the literal readFileSync tracing pattern.
  outputFileTracingIncludes: {
    "/lp/[variant]": [
      "./apps/glide-landing/index.html",
      "./apps/glide-landing-b/index.html",
      "./apps/glide-landing-c/index.html",
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Canonicalize the host: 308 (permanent) redirect www -> apex so link equity consolidates on
  // one host. (If Vercel already redirects www at the edge this is dormant; if not, this enforces
  // it. No loop: the condition only matches host=www and the target is the apex.) Set the apex as
  // the primary domain in Vercel too, belt-and-braces.
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'www.glidetaxes.com' }],
        destination: 'https://glidetaxes.com/:path*',
        permanent: true,
      },
    ];
  },
  async headers() {
    const security = [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-XSS-Protection', value: '1; mode=block' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
    ];
    // Keep the authenticated app + auth screens + checkout out of the index and stop crawl budget
    // leaking onto private surfaces. These are all "use client" pages that can't cleanly export
    // `robots` metadata, so a header is the right lever. Reinforced by robots.ts disallow.
    const noindex = { key: 'X-Robots-Tag', value: 'noindex, nofollow' };
    const appPaths = [
      '/dashboard/:path*', '/accounts/:path*', '/transactions/:path*', '/tax-reports/:path*',
      '/settings/:path*', '/tax-ai/:path*', '/tutorial/:path*', '/securities/:path*',
      '/checkout/:path*', '/login', '/register', '/forgot-password', '/reset-password',
    ];
    return [
      { source: '/:path*', headers: security },
      ...appPaths.map((source) => ({ source, headers: [noindex] })),
    ];
  },
};

module.exports = withSentryConfig(
  nextConfig,
  {
    // For all available options, see:
    // https://github.com/getsentry/sentry-webpack-plugin#options

    // Suppresses source map uploading logs during build
    silent: true,
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
  },
  {
    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Transpiles SDK to be compatible with IE11 (increases bundle size)
    transpileClientSDK: true,

    // Routes browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: "/monitoring",

    // Hides source maps from generated client bundles
    hideSourceMaps: true,

    // Automatically tree-shake Sentry logger statements to reduce bundle size
    disableLogger: true,

    // Enables automatic instrumentation of Vercel Cron Monitors.
    automaticVercelMonitors: true,
  }
);
