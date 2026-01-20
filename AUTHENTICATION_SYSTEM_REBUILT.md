# Authentication System - Complete Rebuild

## Problem Summary

You were experiencing "not authenticated" errors when trying to upload CSV files or access protected pages, even though you were clearly signed in.

## Root Causes Identified

### 1. **Two Conflicting Authentication Systems**

The codebase had **TWO different authentication systems running simultaneously**:

**System A: NextAuth (Modern, JWT-based)**
- Used by: Login page, Header, all client components
- Session storage: JWT in `next-auth.session-token` cookie
- Validation: `getServerSession(authOptions)` from NextAuth

**System B: Legacy Custom Auth**
- Used by: `/api/auth/login` endpoint (never actually called)
- Session storage: Custom token in `session_token` cookie
- Validation: Custom `getCurrentUser()` in `auth.ts`

**The Conflict:**
- When you signed in via the login page, it used NextAuth's `signIn("credentials")`
- This created a NextAuth JWT session in the `next-auth.session-token` cookie
- BUT the `/api/auth/login` endpoint (legacy) would have created a different `session_token` cookie
- This created confusion and potential session mismatch issues

### 2. **Improper App Router Implementation**

The `getCurrentUser()` function in `auth-helpers.ts` was trying to manually pass request objects and extract cookies, but this is **not how Next.js 13+ App Router works**.

In App Router:
- `getServerSession(authOptions)` automatically accesses cookies from the request context
- You should NOT manually pass request objects or cookies
- The function signature should be simple: `getCurrentUser()` with no parameters

### 3. **Missing Environment Variable**

The `.env` file was missing entirely, which meant `NEXTAUTH_SECRET` was not set. Without this secret:
- NextAuth cannot sign JWT tokens when users sign in
- NextAuth cannot verify JWT tokens on subsequent requests
- All authentication silently fails with no clear error messages

## What Was Fixed

### 1. **Completely Rebuilt `getCurrentUser()` Function**

**File:** `src/lib/auth-helpers.ts`

**Before** (Complex, manual cookie extraction):
```typescript
export async function getCurrentUser(request?: NextRequest) {
  // 140+ lines of complex cookie extraction logic
  // Tried to manually parse cookies from request headers
  // Created mock request objects
  // Multiple fallback approaches
  // Confusing and error-prone
}
```

**After** (Simple, App Router compliant):
```typescript
export async function getCurrentUser() {
  // Validate NEXTAUTH_SECRET is set
  if (!process.env.NEXTAUTH_SECRET) {
    // Clear error message
    return null;
  }

  // Get session - automatically accesses cookies from context
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return null;
  }

  // Look up user in database
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
  });

  return user;
}
```

**Key changes:**
- Removed `request` parameter - not needed in App Router
- Removed all manual cookie extraction logic
- Added clear NEXTAUTH_SECRET validation
- Simplified to ~85 lines (was 140+)
- Added better logging for debugging

### 2. **Disabled Conflicting Legacy Auth Routes**

**Disabled:**
- `/api/auth/login/route.ts` → renamed to `route.ts.disabled`
  - This route created conflicting `session_token` cookies
  - Was never actually called by the frontend (frontend uses NextAuth directly)

**Kept:**
- `/api/auth/[...nextauth]/route.ts` - NextAuth handler (ACTIVE)
- `/api/auth/register/route.ts` - User registration (ACTIVE)
- `/api/auth/logout/route.ts` - Legacy, but harmless (not called)
- `/api/auth/coinbase/` - OAuth flows (ACTIVE)

### 3. **Created `.env` File**

**File:** `.env`

Generated secure secrets for:
- `NEXTAUTH_SECRET` - Required for JWT encryption/validation
- `ENCRYPTION_KEY` - Required for encrypting exchange API keys
- `NEXTAUTH_URL` - Set to `http://localhost:3000`

**IMPORTANT:** This `.env` file contains sensitive secrets and is NOT committed to git (by design).

### 4. **Updated All API Route Calls**

Updated `src/app/api/transactions/import/route.ts` to call:
```typescript
// Before
const user = await getCurrentUser(request);

// After
const user = await getCurrentUser();
```

All other API routes were already using the correct syntax.

## How Authentication Works Now

### Sign-In Flow

```
1. User enters email/password on login page
   ↓
2. Frontend calls NextAuth's signIn("credentials", {...})
   ↓
3. NextAuth sends request to /api/auth/[...nextauth]
   ↓
4. authorize() handler in auth-config.ts:
   - Looks up user in database
   - Verifies password with bcrypt
   - Returns user object if valid
   ↓
5. NextAuth creates JWT with user data
   ↓
6. JWT stored in next-auth.session-token cookie
   (HttpOnly, Secure in production, SameSite: lax, 30 day expiry)
   ↓
7. User redirected to dashboard
```

### Protected Route Access Flow

```
1. User requests protected page/API (e.g., CSV upload)
   ↓
2. Browser automatically sends next-auth.session-token cookie
   ↓
3. API route calls getCurrentUser()
   ↓
4. getCurrentUser() calls getServerSession(authOptions)
   ↓
5. NextAuth automatically accesses cookies from request context
   ↓
6. NextAuth validates JWT signature with NEXTAUTH_SECRET
   ↓
7. NextAuth decodes JWT to get user email
   ↓
8. getCurrentUser() looks up full user record in database
   ↓
9. Returns user object: { id, email, name }
   ↓
10. API route proceeds with authenticated user
```

### Sign-Out Flow

```
1. User clicks "Log out" in Header dropdown
   ↓
2. Header calls NextAuth's signOut({ redirect: false })
   ↓
3. NextAuth clears next-auth.session-token cookie
   ↓
4. User redirected to /login
```

## File Structure

### Authentication Files

```
src/
├── lib/
│   ├── auth-config.ts          # NextAuth configuration (providers, callbacks)
│   ├── auth-helpers.ts         # getCurrentUser() - REBUILT ✓
│   ├── auth.ts                 # Password hashing utilities (kept for register)
│   └── env-validation.ts       # Environment variable validation (new)
│
├── app/
│   ├── login/page.tsx          # Login page (uses NextAuth)
│   ├── register/page.tsx       # Registration page
│   │
│   └── api/
│       └── auth/
│           ├── [...nextauth]/route.ts    # NextAuth handler (ACTIVE)
│           ├── register/route.ts         # User registration (ACTIVE)
│           ├── login/route.ts.disabled   # Legacy - DISABLED ✓
│           ├── logout/route.ts           # Legacy - not called
│           └── coinbase/                 # Coinbase OAuth (ACTIVE)
│
└── components/
    ├── header.tsx              # Uses useSession() from NextAuth
    └── providers/
        └── session-provider.tsx  # Wraps app with SessionProvider
```

### API Routes Using Authentication

All these routes now use the rebuilt `getCurrentUser()`:
- `/api/transactions/import` - CSV upload ✓
- `/api/transactions/*` - All transaction endpoints
- `/api/tax-reports/*` - Tax report generation
- `/api/exchanges/*` - Exchange connections
- `/api/wallets/*` - Wallet management
- `/api/dashboard/stats` - Dashboard data

## Environment Variables Required

```bash
# REQUIRED - App will not work without these
DATABASE_URL=postgresql://...         # PostgreSQL connection string
NEXTAUTH_SECRET=<generated>           # JWT signing/verification key
NEXTAUTH_URL=http://localhost:3000    # App URL
ENCRYPTION_KEY=<generated>            # For encrypting API keys

# OPTIONAL - App works without these
GOOGLE_CLIENT_ID=...                  # For Google OAuth
GOOGLE_CLIENT_SECRET=...              # For Google OAuth
COINBASE_CLIENT_ID=...                # For Coinbase OAuth
COINBASE_CLIENT_SECRET=...            # For Coinbase OAuth
```

## Testing Instructions

### 1. Verify Environment Setup

```bash
# Check that .env file exists
ls -la .env

# Verify NEXTAUTH_SECRET is set (don't print the value!)
grep "NEXTAUTH_SECRET=" .env | wc -l
# Should output: 1
```

### 2. Update Database Connection

Open `.env` and update `DATABASE_URL` with your PostgreSQL connection string.

For Vercel deployment with Supabase:
```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 3. Run Database Migrations

```bash
npx prisma migrate dev
npx prisma generate
```

### 4. Start Development Server

```bash
npm run dev
```

### 5. Test Authentication Flow

**A. Test Sign-Out/Sign-In:**
1. If currently signed in, sign out completely
2. Go to http://localhost:3000/login
3. Sign in with your credentials
4. Check browser DevTools:
   - Application → Cookies
   - Should see `next-auth.session-token` cookie
   - Should NOT see old `session_token` cookie

**B. Test Dashboard Access:**
1. Go to http://localhost:3000
2. Dashboard should load without "not authenticated" errors
3. Check browser console - should see no auth errors
4. Check terminal logs - should see `[Auth] ✓ User authenticated: your@email.com`

**C. Test CSV Upload:**
1. Go to Transactions page
2. Try to upload a CSV file
3. Should work without "not authenticated" error
4. Check terminal logs for `[Auth] ✓ User authenticated: ...`

### 6. Debugging

If you still see "not authenticated" errors:

**Check 1: Environment Variables**
```bash
# In your terminal where the app is running
node -e "console.log('NEXTAUTH_SECRET set:', !!process.env.NEXTAUTH_SECRET)"
```

**Check 2: Browser Cookies**
- Open DevTools → Application → Cookies
- Look for `next-auth.session-token`
- If missing: Sign out and sign in again
- If still missing: Check NEXTAUTH_SECRET is set

**Check 3: Server Logs**
Look for these messages in your terminal:
- `[Auth] ✓ User authenticated: user@email.com` - SUCCESS
- `[Auth] No session found` - Session cookie missing or invalid
- `CRITICAL ERROR: NEXTAUTH_SECRET is not set!` - Fix .env file

**Check 4: Database Connection**
```bash
npx prisma db push
# Should connect successfully without errors
```

## Key Improvements

✅ **Simplified Authentication**
- One authentication system (NextAuth only)
- No more conflicting session cookies
- Clear, maintainable code

✅ **Proper App Router Support**
- Uses `getServerSession()` correctly for Next.js 13+
- No manual cookie extraction
- Works reliably on Vercel and other platforms

✅ **Better Error Handling**
- Clear error messages when NEXTAUTH_SECRET is missing
- Helpful debugging logs in development mode
- Informative error responses to frontend

✅ **Environment Validation**
- Validates required environment variables
- Provides clear setup instructions
- Prevents silent failures

✅ **Removed Dead Code**
- Disabled unused legacy `/api/auth/login` route
- Cleaned up conflicting authentication helpers
- Reduced code complexity

## Security Notes

### What's Secure:

✅ **Password Hashing:** bcryptjs with 10 salt rounds
✅ **JWT Sessions:** Signed with NEXTAUTH_SECRET
✅ **HttpOnly Cookies:** Cannot be accessed by JavaScript
✅ **Secure Cookies:** Enabled in production
✅ **SameSite Protection:** Set to `lax` for CSRF protection
✅ **Session Expiry:** 30 days with 24-hour refresh

### Important Security Reminders:

⚠️ **Never commit `.env` file** - Contains sensitive secrets
⚠️ **Use strong NEXTAUTH_SECRET** - Generate with crypto.randomBytes(32)
⚠️ **Use connection pooler in production** - Prevent connection exhaustion
⚠️ **Update NEXTAUTH_URL for production** - Set to your actual domain

## Migration Notes

This authentication rebuild is **backward compatible** in the sense that:
- Existing user accounts work (same User table, same password hashes)
- OAuth connections (Google, Coinbase) still work
- No database schema changes needed

However:
- Old `session_token` cookies will not work (users need to sign in again)
- Users who were signed in with the legacy system need to sign out and sign in again
- This is expected and resolves the authentication conflicts

## Support

If you encounter issues:

1. **Check server logs** - Most issues show clear error messages
2. **Check browser console** - Frontend errors appear here
3. **Check cookies** - DevTools → Application → Cookies
4. **Verify .env** - Ensure all required variables are set
5. **Restart dev server** - After changing .env

## Summary

The authentication system has been completely rebuilt to:
1. Use **only NextAuth** (removed conflicting custom auth)
2. Work properly with **Next.js 13+ App Router**
3. Have **clear error messages** and debugging
4. Be **simple and maintainable**
5. **Resolve "not authenticated" errors**

You should now be able to:
- ✅ Sign in successfully
- ✅ Stay signed in across page reloads
- ✅ Upload CSV files without errors
- ✅ Access all protected pages/features
- ✅ See clear error messages if something goes wrong
