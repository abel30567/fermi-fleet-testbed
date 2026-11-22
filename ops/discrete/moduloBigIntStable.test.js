import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloBigIntStable, SCALE } from './moduloBigIntStable.js';

/**
 * Independent brute-force oracle for small integers that uses ONLY
 * addition, subtraction, and comparison (no `/` or `%`).
 */
function oracleEuclideanMod(a, m) {
  const step = m < 0n ? -m : m;
  let r = a;
  while (r < 0n) r += step;
  while (r >= step) r -= step;
  return r;
}

function oracleFlooredMod(a, m) {
  let r = a;
  if (m > 0n) {
    while (r < 0n) r += m;
    while (r >= m) r -= m;
  } else {
    while (r > 0n) r += m;
    while (r <= m) r -= m;
  }
  return r;
}

function oracleTruncatedMod(a, m) {
  const step = m < 0n ? -m : m;
  let r = a;
  if (a >= 0n) {
    while (r >= step) r -= step;
  } else {
    while (r <= -step) r += step;
  }
  return r;
}

describe('moduloBigIntStable', () => {
  describe('core sign quadrants across modes', () => {
    it('handles positive dividend and positive divisor', () => {
      assert.equal(moduloBigIntStable(7n, 3n), 1n);
      assert.equal(moduloBigIntStable(9n, 3n), 0n);
      assert.equal(moduloBigIntStable(2n, 5n), 2n);
      assert.equal(moduloBigIntStable(7n, 3n, { mode: 'euclidean' }), 1n);
      assert.equal(moduloBigIntStable(7n, 3n, { mode: 'floored' }), 1n);
      assert.equal(moduloBigIntStable(7n, 3n, { mode: 'truncated' }), 1n);
    });

    it('handles negative dividend and positive divisor', () => {
      assert.equal(moduloBigIntStable(-7n, 3n), 2n);
      assert.equal(moduloBigIntStable(-7n, 3n, { mode: 'euclidean' }), 2n);
      assert.equal(moduloBigIntStable(-7n, 3n, { mode: 'floored' }), 2n);
      assert.equal(moduloBigIntStable(-7n, 3n, { mode: 'truncated' }), -1n);

      // Exact multiples must yield 0n in all modes
      assert.equal(moduloBigIntStable(-9n, 3n, { mode: 'euclidean' }), 0n);
      assert.equal(moduloBigIntStable(-9n, 3n, { mode: 'floored' }), 0n);
      assert.equal(moduloBigIntStable(-9n, 3n, { mode: 'truncated' }), 0n);
    });

    it('handles positive dividend and negative divisor', () => {
      assert.equal(moduloBigIntStable(7n, -3n), 1n);
      assert.equal(moduloBigIntStable(7n, -3n, { mode: 'euclidean' }), 1n);
      assert.equal(moduloBigIntStable(7n, -3n, { mode: 'floored' }), -2n);
      assert.equal(moduloBigIntStable(7n, -3n, { mode: 'truncated' }), 1n);

      assert.equal(moduloBigIntStable(9n, -3n, { mode: 'euclidean' }), 0n);
      assert.equal(moduloBigIntStable(9n, -3n, { mode: 'floored' }), 0n);
      assert.equal(moduloBigIntStable(9n, -3n, { mode: 'truncated' }), 0n);
    });

    it('handles both negative dividend and negative divisor', () => {
      assert.equal(moduloBigIntStable(-7n, -3n), 2n);
      assert.equal(moduloBigIntStable(-7n, -3n, { mode: 'euclidean' }), 2n);
      assert.equal(moduloBigIntStable(-7n, -3n, { mode: 'floored' }), -1n);
      assert.equal(moduloBigIntStable(-7n, -3n, { mode: 'truncated' }), -1n);

      assert.equal(moduloBigIntStable(-9n, -3n, { mode: 'euclidean' }), 0n);
      assert.equal(moduloBigIntStable(-9n, -3n, { mode: 'floored' }), 0n);
      assert.equal(moduloBigIntStable(-9n, -3n, { mode: 'truncated' }), 0n);
    });
  });

  describe('edge cases (zero dividend, unit moduli, default options)', () => {
    it('returns 0n for zero dividend across positive, negative, and huge moduli', () => {
      const moduli = [1n, -1n, 7n, -7n, 2n ** 300n + 1n, -(2n ** 300n + 1n)];
      for (const mode of ['euclidean', 'floored', 'truncated']) {
        for (const m of moduli) {
          assert.equal(moduloBigIntStable(0n, m, { mode }), 0n);
        }
      }
    });

    it('returns 0n for unit moduli 1n and -1n for any dividend', () => {
      const dividends = [0n, 1n, -1n, 42n, -42n, 2n ** 260n - 1n, -(2n ** 260n - 1n)];
      for (const mode of ['euclidean', 'floored', 'truncated']) {
        for (const a of dividends) {
          assert.equal(moduloBigIntStable(a, 1n, { mode }), 0n);
          assert.equal(moduloBigIntStable(a, -1n, { mode }), 0n);
        }
      }
    });

    it('defaults to euclidean mode when options or options.mode is omitted/undefined', () => {
      assert.equal(moduloBigIntStable(-1n, 5n), 4n);
      assert.equal(moduloBigIntStable(-1n, 5n, undefined), 4n);
      assert.equal(moduloBigIntStable(-1n, 5n, {}), 4n);
      assert.equal(moduloBigIntStable(-1n, 5n, { mode: undefined }), 4n);
    });
  });

  describe('huge BigInts beyond Number.MAX_SAFE_INTEGER and 2^256', () => {
    it('computes exact remainders for values beyond 2^256 and 2^1024', () => {
      const m = (2n ** 256n) - 189n; // 256-bit prime
      const q = (2n ** 512n) + 123456789012345678901234567890n;
      const expectedR = (2n ** 255n) + 98765432109876543210987654321n;
      const a = q * m + expectedR;

      assert.equal(moduloBigIntStable(a, m), expectedR);
      assert.equal(moduloBigIntStable(a, -m), expectedR);

      // Negative dividend: -a = (-q - 1) * m + (m - expectedR)
      assert.equal(moduloBigIntStable(-a, m), m - expectedR);
      assert.equal(moduloBigIntStable(-a, -m), m - expectedR);
      assert.equal(moduloBigIntStable(-a, m, { mode: 'truncated' }), -expectedR);
      assert.equal(moduloBigIntStable(a, -m, { mode: 'floored' }), expectedR - m);

      // > 2^1024 case
      const mHuge = (2n ** 1024n) + 643n;
      const aHuge = -(3n * mHuge + 1n);
      assert.equal(moduloBigIntStable(aHuge, mHuge), mHuge - 1n);
      assert.equal(moduloBigIntStable(aHuge, -mHuge), mHuge - 1n);
    });

    it('preserves exact SCALE (10^18) fixed-point positive homogeneity', () => {
      assert.equal(SCALE, 10n ** 18n);
      const pairs = [
        [7n, 3n],
        [-7n, 3n],
        [7n, -3n],
        [-7n, -3n],
        [-(2n ** 260n) + 17n, 2n ** 130n + 29n],
      ];
      for (const mode of ['euclidean', 'floored', 'truncated']) {
        for (const [a, m] of pairs) {
          const rScaled = moduloBigIntStable(a * SCALE, m * SCALE, { mode });
          const rUnscaled = moduloBigIntStable(a, m, { mode });
          assert.equal(rScaled, rUnscaled * SCALE);
        }
      }
    });
  });

  describe('input validation and error handling', () => {
    it('throws RangeError for zero modulus in all modes', () => {
      assert.throws(() => moduloBigIntStable(10n, 0n), RangeError);
      assert.throws(() => moduloBigIntStable(0n, 0n), RangeError);
      assert.throws(() => moduloBigIntStable(-5n, 0n, { mode: 'euclidean' }), RangeError);
      assert.throws(() => moduloBigIntStable(-5n, 0n, { mode: 'floored' }), RangeError);
      assert.throws(() => moduloBigIntStable(-5n, 0n, { mode: 'truncated' }), RangeError);
    });

    it('throws TypeError for non-BigInt dividend a', () => {
      const invalidValues = [0, 7, -3.5, NaN, Infinity, '7', null, undefined, true, {}, [], Object(7n)];
      for (const bad of invalidValues) {
        assert.throws(() => moduloBigIntStable(bad, 3n), TypeError);
      }
    });

    it('throws TypeError for non-BigInt modulus m', () => {
      const invalidValues = [0, 3, -3.5, NaN, Infinity, '3', null, undefined, false, {}, [], Object(3n)];
      for (const bad of invalidValues) {
        assert.throws(() => moduloBigIntStable(7n, bad), TypeError);
      }
    });

    it('throws TypeError for invalid options container or non-string mode', () => {
      assert.throws(() => moduloBigIntStable(7n, 3n, null), TypeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, []), TypeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, 'euclidean'), TypeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, 42), TypeError);

      assert.throws(() => moduloBigIntStable(7n, 3n, { mode: 123 }), TypeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, { mode: null }), TypeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, { mode: {} }), TypeError);
    });

    it('throws RangeError for unsupported mode string', () => {
      assert.throws(() => moduloBigIntStable(7n, 3n, { mode: '' }), RangeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, { mode: 'ceil' }), RangeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, { mode: 'EUCLIDEAN' }), RangeError);
      assert.throws(() => moduloBigIntStable(7n, 3n, { mode: 'floor' }), RangeError);
    });
  });

  describe('independent cross-checks & algebraic identities', () => {
    it('matches independent addition/subtraction brute-force oracles exhaustively on [-25..25] x [-10..10]\\{0}', () => {
      for (let a = -25n; a <= 25n; a += 1n) {
        for (let m = -10n; m <= 10n; m += 1n) {
          if (m === 0n) continue;
          assert.equal(
            moduloBigIntStable(a, m, { mode: 'euclidean' }),
            oracleEuclideanMod(a, m),
            `euclidean mismatch for a=${a}, m=${m}`,
          );
          assert.equal(
            moduloBigIntStable(a, m, { mode: 'floored' }),
            oracleFlooredMod(a, m),
            `floored mismatch for a=${a}, m=${m}`,
          );
          assert.equal(
            moduloBigIntStable(a, m, { mode: 'truncated' }),
            oracleTruncatedMod(a, m),
            `truncated mismatch for a=${a}, m=${m}`,
          );
        }
      }
    });

    it('satisfies the Euclidean division identity a = q * m + r and canonical range on huge & signed inputs', () => {
      const bigValues = [
        0n,
        1n,
        -1n,
        17n,
        -17n,
        (2n ** 64n) - 1n,
        -(2n ** 64n) + 1n,
        (2n ** 256n) + 999999999999999999999n,
        -(2n ** 256n) - 999999999999999999999n,
        (2n ** 400n) - 123456789n,
        -(2n ** 400n) + 123456789n,
      ];
      const moduli = [
        1n,
        -1n,
        2n,
        -2n,
        97n,
        -97n,
        (2n ** 128n) + 51n,
        -((2n ** 128n) + 51n),
        (2n ** 256n) - 189n,
        -((2n ** 256n) - 189n),
      ];

      for (const a of bigValues) {
        for (const m of moduli) {
          const absM = m < 0n ? -m : m;
          const r = moduloBigIntStable(a, m);

          // Range invariant: 0 <= r < |m|
          assert.ok(r >= 0n && r < absM, `range violated for a=${a}, m=${m}, r=${r}`);

          // Divisibility & reconstruction: m | (a - r) and q * m + r === a
          const diff = a - r;
          assert.equal(diff % m, 0n, `m does not divide (a - r) for a=${a}, m=${m}`);
          const q = diff / m;
          assert.equal(q * m + r, a, `division identity failed for a=${a}, m=${m}`);

          // Euclidean divisor-sign invariance: a mod m === a mod (-m)
          assert.equal(moduloBigIntStable(a, -m), r);
        }
      }
    });

    it('satisfies modular arithmetic congruence properties for large signed BigInts', () => {
      const triples = [
        [123456789012345678901234567890n, -98765432109876543210987654321n, 1000000007n],
        [-(2n ** 300n) + 77n, -(2n ** 280n) - 55n, (2n ** 256n) - 189n],
        [(2n ** 310n) - 1n, (2n ** 290n) + 13n, -((2n ** 255n) - 19n)],
        [0n, -(2n ** 260n), (2n ** 127n) - 1n],
        [-1n, -1n, 2n ** 256n],
      ];

      for (const [a, b, m] of triples) {
        const ra = moduloBigIntStable(a, m);
        const rb = moduloBigIntStable(b, m);

        // Addition congruence: (a + b) mod m === ((a mod m) + (b mod m)) mod m
        assert.equal(
          moduloBigIntStable(a + b, m),
          moduloBigIntStable(ra + rb, m),
        );

        // Subtraction congruence: (a - b) mod m === ((a mod m) - (b mod m)) mod m
        assert.equal(
          moduloBigIntStable(a - b, m),
          moduloBigIntStable(ra - rb, m),
        );

        // Multiplication congruence: (a * b) mod m === ((a mod m) * (b mod m)) mod m
        assert.equal(
          moduloBigIntStable(a * b, m),
          moduloBigIntStable(ra * rb, m),
        );

        // Idempotence: (a mod m) mod m === a mod m
        assert.equal(moduloBigIntStable(ra, m), ra);

        // Additive inverse congruence: ((-a) mod m + (a mod m)) mod m === 0n
        const rNegA = moduloBigIntStable(-a, m);
        assert.equal(moduloBigIntStable(rNegA + ra, m), 0n);

        // Periodicity: (a + k * m) mod m === a mod m for large signed k
        const k = -(2n ** 100n) + 37n;
        assert.equal(moduloBigIntStable(a + k * m, m), ra);
      }
    });
  });
});
