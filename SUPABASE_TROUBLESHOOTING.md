# Supabase Connection Troubleshooting

## Current Issue

Connection string is configured but can't reach the database server.

## Possible Causes & Solutions

### 1. Use Connection Pooling (Recommended for Supabase)

Supabase often requires using the **connection pooler** instead of direct connection.

**In Supabase Dashboard:**
1. Go to **Project Settings → Database**
2. Look for **"Connection pooling"** section
3. Use the **"Transaction" mode** connection string
4. It will look like:
   ```
   postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
   (Note: Port is **6543** for pooling, not 5432)

**Update your `.env`:**
```env
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 2. Check Supabase Project Status

1. Go to your Supabase dashboard
2. Check if your project shows as **"Active"** or **"Paused"**
3. If paused, click **"Restore"** to activate it
4. Wait a few minutes for it to fully start

### 3. Verify Database is Ready

1. In Supabase dashboard, go to **SQL Editor**
2. Try running a simple query: `SELECT 1;`
3. If this works, the database is ready
4. If it fails, the project might still be initializing

### 4. Network/Firewall Issues

- Check if your firewall is blocking port 5432 or 6543
- Try from a different network
- Some corporate networks block database ports

### 5. Password Special Characters

Your password has special characters: `xF*G5HTin$ba!H8`

**URL-encoded version:** `xF*G5HTin%24ba!H8`

Make sure the `$` is encoded as `%24` in the connection string.

### 6. Try Direct Connection with Session Mode

Sometimes Supabase requires session mode:

```
postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres?pgbouncer=true
```

## Quick Test

Test the connection directly:

```powershell
# If you have psql installed
psql "postgresql://postgres:YOUR_PASSWORD@db.ryuutkahotfhfnuixtlv.supabase.co:5432/postgres"
```

## Alternative: Use Neon Instead

If Supabase continues to have issues, try **Neon**:

1. Go to https://neon.tech
2. Sign up and create project
3. **Connection string is shown immediately** on dashboard
4. Copy and paste into `.env`
5. Usually works without issues

## What to Check in Supabase

1. **Project Status**: Is it active or paused?
2. **Database Settings**: Look for "Connection pooling" section
3. **Connection Info**: Check if there are multiple connection options
4. **Region**: Make sure you're using the correct region endpoint

## Next Steps

1. **Try connection pooling URL** (port 6543)
2. **Check project status** in Supabase dashboard
3. **Verify database is ready** by running a SQL query
4. **If still failing, try Neon** as an alternative
