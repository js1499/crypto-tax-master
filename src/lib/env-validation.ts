/**
 * Environment variable validation
 * This file validates that all required environment variables are set
 */

export interface EnvValidationResult {
  isValid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates required environment variables
 * Call this at application startup or in API routes
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Required variables
  if (!process.env.DATABASE_URL) {
    missing.push("DATABASE_URL");
  }

  if (!process.env.NEXTAUTH_SECRET) {
    missing.push("NEXTAUTH_SECRET");
  }

  if (!process.env.NEXTAUTH_URL) {
    warnings.push("NEXTAUTH_URL - Using default, but should be set for production");
  }

  if (!process.env.ENCRYPTION_KEY) {
    warnings.push("ENCRYPTION_KEY - Required for encrypting exchange API keys");
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validates environment and throws error if invalid
 * Use this in critical paths where env vars must be present
 */
export function requireValidEnv(): void {
  const result = validateEnv();

  if (!result.isValid) {
    const errorMessage = `Missing required environment variables: ${result.missing.join(", ")}\n\n` +
      `Please set these in your .env file:\n` +
      result.missing.map(v => `  ${v}=your-value-here`).join("\n") +
      `\n\nSee env.example for details.`;

    throw new Error(errorMessage);
  }

  // Log warnings in development
  if (process.env.NODE_ENV === "development" && result.warnings.length > 0) {
    console.warn("[Env Validation] Warnings:");
    result.warnings.forEach(w => console.warn(`  - ${w}`));
  }
}

/**
 * Logs environment validation status on startup
 */
export function logEnvStatus(): void {
  const result = validateEnv();

  if (result.isValid) {
    console.log("[Env Validation] ✓ All required environment variables are set");
  } else {
    console.error("[Env Validation] ✗ Missing required environment variables:");
    result.missing.forEach(v => console.error(`  - ${v}`));
  }

  if (result.warnings.length > 0) {
    console.warn("[Env Validation] ⚠ Warnings:");
    result.warnings.forEach(w => console.warn(`  - ${w}`));
  }
}
