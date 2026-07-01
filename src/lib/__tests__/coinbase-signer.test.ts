import { describe, it, expect } from "vitest";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { buildCoinbaseSigner, generateCoinbaseJWT } from "../coinbase-signer";

// Sign a Coinbase-style JWT from `secret`, confirm the detected algorithm, and verify the
// token with the matching public key — proving the key was parsed and signed correctly.
// ES256 is verified via jsonwebtoken; EdDSA is verified via crypto (jwa can't do EdDSA).
function signAndVerify(secret: string, publicKey: crypto.KeyObject, expectedAlg: "ES256" | "EdDSA") {
  expect(buildCoinbaseSigner(secret).algorithm).toBe(expectedAlg);
  const token = generateCoinbaseJWT("organizations/o/apiKeys/k", secret, "GET", "api.coinbase.com", "/v2/user");
  const [h, p, s] = token.split(".");

  const header = JSON.parse(Buffer.from(h, "base64url").toString());
  expect(header.alg).toBe(expectedAlg);
  expect(header.kid).toBe("organizations/o/apiKeys/k");

  let decoded: jwt.JwtPayload;
  if (expectedAlg === "EdDSA") {
    const ok = crypto.verify(null, Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, "base64url"));
    expect(ok).toBe(true);
    decoded = JSON.parse(Buffer.from(p, "base64url").toString());
  } else {
    decoded = jwt.verify(token, publicKey, { algorithms: ["ES256"] }) as jwt.JwtPayload;
  }
  expect(decoded.sub).toBe("organizations/o/apiKeys/k");
  expect(decoded.iss).toBe("cdp");
  expect((decoded as Record<string, unknown>).uri).toBe("GET api.coinbase.com/v2/user");
}

describe("Coinbase signer — EC keys sign as ES256", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });

  it("EC SEC1 PEM (the classic Coinbase 'EC PRIVATE KEY' format)", () => {
    signAndVerify(privateKey.export({ type: "sec1", format: "pem" }).toString(), publicKey, "ES256");
  });

  it("EC PKCS8 PEM", () => {
    signAndVerify(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKey, "ES256");
  });

  it("PEM with escaped \\n newlines (as copied from a JSON field)", () => {
    const escaped = privateKey.export({ type: "sec1", format: "pem" }).toString().replace(/\n/g, "\\n");
    signAndVerify(escaped, publicKey, "ES256");
  });

  it("raw base64 SEC1 DER with NO PEM headers (auto-wrapped)", () => {
    const der = privateKey.export({ type: "sec1", format: "der" }) as Buffer;
    signAndVerify(der.toString("base64"), publicKey, "ES256");
  });
});

describe("Coinbase signer — Ed25519 keys sign as EdDSA (the newer CDP default)", () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
  const der = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
  const seed = der.subarray(der.length - 32); // PKCS8 = 16-byte header + 32-byte seed

  it("Ed25519 PKCS8 PEM", () => {
    signAndVerify(privateKey.export({ type: "pkcs8", format: "pem" }).toString(), publicKey, "EdDSA");
  });

  it("raw 32-byte seed as base64 (no formatting at all)", () => {
    signAndVerify(seed.toString("base64"), publicKey, "EdDSA");
  });

  it("64-byte seed+pubkey as base64", () => {
    const spki = publicKey.export({ type: "spki", format: "der" }) as Buffer;
    const rawPub = spki.subarray(spki.length - 32);
    signAndVerify(Buffer.concat([seed, rawPub]).toString("base64"), publicKey, "EdDSA");
  });

  it("tolerates surrounding whitespace", () => {
    signAndVerify(`  ${seed.toString("base64")}\n`, publicKey, "EdDSA");
  });
});
