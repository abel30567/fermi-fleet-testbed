import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notMask32Lazy } from './notMask32Lazy.js';

/**
 * Independent reference implementation using a JS Set of bit indices.
 *
 * @param {Uint32Array} maskWords
 * @param {number} bitLength
 * @returns {Set<number>}
 */
function maskToBitSet(maskWords, bitLength) {
	const bits = new Set();
	for (let bit = 0; bit < bitLength; bit += 1) {
		const wordIndex = Math.floor(bit / 32);
		const bitOffset = bit % 32;
		const word = wordIndex < maskWords.length ? maskWords[wordIndex] : 0;
		if (((word >>> bitOffset) & 1) === 1) {
			bits.add(bit);
		}
	}
	return bits;
}

describe('notMask32Lazy', () => {
	it('complements Uint32Array words across all 32 bits', () => {
		const input = new Uint32Array([
			0x00000000,
			0xffffffff,
			0xaaaaaaaa,
			0x55555555,
			0x12345678,
			0x80000001
		]);
		const result = Uint32Array.from(notMask32Lazy(input));
		assert.deepEqual(
			result,
			new Uint32Array([
				0xffffffff,
				0x00000000,
				0x55555555,
				0xaaaaaaaa,
				0xedcba987,
				0x7ffffffe
			])
		);
	});

	it('accepts plain arrays and custom generator iterables', () => {
		function* wordGen() {
			yield 0;
			yield 1;
			yield 0x0f0f0f0f;
		}
		assert.deepEqual(
			Array.from(notMask32Lazy([0, 1, 0x0f0f0f0f])),
			[0xffffffff, 0xfffffffe, 0xf0f0f0f0]
		);
		assert.deepEqual(
			Array.from(notMask32Lazy(wordGen())),
			[0xffffffff, 0xfffffffe, 0xf0f0f0f0]
		);
	});

	it('handles empty iterables and empty Uint32Array', () => {
		assert.deepEqual(Array.from(notMask32Lazy(new Uint32Array(0))), []);
		assert.deepEqual(Array.from(notMask32Lazy([])), []);
		assert.deepEqual(Array.from(notMask32Lazy([], 0)), []);
		assert.deepEqual(Array.from(notMask32Lazy(new Uint32Array([0xffffffff]), 0)), []);
	});

	it('masks trailing unused bits when bitLength is not a multiple of 32', () => {
		// bitLength = 1
		assert.deepEqual(Array.from(notMask32Lazy(new Uint32Array([0]), 1)), [1]);
		assert.deepEqual(Array.from(notMask32Lazy(new Uint32Array([1]), 1)), [0]);
		assert.deepEqual(Array.from(notMask32Lazy(new Uint32Array([0xffffffff]), 1)), [0]);

		// bitLength = 5 -> mask 0b11111 = 31
		assert.deepEqual(Array.from(notMask32Lazy(new Uint32Array([0b01010]), 5)), [0b10101]);

		// bitLength = 31 -> mask 0x7fffffff (verifies no 1 << 31 sign bug)
		assert.deepEqual(
			Array.from(notMask32Lazy(new Uint32Array([0x00000000]), 31)),
			[0x7fffffff]
		);
		assert.deepEqual(
			Array.from(notMask32Lazy(new Uint32Array([0x80000000]), 31)),
			[0x7fffffff]
		);

		// bitLength = 32 -> full single word
		assert.deepEqual(
			Array.from(notMask32Lazy(new Uint32Array([0x00000000]), 32)),
			[0xffffffff]
		);

		// bitLength = 33 -> 2 words, second word masked to 1 bit
		assert.deepEqual(
			Array.from(notMask32Lazy(new Uint32Array([0x00000001, 0x00000000]), 33)),
			[0xfffffffe, 0x00000001]
		);
		assert.deepEqual(
			Array.from(notMask32Lazy(new Uint32Array([0x00000001, 0x00000001]), 33)),
			[0xfffffffe, 0x00000000]
		);
	});

	it('pads missing trailing words with 0 when input is shorter than bitLength', () => {
		assert.deepEqual(Array.from(notMask32Lazy([], 35)), [0xffffffff, 0x00000007]);
		assert.deepEqual(
			Array.from(notMask32Lazy(new Uint32Array([0x00ff00ff]), 64)),
			[0xff00ff00, 0xffffffff]
		);
	});

	it('consumes iterables lazily without over-pulling and closes upstream iterators', () => {
		let pulled = 0;
		let closed = false;

		function* infiniteWords() {
			try {
				let i = 0;
				while (true) {
					pulled += 1;
					yield i >>> 0;
					i += 1;
				}
			} finally {
				closed = true;
			}
		}

		// Creating the generator pulls zero elements.
		const gen = notMask32Lazy(infiniteWords());
		assert.equal(pulled, 0);

		const collected = [];
		for (const word of gen) {
			collected.push(word);
			assert.equal(pulled, collected.length);
			if (collected.length === 5) {
				break;
			}
		}

		assert.deepEqual(collected, [
			0xffffffff,
			0xfffffffe,
			0xfffffffd,
			0xfffffffc,
			0xfffffffb
		]);
		assert.equal(pulled, 5);
		assert.equal(closed, true);
	});

	it('stops consuming and closes upstream iterator once bitLength words are satisfied', () => {
		let pulled = 0;
		let closed = false;

		function* infiniteWords() {
			try {
				while (true) {
					pulled += 1;
					yield 0x0000000f;
				}
			} finally {
				closed = true;
			}
		}

		// bitLength = 0 should pull nothing
		const zeroResult = Array.from(notMask32Lazy(infiniteWords(), 0));
		assert.deepEqual(zeroResult, []);
		assert.equal(pulled, 0);

		// bitLength = 40 requires ceil(40 / 32) = 2 words
		const result = Array.from(notMask32Lazy(infiniteWords(), 40));
		assert.deepEqual(result, [0xfffffff0, 0x000000f0]);
		assert.equal(pulled, 2);
		assert.equal(closed, true);
	});

	it('satisfies involution: NOT(NOT(x)) === x', () => {
		const input = new Uint32Array([0, 1, 0x7fffffff, 0x80000000, 0xffffffff, 0xdeadbeef]);
		const doubleNegated = Uint32Array.from(notMask32Lazy(notMask32Lazy(input)));
		assert.deepEqual(doubleNegated, input);

		const bitLength = 100;
		const shortInput = new Uint32Array([0x13579bdf, 0x2468ace0, 0xdeadbeef, 0x0000000a]);
		const doubleNegatedBounded = Uint32Array.from(
			notMask32Lazy(notMask32Lazy(shortInput, bitLength), bitLength)
		);
		// 100 % 32 === 4, so 4th word is masked to 0xf -> 0xa & 0xf === 0xa
		assert.deepEqual(doubleNegatedBounded, shortInput);
	});

	it('independent cross-check against explicit Set complement and XOR with 0xffffffff', () => {
		// Deterministic xorshift32 PRNG for reproducible test vectors
		let state = 0x243f6a88;
		const nextU32 = () => {
			state ^= state << 13;
			state ^= state >>> 17;
			state ^= state << 5;
			return state >>> 0;
		};

		const bitLengths = [0, 1, 7, 16, 31, 32, 33, 63, 64, 65, 95, 96, 127, 130];
		for (const bitLength of bitLengths) {
			const wordCount = Math.ceil(bitLength / 32);
			const inputWords = new Uint32Array(wordCount);
			for (let i = 0; i < wordCount; i += 1) {
				inputWords[i] = nextU32();
			}

			// 1. Cross-check against explicit Set<number> complement over universe 0..bitLength-1
			const inputSet = maskToBitSet(inputWords, bitLength);
			const expectedComplementSet = new Set();
			for (let bit = 0; bit < bitLength; bit += 1) {
				if (!inputSet.has(bit)) {
					expectedComplementSet.add(bit);
				}
			}

			const actualWords = Uint32Array.from(notMask32Lazy(inputWords, bitLength));
			assert.equal(actualWords.length, wordCount);
			const actualSet = maskToBitSet(actualWords, bitLength);
			assert.deepEqual(actualSet, expectedComplementSet);

			// Verify unused high bits in the final word are zero
			const rem = bitLength % 32;
			if (rem !== 0) {
				const unusedHighBits = actualWords[wordCount - 1] >>> rem;
				assert.equal(unusedHighBits, 0);
			}

			// 2. Cross-check full-word mode against XOR with 0xffffffff
			const fullActual = Uint32Array.from(notMask32Lazy(inputWords));
			const expectedXor = Uint32Array.from(inputWords, (w) => (w ^ 0xffffffff) >>> 0);
			assert.deepEqual(fullActual, expectedXor);
		}
	});

	it('validates arguments eagerly and word elements lazily', () => {
		// Eager validation on invalid words iterable
		assert.throws(() => notMask32Lazy(null), TypeError);
		assert.throws(() => notMask32Lazy(undefined), TypeError);
		assert.throws(() => notMask32Lazy(42), TypeError);
		assert.throws(() => notMask32Lazy({}), TypeError);
		assert.throws(() => notMask32Lazy('0101'), TypeError);

		// Eager validation on invalid bitLength
		assert.throws(() => notMask32Lazy([], '32'), TypeError);
		assert.throws(() => notMask32Lazy([], null), TypeError);
		assert.throws(() => notMask32Lazy([], -1), RangeError);
		assert.throws(() => notMask32Lazy([], 1.5), RangeError);
		assert.throws(() => notMask32Lazy([], Number.NaN), RangeError);
		assert.throws(() => notMask32Lazy([], Number.POSITIVE_INFINITY), RangeError);
		assert.throws(() => notMask32Lazy([], Number.MAX_SAFE_INTEGER + 1), RangeError);

		// Lazy validation of words inside iterable
		const badTypeGen = notMask32Lazy([0, 'bad']);
		assert.deepEqual(badTypeGen.next(), { value: 0xffffffff, done: false });
		assert.throws(() => badTypeGen.next(), TypeError);

		const negGen = notMask32Lazy([1, -1]);
		assert.deepEqual(negGen.next(), { value: 0xfffffffe, done: false });
		assert.throws(() => negGen.next(), RangeError);

		const overflowGen = notMask32Lazy([0x100000000]);
		assert.throws(() => overflowGen.next(), RangeError);

		const floatGen = notMask32Lazy([3.14]);
		assert.throws(() => floatGen.next(), RangeError);

		const nanGen = notMask32Lazy([Number.NaN]);
		assert.throws(() => nanGen.next(), RangeError);
	});
});
