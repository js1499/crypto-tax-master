# Quick Database Fix

## The Problem
Your database server at `db.ryuutkahotfhfnuixtlv.supabase.co:5432` is not reachable.

## Common Causes & Fixes

### 1. Supabase Project is Paused (Most Common)
Free Supabase projects pause after 1 week of inactivity.

**Fix:**
1. Go to https://supabase.com/dashboard
2. Find your project
3. Click "Restore" or "Resume" to unpause it
4. Wait 1-2 minutes for it to start
5. Try again

### 2. Wrong Connection String Port
Supabase has two connection modes:
- **Direct connection**: Port `5432` (may be blocked)
- **Connection pooling**: Port `6543` (recommended)

**Fix:**
1. Go to Supabase Dashboard → Project Settings → Database
2. Find "Connection string" section
3. Use the **"Transaction" mode** connection string (port 6543)
4. Update your `.env` file with the new connection string

### 3. Password Needs URL Encoding
If your password has special characters, they need to be URL-encoded.

**Fix:**
- Replace `@` with `%40`
- Replace `#` with `%23`
- Replace `$` with `%24`
- Replace `&` with `%26`
- Replace `+` with `%2B`
- Replace `=` with `%3D`

### 4. Use Connection Pooling Instead
Try using the connection pooling URL (port 6543):

```
postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

## Quick Test

After updating your `.env`, test the connection:

```powershell
npx prisma db pull
```

If it works, run migrations:

```powershell
npx prisma migrate dev --name init
```

## Alternative: Use Neon (Easier)

If Supabase is giving you trouble:

1. Go to https://neon.tech
2. Sign up (free)
3. Create project
4. Copy connection string (shown immediately)
5. Update `.env` with the new connection string
6. Run: `npx prisma migrate dev --name init`

Neon doesn't pause projects and the connection string is easier to find!
