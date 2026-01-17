import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Instrument the onRequestError hook for nested React Server Components
export function onRequestError(
  err: unknown,
  request: {
    path: string;
  }
) {
  Sentry.captureRequestError(err, {
    request: {
      url: request.path,
    },
  });
}
