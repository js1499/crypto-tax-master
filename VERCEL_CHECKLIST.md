# Vercel Deployment Checklist

Use this checklist to ensure your app is ready for Vercel deployment.

## Pre-Deployment

- [ ] Code is committed and pushed to GitHub
- [ ] All environment variables are documented in `env.example`
- [ ] Database is set up (Vercel Postgres, Supabase, Neon, etc.)
- [ ] OAuth applications are created (Google, Coinbase if using)
- [ ] API keys are obtained (CoinGecko, Etherscan, Solscan if using)

## Environment Variables

### Required
- [ ] `DATABASE_URL` - PostgreSQL connection string
- [ ] `NEXTAUTH_URL` - Your Vercel app URL (update after first deploy)
- [ ] `NEXTAUTH_SECRET` - Generated secret (32-byte base64)
- [ ] `ENCRYPTION_KEY` - Generated key (32-byte hex)

### Optional (Add as needed)
- [ ] `REDIS_URL` - Redis connection string (for caching)
- [ ] `GOOGLE_CLIENT_ID` - Google OAuth client ID
- [ ] `GOOGLE_CLIENT_SECRET` - Google OAuth client secret
- [ ] `COINBASE_CLIENT_ID` - Coinbase OAuth client ID
- [ ] `COINBASE_CLIENT_SECRET` - Coinbase OAuth client secret
- [ ] `COINBASE_REDIRECT_URI` - Coinbase redirect URI
- [ ] `ETHERSCAN_API_KEY` - Etherscan API key
- [ ] `SOLSCAN_API_KEY` - Solscan API key
- [ ] `COINGECKO_API_KEY` - CoinGecko API key
- [ ] `SENTRY_DSN` - Sentry DSN (for error tracking)
- [ ] `SENTRY_ORG` - Sentry organization
- [ ] `SENTRY_PROJECT` - Sentry project name

## Vercel Configuration

- [ ] Repository is connected to Vercel
- [ ] Framework is auto-detected as Next.js
- [ ] Build command: `prisma generate && next build`
- [ ] Environment variables are set in Vercel dashboard
- [ ] Environment variables are set for Production, Preview, and Development

## First Deployment

- [ ] Initial deployment is successful
- [ ] Build logs show no errors
- [ ] Prisma Client is generated successfully
- [ ] App URL is accessible

## Post-Deployment

- [ ] Database migrations are run (`npm run prisma:migrate:deploy`)
- [ ] `NEXTAUTH_URL` is updated with actual Vercel domain
- [ ] OAuth redirect URIs are updated in provider dashboards:
  - [ ] Google OAuth redirect URI updated
  - [ ] Coinbase OAuth redirect URI updated
- [ ] Test user registration/login
- [ ] Test database connections
- [ ] Test API endpoints
- [ ] Test transaction import functionality

## Verification

- [ ] App loads without errors
- [ ] Authentication works (login/register)
- [ ] Database queries work
- [ ] API routes respond correctly
- [ ] Long-running functions work (import, sync)
- [ ] Error tracking works (if Sentry configured)
- [ ] Logs are accessible in Vercel dashboard

## Optional Enhancements

- [ ] Custom domain is configured
- [ ] SSL certificate is active (automatic with Vercel)
- [ ] Monitoring is set up (Sentry)
- [ ] Analytics are configured
- [ ] Redis caching is working (if configured)
- [ ] Backup strategy for database is in place

## Troubleshooting Reference

If issues occur, check:
1. Vercel build logs
2. Function logs in Vercel dashboard
3. Environment variables are correctly set
4. Database connection string is valid
5. OAuth redirect URIs match exactly
6. Prisma migrations have been run

For detailed troubleshooting, see [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md)
