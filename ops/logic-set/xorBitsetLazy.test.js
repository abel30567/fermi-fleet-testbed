import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { xorBitsetLazy } from './xorBitsetLazy.js';

/**
 * Independent reference helper: converts a non-negative BigInt bitset into a
 * JS Set of 0-based active bit indices using its base-2 string representation.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
  const result = new Set();
  if (bitset === 0n) {
    return result;
  }
  const bits = bitset.toString(2);
  for (let i = 0; i < bits.length; i += 1) {
    if (bits[bits.length - 1 - i] === '1') {
      result.add(i);
    }
  }
  return result;
}

/**
 * Independent reference helper: computes set-theoretic symmetric difference
 * (A \ B) U (B \ A) over two JS Sets.
 *
 * @param {Set<number>} a
 * @param {Set<number>} b
 * @returns {Set<number>}
 */
function symmetricDifference(a, b) {
  const out = new Set();
  for (const x of a) {
    if (!b.has(x)) {
      out.add(x);
    }
  }
  for (const x of b) {
    if (!a.has(x)) {
      out.add(x);
    }
  }
  return out;
}

/**
 * Independent reference helper: reconstructs a BigInt bitset from a Set of
 * bit indices via summation of powers of two.
 *
 * @param {Set<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
  let acc = 0n;
  for (const idx of indices) {
    acc += 2n ** BigInt(idx);
  }
  return acc;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('xorBitsetLazy', () => {
  describe('normal cases', () => {
    test('yields running XOR for a sequence of BigInt bitsets and returns final value', () => {
      const gen = xorBitsetLazy([0b1010n, 0b1100n, 0b0011n]);

      assert.deepEqual(gen.next(), { value: 0b1010n, done: false });
      assert.deepEqual(gen.next(), { value: 0b0110n, done: false });
      assert.deepEqual(gen.next(), { value: 0b0101n, done: false });
      assert.deepEqual(gen.next(), { value: 0b0101n, done: true });
    });

    test('handles single-element iterable', () => {
      const gen = xorBitsetLazy([0b101010n]);
      assert.deepEqual(gen.next(), { value: 0b101010n, done: false });
      assert.deepEqual(gen.next(), { value: 0b101010n, done: true });
    });

    test('supports custom initial bitset via options.initial', () => {
      const results = [...xorBitsetLazy([0b1010n, 0b0101n, 0b1100n], { initial: 0b1111n })];
      assert.deepEqual(results, [0b0101n, 0b0000n, 0b1100n]);
    });

    test('works across diverse iterable containers (Set, BigUint64Array, custom iterable)', () => {
      const fromSet = [...xorBitsetLazy(new Set([0b0011n, 0b0110n, 0b1100n]))];
      assert.deepEqual(fromSet, [0b0011n, 0b0101n, 0b1001n]);

      const typed = new BigUint64Array([0xffffffffffffffffn, 0x0f0f0f0f0f0f0f0fn]);
      const fromTyped = [...xorBitsetLazy(typed)];
      assert.deepEqual(fromTyped, [0xffffffffffffffffn, 0xf0f0f0f0f0f0f0f0n]);

      const customIterable = {
        [Symbol.iterator]() {
          const items = [1n, 3n, 7n];
          let i = 0;
          return {
            next() {
              return i < items.length
                ? { value: items[i++], done: false }
                : { value: undefined, done: true };
            },
          };
        },
      };
      assert.deepEqual([...xorBitsetLazy(customIterable)], [1n, 2n, 5n]);
    });

    test('handles arbitrary-width BigInt bitsets well beyond 64 bits', () => {
      const a = (1n << 4096n) | (1n << 512n) | (1n << 64n) | 1n;
      const b = (1n << 4096n) | (1n << 1024n) | (1n << 64n);
      const c = (1n << 1024n) | (1n << 256n) | 1n;

      const steps = [...xorBitsetLazy([a, b, c])];
      assert.equal(steps.length, 3);
      assert.equal(steps[0], a);
      assert.equal(steps[1], (1n << 1024n) | (1n << 512n) | 1n);
      assert.equal(steps[2], (1n << 512n) | (1n << 256n));
    });

    test('satisfies XOR algebraic laws: identity, self-inverse, commutativity, associativity', () => {
      const x = (1n << 300n) | (1n << 127n) | 0xdeadbeefn;
      const y = (1n << 300n) | (1n << 77n) | 0xcafebaben;
      const z = (1n << 199n) | (1n << 77n) | 0x12345678n;

      // Identity
      assert.deepEqual([...xorBitsetLazy([x, 0n])], [x, x]);

      // Self-inverse
      assert.deepEqual([...xorBitsetLazy([x, y, y])], [x, x ^ y, x]);
      assert.deepEqual([...xorBitsetLazy([x, x])], [x, 0n]);

      // Commutativity (final result invariant under permutation)
      const final1 = [...xorBitsetLazy([x, y, z])].at(-1);
      const final2 = [...xorBitsetLazy([z, x, y])].at(-1);
      const final3 = [...xorBitsetLazy([y, z, x])].at(-1);
      assert.equal(final1, final2);
      assert.equal(final2, final3);

      // Associativity: xor([xor(x, y), z]) === xor([x, xor(y, z)])
      const leftAssoc = [...xorBitsetLazy([[...xorBitsetLazy([x, y])].at(-1), z])].at(-1);
      const rightAssoc = [...xorBitsetLazy([x, [...xorBitsetLazy([y, z])].at(-1)])].at(-1);
      assert.equal(leftAssoc, rightAssoc);
    });
  });

  describe('edge cases', () => {
    test('empty iterable yields nothing and returns initial (default 0n)', () => {
      const genDefault = xorBitsetLazy([]);
      assert.deepEqual(genDefault.next(), { value: 0n, done: true });

      const customInit = (1n << 128n) | 7n;
      const genCustom = xorBitsetLazy([], { initial: customInit });
      assert.deepEqual(genCustom.next(), { value: customInit, done: true });
    });

    test('all-zero bitset stream stays at 0n', () => {
      assert.deepEqual([...xorBitsetLazy([0n, 0n, 0n, 0n])], [0n, 0n, 0n, 0n]);
    });

    test('toggling bits at boundary indices (0, 31, 32, 53, 63, 64, 128)', () => {
      const positions = [0n, 31n, 32n, 53n, 63n, 64n, 128n];
      const masks = positions.map((p) => 1n << p);
      // Set each boundary bit, then clear them in reverse order
      const sequence = [...masks, ...masks.toReversed()];
      const steps = [...xorBitsetLazy(sequence)];

      assert.equal(steps.at(-1), 0n);
      assert.equal(
        steps[positions.length - 1],
        positions.reduce((acc, p) => acc | (1n << p), 0n)
      );
    });
  });

  describe('lazy / streaming consumption', () => {
    test('does not invoke Symbol.iterator or pull any elements until next() is called', () => {
      let iteratorCreated = false;
      let pulledCount = 0;

      const source = {
        [Symbol.iterator]() {
          iteratorCreated = true;
          return {
            next() {
              pulledCount += 1;
              return { value: 1n << BigInt(pulledCount - 1), done: false };
            },
          };
        },
      };

      const gen = xorBitsetLazy(source);
      assert.equal(iteratorCreated, false);
      assert.equal(pulledCount, 0);

      assert.deepEqual(gen.next(), { value: 0b001n, done: false });
      assert.equal(iteratorCreated, true);
      assert.equal(pulledCount, 1);

      assert.deepEqual(gen.next(), { value: 0b011n, done: false });
      assert.equal(pulledCount, 2);

      assert.deepEqual(gen.next(), { value: 0b111n, done: false });
      assert.equal(pulledCount, 3);
    });

    test('consumes an infinite generator lazily and supports clean early termination', () => {
      let produced = 0;
      let cleanedUp = false;

      function* infiniteBitsets() {
        try {
          let bit = 0n;
          while (true) {
            produced += 1;
            yield 1n << bit;
            bit += 1n;
          }
        } finally {
          cleanedUp = true;
        }
      }

      const collected = [];
      for (const value of xorBitsetLazy(infiniteBitsets())) {
        collected.push(value);
        if (collected.length === 5) {
          break;
        }
      }

      assert.equal(produced, 5);
      assert.equal(cleanedUp, true);
      assert.deepEqual(collected, [0b1n, 0b11n, 0b111n, 0b1111n, 0b11111n]);
    });

    test('streams valid prefix before throwing lazily on an invalid later element', () => {
      let pulls = 0;
      function* faultyStream() {
        pulls += 1;
        yield 0b101n;
        pulls += 1;
        yield 0b011n;
        pulls += 1;
        yield -1n;
        pulls += 1;
        yield 0b111n;
      }

      const gen = xorBitsetLazy(faultyStream());
      assert.deepEqual(gen.next(), { value: 0b101n, done: false });
      assert.equal(pulls, 1);
      assert.deepEqual(gen.next(), { value: 0b110n, done: false });
      assert.equal(pulls, 2);
      assert.throws(() => gen.next(), RangeError);
      assert.equal(pulls, 3);
    });
  });

  describe('input validation', () => {
    test('synchronously rejects non-iterable and string bitsets arguments with TypeError', () => {
      const invalidInputs = [null, undefined, 0, 42, 10n, true, {}, '1010', Symbol('x')];
      for (const bad of invalidInputs) {
        assert.throws(() => xorBitsetLazy(bad), TypeError);
      }
    });

    test('synchronously rejects invalid options objects with TypeError', () => {
      const invalidOptions = [null, 42, 'initial', true, []];
      for (const bad of invalidOptions) {
        assert.throws(() => xorBitsetLazy([], bad), TypeError);
      }
    });

    test('synchronously rejects invalid options.initial values', () => {
      for (const badType of [0, 1, '0', null, {}, Object(0n)]) {
        assert.throws(() => xorBitsetLazy([], { initial: badType }), TypeError);
      }
      for (const badRange of [-1n, -(1n << 256n)]) {
        assert.throws(() => xorBitsetLazy([], { initial: badRange }), RangeError);
      }
    });

    test('lazily rejects non-BigInt elements with TypeError and negative BigInts with RangeError', () => {
      for (const badType of [0, 1, NaN, '1', null, undefined, {}, Object(1n)]) {
        const gen = xorBitsetLazy([badType]);
        assert.throws(() => gen.next(), TypeError);
      }
      for (const badRange of [-1n, -42n, -(1n << 512n)]) {
        const gen = xorBitsetLazy([badRange]);
        assert.throws(() => gen.next(), RangeError);
      }
    });
  });

  describe('independent cross-checks', () => {
    test('matches Set-based symmetric difference at every step on random arbitrary-width bitsets', () => {
      const rand = createPrng(0x5eed1234);
      const maxWidth = 320;
      const count = 40;

      const bitsets = [];
      for (let i = 0; i < count; i += 1) {
        const indices = new Set();
        const numBits = Math.floor(rand() * 25);
        for (let j = 0; j < numBits; j += 1) {
          indices.add(Math.floor(rand() * maxWidth));
        }
        bitsets.push(indexSetToBitset(indices));
      }

      const initialIndices = new Set([0, 17, 64, 199, 319]);
      const initial = indexSetToBitset(initialIndices);

      let expectedSet = new Set(initialIndices);
      const gen = xorBitsetLazy(bitsets, { initial });

      for (let i = 0; i < bitsets.length; i += 1) {
        const step = gen.next();
        assert.equal(step.done, false);

        const nextIndices = bitsetToIndexSet(bitsets[i]);
        expectedSet = symmetricDifference(expectedSet, nextIndices);

        assert.deepEqual(bitsetToIndexSet(step.value), expectedSet);
        assert.equal(step.value, indexSetToBitset(expectedSet));
      }

      const doneStep = gen.next();
      assert.equal(doneStep.done, true);
      assert.equal(doneStep.value, indexSetToBitset(expectedSet));
    });

    test('final bitset matches independent odd-parity count per bit position', () => {
      const rand = createPrng(0xabcdef01);
      const width = 260;
      const count = 35;
      const bitCounts = new Array(width).fill(0);
      const inputs = [];

      for (let i = 0; i < count; i += 1) {
        let mask = 0n;
        for (let bit = 0; bit < width; bit += 1) {
          if (rand() < 0.35) {
            mask |= 1n << BigInt(bit);
            bitCounts[bit] += 1;
          }
        }
        inputs.push(mask);
      }

      let expectedFinal = 0n;
      for (let bit = 0; bit < width; bit += 1) {
        if (bitCounts[bit] % 2 === 1) {
          expectedFinal += 2n ** BigInt(bit);
        }
      }

      const gen = xorBitsetLazy(inputs);
      let lastYielded = 0n;
      for (const value of gen) {
        lastYielded = value;
      }

      assert.equal(lastYielded, expectedFinal);
    });
  });
});
