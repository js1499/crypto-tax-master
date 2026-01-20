# Vercel Environment Variables Guide

## Quick Reference: Environment Variables for Vercel

### 🔴 REQUIRED (Must Set These)

These are **critical** - your app won't work without them:

| Variable | Description | How to Get/Generate |
|----------|-------------|---------------------|
| `DATABASE_URL` | PostgreSQL connection string | From your database provider (Supabase, Neon, Vercel Postgres, etc.) |
| `NEXTAUTH_URL` | Your Vercel app URL | `https://your-app.vercel.app` (update after first deploy) |
| `NEXTAUTH_SECRET` | Secret for NextAuth session encryption | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `ENCRYPTION_KEY` | Key for encrypting API keys | Generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### 🟡 OPTIONAL (Add as Needed)

These enhance functionality but aren't required:

| Variable | Description | When to Add |
|----------|-------------|-------------|
| `REDIS_URL` | Redis connection for caching | If using Redis/Upstash |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID | If using Google sign-in |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret | If using Google sign-in |
| `COINBASE_CLIENT_ID` | Coinbase OAuth client ID | If using Coinbase integration |
| `COINBASE_CLIENT_SECRET` | Coinbase OAuth client secret | If using Coinbase integration |
| `COINBASE_REDIRECT_URI` | Coinbase redirect URI | `https://your-app.vercel.app/api/auth/coinbase/callback` |
| `ETHERSCAN_API_KEY` | Etherscan API key | If fetching Ethereum transactions |
| `SOLSCAN_API_KEY` | Solscan API key | If fetching Solana transactions |
| `COINGECKO_API_KEY` | CoinGecko API key | If using CoinGecko for prices |
| `SENTRY_DSN` | Sentry error tracking DSN | If using Sentry |
| `SENTRY_ORG` | Sentry organization | If using Sentry |
| `SENTRY_PROJECT` | Sentry project name | If using Sentry |

---

## Step-by-Step: Setting Environment Variables in Vercel

### 1. Go to Your Vercel Project

1. Log in to [vercel.com](https://vercel.com)
2. Select your project
3. Go to **Settings** → **Environment Variables**

### 2. Add Required Variables

Click **Add New** and add each variable:

#### `DATABASE_URL`
```
Value: postgresql://user:password@host:port/database
Environment: Production, Preview, Development (select all)
```

**Important for Supabase:**
- Use **port 6543** (connection pooler), NOT 5432
- Get from: Supabase Dashboard → Settings → Database → Connection string → **Transaction mode**
- Format: `postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

#### `NEXTAUTH_URL`
```
Value: https://your-app.vercel.app
Environment: Production, Preview
Note: Update this AFTER your first deployment with your actual domain
```

#### `NEXTAUTH_SECRET`
```
Value: [Generated secret - see below]
Environment: Production, Preview, Development (select all)
```

**Generate it:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Example output: `cBmlL938lwIGxoDPCiom5ca41PRXwGDiFSaGh8Evfp0=`

#### `ENCRYPTION_KEY`
```
Value: [Generated key - see below]
Environment: Production, Preview, Development (select all)
```

**Generate it:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Example output: `af29bd8d29413a2dab61768fe7d8e7dd2334dfc4edfbafa17a88e9fc4715a627`

### 3. Set Environment Scope

For each variable, select which environments it applies to:
- ✅ **Production** - Your live app
- ✅ **Preview** - Pull request previews
- ✅ **Development** - Local development (optional)

**Recommendation:** Set all required variables for all three environments.

### 4. Save and Redeploy

After adding variables:
1. Click **Save**
2. Go to **Deployments**
3. Click **⋯** (three dots) on latest deployment
4. Click **Redeploy** to apply new environment variables

---

## Quick Copy-Paste Values

### For Your First Deployment

Use these generated values (or generate your own):

```bash
# NEXTAUTH_SECRET (already generated for you)
NEXTAUTH_SECRET=cBmlL938lwIGxoDPCiom5ca41PRXwGDiFSaGh8Evfp0=

# ENCRYPTION_KEY (already generated for you)
ENCRYPTION_KEY=af29bd8d29413a2dab61768fe7d8e7dd2334dfc4edfbafa17a88e9fc4715a627
```

**⚠️ Important:** Generate NEW secrets for production! Don't use the same ones as development.

---

## After First Deployment

1. **Get your Vercel domain**: `https://your-app.vercel.app`
2. **Update `NEXTAUTH_URL`**:
   - Go to Environment Variables
   - Edit `NEXTAUTH_URL`
   - Change to: `https://your-app.vercel.app`
   - Save and redeploy

3. **Update OAuth redirect URIs** (if using OAuth):
   - Google: `https://your-app.vercel.app/api/auth/callback/google`
   - Coinbase: `https://your-app.vercel.app/api/auth/coinbase/callback`

---

## Verification Checklist

After setting environment variables:

- [ ] All 4 required variables are set
- [ ] Variables are set for Production environment
- [ ] `NEXTAUTH_URL` matches your Vercel domain
- [ ] `DATABASE_URL` uses connection pooler (port 6543 for Supabase)
- [ ] App has been redeployed after adding variables
- [ ] Can log in successfully
- [ ] Can upload CSV files

---

## Troubleshooting

### "NEXTAUTH_SECRET is not set" Error

1. Go to Vercel → Settings → Environment Variables
2. Verify `NEXTAUTH_SECRET` is set
3. Make sure it's set for **Production** environment
4. Redeploy your app

### "Database connection failed" Error

1. Check `DATABASE_URL` is correct
2. For Supabase: Make sure you're using port **6543** (pooler), not 5432
3. Verify database allows connections from Vercel's IP ranges
4. Check database is running and accessible

### "Not authenticated" Error on CSV Upload

1. Verify `NEXTAUTH_SECRET` is set correctly
2. Check `NEXTAUTH_URL` matches your actual domain
3. Clear browser cookies and sign in again
4. Check Vercel function logs for authentication errors

---

## Security Best Practices

1. ✅ **Never commit `.env` files** to Git
2. ✅ **Use different secrets** for development and production
3. ✅ **Regenerate secrets** if they're ever exposed
4. ✅ **Use connection pooling** for databases (Supabase port 6543)
5. ✅ **Rotate secrets periodically** (every 6-12 months)

---

## Need Help?

- Check build logs in Vercel dashboard
- Check function logs for runtime errors
- Verify all environment variables are set correctly
- Test locally with same environment variables first
