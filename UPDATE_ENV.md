# Update Your .env File

## Your Connection String

You have:
```
postgresql://postgres:[YOUR-PASSWORD]@db.ryuutkahotfhfnuixtlv.supabase.co:5432/postgres
```

## Step 1: Get Your Database Password

1. **Go to Supabase**: https://supabase.com/dashboard
2. **Select your project**
3. **Go to Settings → Database**
4. **Look for "Database password"** section
5. **If you don't see it or forgot it:**
   - Click **"Reset database password"**
   - **Copy the new password** (you'll only see it once!)
   - Save it somewhere safe

## Step 2: Update .env File

1. **Open your `.env` file** in the project root
2. **Find the line:**
   ```env
   DATABASE_URL=postgresql://user:password@localhost:5432/crypto_tax_calculator
   ```
3. **Replace it with:**
   ```env
   DATABASE_URL=postgresql://postgres:YOUR_ACTUAL_PASSWORD@db.ryuutkahotfhfnuixtlv.supabase.co:5432/postgres
   ```
   (Replace `YOUR_ACTUAL_PASSWORD` with the password from Step 1)

## Step 3: Run Migrations

After updating `.env`, run:

```powershell
npx prisma migrate dev --name init
```

This will create all the database tables.

## Step 4: Restart Server

The dev server should auto-restart, but if not:

```powershell
# Stop the current server (Ctrl+C)
# Then restart:
npm run dev
```

## Example

If your password is `mySecurePassword123`, your `.env` should have:

```env
DATABASE_URL=postgresql://postgres:mySecurePassword123@db.ryuutkahotfhfnuixtlv.supabase.co:5432/postgres
```

## Verify It Works

After updating and running migrations, you should see:
- ✅ No more "Failed to fetch transactions" errors
- ✅ Database tables created successfully
- ✅ App works normally

---

**Security Note**: Never commit your `.env` file to git! It contains sensitive passwords.
