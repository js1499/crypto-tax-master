# Sentry & Rate Limiting Setup Guide

This document describes the Sentry error tracking and rate limiting implementation.

## Sentry Error Tracking

### Overview

Sentry has been integrated to catch and track errors in production. It automatically captures:
- Unhandled exceptions
- API route errors
- React component errors
- Database errors
- Network errors

### Setup

1. **Get Sentry DSN**

   - Sign up at [sentry.io](https://sentry.io)
   - Create a new project (select Next.js)
   - Copy your DSN

2. **Environment Variables**

   Add to your `.env` file:

   ```env
   # Sentry Configuration
   SENTRY_DSN=your-sentry-dsn-here
   NEXT_PUBLIC_SENTRY_DSN=your-sentry-dsn-here
   
   # Optional: Sentry organization and project (for source maps)
   SENTRY_ORG=your-org
   SENTRY_PROJECT=your-project
   ```

3. **Configuration Files**

   - `sentry.client.config.ts` - Client-side error tracking
   - `sentry.server.config.ts` - Server-side error tracking
   - `sentry.edge.config.ts` - Edge runtime error tracking
   - `instrumentation.ts` - Initializes Sentry based on runtime

### Features

- **Automatic Error Capture**: All unhandled errors are automatically sent to Sentry
- **Source Maps**: Stack traces include original source code (requires build configuration)
- **User Context**: Errors include user information when available
- **Breadcrumbs**: Automatic tracking of user actions leading to errors
- **Session Replay**: Records user sessions when errors occur (optional)
- **Error Filtering**: Sensitive data is filtered out before sending

### Usage in Code

```typescript
import * as Sentry from "@sentry/nextjs";

// Capture an exception
try {
  // Some code
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      endpoint: "/api/example",
    },
    extra: {
      customData: "value",
    },
  });
}

// Capture a message
Sentry.captureMessage("Something went wrong", "warning");

// Set user context
Sentry.setUser({
  id: user.id,
  email: user.email,
});
```

### Error Boundaries

React error boundaries are set up in the root layout to catch component errors:

```tsx
<ErrorBoundary>
  {/* Your app */}
</ErrorBoundary>
```

## Rate Limiting

### Overview

Rate limiting prevents API abuse by limiting the number of requests per time window. Different endpoints have different limits based on their resource usage.

### Implementation

Rate limiting uses an in-memory LRU cache to track requests per IP address or user ID.

### Rate Limits by Endpoint

| Endpoint | Limit | Window | Notes |
|----------|-------|--------|-------|
| `/api/auth/login` | 5 requests | 15 minutes | Prevents brute force |
| `/api/auth/register` | 3 requests | 15 minutes | Prevents spam |
| `/api/transactions/import` | 20 requests | 1 minute | Per IP + 10 per user |
| `/api/transactions/fetch` | 10 requests | 1 minute | Per IP + 5 per user |
| `/api/tax-reports` | 30 requests | 1 minute | Per IP + 10 per user |
| `/api/prices` | 50 requests | 1 minute | CoinGecko rate limits |
| `/api/prices/update-transactions` | 5 requests | 1 minute | Heavy operation |
| `/api/wallets` | 60 requests | 1 minute | General API |

### Rate Limit Headers

When a request is rate limited, the response includes:

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 2024-01-01T12:00:00Z
Retry-After: 60
```

### Usage in API Routes

```typescript
import { rateLimitAPI, rateLimitAuth, createRateLimitResponse } from "@/lib/rate-limit";

export async function GET(request: NextRequest) {
  // Check rate limit
  const rateLimitResult = rateLimitAPI(request, 60); // 60 requests per minute
  if (!rateLimitResult.success) {
    return createRateLimitResponse(
      rateLimitResult.remaining,
      rateLimitResult.reset
    );
  }
  
  // Continue with request...
}
```

### Rate Limiting Functions

- `rateLimit(request, limit)` - General API rate limiting (60 req/min default)
- `rateLimitAuth(request, limit)` - Auth endpoint rate limiting (5 req/15min default)
- `rateLimitAPI(request, limit)` - API endpoint rate limiting (100 req/min default)
- `rateLimitByUser(userId, limit)` - User-based rate limiting (100 req/min default)

### Identifier

Rate limiting identifies clients by:
1. `X-Forwarded-For` header (for proxies)
2. `X-Real-IP` header
3. `CF-Connecting-IP` header (Cloudflare)
4. Request IP address
5. Falls back to "unknown" if none available

### Production Considerations

**Current Implementation:**
- In-memory cache (resets on server restart)
- Single server only (doesn't work across multiple instances)

**For Production with Multiple Servers:**
- Use Redis for distributed rate limiting
- Consider using a service like Upstash Redis
- Or use a CDN-level rate limiting (Cloudflare, etc.)

Example with Redis:
```typescript
// Future: Use Redis for distributed rate limiting
import { Redis } from "@upstash/redis";
const redis = new Redis({ url: process.env.UPSTASH_REDIS_URL });
```

## Testing

### Test Rate Limiting

```bash
# Make multiple rapid requests
for i in {1..10}; do
  curl http://localhost:3000/api/prices?symbol=BTC
done

# Should get 429 after limit is exceeded
```

### Test Sentry

1. Create a test error endpoint:
```typescript
// /api/test-error
export async function GET() {
  throw new Error("Test error for Sentry");
}
```

2. Visit the endpoint
3. Check your Sentry dashboard for the error

## Monitoring

### Sentry Dashboard

- View errors in real-time
- See error frequency and trends
- Get alerts for new errors
- View user impact
- See stack traces with source maps

### Rate Limit Monitoring

Currently logged to console. For production, consider:
- Logging to Sentry when rate limits are hit
- Tracking rate limit metrics
- Alerting on unusual patterns

## Best Practices

1. **Sentry**
   - Don't send sensitive data (passwords, tokens, etc.)
   - Filter PII before sending
   - Use tags to categorize errors
   - Set appropriate sample rates

2. **Rate Limiting**
   - Set appropriate limits per endpoint
   - Consider user authentication status
   - Log rate limit violations
   - Provide clear error messages
   - Include retry-after headers

3. **Error Handling**
   - Always wrap async operations in try-catch
   - Capture errors in Sentry with context
   - Return user-friendly error messages
   - Log errors for debugging

## Troubleshooting

### Sentry not capturing errors
- Check `SENTRY_DSN` is set correctly
- Verify Sentry is initialized (check browser console)
- Check network tab for Sentry requests
- Ensure not in development mode (errors filtered out)

### Rate limiting too strict
- Adjust limits in `src/lib/rate-limit.ts`
- Or pass custom limits to rate limit functions

### Rate limiting not working
- Check that rate limit middleware is called before request processing
- Verify IP detection is working
- Check cache is not being cleared

## Next Steps

1. Set up Sentry account and add DSN
2. Configure source maps for better stack traces
3. Set up error alerts in Sentry
4. Consider Redis for distributed rate limiting in production
5. Add rate limit metrics tracking
6. Set up monitoring dashboards
