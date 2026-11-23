import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { moduloTypedMemo } from './moduloTypedMemo.js';

/**
 * Independent BigInt reference for discrete (floored) modulo on integers.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function bigIntFlooredMod(a, b) {
  const A = BigInt(a);
  const B = BigInt(b);
  let r = A % B;
  if (r !== 0n && (r < 0n) !== (B < 0n)) {
    r += B;
  }
  return Number(r);
}

describe('moduloTypedMemo', () => {
  it('computes element-wise discrete modulo for positive and negative integers in table range', () => {
    const a = new Float64Array([7, -7, 0, -6, 64, -64, 15, -1]);
    const b = new Float64Array([3, 3, 5, 3, 7, 7, 15, 64]);
    const res = moduloTypedMemo(a, b);

    assert.ok(res instanceof Float64Array);
    assert.deepStrictEqual(Array.from(res), [1, 2, 0, 0, 1, 6, 0, 63]);
  });

  it('handles negative moduli using floored discrete modulo semantics', () => {
    const a = new Float64Array([7, -7, 6, -6, 0, -1]);
    const b = new Float64Array([-3, -3, -3, -3, -5, -4]);
    const res = moduloTypedMemo(a, b);

    assert.deepStrictEqual(Array.from(res), [-2, -1, 0, 0, 0, -1]);
    for (const v of res) {
      if (v === 0) {
        assert.ok(Object.is(v, 0), 'zero results must be normalized to +0');
      }
    }
  });

  it('normalizes -0 inputs and exact-multiple negative dividends to +0', () => {
    const a = new Float64Array([-0, -0, -12, -1000, 1000]);
    const b = new Float64Array([5, -5, 4, 250, -250]);
    const res = moduloTypedMemo(a, b);

    for (let i = 0; i < res.length; i += 1) {
      assert.ok(Object.is(res[i], 0), `index ${i} expected +0, got ${res[i]}`);
    }
  });

  it('handles non-integer floating-point operands and tiny negative underflow', () => {
    const a = new Float64Array([5.5, -5.5, 5.5, -5.5, -1e-20, 1e-20]);
    const b = new Float64Array([2, 2, -2, -2, 3, -3]);
    const res = moduloTypedMemo(a, b);

    assert.equal(res[0], 1.5);
    assert.equal(res[1], 0.5);
    assert.equal(res[2], -0.5);
    assert.equal(res[3], -1.5);
    assert.ok(Object.is(res[4], 0), 'tiny negative dividend mod positive should clamp to +0');
    assert.ok(Object.is(res[5], 0), 'tiny positive dividend mod negative should clamp to +0');
  });

  it('handles zero modulus, NaN, and Infinity edge cases', () => {
    const a = new Float64Array([5, 5, NaN, 5, Infinity, -Infinity, 5, -5, 5, -5]);
    const b = new Float64Array([0, -0, 3, NaN, 3, 3, Infinity, Infinity, -Infinity, -Infinity]);
    const res = moduloTypedMemo(a, b);

    assert.ok(Number.isNaN(res[0]));
    assert.ok(Number.isNaN(res[1]));
    assert.ok(Number.isNaN(res[2]));
    assert.ok(Number.isNaN(res[3]));
    assert.ok(Number.isNaN(res[4]));
    assert.ok(Number.isNaN(res[5]));
    assert.equal(res[6], 5);
    assert.equal(res[7], Infinity);
    assert.equal(res[8], -Infinity);
    assert.equal(res[9], -5);
  });

  it('handles empty Float64Arrays and does not mutate inputs', () => {
    const emptyA = new Float64Array(0);
    const emptyB = new Float64Array(0);
    const emptyRes = moduloTypedMemo(emptyA, emptyB);
    assert.ok(emptyRes instanceof Float64Array);
    assert.equal(emptyRes.length, 0);

    const a = new Float64Array([10, -10, 1000]);
    const b = new Float64Array([3, 3, 97]);
    const res = moduloTypedMemo(a, b);
    assert.notStrictEqual(res, a);
    assert.notStrictEqual(res, b);
    assert.deepStrictEqual(Array.from(a), [10, -10, 1000]);
    assert.deepStrictEqual(Array.from(b), [3, 3, 97]);
    assert.deepStrictEqual(Array.from(res), [1, 2, 30]);
  });

  it('validates input types and array lengths', () => {
    const valid = new Float64Array([1, 2]);
    assert.throws(() => moduloTypedMemo([1, 2], valid), TypeError);
    assert.throws(() => moduloTypedMemo(valid, [1, 2]), TypeError);
    assert.throws(() => moduloTypedMemo(new Int32Array([1, 2]), valid), TypeError);
    assert.throws(() => moduloTypedMemo(valid, new Float32Array([1, 2])), TypeError);
    assert.throws(() => moduloTypedMemo(null, valid), TypeError);
    assert.throws(() => moduloTypedMemo(valid, undefined), TypeError);
    assert.throws(
      () => moduloTypedMemo(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
      RangeError,
    );
  });

  it('cross-checks the entire precomputed table [-64, 64] x [1, 64] against BigInt reference', () => {
    const total = 129 * 64;
    const a = new Float64Array(total);
    const b = new Float64Array(total);
    let idx = 0;
    for (let x = -64; x <= 64; x += 1) {
      for (let y = 1; y <= 64; y += 1) {
        a[idx] = x;
        b[idx] = y;
        idx += 1;
      }
    }

    const res = moduloTypedMemo(a, b);
    for (let i = 0; i < total; i += 1) {
      const expected = bigIntFlooredMod(a[i], b[i]);
      assert.equal(
        res[i],
        expected,
        `table mismatch at (${a[i]}, ${b[i]}): got ${res[i]}, expected ${expected}`,
      );
    }
  });

  it('cross-checks large safe integers, memoized hits, and cache eviction (>4096 entries) against BigInt reference', () => {
    const n = 5000;
    const a = new Float64Array(n);
    const b = new Float64Array(n);

    // Populate >4096 unique pairs plus large safe integers and repeats
    for (let i = 0; i < n; i += 1) {
      if (i < 4500) {
        const signA = i % 2 === 0 ? 1 : -1;
        const signB = i % 3 === 0 ? -1 : 1;
        a[i] = signA * (1000 + i * 37);
        b[i] = signB * (65 + (i % 500));
      } else if (i < 4510) {
        // Extreme safe integers
        const offset = i - 4500;
        a[i] = (offset % 2 === 0 ? 1 : -1) * (Number.MAX_SAFE_INTEGER - offset);
        b[i] = (offset % 3 === 0 ? -1 : 1) * (97 + offset * 13);
      } else {
        // Repeated pairs to exercise memoized cache hits
        const src = i - 4510;
        a[i] = a[src];
        b[i] = b[src];
      }
    }

    const res1 = moduloTypedMemo(a, b);
    const res2 = moduloTypedMemo(a, b);

    for (let i = 0; i < n; i += 1) {
      const expected = bigIntFlooredMod(a[i], b[i]);
      assert.equal(res1[i], expected, `mismatch at index ${i} for (${a[i]}, ${b[i]})`);
      assert.equal(res2[i], expected, `repeat call mismatch at index ${i}`);
    }
  });

  it('satisfies the floored division identity a = floor(a / b) * b + r for general floats', () => {
    const a = new Float64Array([100.25, -100.25, 100.25, -100.25, 0.75, -0.75, 12345.625, -12345.625]);
    const b = new Float64Array([7.5, 7.5, -7.5, -7.5, 0.25, 0.25, 13.5, -13.5]);
    const res = moduloTypedMemo(a, b);

    for (let i = 0; i < a.length; i += 1) {
      const q = Math.floor(a[i] / b[i]);
      const reconstructed = q * b[i] + res[i];
      assert.ok(
        Math.abs(reconstructed - a[i]) <= 1e-12,
        `identity failed at ${i}: ${q} * ${b[i]} + ${res[i]} !== ${a[i]}`,
      );
      assert.ok(Math.abs(res[i]) < Math.abs(b[i]), `|r| >= |b| at ${i}`);
      if (res[i] !== 0) {
        assert.equal(res[i] < 0, b[i] < 0, `sign mismatch at ${i}`);
      }
    }
  });
});
