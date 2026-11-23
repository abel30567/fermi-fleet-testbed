import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtBigIntLazy, SCALE } from './cbrtBigIntLazy.js';

const SCALE_CUBED = SCALE ** 3n;

/**
 * Independent algebraic verification that `root` is the exact nearest
 * integer to `(x * 10^54)^(1/3)` (strictly within 0.5 ULP of the true value).
 *
 * @param {bigint} x
 * @param {bigint} root
 */
function assertExactNearestFixedPointCbrt(x, root) {
  if (x === 0n) {
    assert.equal(root, 0n);
    return;
  }

  if (x < 0n) {
    assert.ok(root < 0n, `Expected negative root for x=${x}, got ${root}`);
  } else {
    assert.ok(root > 0n, `Expected positive root for x=${x}, got ${root}`);
  }

  const absX = x < 0n ? -x : x;
  const absRoot = root < 0n ? -root : root;
  const target = absX * SCALE_CUBED;

  const lowerHalf = 2n * absRoot - 1n;
  const upperHalf = 2n * absRoot + 1n;

  // Exact half-ULP bracket: (absRoot - 0.5)^3 < target < (absRoot + 0.5)^3
  assert.ok(
    lowerHalf ** 3n < 8n * target,
    `Root ${root} too large for x=${x}`
  );
  assert.ok(
    8n * target < upperHalf ** 3n,
    `Root ${root} too small for x=${x}`
  );

  // Also check 1-ULP cubing bracket: (absRoot - 1)^3 < target < (absRoot + 1)^3
  assert.ok((absRoot - 1n) ** 3n < target);
  assert.ok(target < (absRoot + 1n) ** 3n);
}

describe('cbrtBigIntLazy', () => {
  describe('single BigInt: exact perfect cubes & zero', () => {
    it('handles zero', () => {
      assert.equal(cbrtBigIntLazy(0n), 0n);
    });

    it('computes exact fixed-point roots for positive and negative perfect cubes', () => {
      const bases = [1n, -1n, 2n, -2n, 3n, -3n, 4n, -5n, 10n, -10n, 42n, -1000n, 123456n, -987654321n];
      for (const b of bases) {
        const cube = b ** 3n;
        assert.equal(cbrtBigIntLazy(cube), b * SCALE);
      }
    });

    it('handles very large perfect cubes far beyond Number.MAX_SAFE_INTEGER', () => {
      const hugeBase = 10n ** 40n + 123456789012345678901234567890n;
      assert.equal(cbrtBigIntLazy(hugeBase ** 3n), hugeBase * SCALE);
      assert.equal(cbrtBigIntLazy(-(hugeBase ** 3n)), -hugeBase * SCALE);
    });
  });

  describe('single BigInt: non-integer fixed-point cube roots', () => {
    it('matches known 18-decimal cube roots rounded to nearest ULP', () => {
      // cbrt(2)  = 1.2599210498948731647672106... -> ...165
      assert.equal(cbrtBigIntLazy(2n), 1_259_921_049_894_873_165n);
      assert.equal(cbrtBigIntLazy(-2n), -1_259_921_049_894_873_165n);

      // cbrt(3)  = 1.4422495703074083823216383... -> ...382
      assert.equal(cbrtBigIntLazy(3n), 1_442_249_570_307_408_382n);
      assert.equal(cbrtBigIntLazy(-3n), -1_442_249_570_307_408_382n);

      // cbrt(10) = 2.1544346900318837217592935... -> ...722
      assert.equal(cbrtBigIntLazy(10n), 2_154_434_690_031_883_722n);
      assert.equal(cbrtBigIntLazy(-10n), -2_154_434_690_031_883_722n);
    });

    it('preserves odd-function symmetry cbrt(-x) === -cbrt(x)', () => {
      const samples = [1n, 2n, 7n, 9n, 26n, 28n, 63n, 65n, 999n, 10n ** 25n + 7n, 2n ** 200n - 1n];
      for (const x of samples) {
        assert.equal(cbrtBigIntLazy(-x), -cbrtBigIntLazy(x));
      }
    });
  });

  describe('independent cross-checks', () => {
    it('satisfies exact 0.5-ULP cubing back-check across small, boundary, and huge BigInts', () => {
      const samples = [
        -1000n, -65n, -64n, -63n, -9n, -8n, -7n, -2n, -1n, 0n,
        1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 9n, 26n, 27n, 28n, 63n, 64n, 65n,
        10n ** 18n - 1n,
        10n ** 18n + 1n,
        2n ** 64n - 1n,
        2n ** 64n,
        2n ** 64n + 1n,
        -(2n ** 128n + 12345n),
        10n ** 100n + 314159265358979323846n,
        -(10n ** 150n - 1n),
      ];

      for (const x of samples) {
        const root = cbrtBigIntLazy(x);
        assertExactNearestFixedPointCbrt(x, root);
      }
    });

    it('agrees with Math.cbrt across IEEE-754 double-safe values', () => {
      const samples = [
        -1_000_000_000_000n,
        -987_654_321n,
        -100n,
        -7n,
        -2n,
        -1n,
        0n,
        1n,
        2n,
        5n,
        17n,
        99n,
        123_456_789n,
        9_007_199_254_740_991n,
      ];

      for (const x of samples) {
        const result = cbrtBigIntLazy(x);
        const asFloat = Number(result) / 1e18;
        const expected = Math.cbrt(Number(x));
        const tolerance = 1e-14 * Math.max(1, Math.abs(expected));
        assert.ok(
          Math.abs(asFloat - expected) <= tolerance,
          `Mismatch for x=${x}: got ${asFloat}, expected ${expected}`
        );
      }
    });
  });

  describe('lazy streaming over iterables and generators', () => {
    it('streams over arrays, Sets, and BigInt TypedArrays', () => {
      const arrResult = [...cbrtBigIntLazy([0n, 1n, -8n, 27n])];
      assert.deepEqual(arrResult, [0n, SCALE, -2n * SCALE, 3n * SCALE]);

      const setResult = [...cbrtBigIntLazy(new Set([8n, 64n]))];
      assert.deepEqual(setResult, [2n * SCALE, 4n * SCALE]);

      const typedResult = [...cbrtBigIntLazy(new BigInt64Array([-27n, 0n, 125n]))];
      assert.deepEqual(typedResult, [-3n * SCALE, 0n, 5n * SCALE]);
    });

    it('handles empty iterables', () => {
      const gen = cbrtBigIntLazy([]);
      assert.deepEqual(gen.next(), { value: undefined, done: true });
    });

    it('consumes input strictly lazily on demand without eager buffering', () => {
      let produced = 0;
      function* trackedSource() {
        for (const v of [1n, 8n, 27n, 64n]) {
          produced += 1;
          yield v;
        }
      }

      const stream = cbrtBigIntLazy(trackedSource());
      assert.equal(produced, 0, 'Must not pull any elements before first .next()');

      assert.deepEqual(stream.next(), { value: 1n * SCALE, done: false });
      assert.equal(produced, 1);

      assert.deepEqual(stream.next(), { value: 2n * SCALE, done: false });
      assert.equal(produced, 2);

      assert.deepEqual(stream.next(), { value: 3n * SCALE, done: false });
      assert.equal(produced, 3);
    });

    it('supports infinite generators and closes the source iterator on early exit', () => {
      let closed = false;
      function* infiniteCubes() {
        try {
          let i = 0n;
          while (true) {
            yield i ** 3n;
            i += 1n;
          }
        } finally {
          closed = true;
        }
      }

      const taken = [];
      for (const root of cbrtBigIntLazy(infiniteCubes())) {
        taken.push(root);
        if (taken.length === 5) {
          break;
        }
      }

      assert.deepEqual(taken, [0n, 1n * SCALE, 2n * SCALE, 3n * SCALE, 4n * SCALE]);
      assert.equal(closed, true, 'Underlying infinite generator must be closed on break');
    });

    it('supports custom iterable objects implementing Symbol.iterator', () => {
      const customIterable = {
        *[Symbol.iterator]() {
          yield -1n;
          yield 2n;
          yield 8n;
        },
      };

      const values = [...cbrtBigIntLazy(customIterable)];
      assert.deepEqual(values, [-SCALE, 1_259_921_049_894_873_165n, 2n * SCALE]);
    });
  });

  describe('input validation', () => {
    it('throws TypeError synchronously for non-BigInt, non-iterable inputs and strings', () => {
      const invalidInputs = [
        8,
        0,
        -27,
        NaN,
        Infinity,
        '8',
        '',
        true,
        false,
        null,
        undefined,
        Symbol('x'),
        {},
        () => 8n,
      ];

      for (const bad of invalidInputs) {
        assert.throws(() => cbrtBigIntLazy(bad), TypeError);
      }
    });

    it('throws TypeError lazily when an iterable yields a non-BigInt element', () => {
      const stream = cbrtBigIntLazy([8n, 27, 64n]);

      // First element succeeds lazily
      assert.deepEqual(stream.next(), { value: 2n * SCALE, done: false });

      // Second element (number instead of BigInt) throws TypeError
      assert.throws(() => stream.next(), TypeError);
    });

    it('rejects null, undefined, and string elements inside iterables', () => {
      for (const badElem of [null, undefined, '8', NaN, {}]) {
        const stream = cbrtBigIntLazy([badElem]);
        assert.throws(() => stream.next(), TypeError);
      }
    });
  });
});
