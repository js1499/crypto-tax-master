# NextAuth Setup Guide

This document describes the NextAuth authentication setup for the crypto tax calculator.

## Overview

NextAuth.js has been integrated to provide secure, production-ready authentication with:
- Email/password authentication (Credentials provider)
- Database-backed sessions
- Support for multiple users
- Secure session management

## Prerequisites

1. **Environment Variables**

Add the following to your `.env` file:

```env
# NextAuth
NEXTAUTH_URL=http://localhost:3000  # Your app URL (change for production)
NEXTAUTH_SECRET=your-secret-key-here  # Generate with: openssl rand -base64 32

# Database (already configured)
DATABASE_URL=your-postgresql-connection-string

# Coinbase OAuth (optional, for Coinbase integration)
COINBASE_CLIENT_ID=your-coinbase-client-id
COINBASE_CLIENT_SECRET=your-coinbase-client-secret
COINBASE_REDIRECT_URI=http://localhost:3000/api/auth/coinbase/callback
```

2. **Database Migration**

Run the migration to create NextAuth tables:

```bash
npx prisma migrate dev --name add_nextauth_tables
npx prisma generate
```

This will create:
- `Account` table (for OAuth providers)
- `Session` table (for database sessions)
- `VerificationToken` table (for email verification)

## Features

### 1. Email/Password Authentication

Users can register and login with email and password:
- Registration: `/register`
- Login: `/login`
- Password requirements: 8+ characters, uppercase, lowercase, number

### 2. Database Sessions

Sessions are stored in the database for:
- Better security
- Session management
- Multi-device support

### 3. API Route Protection

All protected API routes use `getCurrentUser()` from `@/lib/auth-helpers`:

```typescript
import { getCurrentUser } from "@/lib/auth-helpers";

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  
  // User is authenticated, proceed with request
}
```

### 4. Frontend Session Access

Use NextAuth hooks in client components:

```typescript
"use client";
import { useSession, signIn, signOut } from "next-auth/react";

export function MyComponent() {
  const { data: session, status } = useSession();
  
  if (status === "loading") return <div>Loading...</div>;
  if (!session) return <div>Not authenticated</div>;
  
  return <div>Welcome, {session.user.email}!</div>;
}
```

## Migration from Custom Auth

The app has been migrated from custom session cookies to NextAuth:

### Before:
- Custom `session_token` cookie
- Manual session management
- `getCurrentUser()` from `@/lib/auth`

### After:
- NextAuth database sessions
- Automatic session management
- `getCurrentUser()` from `@/lib/auth-helpers` (uses NextAuth)

### Backward Compatibility

- Old custom auth routes (`/api/auth/login`, `/api/auth/register`) still work
- They now create NextAuth sessions
- Coinbase OAuth still works via `/api/auth/coinbase`

## API Routes Updated

The following routes now use NextAuth:
- `/api/transactions/import`
- `/api/transactions/fetch`
- `/api/tax-reports`
- `/api/wallets`
- `/api/prices/update-transactions`

## Frontend Components Updated

- `Header` component uses `useSession()` hook
- Login page uses `signIn()` from NextAuth
- Register page creates user then signs in automatically

## Security Features

1. **Password Hashing**: bcryptjs with salt rounds
2. **Session Security**: HTTP-only cookies, secure in production
3. **CSRF Protection**: Built into NextAuth
4. **Rate Limiting**: Consider adding for production

## Testing

1. Register a new user at `/register`
2. Login at `/login`
3. Check session in browser DevTools (should see `next-auth.session-token` cookie)
4. Access protected routes - should work automatically

## Troubleshooting

### "NEXTAUTH_SECRET is not set"
- Add `NEXTAUTH_SECRET` to your `.env` file
- Generate a secret: `openssl rand -base64 32`

### "Database tables not found"
- Run migrations: `npx prisma migrate dev`
- Regenerate Prisma client: `npx prisma generate`

### "Session not persisting"
- Check `NEXTAUTH_URL` matches your app URL
- Ensure cookies are enabled
- Check database connection

## Next Steps

1. Add email verification (optional)
2. Add password reset functionality
3. Add social OAuth providers (Google, GitHub, etc.)
4. Add two-factor authentication (2FA)
5. Add rate limiting for login attempts
