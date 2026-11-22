import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { subtractFloatRecursive } from './subtractFloatRecursive.js';

/**
 * Independent reference 1: Exact IEEE-754 dyadic rational arithmetic using BigInt.
 * Decomposes any finite float64 into `sign * mantissa * 2^exp` exactly, computes
 * `minuend - sum(subtrahends)` in exact integer arithmetic, and rounds the exact
 * rational back to nearest-even IEEE-754 float64.
 */
const f64Buf = new ArrayBuffer(8);
const f64View = new Float64Array(f64Buf);
const u64View = new BigUint64Array(f64Buf);

function floatToDyadic(x) {
  if (x === 0) {
    return { mantissa: 0n, exp: 0 };
  }
  f64View[0] = x;
  const bits = u64View[0];
  const sign = (bits >> 63n) === 1n ? -1n : 1n;
  const rawExp = Number((bits >> 52n) & 0x7ffn);
  const rawFrac = bits & 0x000fffffffffffffn;
  if (rawExp === 0) {
    // Subnormal: (-1)^s * rawFrac * 2^(-1074)
    return { mantissa: sign * rawFrac, exp: -1074 };
  }
  // Normal: (-1)^s * (2^52 + rawFrac) * 2^(rawExp - 1023 - 52)
  return { mantissa: sign * ((1n << 52n) | rawFrac), exp: rawExp - 1075 };
}

function exactSubtractFloat64(minuend, subtrahends) {
  const terms = [
    floatToDyadic(minuend),
    ...subtrahends.map((v) => {
      const d = floatToDyadic(v);
      return { mantissa: -d.mantissa, exp: d.exp };
    }),
  ];

  const minExp = terms.reduce((acc, t) => (t.mantissa !== 0n && t.exp < acc ? t.exp : acc), 0);
  let total = 0n;
  for (const t of terms) {
    if (t.mantissa !== 0n) {
      total += t.mantissa << BigInt(t.exp - minExp);
    }
  }

  if (total === 0n) {
    return 0;
  }

  const neg = total < 0n;
  let mag = neg ? -total : total;
  const bitLen = mag.toString(2).length;

  // Round mag * 2^minExp to IEEE-754 float64 (53 bits of precision)
  let shift = bitLen - 53;
  // Handle subnormal range where exponent would be < -1074
  if (minExp + shift < -1074) {
    shift = -1074 - minExp;
  }

  let significand;
  let resultExp;
  if (shift > 0) {
    const half = 1n << BigInt(shift - 1);
    const mask = (1n << BigInt(shift)) - 1n;
    const rem = mag & mask;
    significand = mag >> BigInt(shift);
    if (rem > half || (rem === half && (significand & 1n) === 1n)) {
      significand += 1n;
    }
    resultExp = minExp + shift;
  } else {
    significand = mag << BigInt(-shift);
    resultExp = minExp + shift;
  }

  const value = Number(significand) * 2 ** resultExp;
  return neg ? -value : value;
}

/**
 * Independent reference 2: Kahan-Babuška-Neumaier compensated summation.
 */
function neumaierSubtract(minuend, subtrahends) {
  let sum = 0;
  let comp = 0;
  for (const x of subtrahends) {
    const t = sum + x;
    if (Math.abs(sum) >= Math.abs(x)) {
      comp += (sum - t) + x;
    } else {
      comp += (x - t) + sum;
    }
    sum = t;
  }
  return (minuend - sum) - comp;
}

describe('subtractFloatRecursive', () => {
  describe('normal binary and variadic subtraction', () => {
    it('subtracts basic positive, negative, and mixed numbers', () => {
      assert.equal(subtractFloatRecursive(10, 3), 7);
      assert.equal(subtractFloatRecursive(3, 10), -7);
      assert.equal(subtractFloatRecursive(-5, -8), 3);
      assert.equal(subtractFloatRecursive(-5, 8), -13);
      assert.equal(subtractFloatRecursive(5, -8), 13);
      assert.equal(subtractFloatRecursive(1.5, 0.25), 1.25);
      assert.equal(subtractFloatRecursive(42, 42), 0);
    });

    it('supports variadic subtrahends and array subtrahends equivalently', () => {
      assert.equal(subtractFloatRecursive(100, 10, 20, 30), 40);
      assert.equal(subtractFloatRecursive(100, [10, 20, 30]), 40);
      assert.equal(subtractFloatRecursive(10, 1, 2, 3, 4, 5), -5);
      assert.equal(subtractFloatRecursive(10, [1, 2, 3, 4, 5]), -5);
    });

    it('handles single-argument and empty-array invocations', () => {
      assert.equal(subtractFloatRecursive(42.5), 42.5);
      assert.equal(subtractFloatRecursive(0), 0);
      assert.equal(subtractFloatRecursive(-17.25), -17.25);
      assert.equal(subtractFloatRecursive(42.5, []), 42.5);
      assert.equal(subtractFloatRecursive(-17.25, []), -17.25);
    });

    it('works across odd, even, and power-of-two subtrahend lengths', () => {
      for (const n of [1, 2, 3, 4, 5, 7, 8, 9, 15, 16, 17, 63, 64, 65, 257]) {
        const subtrahends = Array.from({ length: n }, (_, i) => i + 1);
        const expectedSum = (n * (n + 1)) / 2;
        assert.equal(subtractFloatRecursive(expectedSum, subtrahends), 0);
        assert.equal(subtractFloatRecursive(expectedSum, ...subtrahends), 0);
      }
    });

    it('does not mutate the caller-supplied subtrahend array', () => {
      const input = [1.5, -2.25, 3.75, 4.125];
      const snapshot = [...input];
      subtractFloatRecursive(10, input);
      assert.deepEqual(input, snapshot);
    });
  });

  describe('edge cases: signed zeros, subnormals, cancellation, and overflow', () => {
    it('preserves IEEE-754 signed zero semantics', () => {
      assert.ok(Object.is(subtractFloatRecursive(-0), -0));
      assert.ok(Object.is(subtractFloatRecursive(-0, []), -0));
      assert.ok(Object.is(subtractFloatRecursive(-0, 0), -0));
      assert.ok(Object.is(subtractFloatRecursive(0, 0), 0));
      assert.ok(Object.is(subtractFloatRecursive(0, -0), 0));
      assert.ok(Object.is(subtractFloatRecursive(-0, -0), 0));
      assert.ok(Object.is(subtractFloatRecursive(-0, 0, 0, 0), -0));
      assert.ok(Object.is(subtractFloatRecursive(-0, -0, -0, -0), 0));
    });

    it('handles subnormal float64 values faithfully', () => {
      assert.equal(subtractFloatRecursive(Number.MIN_VALUE, Number.MIN_VALUE), 0);
      assert.equal(subtractFloatRecursive(Number.MIN_VALUE, -Number.MIN_VALUE), 2 * Number.MIN_VALUE);
      assert.equal(subtractFloatRecursive(3 * Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE), Number.MIN_VALUE);
    });

    it('avoids catastrophic cancellation where naive left-to-right subtraction fails', () => {
      // Naive (1e16 - 1) - 1e16 evaluates to 0 because ulp(1e16) === 2
      assert.equal(subtractFloatRecursive(1e16, 1, 1e16), -1);
      assert.equal(subtractFloatRecursive(1e16, 1e16, 1), -1);
      assert.equal(subtractFloatRecursive(1, 1e16, -1e16), 1);

      // Subtracting 100,000 ones from 1e16: naive loop stays stuck at 1e16!
      const ones = new Array(100_000).fill(1);
      assert.equal(subtractFloatRecursive(1e16, ones), 1e16 - 100_000);
    });

    it('handles decimal fractions with exact error compensation', () => {
      assert.equal(subtractFloatRecursive(1, 0.1, 0.2), exactSubtractFloat64(1, [0.1, 0.2]));
      assert.equal(subtractFloatRecursive(0.3, 0.1, 0.2), exactSubtractFloat64(0.3, [0.1, 0.2]));
    });

    it('avoids spurious overflow/NaN when large finite subtrahends cancel, and overflows cleanly when true result exceeds MAX_VALUE', () => {
      // Left half overflows to +Infinity, right half to -Infinity; rescaling avoids NaN
      assert.equal(subtractFloatRecursive(5, [1e308, 1e308, -1e308, -1e308]), 5);
      // Subnormal minuend preserved when cancelling huge subtrahends
      assert.equal(subtractFloatRecursive(Number.MIN_VALUE, [1e308, 1e308, -1e308, -1e308]), Number.MIN_VALUE);
      // Intermediate subtrahend sum overflows, but true difference is finite
      assert.equal(subtractFloatRecursive(1e308, [1e308, 1e308]), -1e308);
      // Genuine IEEE-754 overflow
      assert.equal(subtractFloatRecursive(Number.MAX_VALUE, -Number.MAX_VALUE), Infinity);
      assert.equal(subtractFloatRecursive(-Number.MAX_VALUE, Number.MAX_VALUE), -Infinity);
      assert.equal(subtractFloatRecursive(0, [1e308, 1e308]), -Infinity);
    });
  });

  describe('input validation', () => {
    it('throws TypeError when minuend is missing or not a number', () => {
      assert.throws(() => subtractFloatRecursive(), TypeError);
      for (const bad of [undefined, null, '10', true, false, 10n, {}, [], Symbol('x')]) {
        assert.throws(() => subtractFloatRecursive(bad, 1), TypeError);
      }
    });

    it('throws RangeError when minuend is NaN or infinite', () => {
      for (const bad of [NaN, Infinity, -Infinity]) {
        assert.throws(() => subtractFloatRecursive(bad, 1), RangeError);
        assert.throws(() => subtractFloatRecursive(bad), RangeError);
      }
    });

    it('throws TypeError when any subtrahend is not a number', () => {
      for (const bad of [undefined, null, '1', true, 1n, {}, Symbol('s')]) {
        assert.throws(() => subtractFloatRecursive(10, bad), TypeError);
        assert.throws(() => subtractFloatRecursive(10, 1, bad, 2), TypeError);
        assert.throws(() => subtractFloatRecursive(10, [1, bad, 2]), TypeError);
      }
      // Sparse array holes are undefined -> TypeError
      // eslint-disable-next-line no-sparse-arrays
      assert.throws(() => subtractFloatRecursive(10, [1, , 3]), TypeError);
      // Mixing array with extra variadic args -> TypeError
      assert.throws(() => subtractFloatRecursive(10, [1, 2], 3), TypeError);
      assert.throws(() => subtractFloatRecursive(10, 1, [2, 3]), TypeError);
    });

    it('throws RangeError when any subtrahend is NaN or infinite', () => {
      for (const bad of [NaN, Infinity, -Infinity]) {
        assert.throws(() => subtractFloatRecursive(10, bad), RangeError);
        assert.throws(() => subtractFloatRecursive(10, 1, bad), RangeError);
        assert.throws(() => subtractFloatRecursive(10, [1, bad, 2]), RangeError);
      }
    });
  });

  describe('cross-checks against independent computations', () => {
    it('matches exact BigInt dyadic rational arithmetic across binary and multi-term pseudo-random inputs', () => {
      // Deterministic xorshift32 PRNG for reproducible tests
      let state = 0x12345678;
      const nextRand = () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) / 0x100000000) * 2 - 1;
      };

      // Binary subtraction must match IEEE-754 exact rounding bit-for-bit
      for (let i = 0; i < 200; i++) {
        const expA = Math.floor(nextRand() * 30);
        const expB = Math.floor(nextRand() * 30);
        const a = nextRand() * 2 ** expA;
        const b = nextRand() * 2 ** expB;
        const actual = subtractFloatRecursive(a, b);
        const expected = exactSubtractFloat64(a, [b]);
        assert.equal(actual, expected);
        assert.equal(actual, a - b);
      }

      // Multi-term subtraction across varied lengths and scales
      for (let trial = 0; trial < 40; trial++) {
        const len = 3 + (trial % 25);
        const minuend = nextRand() * 1e4;
        const subtrahends = Array.from({ length: len }, () => nextRand() * 1e3);
        const actual = subtractFloatRecursive(minuend, subtrahends);
        const exact = exactSubtractFloat64(minuend, subtrahends);
        const tol = Math.max(Math.abs(exact), 1) * 4 * Number.EPSILON;
        assert.ok(
          Math.abs(actual - exact) <= tol,
          `trial ${trial}: actual=${actual}, exact=${exact}, diff=${Math.abs(actual - exact)}`,
        );
      }
    });

    it('agrees tightly with independent Kahan-Babuška-Neumaier summation on long series', () => {
      // Repeated 0.1 subtraction (10,000 terms)
      const tenths = new Array(10_000).fill(0.1);
      const actualTenths = subtractFloatRecursive(1000, tenths);
      const neumaierTenths = neumaierSubtract(1000, tenths);
      const exactTenths = exactSubtractFloat64(1000, tenths);
      assert.ok(Math.abs(actualTenths - neumaierTenths) <= 2 * Number.EPSILON * 1000);
      assert.ok(Math.abs(actualTenths - exactTenths) <= 2 * Number.EPSILON * 1000);

      // Harmonic series subtraction: 10 - sum_{k=1}^{5000} (1 / k)
      const harmonic = Array.from({ length: 5000 }, (_, i) => 1 / (i + 1));
      const actualHarmonic = subtractFloatRecursive(10, harmonic);
      const neumaierHarmonic = neumaierSubtract(10, harmonic);
      const exactHarmonic = exactSubtractFloat64(10, harmonic);
      assert.ok(Math.abs(actualHarmonic - neumaierHarmonic) <= 4 * Number.EPSILON * 10);
      assert.ok(Math.abs(actualHarmonic - exactHarmonic) <= 4 * Number.EPSILON * 10);
    });
  });
});
