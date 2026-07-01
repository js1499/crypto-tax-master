import crypto from "crypto";
import jwt from "jsonwebtoken";

/**
 * Build a JWT signing key + algorithm from a Coinbase CDP secret in ANY format the user
 * might paste — no manual PEM wrapping required. Coinbase issues two key kinds:
 *   - EC (signed ES256): a "-----BEGIN EC PRIVATE KEY-----" / PKCS8 PEM (real or escaped
 *     \n), or the raw base64 DER of one.
 *   - Ed25519 (signed EdDSA): the newer CDP default — a base64 string of the 32-byte seed
 *     (or 64-byte seed+pubkey), or a "-----BEGIN PRIVATE KEY-----" PKCS8 PEM.
 *
 * Previously the app always wrapped input as EC + signed ES256, which broke Ed25519 keys
 * and forced users to hand-format the key. This detects the type and picks the algorithm.
 */
export function buildCoinbaseSigner(secret: string): {
  key: crypto.KeyObject | string;
  algorithm: "ES256" | "EdDSA";
} {
  const s = secret.trim().replace(/\\n/g, "\n").replace(/\r\n/g, "\n");

  // Already PEM — let Node parse it and infer the algorithm from the key type.
  if (s.includes("-----BEGIN")) {
    const key = crypto.createPrivateKey(s);
    return { key, algorithm: key.asymmetricKeyType === "ed25519" ? "EdDSA" : "ES256" };
  }

  // Raw base64. A Coinbase Ed25519 secret decodes to 32 bytes (seed) or 64 (seed+pubkey);
  // an EC DER is much longer, so these lengths unambiguously indicate Ed25519.
  const b64 = s.replace(/\s+/g, "");
  let raw: Buffer;
  try {
    raw = Buffer.from(b64, "base64");
  } catch {
    raw = Buffer.alloc(0);
  }

  if (raw.length === 32 || raw.length === 64) {
    const seed = raw.subarray(0, 32);
    // Wrap the raw 32-byte seed in a PKCS8 DER envelope so Node can load it as Ed25519.
    const pkcs8 = Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"), // PKCS8 Ed25519 header
      seed,
    ]);
    const key = crypto.createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" });
    return { key, algorithm: "EdDSA" };
  }

  // Fallback: treat as an EC key given as raw base64 DER → wrap as SEC1 EC PEM (ES256).
  return {
    key: `-----BEGIN EC PRIVATE KEY-----\n${b64}\n-----END EC PRIVATE KEY-----`,
    algorithm: "ES256",
  };
}

/**
 * Generate a JWT for Coinbase CDP API authentication (required since Feb 2025). Auto-detects
 * EC (ES256) vs Ed25519 (EdDSA) so the key can be pasted in whatever format Coinbase gave.
 *
 * @param apiKeyName - The API key name (e.g. organizations/{org_id}/apiKeys/{key_id})
 * @param secret - The CDP private key, in any supported format (see buildCoinbaseSigner)
 * @param method - HTTP method (GET, POST, etc.)
 * @param host - API host (e.g., api.coinbase.com)
 * @param path - API path (e.g., /v2/accounts)
 */
export function generateCoinbaseJWT(
  apiKeyName: string,
  secret: string,
  method: string,
  host: string,
  path: string
): string {
  const { key, algorithm } = buildCoinbaseSigner(secret);
  const now = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomBytes(16).toString("hex");

  const payload = {
    sub: apiKeyName,
    iss: "cdp",
    aud: ["cdp_service"],
    nbf: now,
    exp: now + 120, // JWT expires in 2 minutes
    uri: `${method} ${host}${path}`,
  };

  if (algorithm === "EdDSA") {
    // jsonwebtoken (via jwa) cannot sign EdDSA — only HS/RS/ES/PS. Hand-roll the JWS with
    // Node crypto: for Ed25519, crypto.sign uses a null digest and returns the raw 64-byte
    // signature, which is exactly the JOSE EdDSA form.
    const header = { alg: "EdDSA", typ: "JWT", kid: apiKeyName, nonce };
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const signingInput = `${b64(header)}.${b64(payload)}`;
    const signature = crypto
      .sign(null, Buffer.from(signingInput), key as crypto.KeyObject)
      .toString("base64url");
    return `${signingInput}.${signature}`;
  }

  // Casts: jwt's types don't include KeyObject in Secret nor a custom `nonce` header field,
  // but jsonwebtoken accepts both at runtime (KeyObject via Node crypto; extra header claims
  // are passed through). ES256 here is always an EC key (PEM string or KeyObject).
  return jwt.sign(payload, key as jwt.Secret, {
    algorithm: "ES256",
    header: { alg: "ES256", typ: "JWT", kid: apiKeyName, nonce } as unknown as jwt.JwtHeader,
  });
}
