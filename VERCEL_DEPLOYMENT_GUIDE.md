# Complete Vercel Deployment Guide

This guide will walk you through deploying your Crypto Tax Calculator to Vercel step-by-step.

## Prerequisites

- [ ] GitHub account with your code pushed to a repository
- [ ] Vercel account (sign up at [vercel.com](https://vercel.com))
- [ ] PostgreSQL database (Vercel Postgres, Supabase, Neon, Railway, or any PostgreSQL provider)
- [ ] Environment variables ready (see below)

## Step 1: Prepare Your Repository

1. **Ensure all changes are committed and pushed to GitHub**:
   ```bash
   git add .
   git commit -m "Prepare for Vercel deployment"
   git push origin main
   ```

2. **Verify your `vercel.json` is correct** (already configured in this project)

## Step 2: Set Up Database

### Option A: Vercel Postgres (Recommended for easiest setup)

1. Go to your Vercel dashboard
2. Navigate to **Storage** tab
3. Click **Create Database** → Select **Postgres**
4. Choose a name and region
5. The `DATABASE_URL` will be automatically added to your environment variables

### Option B: External PostgreSQL (Supabase, Neon, Railway, etc.)

1. Create a PostgreSQL database with your provider
2. Get your connection string (format: `postgresql://user:password@host:port/database?schema=public`)
3. You'll add this as `DATABASE_URL` in Step 3

## Step 3: Connect Repository to Vercel

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **Add New** → **Project**
3. Import your GitHub repository
4. Vercel will auto-detect Next.js framework

## Step 4: Configure Environment Variables

In the Vercel project settings, go to **Settings** → **Environment Variables** and add:

### Required Variables

```bash
# Database (automatically set if using Vercel Postgres)
DATABASE_URL=postgresql://user:password@host:port/database?schema=public

# NextAuth Configuration
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-generated-secret-here

# Encryption Key (for API keys)
ENCRYPTION_KEY=your-32-byte-hex-key-here
```

**Generate secrets:**
```bash
# Generate NEXTAUTH_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Optional Variables (Add as needed)

```bash
# Redis (for caching)
REDIS_URL=redis://host:port

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Coinbase OAuth
COINBASE_CLIENT_ID=your_coinbase_client_id
COINBASE_CLIENT_SECRET=your_coinbase_client_secret
COINBASE_REDIRECT_URI=https://your-app.vercel.app/api/auth/coinbase/callback

# Blockchain APIs
ETHERSCAN_API_KEY=your_etherscan_key
SOLSCAN_API_KEY=your_solscan_key

# CoinGecko API
COINGECKO_API_KEY=your_coingecko_key

# Sentry (for error tracking)
SENTRY_DSN=your_sentry_dsn
SENTRY_ORG=your_sentry_org
SENTRY_PROJECT=your_sentry_project
```

**Important Notes:**
- Set variables for **Production**, **Preview**, and **Development** environments as needed
- Update `NEXTAUTH_URL` and `COINBASE_REDIRECT_URI` with your actual Vercel domain after first deployment
- Never commit `.env` files to Git

## Step 5: Configure Build Settings

Vercel should auto-detect these settings, but verify in **Settings** → **General**:

- **Framework Preset**: Next.js
- **Build Command**: `prisma generate && next build` (already in vercel.json)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

## Step 6: Deploy

1. Click **Deploy** button
2. Wait for the build to complete (usually 2-5 minutes)
3. Check build logs for any errors

## Step 7: Run Database Migrations

After the first successful deployment:

### Option A: Using Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Pull production environment variables
vercel env pull .env.production.local

# Run migrations
npx prisma migrate deploy
```

### Option B: Using Vercel Functions

Create a one-time migration script or use Vercel's CLI in their dashboard.

### Option C: Manual Migration

If you have direct database access, run:
```bash
npx prisma migrate deploy
```

## Step 8: Verify Deployment

1. **Check your app URL**: `https://your-app.vercel.app`
2. **Test key functionality**:
   - User registration/login
   - Database connections
   - API endpoints
   - Transaction imports

3. **Check Vercel logs**:
   - Go to **Deployments** → Click on your deployment → **Functions** tab
   - Check for any runtime errors

## Step 9: Post-Deployment Configuration

### Update OAuth Redirect URIs

After deployment, update your OAuth provider redirect URIs:

1. **Google OAuth**:
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Add: `https://your-app.vercel.app/api/auth/callback/google`

2. **Coinbase OAuth**:
   - Go to [Coinbase Developer Portal](https://www.coinbase.com/oauth/applications)
   - Update redirect URI to: `https://your-app.vercel.app/api/auth/coinbase/callback`

3. **Update environment variables** in Vercel if you changed redirect URIs

### Set Up Custom Domain (Optional)

1. Go to **Settings** → **Domains**
2. Add your custom domain
3. Follow DNS configuration instructions
4. Update `NEXTAUTH_URL` environment variable

## Troubleshooting

### Build Fails

**Error: "Prisma Client not generated"**
- Solution: The `postinstall` script should handle this. Verify `package.json` has:
  ```json
  "postinstall": "prisma generate"
  ```

**Error: "Cannot find module '@prisma/client'"**
- Solution: Ensure `prisma generate` runs before `next build` (already configured)

### Runtime Errors

**Error: "Database connection failed"**
- Check `DATABASE_URL` is correctly set
- Verify database allows connections from Vercel's IP ranges
- For Supabase/Neon: Check connection pooling settings

**Error: "NEXTAUTH_SECRET is missing"**
- Add `NEXTAUTH_SECRET` to environment variables
- Regenerate if needed

**Error: "Function timeout"**
- Long-running functions (import, sync) are configured for 300s (5 minutes)
- For Vercel Pro: Max is 300s
- For Vercel Enterprise: Can be increased to 900s
- Consider breaking large operations into smaller chunks

### Database Migration Issues

**Migrations not running automatically**
- Vercel doesn't run migrations automatically
- Use Vercel CLI to run `prisma migrate deploy` after deployment
- Or set up a migration script as a Vercel Function

### Performance Issues

**Slow API responses**
- Check Redis caching is configured (if using)
- Review database query performance
- Check Vercel function logs for bottlenecks

## Vercel-Specific Optimizations

### Function Configuration

Long-running functions are configured in `vercel.json`:
- Transaction import: 300s max duration
- Exchange sync: 300s max duration
- Transaction fetch: 300s max duration

### Prisma Connection Pooling

For production, consider using connection pooling:
- **Supabase**: Use connection pooler URL (port 6543)
- **Neon**: Use pooled connection string
- **Vercel Postgres**: Automatically handles pooling

Example pooled connection string:
```
postgresql://user:password@host:6543/database?pgbouncer=true
```

### Environment Variables by Environment

Set different values for:
- **Production**: Your live app
- **Preview**: Pull request previews
- **Development**: Local development (optional)

## Monitoring and Logs

1. **Vercel Dashboard**: View real-time logs and function invocations
2. **Sentry** (if configured): Error tracking and performance monitoring
3. **Vercel Analytics**: Built-in analytics for your app

## Next Steps

- [ ] Set up monitoring (Sentry)
- [ ] Configure Redis caching for better performance
- [ ] Set up CI/CD for automated testing
- [ ] Configure custom domain
- [ ] Set up backup strategy for database
- [ ] Review and optimize function timeouts
- [ ] Set up rate limiting (already implemented in code)

## Support

- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment](https://nextjs.org/docs/deployment)
- [Prisma on Vercel](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
