---
tags: [vercel, preview, deployment, routing, analytics, release]
category: release
related: [glide-conversion-redesign]
---

# Vercel preview deployment - 2026-09-24

## Summary

Deployed the redesigned Glide landing site to the linked `glidetaxes-landing` Vercel project and verified the owned routes and telemetry assets.

## Context

- **Project**: `jatinsawlani-gmailcoms-projects/glidetaxes-landing`
- **Preview**: `https://glidetaxes-landing-5iuwrj8rs-jatinsawlani-gmailcoms-projects.vercel.app`
- **Inspect**: `https://vercel.com/jatinsawlani-gmailcoms-projects/glidetaxes-landing/3MnwHZ24KvkoBPyeBoDuvs34fhVQ`
- **Related implementation**: `glide-conversion-redesign.md`

## Commands

- `vercel.cmd whoami`
- `vercel.cmd deploy --yes`
- `vercel.cmd domains inspect glidetaxes.com`
- Route smoke checks with `curl.exe --location`

## Verification

- 200: `/`, `/pricing`, `/robots.txt`, `/sitemap.xml`, `/opengraph-image`
- 200: `/_vercel/insights/script.js`, `/_vercel/speed-insights/script.js`
- Remote Next.js 16.3.6 build and TypeScript checks completed successfully.

## Routing constraint

The custom domain `glidetaxes.com` is assigned to a separate project named `crypto-tax-master`, not `glidetaxes-landing`. On the landing preview, `/register`, `/login`, blog, CPA filing, contact, privacy, and terms routes return 404 because that application is not part of this repository.

Do not move the custom domain or promote this repository as the sole production application until routing is coordinated with `crypto-tax-master`; otherwise the existing application and content routes would break.

## Next release step

Integrate the landing routes into `crypto-tax-master`, or establish an approved path-routing architecture between both Vercel projects. Re-run the preserved-route smoke checks before changing `glidetaxes.com`.
