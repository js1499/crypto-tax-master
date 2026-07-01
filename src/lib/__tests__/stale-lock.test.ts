import { describe, it, expect } from "vitest";
import { StaleLock } from "../stale-lock";

describe("StaleLock (self-healing concurrency guard)", () => {
  it("acquires when free and rejects a concurrent live holder", () => {
    const lock = new StaleLock(1000);
    expect(lock.acquire(0)).toBe(true);
    expect(lock.isActive(500)).toBe(true);
    expect(lock.acquire(500)).toBe(false); // still held, not stale
  });

  it("self-heals after the TTL when the holder never released (hard kill)", () => {
    const lock = new StaleLock(1000);
    expect(lock.acquire(0)).toBe(true);
    // Holder crashed and never released. At/after the TTL the lock is stale.
    expect(lock.isActive(1000)).toBe(false);
    expect(lock.acquire(1000)).toBe(true); // a later caller can proceed
  });

  it("release frees it immediately (normal completion via finally)", () => {
    const lock = new StaleLock(1000);
    expect(lock.acquire(0)).toBe(true);
    lock.release();
    expect(lock.isActive(1)).toBe(false);
    expect(lock.acquire(1)).toBe(true);
    lock.release();
    lock.release(); // idempotent
  });
});
