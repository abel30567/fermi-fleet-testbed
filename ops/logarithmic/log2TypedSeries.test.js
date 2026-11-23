import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { log2TypedSeries } from './log2TypedSeries.js';

function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15, label = '') {
  const diff = Math.abs(actual - expected);
  const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
  assert.ok(
    diff <= bound,
    `${label ? `${label}: ` : ''}expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`
  );
}

describe('log2TypedSeries', () => {
  it('validates that input is a Float64Array', () => {
    const invalidInputs = [
      null,
      undefined,
      42,
      '123',
      true,
      {},
      [1, 2, 4],
      new Float32Array([1, 2, 4]),
      new Int32Array([1, 2, 4]),
      new Uint8Array([1, 2, 4]),
      new ArrayBuffer(16),
    ];

    for (const bad of invalidInputs) {
      assert.throws(() => log2TypedSeries(bad), TypeError);
    }
  });

  it('handles empty Float64Array and returns a new Float64Array without mutating input', () => {
    const empty = new Float64Array(0);
    const emptyOut = log2TypedSeries(empty);
    assert.ok(emptyOut instanceof Float64Array);
    assert.equal(emptyOut.length, 0);
    assert.notEqual(emptyOut, empty);

    const input = new Float64Array([1, 2, 3, 8]);
    const snapshot = new Float64Array(input);
    const out = log2TypedSeries(input);
    assert.ok(out instanceof Float64Array);
    assert.notEqual(out, input);
    assert.deepEqual(input, snapshot);
  });

  it('computes exact integer results for powers of 2 across normal and subnormal ranges', () => {
    const exponents = [
      -1074, -1073, -1050, -1023, -1022, -500, -53, -10, -1,
      0, 1, 2, 3, 10, 52, 53, 100, 512, 1022, 1023,
    ];
    const input = new Float64Array(exponents.map((e) => 2 ** e));
    const out = log2TypedSeries(input);

    for (let i = 0; i < exponents.length; i += 1) {
      assert.equal(out[i], exponents[i], `2^${exponents[i]}`);
      if (exponents[i] === 0) {
        assert.ok(Object.is(out[i], 0), 'log2(1) should be +0');
      }
    }
  });

  it('handles values <= 0, NaN, and +/-Infinity according to IEEE 754 semantics', () => {
    const input = new Float64Array([0, -0, -1e-300, -1, -42, -Infinity, Infinity, Number.NaN]);
    const out = log2TypedSeries(input);

    assert.equal(out[0], -Infinity);
    assert.equal(out[1], -Infinity);
    assert.ok(Number.isNaN(out[2]));
    assert.ok(Number.isNaN(out[3]));
    assert.ok(Number.isNaN(out[4]));
    assert.ok(Number.isNaN(out[5]));
    assert.equal(out[6], Infinity);
    assert.ok(Number.isNaN(out[7]));
  });

  it('computes accurate values for normal inputs, near-1 values, and range-reduction boundaries', () => {
    const values = [
      0.5 + Number.EPSILON,
      Math.SQRT1_2,
      1 - Number.EPSILON,
      1 + Number.EPSILON,
      1 + 1e-12,
      1 - 1e-12,
      1.25,
      Math.SQRT2 - 1e-15,
      Math.SQRT2,
      Math.SQRT2 + 1e-15,
      1.5,
      1.75,
      2 - Number.EPSILON,
      Math.E,
      3,
      Math.PI,
      10,
      100,
      123456.789,
    ];
    const input = new Float64Array(values);
    const out = log2TypedSeries(input);

    for (let i = 0; i < values.length; i += 1) {
      assertClose(out[i], Math.log2(values[i]), 1e-14, 1e-15, `x=${values[i]}`);
    }
  });

  it('handles subnormal, very small, and very large Float64 values', () => {
    const values = [
      Number.MIN_VALUE, // 2^-1074
      Number.MIN_VALUE * 3,
      Number.MIN_VALUE * 1234567,
      2 ** -1022 - Number.MIN_VALUE, // largest subnormal
      2 ** -1022, // smallest normal
      2 ** -1022 * 1.5,
      1e-308,
      1e-200,
      1e200,
      1e308,
      Number.MAX_VALUE,
    ];
    const input = new Float64Array(values);
    const out = log2TypedSeries(input);

    for (let i = 0; i < values.length; i += 1) {
      assertClose(out[i], Math.log2(values[i]), 1e-14, 1e-15, `x=${values[i]}`);
    }
  });

  it('works on Float64Array subarray views with non-zero byteOffset', () => {
    const backing = new Float64Array([999, 2, 3, 16, 0.25, -5]);
    const view = backing.subarray(1, 5);
    const out = log2TypedSeries(view);

    assert.equal(out.length, 4);
    assert.equal(out[0], 1);
    assertClose(out[1], Math.log2(3), 1e-14, 1e-15);
    assert.equal(out[2], 4);
    assert.equal(out[3], -2);
  });

  it('satisfies independent cross-checks: 2**y === x, product identity, and Math.log2', () => {
    // Deterministic pseudo-random positive values spanning many orders of magnitude
    const samples = [];
    let state = 0x12345678;
    for (let i = 0; i < 200; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      const u = (state + 1) / 4294967297; // in (0, 1)
      const exp = (i % 41) - 20; // -20 .. +20
      samples.push((1 + u) * 10 ** exp);
    }

    const input = new Float64Array(samples);
    const out = log2TypedSeries(input);

    for (let i = 0; i < samples.length; i += 1) {
      const x = samples[i];
      const y = out[i];

      // Cross-check 1: inverse identity 2**y ~= x
      assertClose(2 ** y, x, 1e-12, 0, `2**log2(${x})`);

      // Cross-check 2: reference Math.log2
      assertClose(y, Math.log2(x), 1e-14, 1e-15, `Math.log2(${x})`);
    }

    // Cross-check 3: logarithmic product & quotient identities log2(a*b) = log2(a) + log2(b)
    const a = new Float64Array([1.3, 7.5, 42.1, 0.0037, 1e12]);
    const b = new Float64Array([2.9, 0.4, 9.81, 137.036, 3.14159]);
    const prod = new Float64Array(a.length);
    const quot = new Float64Array(a.length);
    for (let i = 0; i < a.length; i += 1) {
      prod[i] = a[i] * b[i];
      quot[i] = a[i] / b[i];
    }

    const logA = log2TypedSeries(a);
    const logB = log2TypedSeries(b);
    const logProd = log2TypedSeries(prod);
    const logQuot = log2TypedSeries(quot);

    for (let i = 0; i < a.length; i += 1) {
      assertClose(logProd[i], logA[i] + logB[i], 1e-13, 1e-14, `product[${i}]`);
      assertClose(logQuot[i], logA[i] - logB[i], 1e-13, 1e-14, `quotient[${i}]`);
    }
  });
});
