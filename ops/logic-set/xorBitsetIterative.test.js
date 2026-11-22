import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { xorBitsetIterative } from './xorBitsetIterative.js';

/**
 * Independent reference conversion: non-negative BigInt bitset -> Set of active bit indices.
 */
function bitsetToIndexSet(bitset) {
	const indices = new Set();
	const bin = bitset === 0n ? '' : bitset.toString(2);
	for (let i = 0; i < bin.length; i += 1) {
		if (bin[bin.length - 1 - i] === '1') {
			indices.add(i);
		}
	}
	return indices;
}

/**
 * Independent reference conversion: Set of non-negative bit indices -> BigInt bitset.
 */
function indexSetToBitset(indices) {
	let acc = 0n;
	for (const idx of indices) {
		acc += 1n << BigInt(idx);
	}
	return acc;
}

/**
 * Independent reference symmetric difference over JS Sets.
 */
function setSymmetricDifference(setA, setB) {
	const out = new Set();
	for (const el of setA) {
		if (!setB.has(el)) out.add(el);
	}
	for (const el of setB) {
		if (!setA.has(el)) out.add(el);
	}
	return out;
}

/**
 * Deterministic LCG-based BigInt generator for repeatable arbitrary-width tests.
 */
function makeBigIntPrng(seed = 0x9e3779b97f4a7c15n) {
	let state = seed;
	const mask64 = (1n << 64n) - 1n;
	return function nextBigInt(bitWidth) {
		let value = 0n;
		let remaining = bitWidth;
		while (remaining > 0) {
			state = (state * 6364136223846793005n + 1442695040888963407n) & mask64;
			const take = remaining >= 64 ? 64 : remaining;
			const chunk = state >> BigInt(64 - take);
			value = (value << BigInt(take)) | chunk;
			remaining -= take;
		}
		return value;
	};
}

describe('xorBitsetIterative', () => {
	describe('normal cases', () => {
		it('satisfies the 1-bit XOR truth table', () => {
			assert.equal(xorBitsetIterative(0n, 0n), 0n);
			assert.equal(xorBitsetIterative(0n, 1n), 1n);
			assert.equal(xorBitsetIterative(1n, 0n), 1n);
			assert.equal(xorBitsetIterative(1n, 1n), 0n);
		});

		it('computes XOR for typical byte- and word-sized bitsets', () => {
			assert.equal(xorBitsetIterative(0b10101010n, 0b11001100n), 0b01100110n);
			assert.equal(xorBitsetIterative(0xffn, 0x0fn), 0xf0n);
			assert.equal(xorBitsetIterative(0xdeadbeefn, 0xcafebaben), 0x14530451n);
		});

		it('computes union for disjoint bitsets and difference for subsets', () => {
			const evens = 0b0101010101n;
			const odds = 0b1010101010n;
			assert.equal(xorBitsetIterative(evens, odds), 0b1111111111n);

			const superset = 0b11110011n;
			const subset = 0b01010001n;
			assert.equal(xorBitsetIterative(superset, subset), 0b10100010n);
		});
	});

	describe('edge cases', () => {
		it('handles zero/empty bitsets as additive identity', () => {
			const samples = [0n, 1n, 42n, (1n << 128n) - 1n, 1n << 512n];
			for (const x of samples) {
				assert.equal(xorBitsetIterative(x, 0n), x);
				assert.equal(xorBitsetIterative(0n, x), x);
			}
		});

		it('returns 0n when XORing any bitset with itself', () => {
			const samples = [0n, 1n, 0xabcdef1234567890n, (1n << 512n) - 1n, (1n << 1024n) + 7n];
			for (const x of samples) {
				assert.equal(xorBitsetIterative(x, x), 0n);
			}
		});

		it('handles strongly asymmetric bit widths in both argument orders', () => {
			const wide = (1n << 10000n) | (1n << 5000n) | 0b101n;
			const narrow = 0b110n;
			const expected = (1n << 10000n) | (1n << 5000n) | 0b011n;

			assert.equal(xorBitsetIterative(wide, narrow), expected);
			assert.equal(xorBitsetIterative(narrow, wide), expected);
		});

		it('handles all-ones bitsets of differing widths', () => {
			const mask256 = (1n << 256n) - 1n;
			const mask128 = (1n << 128n) - 1n;
			const expected = mask128 << 128n;

			assert.equal(xorBitsetIterative(mask256, mask128), expected);
			assert.equal(xorBitsetIterative(mask128, mask256), expected);
		});

		it('handles very large arbitrary-width bitsets (2048+ bits)', () => {
			const a = (1n << 2048n) | (1n << 1024n) | (1n << 333n) | 1n;
			const b = (1n << 2048n) | (1n << 777n) | (1n << 333n) | (1n << 12n);
			const expected = (1n << 1024n) | (1n << 777n) | (1n << 12n) | 1n;

			assert.equal(xorBitsetIterative(a, b), expected);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when first argument is not a BigInt', () => {
			const invalidValues = [0, 1, 42, NaN, Infinity, -Infinity, '1', '0n', null, undefined, true, false, {}, [], Symbol('x')];
			for (const bad of invalidValues) {
				assert.throws(() => xorBitsetIterative(bad, 0n), TypeError);
			}
		});

		it('throws TypeError when second argument is not a BigInt', () => {
			const invalidValues = [0, 1, 42, NaN, Infinity, -Infinity, '1', '0n', null, undefined, true, false, {}, [], Symbol('x')];
			for (const bad of invalidValues) {
				assert.throws(() => xorBitsetIterative(0n, bad), TypeError);
			}
		});

		it('throws TypeError when called with missing arguments', () => {
			assert.throws(() => xorBitsetIterative(), TypeError);
			assert.throws(() => xorBitsetIterative(1n), TypeError);
		});

		it('throws RangeError when either argument is a negative BigInt', () => {
			assert.throws(() => xorBitsetIterative(-1n, 0n), RangeError);
			assert.throws(() => xorBitsetIterative(0n, -1n), RangeError);
			assert.throws(() => xorBitsetIterative(-1n, -1n), RangeError);
			assert.throws(() => xorBitsetIterative(-(1n << 256n), 5n), RangeError);
			assert.throws(() => xorBitsetIterative(5n, -(1n << 256n)), RangeError);
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches native BigInt XOR and arithmetic symmetric difference across arbitrary widths', () => {
			const nextBigInt = makeBigIntPrng();
			const widths = [1, 7, 16, 31, 32, 33, 63, 64, 65, 128, 255, 512, 1024];

			for (const widthA of widths) {
				for (const widthB of [widthA, Math.max(1, widthA >> 1), widthA + 17]) {
					const a = nextBigInt(widthA);
					const b = nextBigInt(widthB);

					const actual = xorBitsetIterative(a, b);
					const nativeXor = a ^ b;
					const arithmeticSymDiff = (a | b) - (a & b);
					const inclusionExclusion = a + b - 2n * (a & b);

					assert.equal(actual, nativeXor);
					assert.equal(actual, arithmeticSymDiff);
					assert.equal(actual, inclusionExclusion);
				}
			}
		});

		it('matches independent JS Set symmetric difference reference', () => {
			const nextBigInt = makeBigIntPrng(0x123456789abcdef0n);
			for (const width of [8, 32, 100, 300]) {
				const a = nextBigInt(width);
				const b = nextBigInt(width + 13);

				const expected = indexSetToBitset(
					setSymmetricDifference(bitsetToIndexSet(a), bitsetToIndexSet(b))
				);
				assert.equal(xorBitsetIterative(a, b), expected);
			}
		});

		it('satisfies commutativity, associativity, and involution', () => {
			const nextBigInt = makeBigIntPrng(0xfedcba9876543210n);
			for (let i = 0; i < 20; i += 1) {
				const a = nextBigInt(128 + i * 19);
				const b = nextBigInt(96 + i * 23);
				const c = nextBigInt(64 + i * 29);

				// Commutativity: a ^ b === b ^ a
				assert.equal(xorBitsetIterative(a, b), xorBitsetIterative(b, a));

				// Associativity: (a ^ b) ^ c === a ^ (b ^ c)
				assert.equal(
					xorBitsetIterative(xorBitsetIterative(a, b), c),
					xorBitsetIterative(a, xorBitsetIterative(b, c))
				);

				// Involution / recovery: (a ^ b) ^ b === a
				assert.equal(xorBitsetIterative(xorBitsetIterative(a, b), b), a);
			}
		});
	});
});
