# Local Setup Instructions

## ✅ Current Status

- ✅ Node.js v18.18.2 installed
- ✅ npm v9.8.1 installed  
- ✅ Dependencies installed
- ✅ .env file created
- ✅ Secrets generated

## 🔧 Next Steps

### Step 1: Configure Database URL

**Edit the `.env` file** and update `DATABASE_URL`:

#### Option A: Use Free Cloud Database (Recommended - Easiest)

1. **Sign up for Supabase** (free): https://supabase.com
   - Create a new project
   - Go to Settings > Database
   - Copy the connection string
   - Format: `postgresql://postgres:[YOUR-PASSWORD]@[HOST]:5432/postgres`

2. **Or use Neon** (free): https://neon.tech
   - Create a new project
   - Copy the connection string

3. **Update `.env`:**
   ```env
   DATABASE_URL=postgresql://postgres:your_password@host:port/database
   ```

#### Option B: Use Local PostgreSQL

1. Install PostgreSQL: https://www.postgresql.org/download/windows/
2. Create database:
   ```sql
   CREATE DATABASE crypto_tax_calculator;
   ```
3. Update `.env`:
   ```env
   DATABASE_URL=postgresql://postgres:your_password@localhost:5432/crypto_tax_calculator
   ```

### Step 2: Update Secrets in .env

Your `.env` file has been created with generated secrets. Verify these values:

```env
NEXTAUTH_SECRET=lnV8Xxhp3r68/y7wX4jqqHXjdFZ1A1UFjQKq+N7W7SU=
ENCRYPTION_KEY=2eb7ee8e3fe3078b2394c604c39f1b00e06600da165a3a92a30a7969e3b8b9b6
```

### Step 3: Run Database Migrations

After setting DATABASE_URL, run:

```powershell
# Generate Prisma Client
npx prisma generate

# Run migrations to create tables
npx prisma migrate dev --name init
```

### Step 4: Start the Application

```powershell
npm run dev
```

The app will be available at: **http://localhost:3000**

---

## 🚀 Quick Start Script

You can also use the automated script:

```powershell
.\START_LOCAL.ps1
```

This script will:
- Check/install dependencies
- Generate Prisma Client
- Run migrations
- Start the dev server

---

## 📝 Complete .env Template

Your `.env` file should look like this:

```env
# Required
DATABASE_URL=postgresql://user:password@host:port/database
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=lnV8Xxhp3r68/y7wX4jqqHXjdFZ1A1UFjQKq+N7W7SU=
ENCRYPTION_KEY=2eb7ee8e3fe3078b2394c604c39f1b00e06600da165a3a92a30a7969e3b8b9b6

# Optional (can leave empty)
REDIS_URL=
COINBASE_CLIENT_ID=
COINBASE_CLIENT_SECRET=
COINBASE_REDIRECT_URI=http://localhost:3000/api/auth/coinbase/callback
```

---

## ✅ Verification

After starting the server, you should see:

```
✓ Ready in X seconds
○ Local: http://localhost:3000
```

Open http://localhost:3000 and you should see the login page!

---

## 🆘 Troubleshooting

### "Cannot connect to database"
- Check DATABASE_URL is correct
- Make sure PostgreSQL is running (if local)
- Test connection: `psql "your_connection_string"`

### "Prisma Client is not generated"
```powershell
npx prisma generate
```

### "Port 3000 already in use"
```powershell
npm run dev -- -p 3001
```
