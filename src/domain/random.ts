export interface RandomSource {
  next(): number;
  integer(min: number, max: number): number;
  pick<T>(values: readonly T[]): T;
}

export function createRandom(seed: number): RandomSource {
  let state = seed >>> 0;

  const next = () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  return {
    next,
    integer(min, max) {
      return Math.floor(next() * (max - min + 1)) + min;
    },
    pick<T>(values: readonly T[]) {
      if (values.length === 0) throw new Error("Cannot pick from an empty collection.");
      return values[Math.floor(next() * values.length)];
    },
  };
}
