# Authentication Fix - CSV Upload "Not Authenticated" Error

## Problem Summary

When trying to upload a CSV file, users were getting "Not authenticated" errors even when logged in.

## Root Cause Analysis

After thorough investigation of the entire authentication system and CSV upload process, I identified **multiple issues**:

### 1. **Missing .env File (PRIMARY ISSUE)**
- **Problem**: No `.env` file existed in the project
- **Impact**: Critical environment variables like `NEXTAUTH_SECRET` were not set
- **Result**: NextAuth JWT validation failed silently, causing all authentication checks to fail
- **Status**: ✅ FIXED - Created `.env` file with required variables

### 2. **Improper getServerSession Usage in App Router**
- **Problem**: The `getCurrentUser()` function in `src/lib/auth-helpers.ts` was not properly calling `getServerSession()` for Next.js App Router
- **Impact**: Even when cookies were sent, session extraction could fail
- **Status**: ✅ FIXED - Updated to use the correct App Router approach

### 3. **Insufficient Error Logging**
- **Problem**: When authentication failed, there was minimal logging to debug the issue
- **Impact**: Made it very difficult to diagnose the root cause
- **Status**: ✅ FIXED - Added comprehensive logging throughout the auth flow

## Changes Made

### 1. Created `.env` File
**File**: `/home/user/crypto-tax-master/.env`

Generated secure secrets for:
- `NEXTAUTH_SECRET` - Required for JWT session encryption
- `ENCRYPTION_KEY` - Required for encrypting exchange API keys
- `NEXTAUTH_URL` - Set to localhost:3000 (change for production)

### 2. Fixed `getCurrentUser()` Function
**File**: `src/lib/auth-helpers.ts`

**Changes**:
- Added validation to check if `NEXTAUTH_SECRET` is set
- Updated to use the proper Next.js 13+ App Router approach
- Added fallback cookie extraction for compatibility
- Added extensive logging for debugging
- Added cookie parsing helper function

**Before**:
```typescript
const req = { headers: { cookie: request.headers.get("cookie") || "" } } as any;
session = await getServerSession(authOptions, req); // Wrong parameter order
```

**After**:
```typescript
// Use the simple App Router approach first (recommended by NextAuth)
session = await getServerSession(authOptions);

// With proper fallbacks and error handling
```

### 3. Enhanced CSV Import Error Messages
**File**: `src/app/api/transactions/import/route.ts`

**Changes**:
- Added detailed error messages when authentication fails
- Added cookie presence detection
- Added `NEXTAUTH_SECRET` validation check
- Provides actionable error messages to users

### 4. Created Environment Validation Utility
**File**: `src/lib/env-validation.ts`

**Features**:
- Validates all required environment variables
- Provides clear error messages for missing vars
- Can be used at startup or in critical API routes

## How It Works Now

### Authentication Flow:

1. **User signs in** → NextAuth creates JWT session token
2. **Session stored** → JWT token saved in `next-auth.session-token` cookie
3. **User uploads CSV** → Browser sends cookie with request
4. **Backend validates** → `getCurrentUser()` extracts and validates JWT
5. **Database lookup** → User record fetched from database
6. **Request proceeds** → CSV upload continues with authenticated user

### Key Components:

- **NextAuth**: Handles JWT session creation and validation
- **getServerSession()**: Extracts session from cookies (App Router compatible)
- **getCurrentUser()**: Validates session and returns user from database
- **CSV Import Route**: Checks authentication before processing upload

## Next Steps for You

### 1. Update Database Connection (REQUIRED)

Open `.env` and update the `DATABASE_URL` with your actual PostgreSQL connection string:

```bash
# For local PostgreSQL:
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/crypto_tax_calculator

# For Supabase (recommended for Vercel):
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres

# For Neon:
DATABASE_URL=postgresql://[USER]:[PASSWORD]@[HOST]/[DATABASE]

# For Vercel Postgres:
# Automatically set when you create a Vercel Postgres database
```

### 2. Run Database Migrations

```bash
npx prisma migrate dev
npx prisma generate
```

### 3. Start the Application

```bash
npm run dev
```

### 4. Test Authentication

1. **Sign out** if currently logged in (to clear any old session cookies)
2. **Sign in again** at http://localhost:3000/login
3. **Try uploading a CSV** at http://localhost:3000/transactions

### 5. For Production Deployment

Update `.env` for production:

```bash
# Change to your production domain
NEXTAUTH_URL=https://yourdomain.com

# Use secure database connection (pooler for Vercel)
DATABASE_URL=postgresql://...pooler.supabase.com:6543/...
```

## Verification Checklist

After following the steps above, verify:

- [ ] `.env` file exists with `NEXTAUTH_SECRET` set
- [ ] Database connection works (check with `npx prisma db push`)
- [ ] Can register a new user
- [ ] Can sign in successfully
- [ ] Can see session cookie in browser DevTools (Application → Cookies → `next-auth.session-token`)
- [ ] Can upload CSV file without "not authenticated" error
- [ ] Check browser console for any errors
- [ ] Check terminal logs for authentication success messages

## Debugging Tips

If you still get "not authenticated" errors:

### 1. Check Browser DevTools
- Open DevTools → Application → Cookies
- Look for `next-auth.session-token` cookie
- If missing, sign out and sign in again

### 2. Check Environment Variables
```bash
# In your terminal where app is running
echo $NEXTAUTH_SECRET  # Should show your secret
```

### 3. Check Server Logs
Look for these messages:
- `[Auth Helpers] User authenticated: user@example.com` - Success
- `[Auth Helpers] CRITICAL: NEXTAUTH_SECRET environment variable is not set!` - Need to set secret
- `[Auth Helpers] No session found via getServerSession` - Cookie not sent or invalid

### 4. Try Clean Sign-in
```bash
# Clear browser cookies or use incognito mode
# Sign in fresh
# Try CSV upload
```

## Technical Details

### Why NEXTAUTH_SECRET is Critical

NextAuth uses JWT (JSON Web Tokens) for session management. The `NEXTAUTH_SECRET` is used to:
1. **Sign** the JWT token when a user signs in
2. **Verify** the JWT token on subsequent requests

Without this secret:
- JWT signing fails → User can't sign in
- JWT verification fails → User appears not authenticated

### App Router vs Pages Router

Next.js 13+ App Router changed how cookies are accessed:
- **Pages Router**: Pass `req` and `res` to `getServerSession(req, res, authOptions)`
- **App Router**: Call `getServerSession(authOptions)` - automatically accesses cookies via Next.js context

The fix ensures compatibility with App Router while maintaining fallback support.

## Files Changed

1. `src/lib/auth-helpers.ts` - Fixed session extraction
2. `src/app/api/transactions/import/route.ts` - Enhanced error messages
3. `src/lib/env-validation.ts` - New environment validation utility
4. `.env` - Created with required variables

## References

- [NextAuth.js Documentation](https://next-auth.js.org/)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Environment Variables in Next.js](https://nextjs.org/docs/basic-features/environment-variables)
