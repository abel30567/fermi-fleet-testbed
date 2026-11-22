import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { productComplexIterative } from './productComplexIterative.js';

function assertComplexClose(actual, expected, eps = 1e-12) {
  assert.ok(
    Math.abs(actual.re - expected.re) <= eps,
    `Expected re ${actual.re} to be within ${eps} of ${expected.re}`
  );
  assert.ok(
    Math.abs(actual.im - expected.im) <= eps,
    `Expected im ${actual.im} to be within ${eps} of ${expected.im}`
  );
}

describe('productComplexIterative', () => {
  describe('normal cases', () => {
    it('multiplies two complex numbers', () => {
      // (1 + 2i)(3 + 4i) = (3 - 8) + (4 + 6)i = -5 + 10i
      assert.deepStrictEqual(
        productComplexIterative([
          { re: 1, im: 2 },
          { re: 3, im: 4 },
        ]),
        { re: -5, im: 10 }
      );
    });

    it('multiplies multiple complex numbers iteratively', () => {
      // (1 + i)(2 - i)(3 + 2i) = (3 + i)(3 + 2i) = 7 + 9i
      assert.deepStrictEqual(
        productComplexIterative([
          { re: 1, im: 1 },
          { re: 2, im: -1 },
          { re: 3, im: 2 },
        ]),
        { re: 7, im: 9 }
      );
    });

    it('computes powers of the imaginary unit i', () => {
      const i = { re: 0, im: 1 };
      assert.deepStrictEqual(productComplexIterative([i, i]), { re: -1, im: 0 });
      assert.deepStrictEqual(productComplexIterative([i, i, i]), { re: 0, im: -1 });
      assert.deepStrictEqual(productComplexIterative([i, i, i, i]), { re: 1, im: 0 });
    });

    it('handles purely real numbers embedded as { re, im: 0 }', () => {
      assert.deepStrictEqual(
        productComplexIterative([
          { re: 2, im: 0 },
          { re: -3, im: 0 },
          { re: 5, im: 0 },
        ]),
        { re: -30, im: 0 }
      );
    });

    it('handles complex conjugate pairs producing real modulus squared', () => {
      assert.deepStrictEqual(
        productComplexIterative([
          { re: 3, im: 4 },
          { re: 3, im: -4 },
        ]),
        { re: 25, im: 0 }
      );
    });
  });

  describe('edge cases', () => {
    it('returns the multiplicative identity { re: 1, im: 0 } for an empty array', () => {
      assert.deepStrictEqual(productComplexIterative([]), { re: 1, im: 0 });
    });

    it('returns a new object equal to the single element for a 1-element array', () => {
      const z = { re: -7.5, im: 2.25 };
      const result = productComplexIterative([z]);
      assert.deepStrictEqual(result, { re: -7.5, im: 2.25 });
      assert.notStrictEqual(result, z);
    });

    it('returns { re: 0, im: 0 } without negative zero when a zero factor is present', () => {
      const result = productComplexIterative([
        { re: -1, im: 2 },
        { re: 0, im: 0 },
        { re: 4, im: -5 },
      ]);
      assert.deepStrictEqual(result, { re: 0, im: 0 });
      assert.ok(Object.is(result.re, 0));
      assert.ok(Object.is(result.im, 0));
    });

    it('normalizes -0 components to +0', () => {
      const result = productComplexIterative([
        { re: -1, im: 0 },
        { re: 0, im: 1 },
      ]);
      assert.deepStrictEqual(result, { re: 0, im: -1 });
      assert.ok(Object.is(result.re, 0));
    });

    it('does not mutate input array or element objects', () => {
      const input = [
        { re: 2, im: 3 },
        { re: -1, im: 4 },
      ];
      const snapshot = structuredClone(input);
      productComplexIterative(input);
      assert.deepStrictEqual(input, snapshot);
    });
  });

  describe('input validation', () => {
    it('throws TypeError if values is not an array', () => {
      for (const bad of [null, undefined, 42, '1+2i', { re: 1, im: 0 }, new Set()]) {
        assert.throws(() => productComplexIterative(bad), TypeError);
      }
    });

    it('throws TypeError if any element is not a non-null non-array object', () => {
      for (const badElem of [null, undefined, 1, '2', [1, 2], true]) {
        assert.throws(() => productComplexIterative([{ re: 1, im: 0 }, badElem]), TypeError);
      }
    });

    it('throws TypeError if re or im is missing or not a number', () => {
      for (const badElem of [
        {},
        { re: 1 },
        { im: 2 },
        { re: '1', im: 2 },
        { re: 1, im: '2' },
        { re: null, im: 0 },
        { re: 0, im: undefined },
      ]) {
        assert.throws(() => productComplexIterative([badElem]), TypeError);
      }
    });

    it('throws RangeError if re or im is NaN, Infinity, or -Infinity', () => {
      for (const badElem of [
        { re: NaN, im: 0 },
        { re: 0, im: NaN },
        { re: Infinity, im: 1 },
        { re: 1, im: -Infinity },
      ]) {
        assert.throws(() => productComplexIterative([badElem]), RangeError);
      }
    });

    it('validates all elements even after encountering a zero factor', () => {
      assert.throws(
        () => productComplexIterative([{ re: 0, im: 0 }, { re: NaN, im: 1 }]),
        RangeError
      );
      assert.throws(
        () => productComplexIterative([{ re: 0, im: 0 }, null]),
        TypeError
      );
    });
  });

  describe('independent cross-checks', () => {
    it('matches polar form identity: prod(r_k * e^(i*theta_k)) = (prod r_k) * e^(i*sum theta_k)', () => {
      const factors = [
        { re: 1.2, im: -0.7 },
        { re: -0.5, im: 1.8 },
        { re: 0.9, im: 0.4 },
        { re: -1.1, im: -0.6 },
        { re: 2.0, im: 0.3 },
      ];

      const actual = productComplexIterative(factors);

      let totalModulus = 1;
      let totalAngle = 0;
      for (const { re, im } of factors) {
        totalModulus *= Math.hypot(re, im);
        totalAngle += Math.atan2(im, re);
      }
      const expected = {
        re: totalModulus * Math.cos(totalAngle),
        im: totalModulus * Math.sin(totalAngle),
      };

      assertComplexClose(actual, expected, 1e-12);
    });

    it('satisfies the nth roots of unity product identity: prod_{k=0}^{n-1} e^(2*pi*i*k/n) = (-1)^(n-1)', () => {
      for (let n = 1; n <= 12; n++) {
        const roots = [];
        for (let k = 0; k < n; k++) {
          const angle = (2 * Math.PI * k) / n;
          roots.push({ re: Math.cos(angle), im: Math.sin(angle) });
        }
        const actual = productComplexIterative(roots);
        const expected = { re: (n - 1) % 2 === 0 ? 1 : -1, im: 0 };
        assertComplexClose(actual, expected, 1e-11);
      }
    });

    it('matches independent 2x2 real matrix representation multiplication', () => {
      // a + bi corresponds to [[a, -b], [b, a]]
      const matMul = (A, B) => [
        [A[0][0] * B[0][0] + A[0][1] * B[1][0], A[0][0] * B[0][1] + A[0][1] * B[1][1]],
        [A[1][0] * B[0][0] + A[1][1] * B[1][0], A[1][0] * B[0][1] + A[1][1] * B[1][1]],
      ];

      const factors = [
        { re: 2, im: -3 },
        { re: -4, im: 1 },
        { re: 5, im: 2 },
        { re: -1, im: -2 },
        { re: 3, im: 0 },
      ];

      const actual = productComplexIterative(factors);

      let M = [
        [1, 0],
        [0, 1],
      ];
      for (const { re, im } of factors) {
        M = matMul(M, [
          [re, -im],
          [im, re],
        ]);
      }

      assert.deepStrictEqual(actual, { re: M[0][0], im: M[1][0] });
      assert.strictEqual(M[0][0], M[1][1]);
      assert.strictEqual(M[0][1], -M[1][0]);
    });

    it('is commutative under reversal and associative under splitting', () => {
      const factors = [
        { re: 1.5, im: -0.5 },
        { re: -2.0, im: 1.25 },
        { re: 0.75, im: 2.5 },
        { re: -0.5, im: -1.5 },
      ];

      const forward = productComplexIterative(factors);
      const reversed = productComplexIterative([...factors].reverse());
      const left = productComplexIterative(factors.slice(0, 2));
      const right = productComplexIterative(factors.slice(2));
      const splitCombined = productComplexIterative([left, right]);

      assertComplexClose(forward, reversed, 1e-12);
      assertComplexClose(forward, splitCombined, 1e-12);
    });
  });
});
