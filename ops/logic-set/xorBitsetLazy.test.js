import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorBitsetLazy } from './xorBitsetLazy.js';

/**
 * Independent reference: convert a non-negative BigInt bitset to a Set of active bit indices.
 */
function bitsetToSet(bitset) {
  const result = new Set();
  let rem = bitset;
  let idx = 0;
  while (rem > 0n) {
    if ((rem & 1n) === 1n) {
      result.add(idx);
    }
    rem >>= 1n;
    idx += 1;
  }
  return result;
}

/**
 * Independent reference: convert a Set of non-negative bit indices to a BigInt bitset.
 */
function setToBitset(indices) {
  let result = 0n;
  for (const idx of indices) {
    result |= 1n << BigInt(idx);
  }
  return result;
}

/**
 * Independent reference: set-theoretic symmetric difference A Δ B.
 */
function symmetricDiffSets(a, b) {
  const out = new Set();
  for (const x of a) {
    if (!b.has(x)) out.add(x);
  }
  for (const x of b) {
    if (!a.has(x)) out.add(x);
  }
  return out;
}

/**
 * Closed-form identity for cumulative XOR 0n ^ 1n ^ 2n ^ ... ^ n (for n >= 0n).
 */
function closedFormPrefixXor(n) {
  const rem = n & 3n;
  if (rem === 0n) return n;
  if (rem === 1n) return 1n;
  if (rem === 2n) return n + 1n;
  return 0n;
}

describe('xorBitsetLazy', () => {
  describe('normal cases', () => {
    it('streams running bitwise XOR over an array of BigInt bitsets', () => {
      const input = [0b1010n, 0b1100n, 0b0111n, 0b0001n];
      const result = [...xorBitsetLazy(input)];
      assert.deepEqual(result, [0b1010n, 0b0110n, 0b0001n, 0b0000n]);
    });

    it('supports a non-zero initial seed bitset', () => {
      const input = [0b0011n, 0b0101n, 0b1111n];
      const initial = 0b1010n;
      const result = [...xorBitsetLazy(input, initial)];
      assert.deepEqual(result, [
        0b1010n ^ 0b0011n,
        0b1010n ^ 0b0011n ^ 0b0101n,
        0b1010n ^ 0b0011n ^ 0b0101n ^ 0b1111n,
      ]);
    });

    it('accepts diverse iterable types (Set, Map.values, generator, custom iterable)', () => {
      const setInput = new Set([0b1001n, 0b0101n, 0b1110n]);
      assert.deepEqual([...xorBitsetLazy(setInput)], [0b1001n, 0b1100n, 0b0010n]);

      const mapInput = new Map([
        ['a', 0b11n],
        ['b', 0b10n],
      ]);
      assert.deepEqual([...xorBitsetLazy(mapInput.values())], [0b11n, 0b01n]);

      function* gen() {
        yield 1n;
        yield 2n;
        yield 4n;
      }
      assert.deepEqual([...xorBitsetLazy(gen())], [1n, 3n, 7n]);

      const customIterable = {
        [Symbol.iterator]() {
          const items = [0b110n, 0b011n];
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
      assert.deepEqual([...xorBitsetLazy(customIterable)], [0b110n, 0b101n]);
    });
  });

  describe('edge cases', () => {
    it('yields nothing for empty iterables (with default or non-zero initial)', () => {
      assert.deepEqual([...xorBitsetLazy([])], []);
      assert.deepEqual([...xorBitsetLazy(new Set())], []);
      assert.deepEqual([...xorBitsetLazy([], 0b10101n)], []);

      function* emptyGen() {}
      assert.deepEqual([...xorBitsetLazy(emptyGen())], []);
    });

    it('handles zeros and single-element iterables properly', () => {
      assert.deepEqual([...xorBitsetLazy([0n])], [0n]);
      assert.deepEqual([...xorBitsetLazy([0n, 0n, 0n])], [0n, 0n, 0n]);
      assert.deepEqual([...xorBitsetLazy([0b101010n, 0n, 0n])], [0b101010n, 0b101010n, 0b101010n]);
      assert.deepEqual([...xorBitsetLazy([0n], 0b111n)], [0b111n]);
      assert.deepEqual([...xorBitsetLazy([0b101n], undefined)], [0b101n]);
    });

    it('handles arbitrary-width / huge BigInt bitsets accurately', () => {
      const b0 = (1n << 65536n) | (1n << 4096n) | (1n << 64n) | 1n;
      const b1 = (1n << 65536n) | (1n << 512n) | (1n << 64n);
      const b2 = (1n << 4096n) | (1n << 128n);

      const results = [...xorBitsetLazy([b0, b1, b2])];
      assert.equal(results[0], b0);
      assert.equal(results[1], (1n << 4096n) | (1n << 512n) | 1n);
      assert.equal(results[2], (1n << 512n) | (1n << 128n) | 1n);

      // Dense 2048-bit mask XORed with itself yields 0n
      const dense = (1n << 2048n) - 1n;
      const lower = (1n << 1024n) - 1n;
      const upper = dense ^ lower;
      assert.deepEqual([...xorBitsetLazy([dense, lower, upper])], [dense, upper, 0n]);
    });
  });

  describe('input validation', () => {
    it('throws TypeError eagerly for non-iterable or string bitsets arguments', () => {
      const invalidInputs = [
        null,
        undefined,
        42,
        10n,
        true,
        false,
        {},
        Symbol('x'),
        '1010',
        new String('1010'),
      ];
      for (const bad of invalidInputs) {
        assert.throws(() => xorBitsetLazy(bad), TypeError);
      }
    });

    it('throws TypeError or RangeError eagerly for invalid initial arguments', () => {
      for (const badType of [0, 1, '0', null, {}, [], NaN, true]) {
        assert.throws(() => xorBitsetLazy([], badType), TypeError);
      }
      for (const negative of [-1n, -42n, -(1n << 256n)]) {
        assert.throws(() => xorBitsetLazy([], negative), RangeError);
      }
    });

    it('throws TypeError or RangeError lazily when encountering invalid elements in bitsets', () => {
      const withBadType = xorBitsetLazy([0b101n, 0b011n, 123, 0b111n]);
      assert.deepEqual(withBadType.next(), { value: 0b101n, done: false });
      assert.deepEqual(withBadType.next(), { value: 0b110n, done: false });
      assert.throws(() => withBadType.next(), TypeError);

      const withNull = xorBitsetLazy([1n, null]);
      assert.deepEqual(withNull.next(), { value: 1n, done: false });
      assert.throws(() => withNull.next(), TypeError);

      const withNegative = xorBitsetLazy([0b1010n, -1n, 0b1111n]);
      assert.deepEqual(withNegative.next(), { value: 0b1010n, done: false });
      assert.throws(() => withNegative.next(), RangeError);

      const withHugeNegative = xorBitsetLazy([-(1n << 500n)]);
      assert.throws(() => withHugeNegative.next(), RangeError);
    });
  });

  describe('laziness guarantees', () => {
    it('consumes an infinite generator strictly on demand without materializing', () => {
      let produced = 0;
      function* infinitePowersOfTwo() {
        let k = 0n;
        while (true) {
          produced += 1;
          yield 1n << k;
          k += 1n;
        }
      }

      const stream = xorBitsetLazy(infinitePowersOfTwo());
      // Nothing pulled upon creation
      assert.equal(produced, 0);

      const collected = [];
      for (let i = 0; i < 10; i += 1) {
        const step = stream.next();
        assert.equal(step.done, false);
        assert.equal(produced, i + 1);
        collected.push(step.value);
      }

      // XOR of 2^0, 2^1, ..., 2^(k-1) equals (1n << k) - 1n
      for (let i = 0; i < 10; i += 1) {
        assert.equal(collected[i], (1n << BigInt(i + 1)) - 1n);
      }
      assert.equal(produced, 10);
    });

    it('never pulls past early termination and runs upstream finally cleanup', () => {
      let pulled = 0;
      let cleanedUp = false;

      function* sourceWithPoisonTail() {
        try {
          pulled += 1;
          yield 0b001n;
          pulled += 1;
          yield 0b010n;
          pulled += 1;
          yield 0b100n;
          pulled += 1;
          throw new Error('Poison tail should never be pulled');
        } finally {
          cleanedUp = true;
        }
      }

      const seen = [];
      for (const value of xorBitsetLazy(sourceWithPoisonTail())) {
        seen.push(value);
        if (seen.length === 3) {
          break;
        }
      }

      assert.deepEqual(seen, [0b001n, 0b011n, 0b111n]);
      assert.equal(pulled, 3);
      assert.equal(cleanedUp, true);
    });

    it('does not invoke Symbol.iterator until iteration actually starts', () => {
      let iteratorCreated = false;
      const lazyIterable = {
        [Symbol.iterator]() {
          iteratorCreated = true;
          return [0b101n][Symbol.iterator]();
        },
      };

      const stream = xorBitsetLazy(lazyIterable);
      assert.equal(iteratorCreated, false);

      assert.deepEqual(stream.next(), { value: 0b101n, done: false });
      assert.equal(iteratorCreated, true);
      assert.deepEqual(stream.next(), { value: undefined, done: true });
    });
  });

  describe('independent cross-checks & algebraic properties', () => {
    it('matches an independent Set-based symmetric difference across wide bitsets', () => {
      const bitIndexLists = [
        [0, 3, 7, 65, 130, 513],
        [3, 4, 65, 200, 513, 1025],
        [0, 4, 130, 1025, 2048],
        [7, 200, 2048, 3000],
        [3000],
      ];
      const initialIndices = [1, 3, 2048];
      const bitsets = bitIndexLists.map((list) => setToBitset(new Set(list)));
      const initial = setToBitset(new Set(initialIndices));

      let refSet = new Set(initialIndices);
      let stepIdx = 0;
      for (const actual of xorBitsetLazy(bitsets, initial)) {
        refSet = symmetricDiffSets(refSet, new Set(bitIndexLists[stepIdx]));
        assert.equal(actual, setToBitset(refSet));
        assert.deepEqual(bitsetToSet(actual), refSet);
        stepIdx += 1;
      }
      assert.equal(stepIdx, bitsets.length);
    });

    it('matches the closed-form prefix XOR identity over consecutive integers (small and huge)', () => {
      // 0n..500n
      function* range(start, count) {
        for (let i = 0n; i < count; i += 1n) {
          yield start + i;
        }
      }

      let n = 0n;
      for (const actual of xorBitsetLazy(range(0n, 501n))) {
        assert.equal(actual, closedFormPrefixXor(n));
        n += 1n;
      }
      assert.equal(n, 501n);

      // Huge range: base .. base + 255n, where XOR(a..b) = prefixXor(b) ^ prefixXor(a - 1)
      const base = (1n << 256n) + 17n;
      const prefixBeforeBase = closedFormPrefixXor(base - 1n);
      let current = base;
      for (const actual of xorBitsetLazy(range(base, 256n))) {
        const expected = closedFormPrefixXor(current) ^ prefixBeforeBase;
        assert.equal(actual, expected);
        current += 1n;
      }
      assert.equal(current, base + 256n);
    });

    it('satisfies involution, commutativity, associativity, and bit-parity invariants', () => {
      const a = (1n << 300n) | 0xdeadbeef12345678n;
      const b = (1n << 300n) | (1n << 127n) | 0xfeedface87654321n;
      const c = (1n << 512n) | 0x0123456789abcdefn;
      const d = (1n << 127n) | 0xfedcba9876543210n;

      // Involution: XORing with b twice restores a
      assert.deepEqual([...xorBitsetLazy([a, b, b])], [a, a ^ b, a]);

      // Commutativity & associativity: final XOR is invariant under permutations
      const perms = [
        [a, b, c, d],
        [d, c, b, a],
        [b, d, a, c],
        [c, a, d, b],
      ];
      const finals = perms.map((seq) => {
        let last = 0n;
        for (const v of xorBitsetLazy(seq)) {
          last = v;
        }
        return last;
      });
      for (const f of finals) {
        assert.equal(f, finals[0]);
      }

      // Bit-parity check: bit k is 1 in final XOR iff k appears an odd number of times
      const seq = [a, b, c, d];
      const finalXor = finals[0];
      for (let k = 0; k <= 520; k += 1) {
        const mask = 1n << BigInt(k);
        let count = 0;
        for (const x of seq) {
          if ((x & mask) !== 0n) count += 1;
        }
        assert.equal((finalXor & mask) !== 0n, count % 2 === 1);
      }
    });
  });
});
