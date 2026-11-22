import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorBitsetSeries } from './xorBitsetSeries.js';

/**
 * Pure arithmetic bit-plane series reference implementation using zero bitwise operators:
 *   sum_{k >= 0} (a_k + b_k - 2 * a_k * b_k) * 2^k
 *
 * @param {bigint} a
 * @param {bigint} b
 * @returns {bigint}
 */
function naiveBitPlaneXorSeries(a, b) {
  let remA = a;
  let remB = b;
  let weight = 1n;
  let sum = 0n;

  while (remA > 0n || remB > 0n) {
    const bitA = remA % 2n;
    const bitB = remB % 2n;
    const term = bitA + bitB - 2n * bitA * bitB;
    sum += term * weight;
    remA /= 2n;
    remB /= 2n;
    weight *= 2n;
  }

  return sum;
}

/**
 * Deterministic LCG generator producing non-negative BigInts of up to `bits` width.
 *
 * @param {bigint} seed
 * @returns {(bits: number) => bigint}
 */
function makePrng(seed = 0x123456789abcdef0n) {
  let state = seed;
  const MOD = 1n << 64n;
  const MUL = 6364136223846793005n;
  const INC = 1442695040888963407n;

  function next64() {
    state = (state * MUL + INC) % MOD;
    return state;
  }

  return function nextBigInt(bits) {
    let value = 0n;
    let remaining = bits;
    while (remaining > 0) {
      const chunk = remaining >= 64 ? 64 : remaining;
      const mask = (1n << BigInt(chunk)) - 1n;
      value = (value << BigInt(chunk)) | (next64() & mask);
      remaining -= chunk;
    }
    return value;
  };
}

describe('xorBitsetSeries', () => {
  describe('normal cases', () => {
    it('matches the 1-bit XOR truth table', () => {
      assert.equal(xorBitsetSeries(0n, 0n), 0n);
      assert.equal(xorBitsetSeries(0n, 1n), 1n);
      assert.equal(xorBitsetSeries(1n, 0n), 1n);
      assert.equal(xorBitsetSeries(1n, 1n), 0n);
    });

    it('computes symmetric difference for multi-bit bitsets', () => {
      assert.equal(xorBitsetSeries(0b1010n, 0b1100n), 0b0110n);
      assert.equal(xorBitsetSeries(0b11110000n, 0b10101010n), 0b01011010n);
      assert.equal(xorBitsetSeries(0xdeadbeefn, 0xcafebaben), 0x14530451n);
    });

    it('reduces to addition for disjoint bitsets and subtraction for subsets', () => {
      const evenBits = 0x5555555555555555n;
      const oddBits = 0xaaaaaaaaaaaaaaaan;
      assert.equal(xorBitsetSeries(evenBits, oddBits), evenBits + oddBits);

      const superset = 0b11111111n;
      const subset = 0b00101101n;
      assert.equal(xorBitsetSeries(superset, subset), superset - subset);
    });
  });

  describe('edge cases', () => {
    it('satisfies zero identity xor(a, 0n) === a and xor(0n, a) === a', () => {
      const samples = [0n, 1n, 42n, (1n << 64n) - 1n, (1n << 512n) + 123456789n];
      for (const a of samples) {
        assert.equal(xorBitsetSeries(a, 0n), a);
        assert.equal(xorBitsetSeries(0n, a), a);
      }
    });

    it('satisfies self-cancellation xor(a, a) === 0n', () => {
      const samples = [
        0n,
        1n,
        0b101101n,
        (1n << 128n) - 1n,
        (1n << 300n) | (1n << 150n) | 1n,
        (1n << 2048n) - 1n,
      ];
      for (const a of samples) {
        assert.equal(xorBitsetSeries(a, a), 0n);
      }
    });

    it('handles very wide (>256-bit) and asymmetric-width bitsets', () => {
      const wideA = (1n << 512n) - 1n;
      const wideB = (1n << 257n) | (1n << 511n) | 1n;
      assert.equal(xorBitsetSeries(wideA, wideB), wideA ^ wideB);
      assert.equal(xorBitsetSeries(wideA, wideB), (wideA | wideB) - (wideA & wideB));

      // Asymmetric widths: 1-bit against 1024-bit and 4096-bit
      const huge = (1n << 4096n) | (1n << 2048n) | (1n << 513n) | 0xfeedfacecafebeefn;
      assert.equal(xorBitsetSeries(huge, 1n), huge ^ 1n);
      assert.equal(xorBitsetSeries(1n, huge), 1n ^ huge);

      // Alternating 512-bit masks
      const altA = BigInt('0x' + '55'.repeat(64));
      const altB = BigInt('0x' + 'aa'.repeat(64));
      const allOnes512 = (1n << 512n) - 1n;
      assert.equal(xorBitsetSeries(altA, altB), allOnes512);
      assert.equal(xorBitsetSeries(allOnes512, altA), altB);
    });
  });

  describe('algebraic properties', () => {
    it('is commutative, associative, and involutive across arbitrary widths', () => {
      const nextBigInt = makePrng(0x9e3779b97f4a7c15n);
      const widths = [8, 64, 257, 512, 1024];

      for (const width of widths) {
        const a = nextBigInt(width);
        const b = nextBigInt(width);
        const c = nextBigInt(width);

        // Commutativity: a XOR b === b XOR a
        assert.equal(xorBitsetSeries(a, b), xorBitsetSeries(b, a));

        // Associativity: (a XOR b) XOR c === a XOR (b XOR c)
        assert.equal(
          xorBitsetSeries(xorBitsetSeries(a, b), c),
          xorBitsetSeries(a, xorBitsetSeries(b, c)),
        );

        // Involution: (a XOR b) XOR b === a
        assert.equal(xorBitsetSeries(xorBitsetSeries(a, b), b), a);
      }
    });
  });

  describe('cross-checks against independent computations', () => {
    it('matches native ^, (a | b) - (a & b), and bit-plane series exhaustively for 0n..63n', () => {
      for (let a = 0n; a < 64n; a++) {
        for (let b = 0n; b < 64n; b++) {
          const actual = xorBitsetSeries(a, b);
          assert.equal(actual, a ^ b);
          assert.equal(actual, (a | b) - (a & b));
          assert.equal(actual, naiveBitPlaneXorSeries(a, b));
        }
      }
    });

    it('matches native ^, (a | b) - (a & b), and bit-plane series on wide deterministic samples', () => {
      const nextBigInt = makePrng(0xabcdef0123456789n);
      const widthPairs = [
        [32, 32],
        [64, 128],
        [256, 256],
        [300, 512],
        [777, 1024],
      ];

      for (const [wA, wB] of widthPairs) {
        for (let i = 0; i < 10; i++) {
          const a = nextBigInt(wA);
          const b = nextBigInt(wB);
          const actual = xorBitsetSeries(a, b);
          assert.equal(typeof actual, 'bigint');
          assert.ok(actual >= 0n);
          assert.equal(actual, a ^ b);
          assert.equal(actual, (a | b) - (a & b));
          assert.equal(actual, naiveBitPlaneXorSeries(a, b));
        }
      }
    });
  });

  describe('input validation', () => {
    it('throws TypeError for non-BigInt arguments', () => {
      const invalidValues = [
        0,
        1,
        42,
        -1,
        1.5,
        NaN,
        Infinity,
        '0',
        '15',
        true,
        false,
        null,
        undefined,
        {},
        [],
        Object(1n),
        Symbol('bit'),
      ];

      for (const bad of invalidValues) {
        assert.throws(() => xorBitsetSeries(bad, 1n), TypeError);
        assert.throws(() => xorBitsetSeries(1n, bad), TypeError);
      }

      assert.throws(() => xorBitsetSeries(), TypeError);
      assert.throws(() => xorBitsetSeries(1n), TypeError);
    });

    it('throws RangeError for negative BigInt bitsets', () => {
      const negatives = [-1n, -2n, -42n, -(1n << 256n), -(1n << 1024n) - 1n];

      for (const neg of negatives) {
        assert.throws(() => xorBitsetSeries(neg, 0n), RangeError);
        assert.throws(() => xorBitsetSeries(0n, neg), RangeError);
        assert.throws(() => xorBitsetSeries(neg, 5n), RangeError);
        assert.throws(() => xorBitsetSeries(5n, neg), RangeError);
        assert.throws(() => xorBitsetSeries(neg, neg), RangeError);
      }
    });
  });
});
