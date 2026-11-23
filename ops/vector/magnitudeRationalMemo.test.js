import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { magnitudeRationalMemo } from './magnitudeRationalMemo.js';

/** Helper to construct a rational `{ num, den }`. */
function r(num, den = 1n) {
  return { num: BigInt(num), den: BigInt(den) };
}

/** Exact GCD for test assertions. */
function gcd(a, b) {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Independent exact sum of squares in lowest terms. */
function exactSumOfSquares(vec) {
  let num = 0n;
  let den = 1n;
  for (const { num: a, den: b } of vec) {
    const sqN = a * a;
    const sqD = b * b;
    num = num * sqD + sqN * den;
    den = den * sqD;
    const g = gcd(num, den);
    num /= g;
    den /= g;
  }
  return { num, den };
}

/** Asserts that `q` is a non-negative rational in lowest terms. */
function assertLowestTerms(q) {
  assert.equal(typeof q.num, 'bigint');
  assert.equal(typeof q.den, 'bigint');
  assert.ok(q.num >= 0n, `expected num >= 0n, got ${q.num}`);
  assert.ok(q.den > 0n, `expected den > 0n, got ${q.den}`);
  assert.equal(gcd(q.num, q.den), 1n, `expected lowest terms, got ${q.num}/${q.den}`);
}

/** Converts a BigInt rational to a JS Number safely even for large BigInts. */
function toNumber(q) {
  const scale = 10n ** 15n;
  const scaled = (q.num * scale) / q.den;
  return Number(scaled) / 1e15;
}

describe('magnitudeRationalMemo', () => {
  describe('exact rational magnitudes', () => {
    it('computes 2D Pythagorean triples exactly', () => {
      assert.deepEqual(magnitudeRationalMemo([r(3), r(4)]), r(5));
      assert.deepEqual(magnitudeRationalMemo([r(5), r(12)]), r(13));
      assert.deepEqual(magnitudeRationalMemo([r(8), r(15)]), r(17));
      assert.deepEqual(magnitudeRationalMemo([r(7), r(24)]), r(25));
      assert.deepEqual(magnitudeRationalMemo([r(20), r(21)]), r(29));
    });

    it('computes 3D and 4D Pythagorean tuples exactly', () => {
      assert.deepEqual(magnitudeRationalMemo([r(1), r(2), r(2)]), r(3));
      assert.deepEqual(magnitudeRationalMemo([r(2), r(3), r(6)]), r(7));
      assert.deepEqual(magnitudeRationalMemo([r(4), r(4), r(7)]), r(9));
      assert.deepEqual(magnitudeRationalMemo([r(1), r(1), r(1), r(1)]), r(2));
    });

    it('computes fractional rational components with exact square sums', () => {
      assert.deepEqual(magnitudeRationalMemo([r(3, 5), r(4, 5)]), r(1, 1));
      assert.deepEqual(magnitudeRationalMemo([r(1, 2), r(2, 3)]), r(5, 6));
      assert.deepEqual(magnitudeRationalMemo([r(5, 6), r(2, 1)]), r(13, 6));
      assert.deepEqual(magnitudeRationalMemo([r(1, 6), r(1, 3), r(1, 3)]), r(1, 2));
      assert.deepEqual(magnitudeRationalMemo([r(2, 3), r(2, 3), r(2, 3), r(2, 3)]), r(4, 3));
    });

    it('computes exact magnitudes beyond the precomputed perfect-square table limit', () => {
      // 4096 is the table limit; test much larger perfect squares
      const big = 10n ** 18n;
      const res = magnitudeRationalMemo([r(3n * big), r(4n * big)]);
      assertLowestTerms(res);
      assert.deepEqual(res, r(5n * big));

      const resFrac = magnitudeRationalMemo([r(3n * big, 7n), r(4n * big, 7n)]);
      assertLowestTerms(resFrac);
      assert.deepEqual(resFrac, r(5n * big, 7n));
    });

    it('handles single-element vectors exactly', () => {
      assert.deepEqual(magnitudeRationalMemo([r(7, 3)]), r(7, 3));
      assert.deepEqual(magnitudeRationalMemo([r(-6, 4)]), r(3, 2));
      assert.deepEqual(magnitudeRationalMemo([r(5, -10)]), r(1, 2));
      assert.deepEqual(magnitudeRationalMemo([r(-9, -3)]), r(3, 1));
    });
  });

  describe('irrational magnitudes and precision/iteration options', () => {
    it('approximates [1/1, 1/1] (sqrt(2)) to default 30-digit relative precision', () => {
      const vec = [r(1), r(1)];
      const res = magnitudeRationalMemo(vec);
      assertLowestTerms(res);

      // Verify |res^2 - 2| / 2 <= 10^-30 in exact BigInt arithmetic
      const diff = res.num * res.num - 2n * res.den * res.den;
      const absDiff = diff < 0n ? -diff : diff;
      assert.ok(absDiff * 10n ** 30n <= 2n * res.den * res.den);
    });

    it('approximates 3D unit vector [1/1, 1/1, 1/1] (sqrt(3)) and fractional irrational vectors', () => {
      const cases = [
        [r(1), r(1), r(1)],
        [r(1, 2), r(1, 3)],
        [r(1, 1000000), r(1, 1000000)],
        [r(10n ** 15n), r(10n ** 15n)],
        [r(7, 11), r(-5, 13), r(3, 17)],
      ];

      for (const vec of cases) {
        const res = magnitudeRationalMemo(vec);
        assertLowestTerms(res);
        const s = exactSumOfSquares(vec);
        const diff = res.num * res.num * s.den - s.num * res.den * res.den;
        const absDiff = diff < 0n ? -diff : diff;
        assert.ok(
          absDiff * 10n ** 30n <= s.num * res.den * res.den,
          `failed 30-digit accuracy check for sumSq=${s.num}/${s.den}`
        );
      }
    });

    it('respects configurable iterations with monotonic convergence', () => {
      const vec = [r(1), r(1)];
      const r1 = magnitudeRationalMemo(vec, { iterations: 1 });
      const r2 = magnitudeRationalMemo(vec, { iterations: 2 });
      const r4 = magnitudeRationalMemo(vec, { iterations: 4 });
      assertLowestTerms(r1);
      assertLowestTerms(r2);
      assertLowestTerms(r4);

      const err = (q) => {
        const d = q.num * q.num - 2n * q.den * q.den;
        return { num: d < 0n ? -d : d, den: q.den * q.den };
      };
      const e1 = err(r1);
      const e2 = err(r2);
      const e4 = err(r4);

      // e4 < e2 < e1 (strictly improving accuracy)
      assert.ok(e2.num * e1.den < e1.num * e2.den);
      assert.ok(e4.num * e2.den < e2.num * e4.den);
    });

    it('respects configurable precision option up to high digit counts', () => {
      const vec = [r(2), r(3)]; // sumSq = 13
      const res50 = magnitudeRationalMemo(vec, { precision: 50 });
      assertLowestTerms(res50);
      const diff50 = res50.num * res50.num - 13n * res50.den * res50.den;
      const absDiff50 = diff50 < 0n ? -diff50 : diff50;
      assert.ok(absDiff50 * 10n ** 50n <= 13n * res50.den * res50.den);

      const res100 = magnitudeRationalMemo(vec, { precision: 100 });
      assertLowestTerms(res100);
      const diff100 = res100.num * res100.num - 13n * res100.den * res100.den;
      const absDiff100 = diff100 < 0n ? -diff100 : diff100;
      assert.ok(absDiff100 * 10n ** 100n <= 13n * res100.den * res100.den);
    });

    it('accepts combined iterations and precision options', () => {
      const vec = [r(1), r(2)]; // sumSq = 5
      const res = magnitudeRationalMemo(vec, { iterations: 10, precision: 20 });
      assertLowestTerms(res);
      const diff = res.num * res.num - 5n * res.den * res.den;
      const absDiff = diff < 0n ? -diff : diff;
      assert.ok(absDiff * 10n ** 20n <= 5n * res.den * res.den);
    });
  });

  describe('edge cases and normalization', () => {
    it('returns 0/1 for empty and zero vectors', () => {
      assert.deepEqual(magnitudeRationalMemo([]), r(0, 1));
      assert.deepEqual(magnitudeRationalMemo([r(0, 1)]), r(0, 1));
      assert.deepEqual(magnitudeRationalMemo([r(0, 5), r(0, -7), r(0, 13)]), r(0, 1));
    });

    it('normalizes negative numerators, negative denominators, and unreduced fractions', () => {
      assert.deepEqual(magnitudeRationalMemo([r(-6, -2), r(12, -3)]), r(5, 1));
      assert.deepEqual(magnitudeRationalMemo([r(-15, 25), r(16, -20)]), r(1, 1));
      assert.deepEqual(magnitudeRationalMemo([r(0, -9), r(-10, 20), r(0, 4)]), r(1, 2));
    });

    it('returns consistent memoized results and prevents cache mutation', () => {
      const vec = [r(3), r(4)];
      const first = magnitudeRationalMemo(vec);
      assert.deepEqual(first, r(5, 1));

      // Mutating caller's return object must not corrupt internal cache
      first.num = 999n;
      first.den = 777n;

      const second = magnitudeRationalMemo([r(3), r(4)]);
      assert.deepEqual(second, r(5, 1));

      // Equivalent sign/order/unreduced forms return identical results
      assert.deepEqual(magnitudeRationalMemo([r(4), r(3)]), r(5, 1));
      assert.deepEqual(magnitudeRationalMemo([r(-6, 2), r(8, -2)]), r(5, 1));

      // Distinct options on the same irrational vector do not collide in cache
      const coarse = magnitudeRationalMemo([r(1), r(1)], { iterations: 1 });
      const fine = magnitudeRationalMemo([r(1), r(1)], { iterations: 5 });
      assert.notDeepEqual(coarse, fine);

      // Mutating irrational cached result must not corrupt cache either
      const savedFine = { num: fine.num, den: fine.den };
      fine.num = 1n;
      assert.deepEqual(magnitudeRationalMemo([r(1), r(1)], { iterations: 5 }), savedFine);
    });

    it('handles vectors larger than the canonical sort threshold (> 64 elements)', () => {
      // 100 copies of 1/10 -> sumSq = 100 * 1/100 = 1 -> magnitude = 1/1
      const vec = Array.from({ length: 100 }, () => r(1, 10));
      assert.deepEqual(magnitudeRationalMemo(vec), r(1, 1));
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-array vector inputs', () => {
      for (const bad of [null, undefined, 42, '1,2', {}, true]) {
        assert.throws(() => magnitudeRationalMemo(bad), TypeError);
      }
    });

    it('throws TypeError for malformed rational elements', () => {
      const badElements = [
        null,
        undefined,
        5,
        '3/4',
        [],
        {},
        { num: 3, den: 4 },
        { num: 3n, den: 4 },
        { num: 3, den: 4n },
        { num: 3n },
        { den: 4n },
      ];
      for (const bad of badElements) {
        assert.throws(() => magnitudeRationalMemo([bad]), TypeError);
      }
    });

    it('throws RangeError for zero denominators', () => {
      assert.throws(() => magnitudeRationalMemo([r(1, 0)]), RangeError);
      assert.throws(() => magnitudeRationalMemo([r(0, 0)]), RangeError);
      assert.throws(() => magnitudeRationalMemo([r(3, 1), r(4, 0)]), RangeError);
    });

    it('throws TypeError or RangeError for invalid options', () => {
      for (const badOpts of [null, [], 123, 'fast', true]) {
        assert.throws(() => magnitudeRationalMemo([r(1)], badOpts), TypeError);
      }
      assert.throws(() => magnitudeRationalMemo([r(1)], { iterations: '3' }), TypeError);
      assert.throws(() => magnitudeRationalMemo([r(1)], { precision: '10' }), TypeError);

      for (const badIter of [0, -1, 1.5, NaN, Infinity, 21]) {
        assert.throws(() => magnitudeRationalMemo([r(1)], { iterations: badIter }), RangeError);
      }
      for (const badPrec of [0, -5, 2.5, NaN, Infinity, 1001]) {
        assert.throws(() => magnitudeRationalMemo([r(1)], { precision: badPrec }), RangeError);
      }
    });
  });

  describe('independent mathematical cross-checks', () => {
    it('matches Math.hypot across diverse 2D, 3D, and 4D rational vectors', () => {
      const vectors = [
        [r(3), r(4)],
        [r(1), r(1)],
        [r(-7, 3), r(11, 5)],
        [r(1, 2), r(1, 3), r(1, 5)],
        [r(13, 7), r(-9, 4), r(5, 6), r(-11, 8)],
        [r(100, 3), r(250, 7), r(-75, 11)],
      ];

      for (const vec of vectors) {
        const res = magnitudeRationalMemo(vec);
        assertLowestTerms(res);
        const expected = Math.hypot(...vec.map(({ num, den }) => Number(num) / Number(den)));
        const actual = toNumber(res);
        const relErr = Math.abs(actual - expected) / expected;
        assert.ok(relErr < 1e-12, `Math.hypot mismatch: actual=${actual}, expected=${expected}`);
      }
    });

    it('satisfies exact result^2 === sum of squares for exact cases and homogeneity/triangle inequality', () => {
      // Exact square identity
      const exactVecs = [
        [r(9, 4), r(3, 1)],
        [r(2, 5), r(3, 5), r(6, 5)],
        [r(6, 7), r(8, 7)],
      ];
      for (const vec of exactVecs) {
        const res = magnitudeRationalMemo(vec);
        const s = exactSumOfSquares(vec);
        assert.equal(res.num * res.num * s.den, s.num * res.den * res.den);
      }

      // Homogeneity: ||k * v|| === |k| * ||v|| for exact triple
      const v = [r(3, 7), r(4, 7)];
      const k = r(-5, 3);
      const kv = v.map(({ num, den }) => ({ num: num * k.num, den: den * k.den }));
      const magV = magnitudeRationalMemo(v);
      const magKV = magnitudeRationalMemo(kv);
      assert.equal(magKV.num * magV.den * 3n, 5n * magV.num * magKV.den);

      // Triangle inequality: ||u + v|| <= ||u|| + ||v||
      const u = [r(1, 2), r(2, 3)];
      const w = [r(3, 4), r(-1, 5)];
      const uw = [
        { num: u[0].num * w[0].den + w[0].num * u[0].den, den: u[0].den * w[0].den },
        { num: u[1].num * w[1].den + w[1].num * u[1].den, den: u[1].den * w[1].den },
      ];
      const magU = magnitudeRationalMemo(u);
      const magW = magnitudeRationalMemo(w);
      const magUW = magnitudeRationalMemo(uw);
      // Compare magUW <= magU + magW in exact BigInt cross-multiplication
      const rhsNum = magU.num * magW.den + magW.num * magU.den;
      const rhsDen = magU.den * magW.den;
      assert.ok(magUW.num * rhsDen <= rhsNum * magUW.den);
    });
  });
});
