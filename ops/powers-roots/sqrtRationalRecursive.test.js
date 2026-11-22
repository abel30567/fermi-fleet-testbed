import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { sqrtRationalRecursive } from './sqrtRationalRecursive.js';

/**
 * Iterative Euclidean GCD for independent invariant verification in tests.
 */
function iterGcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/**
 * Asserts the exact rational lowest-terms representation invariant.
 */
function assertLowestTerms(r) {
  assert.equal(typeof r, 'object');
  assert.notEqual(r, null);
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `Expected den > 0n, got ${r.den}`);
  assert.ok(r.num >= 0n, `Expected principal root num >= 0n, got ${r.num}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, `Expected zero as 0n/1n, got 0n/${r.den}`);
  } else {
    assert.equal(
      iterGcd(r.num, r.den),
      1n,
      `Expected lowest terms for ${r.num}/${r.den}`,
    );
  }
}

/**
 * Exact BigInt verification that |approx - sqrt(p / q)| <= tolNum / tolDen
 * by checking max(0, approx - tol)^2 <= p / q <= (approx + tol)^2.
 */
function assertWithinExactTolerance(approx, radicand, tol = { num: 1n, den: 10n ** 12n }) {
  assertLowestTerms(approx);
  let p = radicand.num;
  let q = radicand.den;
  if (q < 0n) {
    p = -p;
    q = -q;
  }
  const { num: a, den: b } = approx;
  const { num: tN, den: tD } = tol;

  // Lower bound: max(0, a/b - tN/tD)^2 <= p/q
  const lowNum = a * tD - tN * b;
  const commonDen = b * tD;
  if (lowNum > 0n) {
    assert.ok(
      lowNum * lowNum * q <= p * commonDen * commonDen,
      `Lower bound violated: (${a}/${b} - ${tN}/${tD})^2 > ${p}/${q}`,
    );
  }

  // Upper bound: p/q <= (a/b + tN/tD)^2
  const highNum = a * tD + tN * b;
  assert.ok(
    p * commonDen * commonDen <= highNum * highNum * q,
    `Upper bound violated: ${p}/${q} > (${a}/${b} + ${tN}/${tD})^2`,
  );
}

/**
 * Converts a rational to a JS Number for Math.sqrt cross-checks.
 */
function rationalToNumber({ num, den }) {
  const scale = 10n ** 18n;
  const scaled = (num * scale) / den;
  return Number(scaled) / 1e18;
}

/**
 * Independent iterative integer Babylonian square root reference:
 * computes floor(sqrt(p / q) * 10^digits) iteratively.
 */
function iterativeScaledSqrt(p, q, digits) {
  const scale = 10n ** BigInt(digits);
  const target = (p * scale * scale) / q;
  if (target < 2n) return target;
  let x = 1n << BigInt((target.toString(2).length + 1) >> 1);
  while (true) {
    const next = (x + target / x) >> 1n;
    if (next >= x) return x;
    x = next;
  }
}

describe('sqrtRationalRecursive', () => {
  test('zero and unreduced zero inputs', () => {
    for (const input of [
      { num: 0n, den: 1n },
      { num: 0n, den: 7n },
      { num: 0n, den: -42n },
      { num: 0n, den: 10n ** 30n },
    ]) {
      const res = sqrtRationalRecursive(input);
      assertLowestTerms(res);
      assert.deepEqual(res, { num: 0n, den: 1n });
    }
  });

  test('exact perfect squares (integers, fractions, and unreduced inputs)', () => {
    const cases = [
      [{ num: 1n, den: 1n }, { num: 1n, den: 1n }],
      [{ num: 4n, den: 1n }, { num: 2n, den: 1n }],
      [{ num: 9n, den: 1n }, { num: 3n, den: 1n }],
      [{ num: 144n, den: 1n }, { num: 12n, den: 1n }],
      [{ num: 1n, den: 4n }, { num: 1n, den: 2n }],
      [{ num: 4n, den: 9n }, { num: 2n, den: 3n }],
      [{ num: 25n, den: 49n }, { num: 5n, den: 7n }],
      [{ num: 169n, den: 256n }, { num: 13n, den: 16n }],
      // Unreduced perfect squares (8/18 -> 4/9, -50/-98 -> 25/49)
      [{ num: 8n, den: 18n }, { num: 2n, den: 3n }],
      [{ num: 12n, den: 27n }, { num: 2n, den: 3n }],
      [{ num: -50n, den: -98n }, { num: 5n, den: 7n }],
      [{ num: -100n, den: -1n }, { num: 10n, den: 1n }],
    ];

    for (const [input, expected] of cases) {
      const res = sqrtRationalRecursive(input);
      assertLowestTerms(res);
      assert.deepEqual(res, expected);
    }
  });

  test('boundary values around perfect squares and bit-length thresholds', () => {
    const roots = [
      1n, 2n, 3n, 4n, 7n, 8n, 15n, 16n, 17n, 31n, 32n, 63n, 64n,
      127n, 128n, 255n, 256n, 257n, 1024n, (1n << 16n) - 1n, 1n << 16n,
      (1n << 32n) - 1n, 1n << 32n, (1n << 64n) + 12345n,
    ];

    for (const r of roots) {
      const sq = r * r;
      const exact = sqrtRationalRecursive({ num: sq, den: 1n });
      assertLowestTerms(exact);
      assert.deepEqual(exact, { num: r, den: 1n });

      if (sq > 1n) {
        const below = sqrtRationalRecursive({ num: sq - 1n, den: 1n });
        assertWithinExactTolerance(below, { num: sq - 1n, den: 1n });
        assert.ok(below.num < r * below.den);
      }

      const above = sqrtRationalRecursive({ num: sq + 1n, den: 1n });
      assertWithinExactTolerance(above, { num: sq + 1n, den: 1n });
      assert.ok(above.num > r * above.den);
    }
  });

  test('non-perfect squares cross-checked against Math.sqrt and exact bounds', () => {
    const inputs = [
      { num: 2n, den: 1n },
      { num: 3n, den: 1n },
      { num: 5n, den: 1n },
      { num: 10n, den: 1n },
      { num: 1n, den: 2n },
      { num: 1n, den: 3n },
      { num: 2n, den: 3n },
      { num: 3n, den: 5n },
      { num: 7n, den: 11n },
      { num: 999n, den: 1000n },
      { num: 1000n, den: 3n },
      { num: 3n, den: 1000n },
      { num: 6n, den: 9n }, // unreduced 2/3
      { num: -6n, den: -9n }, // negative/negative unreduced 2/3
    ];

    for (const q of inputs) {
      const res = sqrtRationalRecursive(q);
      assertWithinExactTolerance(res, q);

      const expectedFloat = Math.sqrt(Number(q.num) / Number(q.den));
      const actualFloat = rationalToNumber(res);
      assert.ok(
        Math.abs(actualFloat - expectedFloat) <= 1e-12,
        `Math.sqrt mismatch for ${q.num}/${q.den}: got ${actualFloat}, expected ${expectedFloat}`,
      );
    }
  });

  test('large BigInts (both exact perfect squares and non-perfect squares)', () => {
    // Large exact perfect square
    const bigNumRoot = 10n ** 60n + 123456789n;
    const bigDenRoot = 3n * 10n ** 40n + 7n;
    const g = iterGcd(bigNumRoot, bigDenRoot);
    const exactLarge = sqrtRationalRecursive({
      num: bigNumRoot * bigNumRoot * 17n,
      den: bigDenRoot * bigDenRoot * 17n,
    });
    assertLowestTerms(exactLarge);
    assert.deepEqual(exactLarge, { num: bigNumRoot / g, den: bigDenRoot / g });

    // Large non-perfect square > 1
    const hugeInput = { num: 10n ** 80n + 3n, den: 1n };
    const hugeRes = sqrtRationalRecursive(hugeInput);
    assertWithinExactTolerance(hugeRes, hugeInput);

    // Huge numerator & denominator close to 2
    const bigRatio = { num: 2n * 10n ** 80n + 1n, den: 10n ** 80n + 3n };
    const bigRatioRes = sqrtRationalRecursive(bigRatio);
    assertWithinExactTolerance(bigRatioRes, bigRatio);

    // Very small positive rational: should stay accurately non-zero (relative error <= tol)
    const tinyInput = { num: 2n, den: 10n ** 30n };
    const tinyRes = sqrtRationalRecursive(tinyInput);
    assertLowestTerms(tinyRes);
    assert.ok(tinyRes.num > 0n, 'Square root of tiny positive rational must be > 0');
    assertWithinExactTolerance(tinyRes, tinyInput);
    // Also verify relative error <= 1e-12: |tinyRes - sqrt(2e-30)| <= 1e-12 * 1e-15 = 1e-27
    assertWithinExactTolerance(tinyRes, tinyInput, { num: 1n, den: 10n ** 27n });
  });

  test('custom tolerance and precision options cross-checked against iterative reference', () => {
    // Direct rational tolerance
    const r2 = { num: 2n, den: 1n };
    const tol25 = { num: 1n, den: 10n ** 25n };
    const sqrt2High = sqrtRationalRecursive(r2, tol25);
    assertWithinExactTolerance(sqrt2High, r2, tol25);

    // Options object with tolerance
    const r3 = { num: 3n, den: 7n };
    const tol20 = { num: 1n, den: 10n ** 20n };
    const sqrt3Over7 = sqrtRationalRecursive(r3, { tolerance: tol20 });
    assertWithinExactTolerance(sqrt3Over7, r3, tol20);

    // Options object with integer and BigInt precision (50 decimal digits)
    const sqrt5_50 = sqrtRationalRecursive({ num: 5n, den: 1n }, { precision: 50 });
    assertWithinExactTolerance(sqrt5_50, { num: 5n, den: 1n }, { num: 1n, den: 10n ** 50n });

    const sqrt5_50b = sqrtRationalRecursive({ num: 5n, den: 1n }, { precision: 50n });
    assert.deepEqual(sqrt5_50, sqrt5_50b);

    // Cross-check 50-digit result against independent iterative Babylonian algorithm
    const digits = 48;
    const refScaled = iterativeScaledSqrt(5n, 1n, digits);
    const actualScaled = (sqrt5_50.num * 10n ** BigInt(digits)) / sqrt5_50.den;
    const diff = actualScaled >= refScaled ? actualScaled - refScaled : refScaled - actualScaled;
    assert.ok(diff <= 1n, `Iterative reference mismatch at ${digits} digits: diff=${diff}`);

    // Unreduced tolerance and empty options
    const resUnreducedTol = sqrtRationalRecursive(r2, { num: -2n, den: -2n * 10n ** 15n });
    assertWithinExactTolerance(resUnreducedTol, r2, { num: 1n, den: 10n ** 15n });

    const resEmptyOpts = sqrtRationalRecursive(r2, {});
    assertWithinExactTolerance(resEmptyOpts, r2);

    // Large tolerance
    const resCoarse = sqrtRationalRecursive({ num: 2n, den: 1n }, { num: 5n, den: 1n });
    assertWithinExactTolerance(resCoarse, { num: 2n, den: 1n }, { num: 5n, den: 1n });
  });

  test('negative rational inputs throw RangeError', () => {
    const negatives = [
      { num: -1n, den: 1n },
      { num: 1n, den: -1n },
      { num: -4n, den: 9n },
      { num: 4n, den: -9n },
      { num: -2n, den: 3n },
      { num: -(10n ** 50n), den: 1n },
    ];
    for (const neg of negatives) {
      assert.throws(() => sqrtRationalRecursive(neg), RangeError);
    }
  });

  test('invalid rational and option inputs throw TypeError or RangeError', () => {
    // Invalid rational types -> TypeError
    for (const bad of [
      null,
      undefined,
      4,
      4n,
      '4/1',
      true,
      [4n, 1n],
      {},
      { num: 4, den: 1n },
      { num: 4n, den: 1 },
      { num: 4, den: 1 },
      { num: '4', den: '1' },
      { num: 4n },
      { den: 1n },
    ]) {
      assert.throws(() => sqrtRationalRecursive(bad), TypeError);
    }

    // Zero denominator -> RangeError
    assert.throws(() => sqrtRationalRecursive({ num: 4n, den: 0n }), RangeError);
    assert.throws(() => sqrtRationalRecursive({ num: 0n, den: 0n }), RangeError);
    assert.throws(() => sqrtRationalRecursive({ num: -4n, den: 0n }), RangeError);

    // Invalid option types -> TypeError
    const valid = { num: 2n, den: 1n };
    for (const badOpt of [
      null,
      1e-12,
      12n,
      '12',
      [1n, 10n],
      { foo: 1 },
      { num: 1, den: 10n },
      { num: 1n, den: 10 },
      { num: 1n, den: 10n, precision: 12 },
      { tolerance: 1e-12 },
      { tolerance: null },
      { precision: 1.5 },
      { precision: Number.NaN },
      { precision: Number.POSITIVE_INFINITY },
      { precision: '12' },
    ]) {
      assert.throws(() => sqrtRationalRecursive(valid, badOpt), TypeError);
    }

    // Out-of-range options -> RangeError
    for (const badRangeOpt of [
      { num: 0n, den: 1n },
      { num: -1n, den: 10n },
      { num: 1n, den: -10n },
      { num: 1n, den: 0n },
      { tolerance: { num: 0n, den: 1n } },
      { tolerance: { num: -1n, den: 10n } },
      { tolerance: { num: 1n, den: 0n } },
      { precision: 0 },
      { precision: -5 },
      { precision: 0n },
      { precision: -1n },
      { tolerance: { num: 1n, den: 10n }, precision: 10 },
    ]) {
      assert.throws(() => sqrtRationalRecursive(valid, badRangeOpt), RangeError);
    }

    // Options are still validated even for zero or exact perfect square inputs
    assert.throws(() => sqrtRationalRecursive({ num: 0n, den: 1n }, { precision: 0 }), RangeError);
    assert.throws(() => sqrtRationalRecursive({ num: 4n, den: 9n }, null), TypeError);
  });
});
