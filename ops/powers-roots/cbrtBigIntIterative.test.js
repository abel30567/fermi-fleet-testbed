import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cbrtBigIntIterative } from './cbrtBigIntIterative.js';

const SCALE = 10n ** 18n;
const SCALE_CUBED = SCALE ** 3n;

/**
 * Independent reference implementation via binary search for cross-checking.
 * Computes sign(x) * floor((|x| * 10^54)^(1/3)).
 *
 * @param {bigint} x
 * @returns {bigint}
 */
function cbrtBinarySearchRef(x) {
  if (x === 0n) return 0n;
  const neg = x < 0n;
  const m = (neg ? -x : x) * SCALE_CUBED;
  let lo = 0n;
  let hi = 1n << ((BigInt(m.toString(2).length) + 2n) / 3n);
  while (lo < hi) {
    const mid = (lo + hi + 1n) >> 1n;
    if (mid * mid * mid <= m) {
      lo = mid;
    } else {
      hi = mid - 1n;
    }
  }
  return neg ? -lo : lo;
}

/**
 * Verifies the exact algebraic bracket invariant for fixed-point truncated cbrt:
 * |r|^3 <= |x| * 10^54 < (|r| + 1)^3, with matching sign.
 */
function assertCbrtBracket(x, result) {
  if (x === 0n) {
    assert.equal(result, 0n);
    return;
  }
  assert.equal(result < 0n, x < 0n, `Sign mismatch for x=${x}`);
  const absX = x < 0n ? -x : x;
  const absR = result < 0n ? -result : result;
  const scaled = absX * SCALE_CUBED;
  assert.ok(absR ** 3n <= scaled, `Lower bound failed for x=${x}: ${absR}^3 > ${scaled}`);
  assert.ok((absR + 1n) ** 3n > scaled, `Upper bound failed for x=${x}: (${absR}+1)^3 <= ${scaled}`);
}

describe('cbrtBigIntIterative', () => {
  it('handles zero and unit values', () => {
    assert.equal(cbrtBigIntIterative(0n), 0n);
    assert.equal(cbrtBigIntIterative(1n), SCALE);
    assert.equal(cbrtBigIntIterative(-1n), -SCALE);
  });

  it('computes exact results for positive and negative perfect cubes', () => {
    const roots = [2n, 3n, 4n, 5n, 10n, 42n, 1000n, 123456789n, 10n ** 20n];
    for (const k of roots) {
      assert.equal(cbrtBigIntIterative(k ** 3n), k * SCALE);
      assert.equal(cbrtBigIntIterative(-(k ** 3n)), -k * SCALE);
    }
  });

  it('computes accurate 18-decimal fixed-point results for non-cubes', () => {
    // cbrt(2) = 1.2599210498948731647672...
    assert.equal(cbrtBigIntIterative(2n), 1_259_921_049_894_873_164n);
    assert.equal(cbrtBigIntIterative(-2n), -1_259_921_049_894_873_164n);
    // cbrt(3) = 1.4422495703074083823216...
    assert.equal(cbrtBigIntIterative(3n), 1_442_249_570_307_408_382n);
    // cbrt(10) = 2.1544346900318837217592...
    assert.equal(cbrtBigIntIterative(10n), 2_154_434_690_031_883_721n);
    assert.equal(cbrtBigIntIterative(-10n), -2_154_434_690_031_883_721n);
  });

  it('handles boundary integers immediately around perfect cubes (k^3 - 1, k^3, k^3 + 1)', () => {
    const ks = [1n, 2n, 3n, 10n, 999n, 10n ** 12n, 10n ** 25n];
    for (const k of ks) {
      const cube = k ** 3n;
      for (const delta of [-1n, 0n, 1n]) {
        const pos = cube + delta;
        const neg = -pos;
        assertCbrtBracket(pos, cbrtBigIntIterative(pos));
        assertCbrtBracket(neg, cbrtBigIntIterative(neg));
      }
    }
  });

  it('handles very large BigInt inputs without overflow or precision loss', () => {
    const hugeValues = [
      10n ** 50n,
      -(10n ** 50n),
      (1n << 256n) - 1n,
      -(1n << 300n),
      10n ** 120n + 1234567890123456789n,
    ];
    for (const x of hugeValues) {
      const res = cbrtBigIntIterative(x);
      assertCbrtBracket(x, res);
    }
  });

  it('matches independent binary-search reference implementation across varied inputs', () => {
    const samples = [
      0n, 1n, -1n, 2n, -2n, 7n, -7n, 8n, -8n, 9n, -9n,
      26n, 27n, 28n, -26n, -27n, -28n,
      100n, -100n, 999_999n, 1_000_000n, 1_000_001n,
      2n ** 64n - 1n, -(2n ** 64n), 2n ** 128n + 7n,
      10n ** 60n + 42n, -(10n ** 75n - 1n),
    ];
    for (const x of samples) {
      assert.equal(cbrtBigIntIterative(x), cbrtBinarySearchRef(x), `Mismatch with binary search for x=${x}`);
    }
  });

  it('cross-checks against Math.cbrt within IEEE-754 double precision', () => {
    const inputs = [-1_000_000_000, -123456, -17, -2, 0, 2, 17, 123456, 1_000_000_000, 9_007_199_254_740_991];
    for (const n of inputs) {
      const got = Number(cbrtBigIntIterative(BigInt(n))) / 1e18;
      const expected = Math.cbrt(n);
      const tol = Math.max(1e-12, Math.abs(expected) * 1e-13);
      assert.ok(Math.abs(got - expected) <= tol, `Math.cbrt mismatch for ${n}: got=${got}, expected=${expected}`);
    }
  });

  it('satisfies odd symmetry and monotonicity', () => {
    const xs = [-1000n, -28n, -27n, -26n, -2n, -1n, 0n, 1n, 2n, 26n, 27n, 28n, 1000n];
    for (let i = 0; i < xs.length; i++) {
      assert.equal(cbrtBigIntIterative(-xs[i]), -cbrtBigIntIterative(xs[i]));
      if (i > 0) {
        assert.ok(cbrtBigIntIterative(xs[i - 1]) <= cbrtBigIntIterative(xs[i]));
      }
    }
  });

  it('rejects non-BigInt inputs with TypeError', () => {
    const invalid = [0, 8, -27, 2.5, NaN, Infinity, '8', null, undefined, true, {}, [], Symbol('x')];
    for (const val of invalid) {
      assert.throws(() => cbrtBigIntIterative(val), TypeError);
    }
  });
});
