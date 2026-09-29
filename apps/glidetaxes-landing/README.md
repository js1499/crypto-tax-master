# Glide marketing site

The product-first marketing experience for [Glide](https://glidetaxes.com), built with Next.js 16, React 19, TypeScript, and Tailwind CSS v4.

This repository owns the public homepage and `/pricing`. Registration, sign-in, blog, contact, CPA filing, and legal destinations remain same-domain application routes.

## Local development

Run `npm install`, then `npm run dev`, and open `http://localhost:3000`.

## Quality checks

- `npm run check` — ESLint, TypeScript, and a production build
- `npm run test:e2e` — Playwright navigation, behavior, metadata, and accessibility tests
- `npm run audit:prod` — production dependency vulnerability audit

## Production

The app is configured for Vercel and standalone Docker builds. Vercel Analytics and Speed Insights are included in the root layout; custom CTA events never include email addresses or wallet data.
