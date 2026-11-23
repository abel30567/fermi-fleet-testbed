import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addComplexRecursive } from './addComplexRecursive.js';

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @param {Array<{ re: number, im: number }>} items
 * @returns {{ re: number, im: number }}
 */
function addComplexIterative(items) {
  let re = 0;
  let im = 0;
  for (const z of items) {
    re += z.re;
    im += z.im;
  }
  return { re, im };
}

/**
 * Deterministic LCG for reproducible pseudo-random test sequences.
 *
 * @param {number} seed
 */
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('addComplexRecursive', () => {
  describe('normal cases', () => {
    it('adds two complex numbers passed as an array or variadic arguments', () => {
      const a = { re: 3, im: 4 };
      const b = { re: -1, im: 2.5 };

      assert.deepEqual(addComplexRecursive([a, b]), { re: 2, im: 6.5 });
      assert.deepEqual(addComplexRecursive(a, b), { re: 2, im: 6.5 });
    });

    it('adds odd and even counts of complex numbers via divide-and-conquer', () => {
      const three = [
        { re: 1, im: 2 },
        { re: 3, im: -5 },
        { re: -4, im: 10 },
      ];
      assert.deepEqual(addComplexRecursive(three), { re: 0, im: 7 });

      const four = [
        { re: 1.5, im: -0.5 },
        { re: 2.25, im: 3.75 },
        { re: -0.75, im: 1.25 },
        { re: 4, im: -2.5 },
      ];
      assert.deepEqual(addComplexRecursive(four), { re: 7, im: 2 });
      assert.deepEqual(addComplexRecursive(...four), { re: 7, im: 2 });
    });

    it('adds purely real and purely imaginary complex numbers', () => {
      assert.deepEqual(
        addComplexRecursive(
          { re: 5, im: 0 },
          { re: 0, im: -3 },
          { re: -2, im: 0 },
          { re: 0, im: 7 }
        ),
        { re: 3, im: 4 }
      );
    });

    it('does not mutate inputs and returns a clean { re, im } object', () => {
      const a = Object.freeze({ re: 2, im: 3, extra: 'ignored' });
      const b = Object.freeze({ re: 5, im: -1, tag: 42 });
      const res = addComplexRecursive([a, b]);

      assert.deepEqual(res, { re: 7, im: 2 });
      assert.deepEqual(Object.keys(res).sort(), ['im', 're']);
    });
  });

  describe('edge cases', () => {
    it('returns the additive identity { re: 0, im: 0 } for an empty array', () => {
      assert.deepEqual(addComplexRecursive([]), { re: 0, im: 0 });
    });

    it('returns a fresh copy for a single complex number', () => {
      const z = { re: -7.5, im: 12.25 };
      const fromArray = addComplexRecursive([z]);
      const fromArg = addComplexRecursive(z);

      assert.deepEqual(fromArray, z);
      assert.deepEqual(fromArg, z);
      assert.notEqual(fromArray, z);
      assert.notEqual(fromArg, z);
    });

    it('cancels additive inverses to zero', () => {
      const z = { re: 123.456, im: -789.012 };
      const negZ = { re: -123.456, im: 789.012 };
      assert.deepEqual(addComplexRecursive(z, negZ), { re: 0, im: 0 });
    });

    it('handles zero and negative zero components', () => {
      const res = addComplexRecursive({ re: -0, im: 0 }, { re: 0, im: -0 });
      assert.equal(res.re, 0);
      assert.equal(res.im, 0);
    });

    it('handles large arrays (10,000 elements) without stack overflow and matches Gauss formula', () => {
      const n = 10_000;
      const items = Array.from({ length: n }, (_, i) => ({
        re: i + 1,
        im: -(2 * (i + 1)),
      }));
      const expectedRe = (n * (n + 1)) / 2;
      const expectedIm = -n * (n + 1);

      assert.deepEqual(addComplexRecursive(items), {
        re: expectedRe,
        im: expectedIm,
      });
    });
  });

  describe('invalid inputs', () => {
    it('throws TypeError when called with no arguments', () => {
      assert.throws(() => addComplexRecursive(), TypeError);
    });

    it('throws TypeError for non-object or nullish inputs', () => {
      for (const bad of [null, undefined, 42, '1+2i', true, () => {}]) {
        assert.throws(() => addComplexRecursive(bad), TypeError);
        assert.throws(() => addComplexRecursive([bad]), TypeError);
      }
    });

    it('throws TypeError for missing or non-number re/im properties', () => {
      const invalidObjects = [
        {},
        { re: 1 },
        { im: 2 },
        { re: '1', im: 2 },
        { re: 1, im: '2' },
        { re: null, im: 0 },
        { re: 1n, im: 0 },
      ];
      for (const bad of invalidObjects) {
        assert.throws(() => addComplexRecursive([bad]), TypeError);
        assert.throws(() => addComplexRecursive({ re: 0, im: 0 }, bad), TypeError);
      }
    });

    it('throws RangeError for non-finite re/im values', () => {
      const nonFinite = [
        { re: Number.NaN, im: 0 },
        { re: 0, im: Number.NaN },
        { re: Number.POSITIVE_INFINITY, im: 1 },
        { re: 1, im: Number.NEGATIVE_INFINITY },
      ];
      for (const bad of nonFinite) {
        assert.throws(() => addComplexRecursive([bad]), RangeError);
        assert.throws(() => addComplexRecursive({ re: 1, im: 1 }, bad), RangeError);
      }
    });

    it('throws TypeError for sparse arrays and mixed array/object arguments', () => {
      // eslint-disable-next-line no-sparse-arrays
      const sparse = [{ re: 1, im: 0 }, , { re: 2, im: 0 }];
      assert.throws(() => addComplexRecursive(sparse), TypeError);
      assert.throws(
        () => addComplexRecursive([{ re: 1, im: 2 }], { re: 3, im: 4 }),
        TypeError
      );
    });
  });

  describe('independent cross-checks', () => {
    it('agrees with iterative summation across lengths 0..64 on pseudo-random inputs', () => {
      const rand = makeRng(20261123);
      for (let len = 0; len <= 64; len++) {
        const items = Array.from({ length: len }, () => ({
          re: (rand() - 0.5) * 200,
          im: (rand() - 0.5) * 200,
        }));
        const recursiveSum = addComplexRecursive(items);
        const iterativeSum = addComplexIterative(items);

        assert.ok(
          Math.abs(recursiveSum.re - iterativeSum.re) < 1e-11,
          `re mismatch at len=${len}: ${recursiveSum.re} vs ${iterativeSum.re}`
        );
        assert.ok(
          Math.abs(recursiveSum.im - iterativeSum.im) < 1e-11,
          `im mismatch at len=${len}: ${recursiveSum.im} vs ${iterativeSum.im}`
        );
      }
    });

    it('matches exact BigInt summation on 1,000 integer-valued complex numbers', () => {
      const rand = makeRng(987654321);
      const items = Array.from({ length: 1000 }, () => ({
        re: Math.floor((rand() - 0.5) * 100_000),
        im: Math.floor((rand() - 0.5) * 100_000),
      }));

      let exactRe = 0n;
      let exactIm = 0n;
      for (const { re, im } of items) {
        exactRe += BigInt(re);
        exactIm += BigInt(im);
      }

      const result = addComplexRecursive(items);
      assert.equal(BigInt(result.re), exactRe);
      assert.equal(BigInt(result.im), exactIm);
    });

    it('satisfies commutativity, associativity, and scalar linearity', () => {
      const rand = makeRng(1337);
      const firstHalf = Array.from({ length: 17 }, () => ({
        re: Math.round((rand() - 0.5) * 1000),
        im: Math.round((rand() - 0.5) * 1000),
      }));
      const secondHalf = Array.from({ length: 23 }, () => ({
        re: Math.round((rand() - 0.5) * 1000),
        im: Math.round((rand() - 0.5) * 1000),
      }));
      const combined = [...firstHalf, ...secondHalf];

      // Commutativity (reversed order)
      assert.deepEqual(
        addComplexRecursive([...combined].reverse()),
        addComplexRecursive(combined)
      );

      // Associativity (split sum equals combined sum)
      assert.deepEqual(
        addComplexRecursive(
          addComplexRecursive(firstHalf),
          addComplexRecursive(secondHalf)
        ),
        addComplexRecursive(combined)
      );

      // Scalar linearity: k * sum(Z) === sum(k * Z)
      const k = 7;
      const sumScaled = addComplexRecursive(
        combined.map(({ re, im }) => ({ re: k * re, im: k * im }))
      );
      const scaledSum = addComplexRecursive(combined);
      assert.deepEqual(sumScaled, {
        re: k * scaledSum.re,
        im: k * scaledSum.im,
      });
    });
  });
});
