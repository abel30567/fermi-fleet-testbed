import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddComplexIterative } from './vectorAddComplexIterative.js';

/**
 * Deterministic LCG PRNG for reproducible cross-check tests.
 * @param {number} seed
 */
function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state / 0x100000000) * 20 - 10; // [-10, 10)
  };
}

/**
 * Asserts two complex vectors are approximately equal within epsilon.
 */
function assertComplexVectorsClose(actual, expected, eps = 1e-12) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assert.ok(
      Math.abs(actual[i].re - expected[i].re) <= eps,
      `Index ${i} real mismatch: ${actual[i].re} vs ${expected[i].re}`
    );
    assert.ok(
      Math.abs(actual[i].im - expected[i].im) <= eps,
      `Index ${i} imag mismatch: ${actual[i].im} vs ${expected[i].im}`
    );
  }
}

describe('vectorAddComplexIterative', () => {
  describe('normal cases', () => {
    it('adds integer complex vectors element-wise', () => {
      const a = [
        { re: 1, im: 2 },
        { re: -3, im: 4 },
        { re: 5, im: -6 },
      ];
      const b = [
        { re: 7, im: -8 },
        { re: 3, im: 1 },
        { re: -5, im: 6 },
      ];

      const result = vectorAddComplexIterative(a, b);
      assert.deepEqual(result, [
        { re: 8, im: -6 },
        { re: 0, im: 5 },
        { re: 0, im: 0 },
      ]);
    });

    it('adds floating-point complex vectors accurately', () => {
      const a = [
        { re: 0.25, im: -1.5 },
        { re: 3.125, im: 2.75 },
      ];
      const b = [
        { re: 0.75, im: 1.5 },
        { re: -1.125, im: 0.25 },
      ];

      const result = vectorAddComplexIterative(a, b);
      assert.deepEqual(result, [
        { re: 1, im: 0 },
        { re: 2, im: 3 },
      ]);
    });

    it('does not mutate inputs and returns fresh element objects', () => {
      const a = [{ re: 1, im: 2 }];
      const b = [{ re: 3, im: 4 }];
      const aSnap = structuredClone(a);
      const bSnap = structuredClone(b);

      const result = vectorAddComplexIterative(a, b);

      assert.deepEqual(a, aSnap);
      assert.deepEqual(b, bSnap);
      assert.notEqual(result, a);
      assert.notEqual(result, b);
      assert.notEqual(result[0], a[0]);
      assert.notEqual(result[0], b[0]);
    });
  });

  describe('edge cases', () => {
    it('returns an empty array for empty input vectors', () => {
      assert.deepEqual(vectorAddComplexIterative([], []), []);
    });

    it('handles single-element vectors', () => {
      assert.deepEqual(
        vectorAddComplexIterative([{ re: -4.5, im: 9.25 }], [{ re: 4.5, im: -9.25 }]),
        [{ re: 0, im: 0 }]
      );
    });

    it('preserves additive identity with zero vector', () => {
      const a = [
        { re: 3.5, im: -2.25 },
        { re: 0, im: 7 },
      ];
      const zero = [
        { re: 0, im: 0 },
        { re: 0, im: 0 },
      ];
      assert.deepEqual(vectorAddComplexIterative(a, zero), a);
      assert.deepEqual(vectorAddComplexIterative(zero, a), a);
    });

    it('handles extra properties on complex objects by returning clean { re, im } objects', () => {
      const a = [{ re: 2, im: 3, tag: 'x' }];
      const b = [{ re: 4, im: 5, extra: true }];
      const result = vectorAddComplexIterative(a, b);
      assert.deepEqual(result, [{ re: 6, im: 8 }]);
      assert.deepEqual(Object.keys(result[0]), ['re', 'im']);
    });
  });

  describe('input validation', () => {
    it('throws TypeError when a or b is not an Array', () => {
      for (const bad of [null, undefined, 42, 'abc', {}, { length: 0 }]) {
        assert.throws(() => vectorAddComplexIterative(bad, []), TypeError);
        assert.throws(() => vectorAddComplexIterative([], bad), TypeError);
      }
    });

    it('throws RangeError when vector lengths differ', () => {
      assert.throws(
        () => vectorAddComplexIterative([{ re: 1, im: 0 }], []),
        RangeError
      );
      assert.throws(
        () =>
          vectorAddComplexIterative(
            [{ re: 1, im: 0 }],
            [
              { re: 1, im: 0 },
              { re: 2, im: 0 },
            ]
          ),
        RangeError
      );
    });

    it('throws TypeError when elements are not valid objects', () => {
      for (const badElem of [null, undefined, 5, '1+2i', [1, 2], true]) {
        assert.throws(
          () => vectorAddComplexIterative([badElem], [{ re: 0, im: 0 }]),
          TypeError
        );
        assert.throws(
          () => vectorAddComplexIterative([{ re: 0, im: 0 }], [badElem]),
          TypeError
        );
      }
    });

    it('throws TypeError for sparse arrays with holes', () => {
      const sparse = new Array(2);
      sparse[0] = { re: 1, im: 1 };
      const dense = [
        { re: 1, im: 1 },
        { re: 2, im: 2 },
      ];
      assert.throws(() => vectorAddComplexIterative(sparse, dense), TypeError);
      assert.throws(() => vectorAddComplexIterative(dense, sparse), TypeError);
    });

    it('throws TypeError when re or im is missing or non-numeric', () => {
      const badObjs = [
        { re: 1 },
        { im: 2 },
        {},
        { re: '1', im: 2 },
        { re: 1, im: null },
        { re: true, im: 0 },
      ];
      for (const obj of badObjs) {
        assert.throws(
          () => vectorAddComplexIterative([obj], [{ re: 0, im: 0 }]),
          TypeError
        );
        assert.throws(
          () => vectorAddComplexIterative([{ re: 0, im: 0 }], [obj]),
          TypeError
        );
      }
    });

    it('throws RangeError when re or im is non-finite', () => {
      const nonFinite = [
        { re: Number.NaN, im: 0 },
        { re: 0, im: Number.NaN },
        { re: Number.POSITIVE_INFINITY, im: 1 },
        { re: 1, im: Number.NEGATIVE_INFINITY },
      ];
      for (const obj of nonFinite) {
        assert.throws(
          () => vectorAddComplexIterative([obj], [{ re: 0, im: 0 }]),
          RangeError
        );
        assert.throws(
          () => vectorAddComplexIterative([{ re: 0, im: 0 }], [obj]),
          RangeError
        );
      }
    });
  });

  describe('independent cross-checks and mathematical identities', () => {
    it('matches independent interleaved R^(2n) real vector addition', () => {
      const rng = createRng(123456);
      const n = 64;
      const a = Array.from({ length: n }, () => ({ re: rng(), im: rng() }));
      const b = Array.from({ length: n }, () => ({ re: rng(), im: rng() }));

      // Independent reference: isomorphism C^n <-> R^(2n)
      const flatA = a.flatMap((z) => [z.re, z.im]);
      const flatB = b.flatMap((z) => [z.re, z.im]);
      const flatSum = flatA.map((val, idx) => val + flatB[idx]);
      const expected = [];
      for (let i = 0; i < flatSum.length; i += 2) {
        expected.push({ re: flatSum[i], im: flatSum[i + 1] });
      }

      const actual = vectorAddComplexIterative(a, b);
      assert.deepEqual(actual, expected);
    });

    it('satisfies commutativity, associativity, additive inverse, and complex scalar distributivity', () => {
      const rng = createRng(987654);
      const n = 32;
      const makeVec = () => Array.from({ length: n }, () => ({ re: rng(), im: rng() }));
      const a = makeVec();
      const b = makeVec();
      const c = makeVec();

      // Commutativity: a + b = b + a
      assert.deepEqual(
        vectorAddComplexIterative(a, b),
        vectorAddComplexIterative(b, a)
      );

      // Associativity: (a + b) + c ≈ a + (b + c)
      const lhsAssoc = vectorAddComplexIterative(vectorAddComplexIterative(a, b), c);
      const rhsAssoc = vectorAddComplexIterative(a, vectorAddComplexIterative(b, c));
      assertComplexVectorsClose(lhsAssoc, rhsAssoc, 1e-12);

      // Additive inverse: a + (-a) = 0
      const negA = a.map(({ re, im }) => ({ re: -re, im: -im }));
      const zeroSum = vectorAddComplexIterative(a, negA);
      assertComplexVectorsClose(
        zeroSum,
        Array.from({ length: n }, () => ({ re: 0, im: 0 })),
        0
      );

      // Complex scalar distributivity: s * (a + b) ≈ (s * a) + (s * b)
      const s = { re: -1.75, im: 2.25 };
      const scale = (v) =>
        v.map(({ re, im }) => ({
          re: s.re * re - s.im * im,
          im: s.re * im + s.im * re,
        }));
      const lhsDist = scale(vectorAddComplexIterative(a, b));
      const rhsDist = vectorAddComplexIterative(scale(a), scale(b));
      assertComplexVectorsClose(lhsDist, rhsDist, 1e-11);
    });

    it('satisfies polar law of cosines |z1 + z2|^2 = r1^2 + r2^2 + 2 r1 r2 cos(theta1 - theta2)', () => {
      const rng = createRng(20261122);
      const n = 25;
      const polarA = Array.from({ length: n }, () => ({
        r: Math.abs(rng()),
        theta: rng(),
      }));
      const polarB = Array.from({ length: n }, () => ({
        r: Math.abs(rng()),
        theta: rng(),
      }));

      const vecA = polarA.map(({ r, theta }) => ({
        re: r * Math.cos(theta),
        im: r * Math.sin(theta),
      }));
      const vecB = polarB.map(({ r, theta }) => ({
        re: r * Math.cos(theta),
        im: r * Math.sin(theta),
      }));

      const sum = vectorAddComplexIterative(vecA, vecB);

      for (let i = 0; i < n; i++) {
        const normSqActual = sum[i].re * sum[i].re + sum[i].im * sum[i].im;
        const { r: r1, theta: t1 } = polarA[i];
        const { r: r2, theta: t2 } = polarB[i];
        const normSqExpected = r1 * r1 + r2 * r2 + 2 * r1 * r2 * Math.cos(t1 - t2);
        assert.ok(
          Math.abs(normSqActual - normSqExpected) <= 1e-10,
          `Index ${i}: |z1+z2|^2 mismatch ${normSqActual} vs ${normSqExpected}`
        );
      }
    });
  });
});
