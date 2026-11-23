import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vectorAddIntervalRecursive } from './vectorAddIntervalRecursive.js';

const f64Buf = new Float64Array(1);
const u64Buf = new BigUint64Array(f64Buf.buffer);

/**
 * Converts a finite IEEE-754 binary64 number `x` to an exact BigInt representing
 * `x * 2^1074` (since every finite binary64 value is an integer multiple of 2^-1074).
 *
 * @param {number} x
 * @returns {bigint}
 */
function toExactScaledBigInt(x) {
  assert.ok(Number.isFinite(x), `Expected finite number, got ${x}`);
  f64Buf[0] = x;
  const bits = u64Buf[0];
  const sign = bits >> 63n;
  const exp = (bits >> 52n) & 0x7ffn;
  const frac = bits & 0x000f_ffff_ffff_ffffn;

  let mag;
  if (exp === 0n) {
    // Zero or subnormal: value = frac * 2^-1074
    mag = frac;
  } else {
    // Normal: value = (2^52 + frac) * 2^(exp - 1023 - 52) = ((2^52 + frac) << (exp - 1)) * 2^-1074
    mag = (0x0010_0000_0000_0000n + frac) << (exp - 1n);
  }
  return sign === 1n ? -mag : mag;
}

/**
 * Returns the adjacent IEEE-754 binary64 value one ULP upward (for tightness checks).
 *
 * @param {number} x
 * @returns {number}
 */
function stepUp(x) {
  if (x === Infinity) return Infinity;
  if (x === 0) return Number.MIN_VALUE;
  f64Buf[0] = x;
  u64Buf[0] = x > 0 ? u64Buf[0] + 1n : u64Buf[0] - 1n;
  return f64Buf[0];
}

/**
 * Returns the adjacent IEEE-754 binary64 value one ULP downward (for tightness checks).
 *
 * @param {number} x
 * @returns {number}
 */
function stepDown(x) {
  if (x === -Infinity) return -Infinity;
  if (x === 0) return -Number.MIN_VALUE;
  f64Buf[0] = x;
  u64Buf[0] = x > 0 ? u64Buf[0] - 1n : u64Buf[0] + 1n;
  return f64Buf[0];
}

/**
 * Independent BigInt exact-rational verification that `[resLo, resHi]` is both
 * a valid outward enclosure AND optimal (tight to 0 ULP) for `[aLo, aHi] + [bLo, bHi]`.
 */
function assertExactOptimalEnclosure([aLo, aHi], [bLo, bHi], [resLo, resHi]) {
  assert.ok(resLo <= resHi, `Result interval inverted: [${resLo}, ${resHi}]`);

  const exactLo = toExactScaledBigInt(aLo) + toExactScaledBigInt(bLo);
  const exactHi = toExactScaledBigInt(aHi) + toExactScaledBigInt(bHi);

  if (resLo === -Infinity) {
    assert.ok(exactLo < toExactScaledBigInt(-Number.MAX_VALUE));
  } else {
    const loScaled = toExactScaledBigInt(resLo);
    assert.ok(loScaled <= exactLo, `Lower bound ${resLo} does not enclose exact sum`);
    if (loScaled < exactLo) {
      const next = stepUp(resLo);
      assert.ok(
        next === Infinity || toExactScaledBigInt(next) > exactLo,
        `Lower bound ${resLo} is not tight`
      );
    }
  }

  if (resHi === Infinity) {
    assert.ok(exactHi > toExactScaledBigInt(Number.MAX_VALUE));
  } else {
    const hiScaled = toExactScaledBigInt(resHi);
    assert.ok(hiScaled >= exactHi, `Upper bound ${resHi} does not enclose exact sum`);
    if (hiScaled > exactHi) {
      const prev = stepDown(resHi);
      assert.ok(
        prev === -Infinity || toExactScaledBigInt(prev) < exactHi,
        `Upper bound ${resHi} is not tight`
      );
    }
  }
}

describe('vectorAddIntervalRecursive', () => {
  it('adds exact integer-valued interval vectors without widening', () => {
    const a = [
      [1, 2],
      [3, 5],
      [10, 20],
    ];
    const b = [
      [4, 6],
      [7, 9],
      [30, 40],
    ];
    const res = vectorAddIntervalRecursive(a, b);
    assert.deepEqual(res, [
      [5, 8],
      [10, 14],
      [40, 60],
    ]);
  });

  it('handles empty vectors and length-1 vectors', () => {
    assert.deepEqual(vectorAddIntervalRecursive([], []), []);
    assert.deepEqual(vectorAddIntervalRecursive([[2, 3]], [[5, 7]]), [[7, 10]]);
  });

  it('outwardly rounds inexact floating-point sums like 0.1 + 0.2', () => {
    const a = [[0.1, 0.1], [1e16, 1e16], [-0.1, -0.1]];
    const b = [[0.2, 0.2], [1, 1], [-0.2, -0.2]];
    const res = vectorAddIntervalRecursive(a, b);

    // 0.1 + 0.2 in IEEE-754 rounds up to 0.30000000000000004, so outward bounds must widen downward
    assert.equal(res[0][0], 0.3);
    assert.equal(res[0][1], 0.1 + 0.2);
    assert.ok(res[0][0] < res[0][1]);

    // 1e16 + 1 rounds down to 1e16 in round-to-nearest-even (even significand), so upper bound widens upward
    assert.equal(res[1][0], 1e16);
    assert.equal(res[1][1], stepUp(1e16));
    assert.ok(res[1][0] < res[1][1]);

    // Symmetric negative case
    assert.equal(res[2][0], -(0.1 + 0.2));
    assert.equal(res[2][1], -0.3);

    for (let i = 0; i < a.length; i++) {
      assertExactOptimalEnclosure(a[i], b[i], res[i]);
    }
  });

  it('handles negative, zero-straddling, cancelling, and signed-zero components', () => {
    const a = [
      [-5, 3],
      [-0, 0],
      [-1.5, -0.25],
      [-1e-300, 1e-300],
      [Number.MIN_VALUE, Number.MIN_VALUE],
    ];
    const b = [
      [-2, 4],
      [-0, -0],
      [0.25, 1.5],
      [1, 1],
      [-Number.MIN_VALUE, Number.MIN_VALUE],
    ];
    const res = vectorAddIntervalRecursive(a, b);

    assert.deepEqual(res[0], [-7, 7]);
    assert.equal(Object.is(res[1][0], 0), true);
    assert.equal(Object.is(res[1][1], 0), true);
    assert.deepEqual(res[2], [-1.25, 1.25]);
    // 1 + (-1e-300) < 1 so lower bound must be nextDown(1); 1 + 1e-300 > 1 so upper bound must be nextUp(1)
    assert.equal(res[3][0], stepDown(1));
    assert.equal(res[3][1], stepUp(1));
    assert.deepEqual(res[4], [0, 2 * Number.MIN_VALUE]);

    for (let i = 0; i < a.length; i++) {
      assertExactOptimalEnclosure(a[i], b[i], res[i]);
    }
  });

  it('handles overflow at binary64 limits with exact outward bounds', () => {
    const max = Number.MAX_VALUE;
    const a = [
      [max, max],
      [-max, -max],
      [-max, max],
    ];
    const b = [
      [max, max],
      [-max, -max],
      [-1e292, 1e292],
    ];
    const res = vectorAddIntervalRecursive(a, b);

    assert.deepEqual(res[0], [max, Infinity]);
    assert.deepEqual(res[1], [-Infinity, -max]);
    assert.deepEqual(res[2], [-Infinity, Infinity]);

    for (let i = 0; i < a.length; i++) {
      assertExactOptimalEnclosure(a[i], b[i], res[i]);
    }
  });

  it('handles odd, power-of-two, and large vectors across recursive splits', () => {
    const n = 2049;
    const a = new Array(n);
    const b = new Array(n);
    for (let i = 0; i < n; i++) {
      const base = (i - 1024) * 0.1;
      a[i] = [base - 0.3, base + 0.7];
      b[i] = [i * 0.2 - 50.1, i * 0.2 + 50.3];
    }

    const res = vectorAddIntervalRecursive(a, b);
    assert.equal(res.length, n);
    for (let i = 0; i < n; i++) {
      assertExactOptimalEnclosure(a[i], b[i], res[i]);
    }
  });

  it('does not mutate input vectors or intervals', () => {
    const a = [[0.1, 0.2], [-3, 4]];
    const b = [[0.2, 0.3], [1, 2]];
    const aSnap = structuredClone(a);
    const bSnap = structuredClone(b);

    vectorAddIntervalRecursive(a, b);

    assert.deepEqual(a, aSnap);
    assert.deepEqual(b, bSnap);
  });

  it('independent cross-check: exact BigInt rational enclosure + commutativity + associativity enclosure', () => {
    // Deterministic PRNG (Mulberry32) for reproducible stress testing across scales
    let seed = 0x12345678;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    const makeVal = () => {
      const r = rand();
      if (r < 0.15) return (rand() - 0.5) * 1e-305; // near subnormal
      if (r < 0.3) return (rand() - 0.5) * 1e16; // large magnitude
      if (r < 0.45) return (rand() - 0.5) * 1e-16; // tiny perturbation
      return (rand() - 0.5) * 1000;
    };

    const n = 257;
    const a = [];
    const b = [];
    const c = [];
    for (let i = 0; i < n; i++) {
      const mkIv = () => {
        const u = makeVal();
        const v = makeVal();
        return u <= v ? [u, v] : [v, u];
      };
      a.push(mkIv());
      b.push(mkIv());
      c.push(mkIv());
    }

    const ab = vectorAddIntervalRecursive(a, b);
    const ba = vectorAddIntervalRecursive(b, a);

    // Commutativity: a + b === b + a bit-for-bit
    assert.deepEqual(ab, ba);

    // Exact BigInt rational enclosure & tightness for every component
    for (let i = 0; i < n; i++) {
      assertExactOptimalEnclosure(a[i], b[i], ab[i]);
    }

    // 3-way exact rational sum enclosure for both (a + b) + c and a + (b + c)
    const ab_c = vectorAddIntervalRecursive(ab, c);
    const a_bc = vectorAddIntervalRecursive(a, vectorAddIntervalRecursive(b, c));
    for (let i = 0; i < n; i++) {
      const exactLo =
        toExactScaledBigInt(a[i][0]) +
        toExactScaledBigInt(b[i][0]) +
        toExactScaledBigInt(c[i][0]);
      const exactHi =
        toExactScaledBigInt(a[i][1]) +
        toExactScaledBigInt(b[i][1]) +
        toExactScaledBigInt(c[i][1]);

      assert.ok(toExactScaledBigInt(ab_c[i][0]) <= exactLo);
      assert.ok(toExactScaledBigInt(ab_c[i][1]) >= exactHi);
      assert.ok(toExactScaledBigInt(a_bc[i][0]) <= exactLo);
      assert.ok(toExactScaledBigInt(a_bc[i][1]) >= exactHi);
    }
  });

  it('rejects invalid inputs with appropriate errors', () => {
    // Non-array top-level inputs
    assert.throws(() => vectorAddIntervalRecursive(null, []), TypeError);
    assert.throws(() => vectorAddIntervalRecursive([], 'not-array'), TypeError);
    assert.throws(() => vectorAddIntervalRecursive({}, []), TypeError);

    // Mismatched lengths
    assert.throws(() => vectorAddIntervalRecursive([[0, 1]], []), RangeError);
    assert.throws(() => vectorAddIntervalRecursive([[0, 1]], [[0, 1], [2, 3]]), RangeError);

    // Malformed interval entries
    assert.throws(() => vectorAddIntervalRecursive([123], [[0, 1]]), TypeError);
    assert.throws(() => vectorAddIntervalRecursive([[0, 1]], [null]), TypeError);
    assert.throws(() => vectorAddIntervalRecursive([[0]], [[0, 1]]), RangeError);
    assert.throws(() => vectorAddIntervalRecursive([[0, 1, 2]], [[0, 1]]), RangeError);
    assert.throws(() => vectorAddIntervalRecursive([['0', 1]], [[0, 1]]), TypeError);
    assert.throws(() => vectorAddIntervalRecursive([[0, 1]], [[0, undefined]]), TypeError);

    // Non-finite endpoints
    assert.throws(() => vectorAddIntervalRecursive([[NaN, 1]], [[0, 1]]), RangeError);
    assert.throws(() => vectorAddIntervalRecursive([[0, NaN]], [[0, 1]]), RangeError);
    assert.throws(() => vectorAddIntervalRecursive([[-Infinity, 1]], [[0, 1]]), RangeError);
    assert.throws(() => vectorAddIntervalRecursive([[0, 1]], [[0, Infinity]]), RangeError);

    // Inverted intervals (lo > hi)
    assert.throws(() => vectorAddIntervalRecursive([[2, 1]], [[0, 1]]), RangeError);
    assert.throws(
      () => vectorAddIntervalRecursive([[0, 1], [0, 1]], [[0, 1], [5, -5]]),
      RangeError
    );

    // Sparse array holes
    const sparse = new Array(2);
    sparse[0] = [0, 1];
    assert.throws(() => vectorAddIntervalRecursive(sparse, [[0, 1], [0, 1]]), TypeError);
  });
});
