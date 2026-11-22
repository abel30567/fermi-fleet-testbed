import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtRationalRecursive } from './cbrtRationalRecursive.js';

function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    [x, y] = [y, x % y];
  }
  return x;
}

function assertLowestTerms(r) {
  assert.equal(typeof r, 'object');
  assert.notEqual(r, null);
  assert.equal(typeof r.num, 'bigint');
  assert.equal(typeof r.den, 'bigint');
  assert.ok(r.den > 0n, `expected den > 0n, got ${r.den}`);
  if (r.num === 0n) {
    assert.equal(r.den, 1n, `expected zero as 0n/1n, got 0n/${r.den}`);
  } else {
    assert.equal(
      gcd(r.num, r.den),
      1n,
      `expected lowest terms for ${r.num}/${r.den}`,
    );
  }
}

function ratAdd(a, b) {
  return { num: a.num * b.den + b.num * a.den, den: a.den * b.den };
}

function ratSub(a, b) {
  return { num: a.num * b.den - b.num * a.den, den: a.den * b.den };
}

function ratCube(r) {
  return { num: r.num * r.num * r.num, den: r.den * r.den * r.den };
}

function ratCmp(a, b) {
  // Normalize sign of denominators for comparison
  const aNum = a.den < 0n ? -a.num : a.num;
  const aDen = a.den < 0n ? -a.den : a.den;
  const bNum = b.den < 0n ? -b.num : b.num;
  const bDen = b.den < 0n ? -b.den : b.den;
  const lhs = aNum * bDen;
  const rhs = bNum * aDen;
  return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
}

/**
 * Exact BigInt verification of |r - cbrt(x)| <= tol,
 * valid for positive, zero, and negative rationals x and r.
 * Since t -> t^3 is strictly increasing on all of R:
 *   r - tol <= cbrt(x) <= r + tol  <=>  (r - tol)^3 <= x <= (r + tol)^3
 */
function assertCbrtWithinTolerance(r, x, tol) {
  assertLowestTerms(r);
  const lo = ratSub(r, tol);
  const hi = ratAdd(r, tol);
  assert.ok(
    ratCmp(ratCube(lo), x) <= 0,
    `Lower bound failed: (${lo.num}/${lo.den})^3 > ${x.num}/${x.den}`,
  );
  assert.ok(
    ratCmp(x, ratCube(hi)) <= 0,
    `Upper bound failed: ${x.num}/${x.den} > (${hi.num}/${hi.den})^3`,
  );
}

/**
 * Converts a rational to a JS Number for Math.cbrt cross-checks (moderate values).
 */
function ratToNumber(r) {
  const scale = 10n ** 18n;
  const scaled = (r.num * scale) / r.den;
  return Number(scaled) / 1e18;
}

/**
 * Independent iterative binary search reference implementation for positive rationals.
 */
function referenceIterativeCbrt(x, steps = 80) {
  let lo = { num: 0n, den: 1n };
  let hi = { num: 1n, den: 1n };
  while (ratCmp(ratCube(hi), x) < 0) {
    hi = { num: hi.num * 2n, den: 1n };
  }
  for (let i = 0; i < steps; i++) {
    const midNum = lo.num * hi.den + hi.num * lo.den;
    const midDen = 2n * lo.den * hi.den;
    const g = gcd(midNum, midDen);
    const mid = { num: midNum / g, den: midDen / g };
    if (ratCmp(ratCube(mid), x) <= 0) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return lo;
}

describe('cbrtRationalRecursive', () => {
  describe('exact rational cube roots', () => {
    it('handles zero in canonical and unreduced forms', () => {
      for (const input of [
        { num: 0n, den: 1n },
        { num: 0n, den: 7n },
        { num: 0n, den: -99n },
      ]) {
        const res = cbrtRationalRecursive(input);
        assertLowestTerms(res);
        assert.deepEqual(res, { num: 0n, den: 1n });
      }
    });

    it('returns exact cube roots for unit and integer cubes (positive and negative)', () => {
      const cases = [
        [{ num: 1n, den: 1n }, { num: 1n, den: 1n }],
        [{ num: -1n, den: 1n }, { num: -1n, den: 1n }],
        [{ num: 1n, den: -1n }, { num: -1n, den: 1n }],
        [{ num: -1n, den: -1n }, { num: 1n, den: 1n }],
        [{ num: 8n, den: 1n }, { num: 2n, den: 1n }],
        [{ num: -8n, den: 1n }, { num: -2n, den: 1n }],
        [{ num: 27n, den: 1n }, { num: 3n, den: 1n }],
        [{ num: -27n, den: 1n }, { num: -3n, den: 1n }],
        [{ num: 64n, den: 1n }, { num: 4n, den: 1n }],
        [{ num: -125n, den: 1n }, { num: -5n, den: 1n }],
        [{ num: 1000n, den: 1n }, { num: 10n, den: 1n }],
        [{ num: -1728n, den: 1n }, { num: -12n, den: 1n }],
      ];
      for (const [input, expected] of cases) {
        const res = cbrtRationalRecursive(input);
        assertLowestTerms(res);
        assert.deepEqual(res, expected);
      }
    });

    it('returns exact cube roots for fractional perfect cubes and unreduced inputs', () => {
      const cases = [
        [{ num: 8n, den: 27n }, { num: 2n, den: 3n }],
        [{ num: -27n, den: 64n }, { num: -3n, den: 4n }],
        [{ num: 125n, den: 343n }, { num: 5n, den: 7n }],
        [{ num: 1n, den: 1000n }, { num: 1n, den: 10n }],
        [{ num: -1n, den: 8n }, { num: -1n, den: 2n }],
        // Unreduced inputs that become perfect cubes after reduction
        [{ num: 16n, den: 2n }, { num: 2n, den: 1n }],
        [{ num: -54n, den: 16n }, { num: -3n, den: 2n }],
        [{ num: 24n, den: -81n }, { num: -2n, den: 3n }],
        [{ num: -16n, den: -54n }, { num: 2n, den: 3n }],
        [{ num: 700n, den: 18900n }, { num: 1n, den: 3n }],
      ];
      for (const [input, expected] of cases) {
        const res = cbrtRationalRecursive(input);
        assertLowestTerms(res);
        assert.deepEqual(res, expected);
      }
    });

    it('returns exact cube roots for very large BigInt perfect cubes', () => {
      const p = 10n ** 35n + 7n;
      const q = 10n ** 30n + 9n;
      assert.equal(gcd(p, q), 1n);

      const posRes = cbrtRationalRecursive({ num: p ** 3n, den: q ** 3n });
      assertLowestTerms(posRes);
      assert.deepEqual(posRes, { num: p, den: q });

      const negRes = cbrtRationalRecursive({ num: -(p ** 3n), den: q ** 3n });
      assertLowestTerms(negRes);
      assert.deepEqual(negRes, { num: -p, den: q });

      // Unreduced large BigInt perfect cube
      const factor = 1234567890123456789n;
      const unreducedRes = cbrtRationalRecursive({
        num: -(p ** 3n) * factor,
        den: -(q ** 3n) * factor,
      });
      assertLowestTerms(unreducedRes);
      assert.deepEqual(unreducedRes, { num: p, den: q });
    });
  });

  describe('irrational cube roots and accuracy', () => {
    const defaultBound = { num: 1n, den: 10n ** 12n };

    it('computes positive and negative irrational cube roots within 1e-12', () => {
      const inputs = [
        { num: 2n, den: 1n },
        { num: -2n, den: 1n },
        { num: 3n, den: 1n },
        { num: -3n, den: 1n },
        { num: 5n, den: 1n },
        { num: 10n, den: 1n },
        { num: -100n, den: 1n },
        { num: 1n, den: 2n },
        { num: -1n, den: 2n },
        { num: 2n, den: 3n },
        { num: -5n, den: 7n },
        { num: 22n, den: 7n },
        { num: 355n, den: 113n },
        { num: 1n, den: 100n },
      ];

      for (const x of inputs) {
        const r = cbrtRationalRecursive(x);
        assertCbrtWithinTolerance(r, x, defaultBound);

        // Cross-check against Math.cbrt
        const expectedFloat = Math.cbrt(Number(x.num) / Number(x.den));
        const actualFloat = ratToNumber(r);
        assert.ok(
          Math.abs(actualFloat - expectedFloat) <= 1e-12,
          `Math.cbrt mismatch for ${x.num}/${x.den}: got ${actualFloat}, expected ${expectedFloat}`,
        );
      }
    });

    it('preserves odd symmetry cbrt(-x) === -cbrt(x) and handles unreduced irrationals', () => {
      const rPos = cbrtRationalRecursive({ num: 2n, den: 3n });
      const rNeg = cbrtRationalRecursive({ num: -2n, den: 3n });
      assertLowestTerms(rPos);
      assertLowestTerms(rNeg);
      assert.equal(rNeg.num, -rPos.num);
      assert.equal(rNeg.den, rPos.den);

      const rUnreduced = cbrtRationalRecursive({ num: 14n, den: -21n });
      assert.deepEqual(rUnreduced, rNeg);
    });

    it('satisfies multiplicative algebraic identities', () => {
      const c2 = cbrtRationalRecursive({ num: 2n, den: 1n });
      const c3 = cbrtRationalRecursive({ num: 3n, den: 1n });
      const c6 = cbrtRationalRecursive({ num: 6n, den: 1n });
      const prod = { num: c2.num * c3.num, den: c2.den * c3.den };
      const diff = ratSub(prod, c6);
      const absDiffNum = diff.num < 0n ? -diff.num : diff.num;
      // |cbrt(2)*cbrt(3) - cbrt(6)| <= 1e-12
      assert.ok(absDiffNum * 10n ** 12n <= diff.den);

      // cbrt(2)^2 approx cbrt(4)
      const c4 = cbrtRationalRecursive({ num: 4n, den: 1n });
      const c2Sq = { num: c2.num * c2.num, den: c2.den * c2.den };
      const sqDiff = ratSub(c2Sq, c4);
      const absSqDiffNum = sqDiff.num < 0n ? -sqDiff.num : sqDiff.num;
      assert.ok(absSqDiffNum * 10n ** 12n <= sqDiff.den);
    });

    it('matches independent iterative binary search reference implementation', () => {
      const inputs = [
        { num: 2n, den: 1n },
        { num: 7n, den: 5n },
        { num: 1000003n, den: 997n },
        { num: 10n ** 25n + 3n, den: 7n },
      ];
      for (const x of inputs) {
        const recursiveRes = cbrtRationalRecursive(x, { precision: 20 });
        const iterativeRef = referenceIterativeCbrt(x, 120);
        const diff = ratSub(recursiveRes, iterativeRef);
        const absDiff = diff.num < 0n ? -diff.num : diff.num;
        assert.ok(
          absDiff * 10n ** 18n <= diff.den,
          `Mismatch vs iterative reference for ${x.num}/${x.den}`,
        );
      }
    });
  });

  describe('custom tolerance and precision options', () => {
    it('supports passing a tolerance rational directly or via options.tolerance', () => {
      const x = { num: 2n, den: 1n };
      const tol25 = { num: 1n, den: 10n ** 25n };
      const r1 = cbrtRationalRecursive(x, tol25);
      assertCbrtWithinTolerance(r1, x, tol25);

      const tol30 = { num: 1n, den: 10n ** 30n };
      const r2 = cbrtRationalRecursive(x, { tolerance: tol30 });
      assertCbrtWithinTolerance(r2, x, tol30);
    });

    it('supports options.precision as number or BigInt', () => {
      const x = { num: -5n, den: 3n };
      const r40 = cbrtRationalRecursive(x, { precision: 40 });
      assertCbrtWithinTolerance(r40, x, { num: 1n, den: 10n ** 40n });

      const r50 = cbrtRationalRecursive(x, { precision: 50n });
      assertCbrtWithinTolerance(r50, x, { num: 1n, den: 10n ** 50n });
    });

    it('handles empty options object and loose tolerance sensibly', () => {
      const x = { num: 2n, den: 1n };
      const rDefault = cbrtRationalRecursive(x, {});
      assertCbrtWithinTolerance(rDefault, x, { num: 1n, den: 10n ** 12n });

      const looseTol = { num: 10n, den: 1n };
      const rLoose = cbrtRationalRecursive(x, looseTol);
      assertCbrtWithinTolerance(rLoose, x, looseTol);
      assert.ok(rLoose.num > 0n, 'cube root of positive input must remain positive');
    });
  });

  describe('extreme scales and boundary cases', () => {
    it('handles very large and very small irrational rationals accurately', () => {
      const scaleCube = 10n ** 60n;
      const scale = 10n ** 20n;

      // cbrt(2 * 10^60) = 10^20 * cbrt(2)
      const huge = { num: 2n * scaleCube, den: 1n };
      const rHuge = cbrtRationalRecursive(huge);
      assertCbrtWithinTolerance(rHuge, huge, { num: 1n, den: 10n ** 12n });

      // cbrt(2 / 10^60) = cbrt(2) / 10^20 (must stay strictly positive and maintain relative accuracy)
      const tiny = { num: 2n, den: scaleCube };
      const rTiny = cbrtRationalRecursive(tiny);
      assertLowestTerms(rTiny);
      assert.ok(rTiny.num > 0n);
      assertCbrtWithinTolerance(rTiny, tiny, { num: 1n, den: 10n ** 32n });

      // Check scaling relation: rTiny * 10^20 ≈ cbrt(2)
      const g = gcd(rTiny.num * scale, rTiny.den);
      const scaledTiny = { num: (rTiny.num * scale) / g, den: rTiny.den / g };
      assertCbrtWithinTolerance(scaledTiny, { num: 2n, den: 1n }, { num: 1n, den: 10n ** 12n });
    });

    it('handles numbers very close to perfect cubes', () => {
      const base = 10n ** 20n;
      const nearCubePlus = { num: base ** 3n + 1n, den: 1n };
      const nearCubeMinus = { num: base ** 3n - 1n, den: 1n };

      const rPlus = cbrtRationalRecursive(nearCubePlus);
      assertCbrtWithinTolerance(rPlus, nearCubePlus, { num: 1n, den: 10n ** 12n });

      const rMinus = cbrtRationalRecursive(nearCubeMinus);
      assertCbrtWithinTolerance(rMinus, nearCubeMinus, { num: 1n, den: 10n ** 12n });

      // At high precision (10^-50), cbrt(10^60 + 1) must strictly exceed 10^20
      const rPlusHigh = cbrtRationalRecursive(nearCubePlus, { precision: 50 });
      assertCbrtWithinTolerance(rPlusHigh, nearCubePlus, { num: 1n, den: 10n ** 50n });
      assert.ok(ratCmp(rPlusHigh, { num: base, den: 1n }) > 0);
    });
  });

  describe('input validation', () => {
    it('throws TypeError for invalid rational inputs', () => {
      for (const bad of [
        null,
        undefined,
        8,
        8n,
        '8/1',
        true,
        [8n, 1n],
        {},
        { num: 8n },
        { den: 1n },
        { num: 8, den: 1n },
        { num: 8n, den: 1 },
        { num: '8', den: '1' },
      ]) {
        assert.throws(() => cbrtRationalRecursive(bad), TypeError);
      }
    });

    it('throws RangeError for zero denominator', () => {
      assert.throws(() => cbrtRationalRecursive({ num: 1n, den: 0n }), RangeError);
      assert.throws(() => cbrtRationalRecursive({ num: 0n, den: 0n }), RangeError);
      assert.throws(() => cbrtRationalRecursive({ num: -8n, den: 0n }), RangeError);
    });

    it('throws TypeError or RangeError for invalid options', () => {
      const valid = { num: 2n, den: 1n };

      for (const badOpt of [null, 12, 12n, '12', true, []]) {
        assert.throws(() => cbrtRationalRecursive(valid, badOpt), TypeError);
      }

      // Bad tolerance rational types
      assert.throws(() => cbrtRationalRecursive(valid, { num: 1, den: 10n }), TypeError);
      assert.throws(() => cbrtRationalRecursive(valid, { tolerance: '1e-12' }), TypeError);

      // Zero or negative tolerance
      assert.throws(() => cbrtRationalRecursive(valid, { num: 0n, den: 1n }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { num: -1n, den: 10n }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { num: 1n, den: -10n }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { num: 1n, den: 0n }), RangeError);
      assert.throws(
        () => cbrtRationalRecursive(valid, { tolerance: { num: 0n, den: 1n } }),
        RangeError,
      );

      // Bad precision
      assert.throws(() => cbrtRationalRecursive(valid, { precision: 0 }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { precision: -5 }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { precision: 1.5 }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { precision: Number.NaN }), RangeError);
      assert.throws(
        () => cbrtRationalRecursive(valid, { precision: Number.POSITIVE_INFINITY }),
        RangeError,
      );
      assert.throws(() => cbrtRationalRecursive(valid, { precision: 0n }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { precision: -3n }), RangeError);
      assert.throws(() => cbrtRationalRecursive(valid, { precision: '12' }), TypeError);
      assert.throws(() => cbrtRationalRecursive(valid, { precision: null }), TypeError);

      // Conflicting options
      assert.throws(
        () =>
          cbrtRationalRecursive(valid, {
            tolerance: { num: 1n, den: 100n },
            precision: 12,
          }),
        RangeError,
      );
    });
  });
});
