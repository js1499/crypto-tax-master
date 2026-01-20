# Authentication System Analysis - Critical Findings

## 🚨 CRITICAL ISSUE: Two Conflicting Authentication Systems

After a thorough codebase analysis, I discovered that your application has **TWO SEPARATE AND CONFLICTING** authentication systems running simultaneously. This is causing the CSV upload authentication failures.

---

## System #1: NextAuth.js (Primary System)

**Location**: `src/lib/auth-helpers.ts` and `src/lib/auth-config.ts`

**How it works**:
- Login page uses `signIn("credentials", ...)` from `next-auth/react`
- Creates `next-auth.session-token` cookie
- Uses JWT strategy with `getServerSession(authOptions)`
- Used by **ALL API routes** including CSV import

**Cookie Name**: `next-auth.session-token`

**Used by**:
- ✅ Login page (`src/app/login/page.tsx`) - uses `signIn("credentials", ...)`
- ✅ Register page (`src/app/register/page.tsx`) - uses `signIn("credentials", ...)` after registration
- ✅ All protected API routes (transactions, tax-reports, wallets, etc.)
- ✅ CSV import route (`src/app/api/transactions/import/route.ts`)

---

## System #2: Custom Auth (Legacy/Unused System)

**Location**: `src/lib/auth.ts` and `src/app/api/auth/login/route.ts`

**How it works**:
- Custom `/api/auth/login` endpoint
- Creates `session_token` cookie
- Uses simple base64 encoding (NOT secure)
- Only used by ONE route: `/api/auth/me`

**Cookie Name**: `session_token`

**Used by**:
- ❌ `/api/auth/login` route (NOT used by login page)
- ❌ `/api/auth/me` route (only route using this system)
- ❌ `/api/auth/logout` route (clears `session_token` cookie)

---

## The Problem

1. **Login page uses NextAuth** (`signIn("credentials", ...)`) → Creates `next-auth.session-token` cookie
2. **CSV import expects NextAuth** → Looks for `next-auth.session-token` cookie via `getCurrentUser()` from `auth-helpers.ts`
3. **But there's also a custom login endpoint** → Creates `session_token` cookie (different system)
4. **These two systems don't talk to each other!**

---

## Current State

### What's Actually Happening:

1. User logs in via `/login` page
   - Uses `signIn("credentials", ...)` from NextAuth
   - Creates `next-auth.session-token` cookie ✅
   - This should work!

2. User tries to upload CSV
   - API route calls `getCurrentUser()` from `auth-helpers.ts`
   - Looks for `next-auth.session-token` cookie ✅
   - Should work IF NextAuth is properly configured

### Why It Might Be Failing:

1. **NEXTAUTH_SECRET not set properly** (we already identified this)
2. **NextAuth session not being created properly**
3. **Cookie not being sent with requests**
4. **Session validation failing silently**

---

## Recommended Solution: Use ONLY NextAuth

Since the entire application already uses NextAuth, we should:

1. ✅ **Keep NextAuth** (already in use everywhere)
2. ❌ **Remove/Deprecate Custom Auth** (only used by `/api/auth/me`)

### Steps to Fix:

1. **Update `/api/auth/me` to use NextAuth**:
   ```typescript
   // Change from:
   import { getCurrentUser } from "@/lib/auth";
   const sessionCookie = request.cookies.get("session_token")?.value;
   const user = await getCurrentUser(sessionCookie);
   
   // To:
   import { getCurrentUser } from "@/lib/auth-helpers";
   const user = await getCurrentUser();
   ```

2. **Remove unused custom auth endpoints** (optional):
   - `/api/auth/login` (not used by login page)
   - Keep `/api/auth/logout` but update it to clear NextAuth cookies

3. **Ensure NEXTAUTH_SECRET is set** (already identified)

---

## File-by-File Breakdown

### NextAuth System (✅ Keep This)

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/auth-config.ts` | NextAuth configuration | ✅ Active |
| `src/lib/auth-helpers.ts` | `getCurrentUser()` for NextAuth | ✅ Active - Used by ALL API routes |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth API handler | ✅ Active |
| `src/app/login/page.tsx` | Uses `signIn("credentials", ...)` | ✅ Active |
| `src/app/register/page.tsx` | Uses `signIn("credentials", ...)` | ✅ Active |

### Custom Auth System (❌ Remove/Deprecate)

| File | Purpose | Status |
|------|---------|--------|
| `src/lib/auth.ts` | Custom auth functions | ⚠️ Only used by `/api/auth/me` |
| `src/app/api/auth/login/route.ts` | Custom login endpoint | ❌ NOT USED by login page |
| `src/app/api/auth/logout/route.ts` | Clears `session_token` cookie | ⚠️ Should clear NextAuth cookies instead |
| `src/app/api/auth/me/route.ts` | Uses custom auth | ⚠️ Should use NextAuth |

---

## Immediate Action Items

### 1. Fix `/api/auth/me` to use NextAuth

**File**: `src/app/api/auth/me/route.ts`

**Current** (uses custom auth):
```typescript
import { getCurrentUser } from "@/lib/auth";
const sessionCookie = request.cookies.get("session_token")?.value;
const user = await getCurrentUser(sessionCookie);
```

**Should be** (uses NextAuth):
```typescript
import { getCurrentUser } from "@/lib/auth-helpers";
const user = await getCurrentUser();
```

### 2. Update `/api/auth/logout` to clear NextAuth cookies

**File**: `src/app/api/auth/logout/route.ts`

**Current**: Only clears `session_token` cookie

**Should**: Clear `next-auth.session-token` cookie (or use NextAuth's signOut)

### 3. Verify NEXTAUTH_SECRET is set

Already identified - needs to be updated in `.env`

---

## Testing After Fix

1. **Sign in** via `/login` page
2. **Check cookies** in DevTools:
   - Should see `next-auth.session-token` cookie ✅
   - Should NOT see `session_token` cookie (or it's from old session)
3. **Upload CSV** - should work now
4. **Check `/api/auth/me`** - should return user info

---

## Summary

- **Primary System**: NextAuth.js (used everywhere)
- **Legacy System**: Custom auth (only used by `/api/auth/me`)
- **Issue**: Two systems don't communicate
- **Solution**: Update `/api/auth/me` to use NextAuth, remove custom auth
- **Status**: NextAuth is already correctly implemented, just needs cleanup

The CSV upload should work once:
1. NEXTAUTH_SECRET is properly set
2. `/api/auth/me` is updated to use NextAuth (if it's being called)
3. User signs in via the login page (which uses NextAuth)
