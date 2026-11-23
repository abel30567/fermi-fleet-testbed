import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { crossProductComplexMemo } from './crossProductComplexMemo.js';

/** Helper to construct a complex number `{ re, im }`. */
const c = (re, im = 0) => ({ re, im });

/** Complex addition. */
const cAdd = (x, y) => ({ re: x.re + y.re, im: x.im + y.im });

/** Complex subtraction. */
const cSub = (x, y) => ({ re: x.re - y.re, im: x.im - y.im });

/** Complex multiplication. */
const cMul = (x, y) => ({
  re: x.re * y.re - x.im * y.im,
  im: x.re * y.im + x.im * y.re,
});

/** Complex negation. */
const cNeg = (x) => ({ re: -x.re, im: -x.im });

/** Vector addition over 3D complex vectors. */
const vAdd = (u, v) => [cAdd(u[0], v[0]), cAdd(u[1], v[1]), cAdd(u[2], v[2])];

/** Scalar multiplication of a 3D complex vector by a complex scalar. */
const vScale = (s, v) => [cMul(s, v[0]), cMul(s, v[1]), cMul(s, v[2])];

/** Vector negation over 3D complex vectors. */
const vNeg = (v) => [cNeg(v[0]), cNeg(v[1]), cNeg(v[2])];

/** Bilinear complex dot product: Σ u_k * v_k. */
const vDot = (u, v) =>
  cAdd(cAdd(cMul(u[0], v[0]), cMul(u[1], v[1])), cMul(u[2], v[2]));

/** Assert two complex numbers are equal within epsilon. */
function assertComplexClose(actual, expected, eps = 1e-12) {
  assert.ok(
    Math.abs(actual.re - expected.re) <= eps,
    `real part mismatch: got ${actual.re}, expected ${expected.re}`
  );
  assert.ok(
    Math.abs(actual.im - expected.im) <= eps,
    `imag part mismatch: got ${actual.im}, expected ${expected.im}`
  );
}

/** Assert two 3D complex vectors are equal within epsilon. */
function assertVecClose(actual, expected, eps = 1e-12) {
  assert.equal(actual.length, 3);
  for (let i = 0; i < 3; i++) {
    assertComplexClose(actual[i], expected[i], eps);
  }
}

describe('crossProductComplexMemo', () => {
  describe('normal cases', () => {
    it('computes cross product for purely real 3D vectors', () => {
      const a = [c(1), c(2), c(3)];
      const b = [c(4), c(5), c(6)];
      // [2*6 - 3*5, 3*4 - 1*6, 1*5 - 2*4] = [-3, 6, -3]
      assert.deepStrictEqual(crossProductComplexMemo(a, b), [
        c(-3, 0),
        c(6, 0),
        c(-3, 0),
      ]);
    });

    it('computes cross product for purely imaginary vectors', () => {
      const a = [c(0, 1), c(0, 0), c(0, 0)];
      const b = [c(0, 0), c(0, 1), c(0, 0)];
      // (i e1) x (i e2) = i^2 e3 = -e3
      assert.deepStrictEqual(crossProductComplexMemo(a, b), [
        c(0, 0),
        c(0, 0),
        c(-1, 0),
      ]);
    });

    it('computes cross product for general complex vectors', () => {
      const a = [c(1, 2), c(3, -1), c(0, 4)];
      const b = [c(2, -1), c(1, 1), c(-2, 3)];
      // c0 = a1*b2 - a2*b1 = (3-i)(-2+3i) - (4i)(1+i) = (-3+11i) - (-4+4i) = 1 + 7i
      // c1 = a2*b0 - a0*b2 = (4i)(2-i) - (1+2i)(-2+3i) = (4+8i) - (-8-i) = 12 + 9i
      // c2 = a0*b1 - a1*b0 = (1+2i)(1+i) - (3-i)(2-i) = (-1+3i) - (5-5i) = -6 + 8i
      assert.deepStrictEqual(crossProductComplexMemo(a, b), [
        c(1, 7),
        c(12, 9),
        c(-6, 8),
      ]);
    });

    it('handles fractional floating-point complex components', () => {
      const a = [c(0.5, -1.25), c(2.5, 0.5), c(-1.5, 0.75)];
      const b = [c(-0.25, 1.5), c(1.25, -0.5), c(0.5, 2.0)];
      const expected = [
        cSub(cMul(a[1], b[2]), cMul(a[2], b[1])),
        cSub(cMul(a[2], b[0]), cMul(a[0], b[2])),
        cSub(cMul(a[0], b[1]), cMul(a[1], b[0])),
      ];
      assertVecClose(crossProductComplexMemo(a, b), expected);
    });
  });

  describe('edge cases', () => {
    const e1 = [c(1), c(0), c(0)];
    const e2 = [c(0), c(1), c(0)];
    const e3 = [c(0), c(0), c(1)];
    const zero = [c(0), c(0), c(0)];

    it('satisfies standard basis vector rules', () => {
      assert.deepStrictEqual(crossProductComplexMemo(e1, e2), e3);
      assert.deepStrictEqual(crossProductComplexMemo(e2, e3), e1);
      assert.deepStrictEqual(crossProductComplexMemo(e3, e1), e2);
      assert.deepStrictEqual(crossProductComplexMemo(e2, e1), [c(0), c(0), c(-1)]);
      assert.deepStrictEqual(crossProductComplexMemo(e3, e2), [c(-1), c(0), c(0)]);
      assert.deepStrictEqual(crossProductComplexMemo(e1, e3), [c(0), c(-1), c(0)]);
    });

    it('returns zero vector for parallel / complex-scalar-multiple vectors', () => {
      const a = [c(1, -2), c(3, 4), c(-5, 1)];
      const scalar = c(2, -3);
      const b = vScale(scalar, a);
      assert.deepStrictEqual(crossProductComplexMemo(a, b), zero);
      assert.deepStrictEqual(crossProductComplexMemo(a, a), zero);
    });

    it('returns zero vector when either operand is the zero vector', () => {
      const a = [c(7, -3), c(2, 5), c(-1, 8)];
      assert.deepStrictEqual(crossProductComplexMemo(zero, a), zero);
      assert.deepStrictEqual(crossProductComplexMemo(a, zero), zero);
      assert.deepStrictEqual(crossProductComplexMemo(zero, zero), zero);
    });

    it('normalizes -0 inputs to canonical +0 outputs', () => {
      const a = [c(-0, -0), c(1, -0), c(-0, 2)];
      const b = [c(-0, 0), c(-0, -0), c(0, -0)];
      const res = crossProductComplexMemo(a, b);
      for (const comp of res) {
        assert.ok(!Object.is(comp.re, -0), 're should not be -0');
        assert.ok(!Object.is(comp.im, -0), 'im should not be -0');
      }
      assert.deepStrictEqual(res, zero);
    });
  });

  describe('memoization and immutability', () => {
    it('returns fresh cloned arrays and objects on cache hits', () => {
      const a = [c(2, 1), c(-1, 3), c(4, -2)];
      const b = [c(-3, 2), c(5, -1), c(1, 4)];

      const first = crossProductComplexMemo(a, b);
      const second = crossProductComplexMemo(a, b);

      assert.deepStrictEqual(second, first);
      assert.notStrictEqual(second, first);
      for (let i = 0; i < 3; i++) {
        assert.notStrictEqual(second[i], first[i]);
      }
    });

    it('does not corrupt cache when caller mutates returned result or input vectors', () => {
      const a = [c(1, 1), c(2, -1), c(3, 2)];
      const b = [c(4, -2), c(-1, 3), c(2, 1)];

      const expected = crossProductComplexMemo(a, b);
      const snapshot = expected.map((z) => ({ re: z.re, im: z.im }));

      // Mutate returned result
      expected[0].re = 999999;
      expected[1] = { re: -999, im: -999 };
      expected.push({ re: 1, im: 1 });

      // Subsequent call with fresh equal inputs must still return original value
      const afterOutputMutation = crossProductComplexMemo(
        [c(1, 1), c(2, -1), c(3, 2)],
        [c(4, -2), c(-1, 3), c(2, 1)]
      );
      assert.deepStrictEqual(afterOutputMutation, snapshot);

      // Mutating original input objects should compute for the new values, not stale cache
      a[0].re = 10;
      const afterInputMutation = crossProductComplexMemo(a, b);
      assert.notDeepStrictEqual(afterInputMutation, snapshot);
    });

    it('handles bounded cache eviction gracefully beyond cache capacity', () => {
      const baseB = [c(0, 1), c(1, 0), c(1, 1)];
      for (let k = 0; k < 1200; k++) {
        const a = [c(k, 1), c(2, -k), c(1, 3)];
        const res = crossProductComplexMemo(a, baseB);
        assert.equal(res.length, 3);
      }
      // Verify recomputation after eviction still matches exact formula
      const a0 = [c(0, 1), c(2, 0), c(1, 3)];
      const expected0 = [
        cSub(cMul(a0[1], baseB[2]), cMul(a0[2], baseB[1])),
        cSub(cMul(a0[2], baseB[0]), cMul(a0[0], baseB[2])),
        cSub(cMul(a0[0], baseB[1]), cMul(a0[1], baseB[0])),
      ];
      assert.deepStrictEqual(crossProductComplexMemo(a0, baseB), expected0);
    });
  });

  describe('input validation', () => {
    const valid = [c(1, 0), c(0, 1), c(1, 1)];

    it('rejects non-array inputs', () => {
      for (const bad of [null, undefined, 42, '123', {}, { length: 3 }]) {
        assert.throws(() => crossProductComplexMemo(bad, valid), TypeError);
        assert.throws(() => crossProductComplexMemo(valid, bad), TypeError);
      }
    });

    it('rejects arrays whose length is not 3', () => {
      for (const bad of [[], [c(1)], [c(1), c(2)], [c(1), c(2), c(3), c(4)]]) {
        assert.throws(() => crossProductComplexMemo(bad, valid), RangeError);
        assert.throws(() => crossProductComplexMemo(valid, bad), RangeError);
      }
    });

    it('rejects invalid complex elements', () => {
      const badElements = [
        null,
        undefined,
        5,
        '1+2i',
        {},
        { re: 1 },
        { im: 2 },
        { re: '1', im: 0 },
        { re: 0, im: null },
      ];
      for (const el of badElements) {
        assert.throws(
          () => crossProductComplexMemo([el, c(0), c(0)], valid),
          TypeError
        );
        assert.throws(
          () => crossProductComplexMemo(valid, [c(0), el, c(0)]),
          TypeError
        );
      }
    });

    it('rejects non-finite re or im values (NaN, Infinity, -Infinity)', () => {
      const nonFinite = [
        { re: NaN, im: 0 },
        { re: 0, im: NaN },
        { re: Infinity, im: 1 },
        { re: 1, im: -Infinity },
      ];
      for (const el of nonFinite) {
        assert.throws(
          () => crossProductComplexMemo([c(1), c(2), el], valid),
          RangeError
        );
        assert.throws(
          () => crossProductComplexMemo(valid, [el, c(2), c(3)]),
          RangeError
        );
      }
    });
  });

  describe('algebraic cross-checks', () => {
    const samples = [
      [c(1, 2), c(-3, 4), c(5, -1)],
      [c(-2, 1), c(0.5, -2.5), c(3, 3)],
      [c(4, -3), c(1.5, 2), c(-1, 0.5)],
      [c(-0.75, 1.25), c(2.25, -1.75), c(0.5, -3.5)],
    ];

    it('satisfies anticommutativity: a × b = -(b × a)', () => {
      for (let i = 0; i < samples.length; i++) {
        for (let j = i + 1; j < samples.length; j++) {
          const ab = crossProductComplexMemo(samples[i], samples[j]);
          const ba = crossProductComplexMemo(samples[j], samples[i]);
          assertVecClose(ab, vNeg(ba));
        }
      }
    });

    it('satisfies the Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0', () => {
      const triples = [
        [samples[0], samples[1], samples[2]],
        [samples[1], samples[2], samples[3]],
        [samples[0], samples[2], samples[3]],
      ];
      const zero = [c(0), c(0), c(0)];
      for (const [a, b, d] of triples) {
        const term1 = crossProductComplexMemo(a, crossProductComplexMemo(b, d));
        const term2 = crossProductComplexMemo(b, crossProductComplexMemo(d, a));
        const term3 = crossProductComplexMemo(d, crossProductComplexMemo(a, b));
        assertVecClose(vAdd(vAdd(term1, term2), term3), zero, 1e-10);
      }
    });

    it('satisfies bilinear orthogonality: a · (a × b) = 0 and b · (a × b) = 0', () => {
      const zeroC = c(0, 0);
      for (let i = 0; i < samples.length; i++) {
        for (let j = 0; j < samples.length; j++) {
          const axb = crossProductComplexMemo(samples[i], samples[j]);
          assertComplexClose(vDot(samples[i], axb), zeroC, 1e-10);
          assertComplexClose(vDot(samples[j], axb), zeroC, 1e-10);
        }
      }
    });

    it('satisfies bilinearity: (αa + βb) × d = α(a × d) + β(b × d)', () => {
      const alpha = c(2, -1.5);
      const beta = c(-0.5, 3);
      const [a, b, d] = samples;
      const lhs = crossProductComplexMemo(vAdd(vScale(alpha, a), vScale(beta, b)), d);
      const rhs = vAdd(
        vScale(alpha, crossProductComplexMemo(a, d)),
        vScale(beta, crossProductComplexMemo(b, d))
      );
      assertVecClose(lhs, rhs, 1e-10);
    });

    it('satisfies Lagrange identity: (a×b)·(d×e) = (a·d)(b·e) - (a·e)(b·d)', () => {
      const [a, b, d, e] = samples;
      const lhs = vDot(crossProductComplexMemo(a, b), crossProductComplexMemo(d, e));
      const rhs = cSub(cMul(vDot(a, d), vDot(b, e)), cMul(vDot(a, e), vDot(b, d)));
      assertComplexClose(lhs, rhs, 1e-10);
    });
  });
});
