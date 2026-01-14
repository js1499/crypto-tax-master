# Quick Start - Host Locally

Follow these steps to get your application running locally in minutes.

## Step 1: Install Dependencies

```powershell
cd "c:\Users\Jatin\Downloads\crypto-tax-master\crypto-tax-master"
npm install
```

## Step 2: Set Up Database (Choose One Option)

### Option A: Use Cloud Database (Easiest - Recommended)

1. **Sign up for free database:**
   - **Supabase**: https://supabase.com (Recommended)
   - **Neon**: https://neon.tech
   - **Railway**: https://railway.app

2. **Create a new project** and copy the connection string

3. **Format:** `postgresql://user:password@host:port/database`

### Option B: Install PostgreSQL Locally

1. Download PostgreSQL: https://www.postgresql.org/download/windows/
2. Install and set a password
3. Create database:
   ```sql
   CREATE DATABASE crypto_tax_calculator;
   ```
4. Connection string: `postgresql://postgres:YOUR_PASSWORD@localhost:5432/crypto_tax_calculator`

## Step 3: Create .env File

1. **Copy the example file:**
   ```powershell
   Copy-Item env.example .env
   ```

2. **Edit `.env` file** and add your values:

```env
# Required - Replace with your actual values
DATABASE_URL=postgresql://user:password@host:port/database
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=generate-with-command-below
ENCRYPTION_KEY=generate-with-command-below

# Optional - Can leave empty for now
REDIS_URL=
COINBASE_CLIENT_ID=
COINBASE_CLIENT_SECRET=
COINBASE_REDIRECT_URI=http://localhost:3000/api/auth/coinbase/callback
```

3. **Generate secrets:**
   ```powershell
   # Generate NEXTAUTH_SECRET
   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
   
   # Generate ENCRYPTION_KEY
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

   Copy the output and paste into your `.env` file.

## Step 4: Set Up Database Schema

```powershell
# Generate Prisma Client
npx prisma generate

# Run migrations to create tables
npx prisma migrate dev --name init
```

## Step 5: Start the Application

```powershell
npm run dev
```

The application will be available at: **http://localhost:3000**

## Step 6: Create Your First Account

1. Open http://localhost:3000 in your browser
2. Click "Sign Up" or "Register"
3. Create an account with email and password
4. You're ready to use the app!

---

## Troubleshooting

### "Cannot connect to database"
- Check your `DATABASE_URL` is correct
- Make sure PostgreSQL is running (if using local)
- Test connection: `psql "your_connection_string"`

### "Port 3000 is already in use"
```powershell
# Use a different port
npm run dev -- -p 3001
```

### "Prisma Client is not generated"
```powershell
npx prisma generate
```

### "Module not found"
```powershell
# Reinstall dependencies
rm -r node_modules
npm install
```

---

## What's Next?

- Connect wallets or exchanges
- Import transactions
- Generate tax reports
- Explore the dashboard

For detailed setup instructions, see `LOCAL_SETUP.md`
