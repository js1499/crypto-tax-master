# Fix Supabase Database Connection Error

## The Problem
```
Can't reach database server at `db.ryuutkahotfhfnuixtlv.supabase.co:5432`
```

This happens because **Supabase requires connection pooling for serverless functions** (like Vercel).

## Quick Fix

### Step 1: Get Your Connection Pooler URL

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Go to **Settings** → **Database**
4. Scroll to **"Connection string"** section
5. Select **"Transaction" mode** (or "Session" mode)
6. Copy the connection string - it should look like:
   ```
   postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   **Note:** Port is **6543** (not 5432)

### Step 2: Update Vercel Environment Variables

1. Go to your [Vercel Dashboard](https://vercel.com)
2. Select your project
3. Go to **Settings** → **Environment Variables**
4. Find `DATABASE_URL`
5. **Replace** the current value with the connection pooler URL from Step 1
6. Make sure it's set for **Production**, **Preview**, and **Development** environments
7. **Redeploy** your application

### Step 3: Verify Connection

After redeploying, your app should connect successfully.

## Alternative: Check if Project is Paused

Supabase free projects pause after 1 week of inactivity:

1. Go to Supabase Dashboard
2. Check if your project shows **"Paused"**
3. If paused, click **"Restore"** or **"Resume"**
4. Wait 1-2 minutes for it to start
5. Then update the connection string as above

## Connection String Formats

### ❌ Wrong (Direct Connection - Port 5432)
```
postgresql://postgres:password@db.ryuutkahotfhfnuixtlv.supabase.co:5432/postgres
```
This won't work with serverless functions.

### ✅ Correct (Connection Pooler - Port 6543)
```
postgresql://postgres:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```
This works with Vercel serverless functions.

## Password Special Characters

If your password has special characters, URL-encode them:
- `$` → `%24`
- `@` → `%40`
- `#` → `%23`
- `&` → `%26`
- `+` → `%2B`
- `=` → `%3D`

Example:
```
Password: xF*G5HTin$ba!H8
Encoded:  xF*G5HTin%24ba!H8
```

## Still Not Working?

1. **Check Supabase project status** - Make sure it's active
2. **Verify the connection string** - Copy directly from Supabase dashboard
3. **Check Vercel logs** - Look for connection errors
4. **Try Session mode** instead of Transaction mode if Transaction doesn't work

## Need Help?

- [Supabase Connection Pooling Docs](https://supabase.com/docs/guides/database/connecting-to-postgres#connection-pooler)
- [Vercel Environment Variables](https://vercel.com/docs/concepts/projects/environment-variables)
