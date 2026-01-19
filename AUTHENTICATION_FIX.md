# Authentication Fix - "Not Authenticated" Error on Vercel

## Problem

Users were getting "not authenticated" errors when trying to upload CSVs or access any authenticated API endpoints on Vercel after logging in.

## Root Cause

The application had **two conflicting authentication systems** running simultaneously:

### 1. Custom Authentication (`src/lib/auth.ts`)
- Used by `/api/auth/login` and `/api/auth/register` routes
- Creates a `session_token` cookie when users log in
- Uses a simple base64-encoded session token

### 2. NextAuth (`src/lib/auth-helpers.ts`)
- Expected by ALL other API routes (21 files)
- Uses JWT sessions managed by NextAuth
- Requires `NEXTAUTH_SECRET` and NextAuth configuration

### The Conflict

When users logged in via `/api/auth/login`:
1. They received a `session_token` cookie from the custom auth system
2. But all API routes were checking for NextAuth sessions using `getServerSession()`
3. NextAuth didn't know about the `session_token` cookie
4. Result: All authenticated requests returned 401 "Not authenticated"

## Solution

Updated **all 21 API routes** to use the custom authentication system:

```typescript
// BEFORE (incorrect - using NextAuth)
import { getCurrentUser } from "@/lib/auth-helpers";

const user = await getCurrentUser();
```

```typescript
// AFTER (correct - using custom auth)
import { getCurrentUser } from "@/lib/auth";

const sessionCookie = request.cookies.get("session_token")?.value;
const user = await getCurrentUser(sessionCookie);
```

## Files Fixed

- ✅ `src/app/api/transactions/import/route.ts` - **CSV upload (primary issue)**
- ✅ `src/app/api/wallets/route.ts`
- ✅ `src/app/api/exchanges/route.ts`
- ✅ `src/app/api/exchanges/connect/route.ts`
- ✅ `src/app/api/exchanges/sync/route.ts`
- ✅ `src/app/api/transactions/route.ts`
- ✅ `src/app/api/transactions/[id]/route.ts`
- ✅ `src/app/api/transactions/bulk/route.ts`
- ✅ `src/app/api/transactions/categorize/route.ts`
- ✅ `src/app/api/transactions/delete-all/route.ts`
- ✅ `src/app/api/transactions/duplicates/route.ts`
- ✅ `src/app/api/transactions/fetch/route.ts`
- ✅ `src/app/api/tax-reports/route.ts`
- ✅ `src/app/api/tax-reports/debug/route.ts`
- ✅ `src/app/api/tax-reports/diagnose/route.ts`
- ✅ `src/app/api/tax-reports/export/route.ts`
- ✅ `src/app/api/tax-reports/form8949/route.ts`
- ✅ `src/app/api/dashboard/stats/route.ts`
- ✅ `src/app/api/debug/import-status/route.ts`
- ✅ `src/app/api/dev/check-notes/route.ts`
- ✅ `src/app/api/dev/test-logs/route.ts`

## Testing

After deploying these changes to Vercel:

1. **Log in** using your email and password
2. **Upload a CSV** via the transactions import page
3. **Verify** that the upload works without "not authenticated" errors
4. **Test other features** that require authentication (wallets, exchanges, tax reports)

## Future Architectural Improvements

The app currently has remnants of two authentication systems. For better maintainability:

### Option 1: Keep Custom Auth (Recommended for quick fix)
- ✅ Already working with this fix
- Remove unused `auth-config.ts` and `auth-helpers.ts`
- Remove NextAuth dependencies from `package.json`
- Remove `[...nextauth]/route.ts`
- Update frontend `SessionProvider` to use custom auth

### Option 2: Migrate to NextAuth
- Update `/api/auth/login` to use NextAuth's `signIn()`
- Update `/api/auth/register` to create NextAuth sessions
- Keep `auth-helpers.ts` and remove `auth.ts`
- More feature-rich (OAuth, email verification, etc.)

### Option 3: Hybrid Approach
- Make custom login also create NextAuth sessions
- Allows gradual migration
- More complex to maintain

## Notes

- The custom auth system (`auth.ts`) works but is basic
- NextAuth provides more features (OAuth, JWT rotation, security best practices)
- The frontend uses NextAuth's `SessionProvider` but it may not be necessary if custom auth is kept
- This fix resolves the immediate Vercel authentication issue

## Commit

```
commit a9fb345
Author: Claude
Date: [timestamp]

Fix authentication system across all API routes

Updated all 21 API routes to use custom authentication (auth.ts)
instead of NextAuth (auth-helpers.ts) to fix "not authenticated"
errors on Vercel after login.
```
