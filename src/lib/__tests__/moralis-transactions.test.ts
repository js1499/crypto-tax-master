import { describe, it, expect } from "vitest";
import { moralisTxStatus } from "../moralis-transactions";

describe("moralisTxStatus (T4 — reverted txns marked failed, excluded from tax)", () => {
  it("maps receipt_status '0' (reverted) to failed", () => {
    expect(moralisTxStatus("0")).toBe("failed");
  });

  it("maps success / missing status to confirmed", () => {
    expect(moralisTxStatus("1")).toBe("confirmed");
    expect(moralisTxStatus(undefined)).toBe("confirmed");
    expect(moralisTxStatus(null)).toBe("confirmed");
    expect(moralisTxStatus("")).toBe("confirmed");
  });
});
