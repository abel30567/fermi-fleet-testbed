import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { convolutionRationalSeries } from './convolutionRationalSeries.js';

// --- Independent exact rational reference helpers ---

function abs(x) {
  return x < 0n ? -x : x;
}

function gcd(a, b) {
  let x = abs(a);
  let y = abs(b);
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function r(num, den = 1n) {
  return { num: BigInt(num), den: BigInt(den) };
}

function ratNorm(x) {
  if (x.num === 0n) {
    return { num: 0n, den: 1n };
  }
  let n = x.num;
  let d = x.den;
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { num: n / g, den: d / g };
}

function ratAdd(a, b) {
  return ratNorm({
    num: a.num * b.den + b.num * a.den,
    den: a.den * b.den,
  });
}

function ratMul(a, b) {
  return ratNorm({
    num: a.num * b.num,
    den: a.den * b.den,
  });
}

/**
 * Independent naive O(m * n) direct double-sum convolution over exact rationals.
 */
function directDoubleSumConvolution(a, b) {
  if (a.length === 0 || b.length === 0) {
    return [];
  }
  const na = a.map(ratNorm);
  const nb = b.map(ratNorm);
  const outLen = na.length + nb.length - 1;
  const out = Array.from({ length: outLen }, () => ({ num: 0n, den: 1n }));
  for (let i = 0; i < na.length; i++) {
    for (let j = 0; j < nb.length; j++) {
      out[i + j] = ratAdd(out[i + j], ratMul(na[i], nb[j]));
    }
  }
  return out;
}

/**
 * Exact polynomial evaluation P_c(x) = sum_{k=0}^{n-1} c[k] * x^k via Horner's method.
 */
function evalPolyRational(coeffs, x) {
  let acc = { num: 0n, den: 1n };
  const xn = ratNorm(x);
  for (let k = coeffs.length - 1; k >= 0; k--) {
    acc = ratAdd(ratMul(acc, xn), ratNorm(coeffs[k]));
  }
  return acc;
}

/**
 * Verify every rational in a sequence is canonically reduced to lowest terms.
 */
function assertCanonicalRationals(seq) {
  for (let i = 0; i < seq.length; i++) {
    const item = seq[i];
    assert.equal(typeof item.num, 'bigint', `index ${i} num must be BigInt`);
    assert.equal(typeof item.den, 'bigint', `index ${i} den must be BigInt`);
    assert.ok(item.den > 0n, `index ${i} den must be > 0n, got ${item.den}`);
    if (item.num === 0n) {
      assert.equal(item.den, 1n, `index ${i} zero must have den === 1n`);
    } else {
      assert.equal(gcd(item.num, item.den), 1n, `index ${i} must be in lowest terms`);
    }
  }
}

/**
 * Deterministic generator for pseudo-random rational sequences.
 */
function makeRationalSequence(len, seed) {
  const seq = [];
  let s = BigInt(seed);
  for (let i = 0; i < len; i++) {
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    const num = (s % 41n) - 20n; // [-20, 20]
    s = (s * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
    const den = (s % 19n) + 1n; // [1, 19]
    seq.push({ num, den });
  }
  return seq;
}

describe('convolutionRationalSeries', () => {
  describe('normal cases and normalization', () => {
    it('computes exact convolution of small rational sequences', () => {
      // (1/2 + 1/3 x) * (2/5 - 3/4 x)
      // = (1/5) + (2/15 - 3/8) x + (-1/4) x^2
      // = 1/5 + (-29/120) x + (-1/4) x^2
      const a = [r(1, 2), r(1, 3)];
      const b = [r(2, 5), r(-3, 4)];
      const res = convolutionRationalSeries(a, b);
      assertCanonicalRationals(res);
      assert.deepEqual(res, [r(1, 5), r(-29, 120), r(-1, 4)]);
    });

    it('handles unreduced inputs and negative denominators cleanly', () => {
      // a = [ -6/-9, 4/-6 ] = [ 2/3, -2/3 ]
      // b = [ -10/15, 0/-7, 9/6 ] = [ -2/3, 0, 3/2 ]
      // product = [ -4/9, 4/9, 1, -1 ]
      const a = [r(-6, -9), r(4, -6)];
      const b = [r(-10, 15), r(0, -7), r(9, 6)];
      const res = convolutionRationalSeries(a, b);
      assertCanonicalRationals(res);
      assert.deepEqual(res, [r(-4, 9), r(4, 9), r(1, 1), r(-1, 1)]);
    });

    it('produces canonical { num: 0n, den: 1n } upon exact cancellation', () => {
      // (1/3 + 1/5 x) * (1/3 - 1/5 x) = 1/9 + 0 x - 1/25 x^2
      const a = [r(1, 3), r(1, 5)];
      const b = [r(1, 3), r(-1, 5)];
      const res = convolutionRationalSeries(a, b);
      assertCanonicalRationals(res);
      assert.deepEqual(res, [r(1, 9), r(0, 1), r(-1, 25)]);
    });

    it('handles very large BigInt numerators and denominators accurately', () => {
      const big1 = 10n ** 30n + 7n;
      const big2 = 10n ** 30n + 9n;
      const a = [{ num: big1, den: 3n }, { num: -big2, den: 5n }];
      const b = [{ num: 6n, den: big1 }, { num: 10n, den: big2 }];
      const res = convolutionRationalSeries(a, b);
      assertCanonicalRationals(res);
      const expected = directDoubleSumConvolution(a, b);
      assert.deepEqual(res, expected);
      // Constant term is (big1/3)*(6/big1) = 2/1; quadratic term is (-big2/5)*(10/big2) = -2/1
      assert.deepEqual(res[0], r(2, 1));
      assert.deepEqual(res[2], r(-2, 1));
    });

    it('does not mutate input arrays or input rational objects', () => {
      const a = [r(2, -4), r(3, 6)];
      const b = [r(-5, 10), r(7, -14)];
      const aCopy = a.map((x) => ({ ...x }));
      const bCopy = b.map((x) => ({ ...x }));
      convolutionRationalSeries(a, b);
      assert.deepEqual(a, aCopy);
      assert.deepEqual(b, bCopy);
    });
  });

  describe('edge cases', () => {
    it('returns empty array when either or both inputs are empty', () => {
      assert.deepEqual(convolutionRationalSeries([], []), []);
      assert.deepEqual(convolutionRationalSeries([], [r(1, 2), r(3, 4)]), []);
      assert.deepEqual(convolutionRationalSeries([r(1, 2), r(3, 4)], []), []);
    });

    it('handles single-element sequences (scalar multiplication)', () => {
      const res = convolutionRationalSeries([r(6, 7)], [r(-14, 9)]);
      assertCanonicalRationals(res);
      assert.deepEqual(res, [r(-4, 3)]);
    });

    it('preserves full length m + n - 1 for all-zero sequences', () => {
      const a = [r(0, 1), r(0, 5), r(0, -3)];
      const b = [r(1, 2), r(-3, 7)];
      const res = convolutionRationalSeries(a, b);
      assert.equal(res.length, 4);
      assertCanonicalRationals(res);
      assert.deepEqual(res, [r(0, 1), r(0, 1), r(0, 1), r(0, 1)]);
    });

    it('satisfies multiplicative identity [1] and shift [0, 0, 1]', () => {
      const a = [r(1, 2), r(-3, 4), r(5, 6), r(0, 9)];
      const id = [r(1, 1)];
      assert.deepEqual(convolutionRationalSeries(a, id), a.map(ratNorm));
      assert.deepEqual(convolutionRationalSeries(id, a), a.map(ratNorm));

      const shift2 = [r(0, 1), r(0, 1), r(1, 1)];
      assert.deepEqual(
        convolutionRationalSeries(a, shift2),
        [r(0, 1), r(0, 1), ...a.map(ratNorm)],
      );
    });
  });

  describe('formal power series & algebraic identities', () => {
    it('satisfies commutativity, associativity, and distributivity', () => {
      const a = makeRationalSequence(19, 101);
      const b = makeRationalSequence(21, 202);
      const c = makeRationalSequence(19, 303);

      // Commutativity: a * b == b * a
      assert.deepEqual(
        convolutionRationalSeries(a, b),
        convolutionRationalSeries(b, a),
      );

      // Associativity: (a * b) * c == a * (b * c)
      const ab_c = convolutionRationalSeries(convolutionRationalSeries(a, b), c);
      const a_bc = convolutionRationalSeries(a, convolutionRationalSeries(b, c));
      assertCanonicalRationals(ab_c);
      assert.deepEqual(ab_c, a_bc);

      // Distributivity: b * (a + c) == b * a + b * c
      const aPlusC = a.map((ai, i) => ratAdd(ai, c[i]));
      const lhs = convolutionRationalSeries(b, aPlusC);
      const ba = convolutionRationalSeries(b, a);
      const bc = convolutionRationalSeries(b, c);
      const rhs = ba.map((v, i) => ratAdd(v, bc[i]));
      assert.deepEqual(lhs, rhs);
    });

    it('satisfies geometric series identity (1 + x + ... + x^{n-1}) * (1 - x) = 1 - x^n', () => {
      const n = 25;
      const geom = Array.from({ length: n }, () => r(1, 1));
      const oneMinusX = [r(1, 1), r(-1, 1)];
      const res = convolutionRationalSeries(geom, oneMinusX);
      assert.equal(res.length, n + 1);
      assertCanonicalRationals(res);
      assert.deepEqual(res[0], r(1, 1));
      for (let k = 1; k < n; k++) {
        assert.deepEqual(res[k], r(0, 1));
      }
      assert.deepEqual(res[n], r(-1, 1));
    });

    it('satisfies Cauchy product of truncated exponential series e_N(x) * e_N(-x) = 1 + O(x^{N+1})', () => {
      const N = 22; // > Karatsuba threshold
      const expPos = [];
      const expNeg = [];
      let fact = 1n;
      for (let k = 0; k <= N; k++) {
        if (k > 0) fact *= BigInt(k);
        expPos.push({ num: 1n, den: fact });
        expNeg.push({ num: k % 2 === 0 ? 1n : -1n, den: fact });
      }
      const prod = convolutionRationalSeries(expPos, expNeg);
      assert.equal(prod.length, 2 * N + 1);
      assertCanonicalRationals(prod);
      assert.deepEqual(prod[0], r(1, 1));
      for (let k = 1; k <= N; k++) {
        assert.deepEqual(prod[k], r(0, 1), `coefficient of x^${k} must vanish`);
      }
    });

    it('produces exact binomial distribution via repeated convolution of [1/2, 1/2]', () => {
      const step = [r(1, 2), r(1, 2)];
      let dist = [r(1, 1)];
      const n = 10;
      for (let i = 0; i < n; i++) {
        dist = convolutionRationalSeries(dist, step);
      }
      assertCanonicalRationals(dist);
      assert.equal(dist.length, n + 1);
      // Compare with C(10, k) / 2^10
      let binom = 1n;
      const den = 1n << BigInt(n);
      for (let k = 0; k <= n; k++) {
        assert.deepEqual(dist[k], ratNorm({ num: binom, den }));
        binom = (binom * BigInt(n - k)) / BigInt(k + 1);
      }
    });
  });

  describe('cross-checks against direct double-sum AND polynomial evaluation identity', () => {
    const testCases = [
      { name: 'small (5 x 4)', lenA: 5, lenB: 4, seedA: 11, seedB: 17 },
      { name: 'at threshold (16 x 16)', lenA: 16, lenB: 16, seedA: 23, seedB: 29 },
      { name: 'just above threshold (17 x 17)', lenA: 17, lenB: 17, seedA: 31, seedB: 37 },
      { name: 'balanced odd/even Karatsuba (25 x 28)', lenA: 25, lenB: 28, seedA: 41, seedB: 43 },
      { name: 'edge ratio 2:1 even (17 x 34)', lenA: 17, lenB: 34, seedA: 47, seedB: 53 },
      { name: 'edge ratio >2:1 odd (17 x 35)', lenA: 17, lenB: 35, seedA: 59, seedB: 61 },
      { name: 'asymmetric overlap-add A > 2B (55 x 18)', lenA: 55, lenB: 18, seedA: 67, seedB: 71 },
      { name: 'asymmetric overlap-add B > 2A (18 x 55)', lenA: 18, lenB: 55, seedA: 73, seedB: 79 },
      { name: 'large balanced Karatsuba (40 x 39)', lenA: 40, lenB: 39, seedA: 83, seedB: 89 },
    ];

    const evalPoints = [
      r(0, 1),
      r(1, 1),
      r(-1, 1),
      r(1, 2),
      r(-3, 7),
      r(5, 11),
      r(13, 4),
      r(-17, 19),
    ];

    for (const tc of testCases) {
      it(`matches direct double-sum and P_a(x)*P_b(x) === P_conv(x) for ${tc.name}`, () => {
        const a = makeRationalSequence(tc.lenA, tc.seedA);
        const b = makeRationalSequence(tc.lenB, tc.seedB);

        const actual = convolutionRationalSeries(a, b);
        assertCanonicalRationals(actual);

        // Cross-check 1: Direct double-sum convolution
        const expected = directDoubleSumConvolution(a, b);
        assert.deepEqual(actual, expected);

        // Cross-check 2: Polynomial evaluation identity P_a(x) * P_b(x) === P_{conv(a,b)}(x)
        for (const x of evalPoints) {
          const pa = evalPolyRational(a, x);
          const pb = evalPolyRational(b, x);
          const pConv = evalPolyRational(actual, x);
          assert.deepEqual(
            ratMul(pa, pb),
            pConv,
            `Polynomial evaluation mismatch at x = ${x.num}/${x.den} for ${tc.name}`,
          );
        }
      });
    }
  });

  describe('input validation', () => {
    it('throws TypeError when a or b is not an Array', () => {
      const valid = [r(1, 2)];
      for (const bad of [null, undefined, 123, '1/2', {}, new Uint32Array([1])]) {
        assert.throws(() => convolutionRationalSeries(bad, valid), TypeError);
        assert.throws(() => convolutionRationalSeries(valid, bad), TypeError);
      }
    });

    it('throws TypeError for invalid rational elements or non-BigInt fields', () => {
      const valid = [r(1, 2)];
      const badElements = [
        null,
        undefined,
        1,
        '1/2',
        {},
        { num: 1, den: 2n },
        { num: 1n, den: 2 },
        { num: 1n },
        { den: 2n },
        { num: '1', den: '2' },
      ];
      for (const el of badElements) {
        assert.throws(() => convolutionRationalSeries([el], valid), TypeError);
        assert.throws(() => convolutionRationalSeries(valid, [el]), TypeError);
      }
    });

    it('throws TypeError for sparse arrays containing holes', () => {
      const sparse = new Array(2);
      sparse[0] = r(1, 2);
      assert.throws(() => convolutionRationalSeries(sparse, [r(1, 1)]), TypeError);
      assert.throws(() => convolutionRationalSeries([r(1, 1)], sparse), TypeError);
    });

    it('throws RangeError when any denominator is 0n (even if the other array is empty)', () => {
      assert.throws(() => convolutionRationalSeries([r(1, 0)], [r(1, 2)]), RangeError);
      assert.throws(() => convolutionRationalSeries([r(1, 2)], [r(0, 0)]), RangeError);
      assert.throws(() => convolutionRationalSeries([], [r(3, 0)]), RangeError);
      assert.throws(() => convolutionRationalSeries([r(3, 0)], []), RangeError);
    });
  });
});
