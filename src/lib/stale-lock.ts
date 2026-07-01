/**
 * A self-healing single-flight lock for module-scoped concurrency guards.
 *
 * A plain boolean flag can wedge permanently: if the holder is hard-killed
 * (serverless 504 / OOM), its release never runs and every future caller is
 * rejected forever. StaleLock records the acquire time and auto-expires after
 * `ttlMs`, so a crashed holder's lock self-heals once the TTL elapses.
 *
 * `now` is injectable purely so the behaviour is deterministically testable.
 */
export class StaleLock {
  private startedAt: number | null = null;

  constructor(private readonly ttlMs: number) {}

  /** True if the lock is currently held and not yet stale. */
  isActive(now: number = Date.now()): boolean {
    return this.startedAt !== null && now - this.startedAt < this.ttlMs;
  }

  /** Acquire the lock. Returns false if it's held by a live (non-stale) holder. */
  acquire(now: number = Date.now()): boolean {
    if (this.isActive(now)) return false;
    this.startedAt = now;
    return true;
  }

  /** Release the lock (idempotent — safe to call from a finally). */
  release(): void {
    this.startedAt = null;
  }
}
