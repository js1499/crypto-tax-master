import { describe, it, expect, vi } from "vitest";

// exchange-clients imports these at module load — stub them so the client can be constructed.
vi.mock("@/lib/coingecko", () => ({ getHistoricalPriceAtTimestamp: vi.fn(async () => 0) }));
vi.mock("axios", () => ({ default: { post: vi.fn() } }));

import axios from "axios";
import { KrakenClient } from "../exchange-clients";

const mockPost = axios.post as unknown as ReturnType<typeof vi.fn>;

describe("Kraken API-Sign signing — documented test vector", () => {
  // Authoritative worked example from Kraken's REST auth docs
  // (https://docs.kraken.com/api/docs/guides/spot-rest-auth). Proving our signer reproduces
  // this byte-for-byte validates the entire auth path (HMAC-SHA512 over path + SHA256(nonce+
  // postData), base64) with ZERO account — the #1 connectivity failure mode.
  it("reproduces Kraken's documented API-Sign byte-for-byte", () => {
    const secret =
      "kQH5HW/8p1uGOVjbgWA7FunAmGO8lsSUXNsu3eow76sz84Q18fWxnyRzBHCd3pd5nE9qa99HAZtuZuj6F1huXg==";
    const client = new KrakenClient("apikey", secret);
    const sig = (client as any).generateSignature(
      "/0/private/AddOrder",
      "1616492376594",
      "nonce=1616492376594&ordertype=limit&pair=XBTUSD&price=37500&type=buy&volume=1.25",
    );
    expect(sig).toBe(
      "4/dpxb3iT4tp/ZCVEwSnEsLxx0bqyhLpdfOpc6fn7OR8+UClSV5n9E6aSS8MPtnRfp32bAb0nmbRn6H8ndwLUQ==",
    );
  });
});

describe("Kraken transport / error-envelope handling", () => {
  it("throws when Kraken returns a non-empty error array", async () => {
    mockPost.mockReset();
    mockPost.mockResolvedValueOnce({ data: { error: ["EAPI:Invalid key"], result: {} } });
    const client = new KrakenClient("apikey", Buffer.from("secret").toString("base64"));
    await expect((client as any).makeRequest("/0/private/Balance")).rejects.toThrow(/Kraken API error/);
  });

  it("returns result when the error array is empty", async () => {
    mockPost.mockReset();
    mockPost.mockResolvedValueOnce({ data: { error: [], result: { ZUSD: "100.0" } } });
    const client = new KrakenClient("apikey", Buffer.from("secret").toString("base64"));
    const res = await (client as any).makeRequest("/0/private/Balance");
    expect(res.result.ZUSD).toBe("100.0");
  });
});
