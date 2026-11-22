import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorBitsetRecursive } from './xorBitsetRecursive.js';

/**
 * Deterministic pseudo-random BigInt generator for reproducible cross-checks.
 * Uses a 64-bit LCG stepped across 64-bit chunks to build arbitrary bit widths.
 *
 * @param {bigint} seed
 * @returns {(bits: number) => bigint}
 */
function createBigIntRng(seed) {
  let state = seed & ((1n << 64n) - 1n);
  const mult = 6364136223846793005n;
  const inc = 1442695040888963407n;
  const mask64 = (1n << 64n) - 1n;

  function next64() {
    state = (state * mult + inc) & mask64;
    return state;
  }

  return function nextBits(bits) {
    if (bits <= 0) {
      return 0n;
    }
    let result = 0n;
    let remaining = bits;
    while (remaining > 0) {
      const chunk = remaining >= 64 ? 64 : remaining;
      const val = next64() >> BigInt(64 - chunk);
      result = (result << BigInt(chunk)) + val;
      remaining -= chunk;
    }
    return result;
  };
}

describe('xorBitsetRecursive', () => {
  it('computes 1-bit XOR truth table accurately', () => {
    assert.equal(xorBitsetRecursive(0n, 0n), 0n);
    assert.equal(xorBitsetRecursive(0n, 1n), 1n);
    assert.equal(xorBitsetRecursive(1n, 0n), 1n);
    assert.equal(xorBitsetRecursive(1n, 1n), 0n);
  });

  it('computes XOR for normal multi-bit bitsets of equal and unequal widths', () => {
    assert.equal(xorBitsetRecursive(0b101010n, 0b110011n), 0b011001n);
    assert.equal(xorBitsetRecursive(0b11111n, 0b10n), 0b11101n);
    assert.equal(xorBitsetRecursive(0b101n, 0b100000101n), 0b100000000n);
    assert.equal(xorBitsetRecursive(0xdeadbeefn, 0xcafebaben), 0x14530451n);
    assert.equal(xorBitsetRecursive((1n << 64n) - 1n, 1n << 32n), ((1n << 64n) - 1n) ^ (1n << 32n));
  });

  it('satisfies 0n identity on both sides', () => {
    const samples = [0n, 1n, 42n, (1n << 127n) - 1n, (1n << 600n) + 0x123456789abcdef0n];
    for (const x of samples) {
      assert.equal(xorBitsetRecursive(x, 0n), x);
      assert.equal(xorBitsetRecursive(0n, x), x);
    }
  });

  it('satisfies self-XOR equals 0n', () => {
    const samples = [0n, 1n, 0b10110111001n, (1n << 256n) - 1n, (1n << 777n) + (1n << 333n) + 1n];
    for (const x of samples) {
      assert.equal(xorBitsetRecursive(x, x), 0n);
    }
  });

  it('satisfies commutativity, associativity, and involution', () => {
    const a = 0x123456789abcdef0fedcba9876543210n;
    const b = 0x0f0f0f0f0f0f0f0ff0f0f0f0f0f0f0f0n;
    const c = (1n << 550n) + 0xabcdef1234567890n;

    // Commutativity
    assert.equal(xorBitsetRecursive(a, b), xorBitsetRecursive(b, a));
    assert.equal(xorBitsetRecursive(b, c), xorBitsetRecursive(c, b));

    // Associativity
    assert.equal(
      xorBitsetRecursive(xorBitsetRecursive(a, b), c),
      xorBitsetRecursive(a, xorBitsetRecursive(b, c)),
    );

    // Involution: (a XOR b) XOR b === a
    assert.equal(xorBitsetRecursive(xorBitsetRecursive(a, b), b), a);
    assert.equal(xorBitsetRecursive(xorBitsetRecursive(c, a), a), c);
  });

  it('handles very wide bitsets (> 512 bits)', () => {
    // 513-bit, 640-bit, 1024-bit, and 2048-bit patterns
    const allOnes513 = (1n << 513n) - 1n;
    const evenBits513 = BigInt(`0x${'5'.repeat(128)}`) | (1n << 512n);
    assert.equal(xorBitsetRecursive(allOnes513, evenBits513), allOnes513 ^ evenBits513);

    const wideA = (1n << 1024n) - 1n;
    const wideB = (1n << 1023n) + (1n << 700n) + (1n << 513n) + (1n << 256n) + 1n;
    assert.equal(xorBitsetRecursive(wideA, wideB), wideA ^ wideB);

    // Highly asymmetric widths (2048-bit vs 9-bit)
    const huge = ((1n << 2048n) - 1n) - (1n << 1000n);
    const tiny = 0b101101011n;
    assert.equal(xorBitsetRecursive(huge, tiny), huge ^ tiny);
    assert.equal(xorBitsetRecursive(tiny, huge), tiny ^ huge);
  });

  it('matches native BigInt ^ operator across pseudo-random widths up to 1024 bits', () => {
    const rng = createBigIntRng(0x5eed1234abcd5678n);
    const widths = [1, 2, 3, 5, 8, 15, 16, 31, 63, 64, 127, 255, 512, 513, 768, 1024];

    for (const wA of widths) {
      for (const wB of [wA, Math.max(1, wA >> 1), wA + 7]) {
        const a = rng(wA);
        const b = rng(wB);
        assert.equal(
          xorBitsetRecursive(a, b),
          a ^ b,
          `Mismatch for widths (${wA}, ${wB})`,
        );
      }
    }
  });

  it('throws TypeError for non-BigInt inputs', () => {
    const invalidInputs = [0, 1, 42, -1, NaN, Infinity, '0', '1n', null, undefined, true, false, {}, []];

    for (const bad of invalidInputs) {
      assert.throws(() => xorBitsetRecursive(bad, 0n), TypeError);
      assert.throws(() => xorBitsetRecursive(0n, bad), TypeError);
    }
    assert.throws(() => xorBitsetRecursive(), TypeError);
  });

  it('throws RangeError for negative BigInt inputs', () => {
    const negativeInputs = [-1n, -2n, -42n, -(1n << 600n)];

    for (const neg of negativeInputs) {
      assert.throws(() => xorBitsetRecursive(neg, 0n), RangeError);
      assert.throws(() => xorBitsetRecursive(0n, neg), RangeError);
      assert.throws(() => xorBitsetRecursive(neg, neg), RangeError);
    }
  });
});
