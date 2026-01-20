# Vercel Session Handling Fix

## Problem

After deploying to Vercel, CSV uploads fail with "session handling error" or "Not authenticated" errors, even though:
- Environment variables are set correctly
- User is logged in
- Session cookie exists in browser

## Root Cause

In Next.js App Router API routes on Vercel, `getServerSession()` may not automatically access cookies from the request context. We need to explicitly pass request headers.

## Solution Applied

Updated `getCurrentUser()` function to:
1. Accept optional `NextRequest` parameter
2. Extract cookies from request headers when provided
3. Pass cookies explicitly to `getServerSession()` for API routes

## Changes Made

### 1. Updated `src/lib/auth-helpers.ts`

- Added optional `request?: NextRequest` parameter
- When request is provided, extracts cookies and passes to `getServerSession()`
- Maintains backward compatibility for server components

### 2. Updated `src/app/api/transactions/import/route.ts`

- Now passes `request` object to `getCurrentUser(request)`
- Ensures cookies are properly extracted on Vercel

## Verification Steps

After redeploying:

1. **Clear browser cookies** for your Vercel domain
2. **Sign in** at your Vercel app
3. **Check cookies** in DevTools:
   - Should see `next-auth.session-token` or `__Secure-next-auth.session-token`
4. **Try CSV upload** - should work now

## If Still Not Working

### Check Vercel Environment Variables

Verify these are set correctly in Vercel dashboard:

```bash
NEXTAUTH_URL=https://your-app.vercel.app  # Must match your actual domain
NEXTAUTH_SECRET=your-generated-secret     # Must be set
DATABASE_URL=postgresql://...             # Must be valid
```

### Check Vercel Function Logs

1. Go to Vercel Dashboard → Your Project → Deployments
2. Click on latest deployment → Functions tab
3. Look for errors like:
   - `[Auth] Error getting session`
   - `[Import] Authentication failed`
   - `NEXTAUTH_SECRET is not set`

### Common Issues

1. **NEXTAUTH_URL mismatch**
   - Must be exactly: `https://your-app.vercel.app`
   - No trailing slash
   - Must use `https://` (not `http://`)

2. **NEXTAUTH_SECRET not set**
   - Check Vercel dashboard → Settings → Environment Variables
   - Make sure it's set for **Production** environment
   - Value should be a base64 string (32 bytes)

3. **Cookie domain issues**
   - Cookies might be set for wrong domain
   - Clear cookies and sign in again
   - Check cookie domain in browser DevTools

4. **Database connection**
   - If using Supabase, must use port **6543** (pooler), not 5432
   - Connection string format: `postgresql://postgres:[PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres`

## Testing Locally

To test the fix locally:

1. Set environment variables in `.env.local`:
   ```bash
   NEXTAUTH_URL=http://localhost:3000
   NEXTAUTH_SECRET=your-secret
   DATABASE_URL=your-database-url
   ```

2. Run the app:
   ```bash
   npm run dev
   ```

3. Test CSV upload - should work the same way

## Next Steps

1. **Commit and push** the changes
2. **Redeploy** on Vercel
3. **Test** CSV upload after redeployment
4. **Check logs** if issues persist

## Additional Debugging

If you're still having issues, check:

1. **Browser Console** - Any JavaScript errors?
2. **Network Tab** - Is the cookie being sent with the request?
3. **Vercel Logs** - What errors appear in function logs?
4. **Cookie Settings** - Are cookies being blocked by browser?

The fix should resolve the session handling issue on Vercel. If problems persist, check the logs and verify all environment variables are set correctly.
