# How to Find Your Supabase Connection String

## Step-by-Step Guide

### Method 1: Project Settings (Most Common)

1. **Go to your Supabase project dashboard**
2. **Click on "Project Settings"** (gear icon in the left sidebar)
3. **Click on "Database"** in the settings menu
4. **Look for "Connection string"** or **"Connection pooling"** section
5. **You'll see different connection strings:**
   - **URI** - This is what you need!
   - **Connection pooling** - Alternative option
   - **Direct connection** - Another option

### Method 2: Connection Info Section

1. **Project Settings → Database**
2. **Scroll down to "Connection info"** or **"Connection parameters"**
3. **Look for:**
   - **Host** (e.g., `db.xxxxx.supabase.co`)
   - **Database name** (usually `postgres`)
   - **Port** (usually `5432`)
   - **User** (usually `postgres`)
   - **Password** (you set this when creating the project)

### Method 3: Connection String Format

If you can find the individual pieces, you can construct it yourself:

```
postgresql://postgres:[YOUR-PASSWORD]@[HOST]:5432/postgres
```

**Example:**
```
postgresql://postgres:your_password_here@db.abcdefghijklmnop.supabase.co:5432/postgres
```

### Method 4: Connection Pooling (Recommended for Production)

1. **Project Settings → Database**
2. **Look for "Connection pooling"** section
3. **Use the "Transaction" mode connection string**
4. **Format:** `postgresql://postgres:[PASSWORD]@[POOLER-HOST]:6543/postgres`

### Method 5: API Settings (Alternative)

1. **Project Settings → API**
2. **Look for database connection info** (sometimes shown here)

## What to Look For

The connection string will look like one of these:

```
# Direct connection
postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres

# Connection pooling
postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# With session mode
postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?pgbouncer=true
```

## If You Can't Find It

### Option A: Reset Your Database Password

1. **Project Settings → Database**
2. **Click "Reset database password"**
3. **Copy the new password**
4. **Construct the connection string:**
   ```
   postgresql://postgres:NEW_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres
   ```
   (Replace `YOUR_PROJECT_REF` with your project reference ID)

### Option B: Use Individual Parameters

If you can see the individual connection parameters:

1. **Host:** `db.xxxxx.supabase.co`
2. **Database:** `postgres`
3. **Port:** `5432`
4. **User:** `postgres`
5. **Password:** (your password)

**Construct it as:**
```
postgresql://postgres:YOUR_PASSWORD@HOST:5432/postgres
```

## Quick Test

Once you have the connection string, test it:

```powershell
# Test the connection (if you have psql installed)
psql "your_connection_string_here"
```

Or update your `.env` and run:
```powershell
npx prisma migrate dev --name init
```

## Alternative: Use Neon Instead

If Supabase is confusing, try **Neon** (easier to find connection string):

1. Go to https://neon.tech
2. Sign up
3. Create project
4. **Connection string is shown immediately** on the project dashboard
5. Copy and paste into `.env`

---

## Still Can't Find It?

1. **Check your Supabase project dashboard** - it's usually prominently displayed
2. **Look for "Database URL"** or **"Postgres connection string"**
3. **Check the "Getting Started" section** of your project
4. **Try the Supabase CLI**: `supabase status` (if you have it installed)

The connection string is definitely there - Supabase always provides it! It might just be in a slightly different location depending on your Supabase UI version.
