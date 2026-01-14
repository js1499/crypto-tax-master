# Quick Database Setup Guide

## The Error You're Seeing

"Failed to fetch transactions" is happening because the app can't connect to the database.

## Quick Fix (2 Minutes)

### Option 1: Use Free Cloud Database (Recommended)

1. **Go to Supabase**: https://supabase.com
2. **Sign up** (free account)
3. **Create a new project**
4. **Find the connection string** (see detailed instructions below)
5. **Edit your `.env` file** and replace `DATABASE_URL` with the connection string

### Finding the Connection String in Supabase:

**Method 1 (Easiest):**
- Go to **Project Settings** (gear icon) → **Database**
- Look for **"Connection string"** or **"URI"** section
- Copy the string that starts with `postgresql://`

**Method 2 (If you see individual parameters):**
- In **Project Settings → Database**, find:
  - **Host** (e.g., `db.xxxxx.supabase.co`)
  - **Database** (usually `postgres`)
  - **Port** (usually `5432`)
  - **User** (usually `postgres`)
  - **Password** (you set this when creating project)
- Construct: `postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres`

**Method 3 (Can't find it?):**
- Check the **"Getting Started"** section of your project
- Or use **Neon** instead (easier): https://neon.tech - connection string is shown immediately!

**See `SUPABASE_CONNECTION_STRING.md` for detailed instructions**
7. **Run migrations**:
   ```powershell
   npx prisma migrate dev --name init
   ```
8. **Restart the server** (the dev server should auto-restart)

### Option 2: Use Neon (Alternative)

1. **Go to Neon**: https://neon.tech
2. **Sign up** (free account)
3. **Create a new project**
4. **Copy the connection string**
5. **Update `.env` file** with the connection string
6. **Run migrations**: `npx prisma migrate dev --name init`

## After Setting Up Database

Once the database is connected:
- ✅ Transactions page will work
- ✅ You can create accounts
- ✅ You can import transactions
- ✅ All features will be functional

## Verify It's Working

After setting up the database and running migrations, you should see:
- No more "Failed to fetch transactions" errors
- The transactions page loads (even if empty)
- You can create a user account

---

**Note**: The app is running, but database features won't work until you set up the database connection!
