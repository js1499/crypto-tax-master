# Quick Vercel Deployment - Step by Step

## Option 1: Deploy via Vercel Web Dashboard (Recommended - Easiest)

### Step 1: Push to GitHub
```bash
git push origin main
```

### Step 2: Go to Vercel Dashboard
1. Open https://vercel.com in your browser
2. Sign up or log in (you can use GitHub to sign in)

### Step 3: Import Your Project
1. Click **"Add New"** → **"Project"**
2. Click **"Import Git Repository"**
3. Select your GitHub repository
4. If it's not listed, click **"Adjust GitHub App Permissions"** and grant access

### Step 4: Configure Project
Vercel will auto-detect Next.js. Verify these settings:
- **Framework Preset**: Next.js
- **Root Directory**: `./` (default)
- **Build Command**: `prisma generate && next build` (should auto-detect)
- **Output Directory**: `.next` (default)
- **Install Command**: `npm install` (default)

### Step 5: Set Environment Variables
Before deploying, click **"Environment Variables"** and add:

**Required:**
```
DATABASE_URL=your_postgresql_connection_string
NEXTAUTH_URL=https://your-app-name.vercel.app (update after first deploy)
NEXTAUTH_SECRET=your_generated_secret
ENCRYPTION_KEY=your_generated_key
```

**Generate secrets:**
```bash
# In your terminal:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 6: Deploy
1. Click **"Deploy"**
2. Wait for build to complete (2-5 minutes)
3. Your app will be live at `https://your-app-name.vercel.app`

### Step 7: Update NEXTAUTH_URL
After deployment:
1. Go to **Settings** → **Environment Variables**
2. Update `NEXTAUTH_URL` with your actual Vercel URL
3. Redeploy (or it will auto-redeploy)

### Step 8: Run Database Migrations
After first deployment, run migrations:

**Option A: Using Vercel CLI (after login)**
```bash
vercel login  # Complete in browser
vercel env pull .env.production.local
npm run prisma:migrate:deploy
```

**Option B: Using the migrate API endpoint**
```bash
# Set MIGRATION_SECRET_TOKEN in Vercel environment variables first
curl -X POST https://your-app.vercel.app/api/migrate \
  -H "Authorization: Bearer YOUR_MIGRATION_SECRET_TOKEN"
```

---

## Option 2: Deploy via Vercel CLI (After Manual Login)

If you prefer CLI, complete the login manually:

1. **Open a new terminal** and run:
   ```bash
   vercel login
   ```
   This will open your browser - complete the login there.

2. **Then deploy:**
   ```bash
   vercel --prod
   ```

3. **Set environment variables via CLI:**
   ```bash
   vercel env add DATABASE_URL
   vercel env add NEXTAUTH_URL
   vercel env add NEXTAUTH_SECRET
   vercel env add ENCRYPTION_KEY
   ```

---

## Quick Setup Checklist

- [ ] Code pushed to GitHub
- [ ] Vercel account created
- [ ] Repository imported to Vercel
- [ ] Environment variables added
- [ ] Database set up (Vercel Postgres, Supabase, etc.)
- [ ] Deployed successfully
- [ ] Migrations run
- [ ] OAuth redirect URIs updated (if using OAuth)

---

## Need a Database?

### Vercel Postgres (Easiest)
1. In Vercel dashboard, go to **Storage** tab
2. Click **Create Database** → **Postgres**
3. Connect to your project
4. `DATABASE_URL` will be auto-added

### Supabase (Free tier available)
1. Go to https://supabase.com
2. Create a new project
3. Get connection string from Settings → Database
4. Add as `DATABASE_URL` in Vercel

### Neon (Free tier available)
1. Go to https://neon.tech
2. Create a new project
3. Get connection string
4. Add as `DATABASE_URL` in Vercel

---

## Troubleshooting

**Build fails?**
- Check build logs in Vercel dashboard
- Ensure all environment variables are set
- Verify `DATABASE_URL` is correct

**App doesn't work after deployment?**
- Run database migrations
- Check function logs in Vercel dashboard
- Verify environment variables are set for Production environment

**Need help?**
- See [VERCEL_DEPLOYMENT_GUIDE.md](./VERCEL_DEPLOYMENT_GUIDE.md) for detailed guide
- Check Vercel build logs
- Review [VERCEL_CHECKLIST.md](./VERCEL_CHECKLIST.md)
