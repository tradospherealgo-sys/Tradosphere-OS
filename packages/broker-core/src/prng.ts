// Small deterministic PRNG (mulberry32) seeded from a string hash. Used only
// so `SimulatedBrokerClient`'s synthetic data is reproducible across calls --
// e.g. requesting the same symbol/date-range twice for a historical import
// must yield the exact same ticks, which is what lets Sprint 3's idempotency
// test (3.5) actually prove something instead of getting lucky.
export function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
