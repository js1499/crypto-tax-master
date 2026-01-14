# Local Development Setup Guide

This guide will help you set up and run the Crypto Tax Calculator application locally on your machine.

## Prerequisites

Before you begin, make sure you have the following installed:

1. **Node.js** (v18 or higher) - [Download](https://nodejs.org/)
2. **PostgreSQL** (v12 or higher) - [Download](https://www.postgresql.org/download/)
3. **Git** - [Download](https://git-scm.com/downloads)
4. **Redis** (optional, for caching) - [Download](https://redis.io/download)

### Verify Installation

```bash
node --version    # Should be v18+
npm --version     # Should be 9+
psql --version    # Should be v12+
```

## Step 1: Clone and Install Dependencies

```bash
# Navigate to your project directory
cd c:\Users\Jatin\Downloads\crypto-tax-master\crypto-tax-master

# Install all dependencies
npm install
```

## Step 2: Set Up PostgreSQL Database

### Option A: Local PostgreSQL Installation

1. **Install PostgreSQL** (if not already installed)
   - Windows: Download from [postgresql.org](https://www.postgresql.org/download/windows/)
   - Mac: `brew install postgresql` or download from website
   - Linux: `sudo apt-get install postgresql` (Ubuntu/Debian)

2. **Create a database**:
   ```bash
   # Start PostgreSQL service
   # Windows: Services > PostgreSQL > Start
   # Mac/Linux: sudo service postgresql start
   
   # Connect to PostgreSQL
   psql -U postgres
   
   # Create database
   CREATE DATABASE crypto_tax_calculator;
   
   # Exit psql
   \q
   ```

3. **Get your connection string**:
   ```
   postgresql://postgres:your_password@localhost:5432/crypto_tax_calculator
   ```

### Option B: Use a Cloud Database (Easier)

You can use a free cloud PostgreSQL database:

- **Supabase** (Recommended): https://supabase.com
  - Sign up for free
  - Create a new project
  - Go to Settings > Database
  - Copy the connection string

- **Neon** (Recommended): https://neon.tech
  - Sign up for free
  - Create a new project
  - Copy the connection string

- **Railway**: https://railway.app
  - Sign up for free
  - Create PostgreSQL database
  - Copy the connection string

## Step 3: Set Up Environment Variables

Create a `.env` file in the root directory:

```bash
# Windows PowerShell
New-Item -Path .env -ItemType File

# Mac/Linux
touch .env
```

Add the following environment variables to `.env`:

```env
# Database
DATABASE_URL="postgresql://postgres:your_password@localhost:5432/crypto_tax_calculator?schema=public"

# NextAuth Configuration
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key-here-generate-a-random-string"

# Coinbase OAuth (Optional - for Coinbase integration)
COINBASE_CLIENT_ID="your_coinbase_client_id"
COINBASE_CLIENT_SECRET="your_coinbase_client_secret"
COINBASE_REDIRECT_URI="http://localhost:3000/api/auth/coinbase/callback"

# Redis (Optional - for caching)
REDIS_URL="redis://localhost:6379"

# Sentry (Optional - for error tracking)
SENTRY_DSN="your_sentry_dsn"

# Encryption Key (for API key encryption - generate a random 32-byte key)
ENCRYPTION_KEY="your-32-byte-encryption-key-here"

# CoinGecko API (Optional - for price data)
COINGECKO_API_KEY="your_coingecko_api_key"
```

### Generate NEXTAUTH_SECRET

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Or use an online generator
# https://generate-secret.vercel.app/32
```

### Generate ENCRYPTION_KEY

```bash
# Using Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Step 4: Set Up Database Schema

Run Prisma migrations to create the database tables:

```bash
# Generate Prisma Client
npx prisma generate

# Run migrations to create tables
npx prisma migrate dev --name init

# (Optional) Seed the database with sample data
npm run prisma:seed
```

## Step 5: Set Up Redis (Optional but Recommended)

### Option A: Local Redis Installation

**Windows:**
1. Download Redis from: https://github.com/microsoftarchive/redis/releases
2. Extract and run `redis-server.exe`
3. Or use WSL: `wsl sudo apt-get install redis-server`

**Mac:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo service redis-server start
```

### Option B: Use Cloud Redis (Easier)

- **Upstash** (Free tier): https://upstash.com
- **Redis Cloud** (Free tier): https://redis.com/try-free/

Add the connection URL to your `.env`:
```env
REDIS_URL="redis://default:password@host:port"
```

**Note:** If you don't set up Redis, the app will still work but caching won't be available.

## Step 6: Start the Development Server

```bash
# Start the Next.js development server
npm run dev
```

The application will be available at: **http://localhost:3000**

## Step 7: Create Your First User

1. Open http://localhost:3000
2. Click "Sign Up" or "Register"
3. Create an account with email and password
4. You'll be automatically logged in

## Troubleshooting

### Database Connection Issues

**Error: "Can't reach database server"**
- Make sure PostgreSQL is running
- Check your `DATABASE_URL` is correct
- Verify PostgreSQL is listening on port 5432

**Error: "relation does not exist"**
- Run migrations: `npx prisma migrate dev`
- Or reset database: `npx prisma migrate reset`

### Port Already in Use

**Error: "Port 3000 is already in use"**
```bash
# Use a different port
npm run dev -- -p 3001
```

### Prisma Client Not Generated

**Error: "PrismaClient is not generated"**
```bash
npx prisma generate
```

### Redis Connection Issues

**Error: "Redis connection failed"**
- Make sure Redis is running: `redis-cli ping` (should return "PONG")
- Or remove `REDIS_URL` from `.env` to disable Redis (app will still work)

### NextAuth Issues

**Error: "NEXTAUTH_SECRET is missing"**
- Make sure `.env` file exists and has `NEXTAUTH_SECRET`
- Restart the dev server after adding environment variables

## Quick Start (Minimal Setup)

If you want to get started quickly with minimal configuration:

1. **Use a cloud database** (Supabase/Neon) - no local PostgreSQL needed
2. **Skip Redis** - remove `REDIS_URL` from `.env`
3. **Skip optional services** - Coinbase, Sentry, CoinGecko are optional

Minimum `.env` file:
```env
DATABASE_URL="your_cloud_postgresql_url"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-random-32-byte-string"
ENCRYPTION_KEY="generate-a-random-32-byte-hex-string"
```

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run database migrations
npx prisma migrate dev

# View database in Prisma Studio
npx prisma studio

# Format code
npm run format

# Lint code
npm run lint
```

## Next Steps

1. **Explore the application**: Navigate through the dashboard, accounts, transactions, and tax reports
2. **Connect a wallet**: Try connecting a wallet or exchange
3. **Import transactions**: Test the CSV import functionality
4. **Generate reports**: Create a tax report

## Additional Resources

- **Prisma Docs**: https://www.prisma.io/docs
- **Next.js Docs**: https://nextjs.org/docs
- **NextAuth Docs**: https://next-auth.js.org

## Need Help?

If you encounter issues:
1. Check the console for error messages
2. Verify all environment variables are set correctly
3. Make sure all services (PostgreSQL, Redis) are running
4. Try resetting the database: `npx prisma migrate reset`
