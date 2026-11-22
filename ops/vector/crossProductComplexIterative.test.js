import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductComplexIterative } from './crossProductComplexIterative.js';

const c = (re, im = 0) => ({ re, im });

const cAdd = (x, y) => ({ re: x.re + y.re, im: x.im + y.im });
const cSub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });
const cMul = (x, y) => ({
  re: x.re * y.re - x.im * y.im,
  im: x.re * y.im + x.im * y.re,
});
const cScaleVec = (s, v) => v.map((entry) => cMul(s, entry));
const vecAdd = (u, v) => u.map((entry, idx) => cAdd(entry, v[idx]));
const vecSub = (u, v) => u.map((entry, idx) => cSub(entry, v[idx]));
const bilinearDot = (u, v) =>
  u.reduce((acc, entry, idx) => cAdd(acc, cMul(entry, v[idx])), c(0, 0));

function assertComplexClose(actual, expected, eps = 1e-12) {
  assert.ok(
    Math.abs(actual.re - expected.re) <= eps && Math.abs(actual.im - expected.im) <= eps,
    `Expected {re: ${expected.re}, im: ${expected.im}} within ${eps}, got {re: ${actual.re}, im: ${actual.im}}`
  );
}

function assertVecClose(actual, expected, eps = 1e-12) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i += 1) {
    assertComplexClose(actual[i], expected[i], eps);
  }
}

/**
 * Independent reference implementation via explicit Levi-Civita tensor summation:
 * (a x b)_k = sum_{i=0..2} sum_{j=0..2} eps_{kij} * a_i * b_j
 */
function naiveLeviCivitaCross(a, b) {
  const leviCivita = (i, j, k) => {
    if (i === j || j === k || i === k) return 0;
    const inversions = (i > j ? 1 : 0) + (i > k ? 1 : 0) + (j > k ? 1 : 0);
    return inversions % 2 === 0 ? 1 : -1;
  };

  const out = [c(0, 0), c(0, 0), c(0, 0)];
  for (let k = 0; k < 3; k += 1) {
    let sum = c(0, 0);
    for (let i = 0; i < 3; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        const eps = leviCivita(k, i, j);
        if (eps !== 0) {
          const term = cMul(a[i], b[j]);
          sum = eps === 1 ? cAdd(sum, term) : cSub(sum, term);
        }
      }
    }
    out[k] = { re: sum.re === 0 ? 0 : sum.re, im: sum.im === 0 ? 0 : sum.im };
  }
  return out;
}

describe('crossProductComplexIterative', () => {
  describe('normal cases', () => {
    it('computes standard real basis vector cross products embedded in C^3', () => {
      const e1 = [c(1, 0), c(0, 0), c(0, 0)];
      const e2 = [c(0, 0), c(1, 0), c(0, 0)];
      const e3 = [c(0, 0), c(0, 0), c(1, 0)];

      assert.deepStrictEqual(crossProductComplexIterative(e1, e2), e3);
      assert.deepStrictEqual(crossProductComplexIterative(e2, e3), e1);
      assert.deepStrictEqual(crossProductComplexIterative(e3, e1), e2);
      assert.deepStrictEqual(crossProductComplexIterative(e2, e1), [c(0, 0), c(0, 0), c(-1, 0)]);
    });

    it('computes cross product for purely imaginary basis vectors', () => {
      const ie1 = [c(0, 1), c(0, 0), c(0, 0)];
      const ie2 = [c(0, 0), c(0, 1), c(0, 0)];
      // (i e1) x (i e2) = i^2 e3 = -e3
      assert.deepStrictEqual(crossProductComplexIterative(ie1, ie2), [c(0, 0), c(0, 0), c(-1, 0)]);
    });

    it('computes hand-verified complex 3D cross product', () => {
      const a = [c(1, 2), c(3, -1), c(0, 4)];
      const b = [c(2, -1), c(1, 1), c(-3, 2)];
      // c0 = (3 - i)(-3 + 2i) - (4i)(1 + i) = (-9 + 6i + 3i + 2) - (4i - 4) = (-7 + 9i) - (-4 + 4i) = -3 + 5i
      // c1 = (4i)(2 - i) - (1 + 2i)(-3 + 2i) = (4 + 8i) - (-3 + 2i - 6i - 4) = (4 + 8i) - (-7 - 4i) = 11 + 12i
      // c2 = (1 + 2i)(1 + i) - (3 - i)(2 - i) = (1 + i + 2i - 2) - (6 - 3i - 2i - 1) = (-1 + 3i) - (5 - 5i) = -6 + 8i
      assert.deepStrictEqual(crossProductComplexIterative(a, b), [
        c(-3, 5),
        c(11, 12),
        c(-6, 8),
      ]);
    });

    it('does not mutate input vectors or complex elements', () => {
      const a = [c(1, 2), c(3, 4), c(5, 6)];
      const b = [c(7, 8), c(9, 10), c(11, 12)];
      const aSnapshot = structuredClone(a);
      const bSnapshot = structuredClone(b);

      const out = crossProductComplexIterative(a, b);
      assert.deepStrictEqual(a, aSnapshot);
      assert.deepStrictEqual(b, bSnapshot);
      assert.notStrictEqual(out, a);
      assert.notStrictEqual(out, b);
    });
  });

  describe('edge cases', () => {
    it('returns the zero vector when either input is the zero vector', () => {
      const zero = [c(0, 0), c(0, 0), c(0, 0)];
      const v = [c(2, -3), c(4, 5), c(-1, 7)];

      assert.deepStrictEqual(crossProductComplexIterative(zero, v), zero);
      assert.deepStrictEqual(crossProductComplexIterative(v, zero), zero);
      assert.deepStrictEqual(crossProductComplexIterative(zero, zero), zero);
    });

    it('returns the zero vector for a vector crossed with itself or a complex scalar multiple', () => {
      const v = [c(1.5, -2.5), c(-3, 4), c(0.5, 0.25)];
      const scaled = cScaleVec(c(-2, 3), v);

      assertVecClose(crossProductComplexIterative(v, v), [c(0, 0), c(0, 0), c(0, 0)]);
      assertVecClose(crossProductComplexIterative(v, scaled), [c(0, 0), c(0, 0), c(0, 0)]);
    });

    it('normalizes -0 to +0 in output components', () => {
      const a = [c(-0, 0), c(0, -0), c(1, 0)];
      const b = [c(0, 0), c(1, 0), c(0, 0)];
      const res = crossProductComplexIterative(a, b);
      for (const comp of res) {
        assert.equal(Object.is(comp.re, -0), false);
        assert.equal(Object.is(comp.im, -0), false);
      }
    });
  });

  describe('input validation', () => {
    const valid = [c(1, 0), c(0, 1), c(1, 1)];

    it('throws TypeError when a or b is not an array', () => {
      for (const bad of [null, undefined, 42, 'abc', {}, new Float64Array(3)]) {
        assert.throws(() => crossProductComplexIterative(bad, valid), TypeError);
        assert.throws(() => crossProductComplexIterative(valid, bad), TypeError);
      }
    });

    it('throws RangeError when a or b does not have length 3', () => {
      for (const bad of [[], [c(1, 0)], [c(1, 0), c(2, 0)], [c(1, 0), c(2, 0), c(3, 0), c(4, 0)]]) {
        assert.throws(() => crossProductComplexIterative(bad, valid), RangeError);
        assert.throws(() => crossProductComplexIterative(valid, bad), RangeError);
      }
    });

    it('throws TypeError when an entry is not a valid complex object with numeric re and im', () => {
      const badEntries = [
        null,
        undefined,
        5,
        '1+2i',
        [1, 2],
        { re: 1 },
        { im: 2 },
        { re: '1', im: 0 },
        { re: 1, im: null },
      ];
      for (const entry of badEntries) {
        assert.throws(
          () => crossProductComplexIterative([entry, c(0, 0), c(0, 0)], valid),
          TypeError
        );
        assert.throws(
          () => crossProductComplexIterative(valid, [c(0, 0), entry, c(0, 0)]),
          TypeError
        );
      }
    });

    it('throws RangeError when any re or im is NaN or infinite', () => {
      const badComplex = [
        c(NaN, 0),
        c(0, NaN),
        c(Infinity, 0),
        c(0, -Infinity),
      ];
      for (const entry of badComplex) {
        assert.throws(
          () => crossProductComplexIterative([c(0, 0), c(0, 0), entry], valid),
          RangeError
        );
        assert.throws(
          () => crossProductComplexIterative(valid, [entry, c(0, 0), c(0, 0)]),
          RangeError
        );
      }
    });
  });

  describe('independent cross-checks and algebraic identities', () => {
    const vectors = [
      [c(2, -1), c(-3, 4), c(5, 0.5)],
      [c(-1.5, 2.5), c(0.25, -1.25), c(3, -2)],
      [c(4, 1), c(-2, -3), c(0.5, 6)],
      [c(-0.75, 3.25), c(2.5, 1.5), c(-4, -0.5)],
    ];

    it('matches the independent Levi-Civita tensor summation reference across vector pairs', () => {
      for (const a of vectors) {
        for (const b of vectors) {
          const actual = crossProductComplexIterative(a, b);
          const expected = naiveLeviCivitaCross(a, b);
          assertVecClose(actual, expected, 1e-12);
        }
      }
    });

    it('satisfies anticommutativity: a x b = -(b x a)', () => {
      for (const a of vectors) {
        for (const b of vectors) {
          const ab = crossProductComplexIterative(a, b);
          const ba = crossProductComplexIterative(b, a);
          assertVecClose(vecAdd(ab, ba), [c(0, 0), c(0, 0), c(0, 0)], 1e-12);
        }
      }
    });

    it('satisfies complex bilinearity: (alpha*a + beta*b) x u = alpha*(a x u) + beta*(b x u)', () => {
      const [a, b, u] = vectors;
      const alpha = c(2.5, -1.5);
      const beta = c(-0.75, 3.25);

      const lhs = crossProductComplexIterative(
        vecAdd(cScaleVec(alpha, a), cScaleVec(beta, b)),
        u
      );
      const rhs = vecAdd(
        cScaleVec(alpha, crossProductComplexIterative(a, u)),
        cScaleVec(beta, crossProductComplexIterative(b, u))
      );

      assertVecClose(lhs, rhs, 1e-11);
    });

    it('satisfies the Jacobi identity: a x (b x u) + b x (u x a) + u x (a x b) = 0', () => {
      const [a, b, u] = vectors;
      const t1 = crossProductComplexIterative(a, crossProductComplexIterative(b, u));
      const t2 = crossProductComplexIterative(b, crossProductComplexIterative(u, a));
      const t3 = crossProductComplexIterative(u, crossProductComplexIterative(a, b));

      assertVecClose(vecAdd(vecAdd(t1, t2), t3), [c(0, 0), c(0, 0), c(0, 0)], 1e-10);
    });

    it('satisfies the Lagrange BAC-CAB identity: a x (b x u) = b*(a·u) - u*(a·b)', () => {
      const [a, b, u] = vectors;
      const lhs = crossProductComplexIterative(a, crossProductComplexIterative(b, u));
      const rhs = vecSub(
        cScaleVec(bilinearDot(a, u), b),
        cScaleVec(bilinearDot(a, b), u)
      );

      assertVecClose(lhs, rhs, 1e-10);
    });

    it('is bilinearly orthogonal to both inputs: a·(a x b) = 0 and b·(a x b) = 0', () => {
      const [a, b] = vectors;
      const cross = crossProductComplexIterative(a, b);
      assertComplexClose(bilinearDot(a, cross), c(0, 0), 1e-11);
      assertComplexClose(bilinearDot(b, cross), c(0, 0), 1e-11);
    });
  });
});
