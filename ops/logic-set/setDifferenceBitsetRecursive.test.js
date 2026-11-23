import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceBitsetRecursive } from './setDifferenceBitsetRecursive.js';

/**
 * Converts a non-negative BigInt bitset into a Set of 0-based bit indices.
 *
 * @param {bigint} bitset
 * @returns {Set<number>}
 */
function bitsetToIndexSet(bitset) {
	const indices = new Set();
	let value = bitset;
	let index = 0;
	while (value > 0n) {
		if ((value & 1n) === 1n) {
			indices.add(index);
		}
		value >>= 1n;
		index += 1;
	}
	return indices;
}

/**
 * Converts a Set (or iterable) of non-negative integer bit indices into a BigInt bitset.
 *
 * @param {Iterable<number>} indices
 * @returns {bigint}
 */
function indexSetToBitset(indices) {
	let bitset = 0n;
	for (const index of indices) {
		bitset |= 1n << BigInt(index);
	}
	return bitset;
}

describe('setDifferenceBitsetRecursive', () => {
	it('computes set difference for standard overlapping bitsets', () => {
		assert.equal(setDifferenceBitsetRecursive(0b110110n, 0b101100n), 0b010010n);
		assert.equal(setDifferenceBitsetRecursive(0b1111n, 0b0101n), 0b1010n);
		assert.equal(setDifferenceBitsetRecursive(0b10101010n, 0b11001100n), 0b00100010n);
	});

	it('handles empty sets', () => {
		assert.equal(setDifferenceBitsetRecursive(0n, 0n), 0n);
		assert.equal(setDifferenceBitsetRecursive(0n, 0b111111n), 0n);
		assert.equal(setDifferenceBitsetRecursive(0b101101n, 0n), 0b101101n);
	});

	it('handles identical sets and subsets', () => {
		assert.equal(setDifferenceBitsetRecursive(1n, 1n), 0n);
		assert.equal(setDifferenceBitsetRecursive(0xdeadbeefn, 0xdeadbeefn), 0n);
		// A is a strict subset of B => A \ B = 0n
		assert.equal(setDifferenceBitsetRecursive(0b001010n, 0b111111n), 0n);
		// B is a strict subset of A => A \ B = A - B
		assert.equal(setDifferenceBitsetRecursive(0b111111n, 0b001010n), 0b110101n);
	});

	it('handles disjoint sets', () => {
		assert.equal(setDifferenceBitsetRecursive(0b10101010n, 0b01010101n), 0b10101010n);
		assert.equal(setDifferenceBitsetRecursive(1n << 40n, 1n << 41n), 1n << 40n);
	});

	it('handles asymmetric bit widths (a much wider than b, and b much wider than a)', () => {
		const aWide = (1n << 700n) | (1n << 350n) | 0b1011n;
		const bNarrow = 0b0010n;
		assert.equal(setDifferenceBitsetRecursive(aWide, bNarrow), (1n << 700n) | (1n << 350n) | 0b1001n);

		const aNarrow = 0b101101n;
		const bWide = (1n << 900n) | (1n << 512n) | 0b001100n;
		assert.equal(setDifferenceBitsetRecursive(aNarrow, bWide), 0b100001n);
	});

	it('handles very wide bitsets (>512 bits), both sparse and dense', () => {
		// Sparse >512-bit bitsets (up to bit 1500)
		const aSparse = (1n << 1500n) | (1n << 1024n) | (1n << 600n) | (1n << 513n) | (1n << 7n) | 1n;
		const bSparse = (1n << 1024n) | (1n << 513n) | (1n << 200n) | 1n;
		const expectedSparse = (1n << 1500n) | (1n << 600n) | (1n << 7n);
		assert.equal(setDifferenceBitsetRecursive(aSparse, bSparse), expectedSparse);

		// Dense 1024-bit bitsets with repeating patterns
		const all1024 = (1n << 1024n) - 1n;
		let even1024 = 0n;
		for (let i = 0; i < 1024; i += 2) {
			even1024 |= 1n << BigInt(i);
		}
		const odd1024 = all1024 ^ even1024;
		assert.equal(setDifferenceBitsetRecursive(all1024, even1024), odd1024);
		assert.equal(setDifferenceBitsetRecursive(all1024, all1024), 0n);
		assert.equal(setDifferenceBitsetRecursive(odd1024, even1024), odd1024);
	});

	it('satisfies set-difference algebraic laws across wide inputs', () => {
		const a = (1n << 640n) | (0xabcdef1234567890n << 300n) | 0xf0f0f0f0n;
		const b = (1n << 640n) | (0x1234567890abcdefn << 300n) | 0x0f0f0f0fn;
		const diff = setDifferenceBitsetRecursive(a, b);

		// (A \ B) is disjoint from B
		assert.equal(diff & b, 0n);
		// (A \ B) union (A intersect B) equals A
		assert.equal(diff | (a & b), a);
		// Idempotence: (A \ B) \ B === A \ B
		assert.equal(setDifferenceBitsetRecursive(diff, b), diff);
	});

	it('matches independent Set difference over bit indices (including >512-bit bitsets)', () => {
		const cases = [
			[
				[0, 1, 2, 5, 10, 31, 32, 63, 64],
				[1, 5, 32, 64, 100],
			],
			[
				[0, 7, 13, 65, 128, 255, 256, 511, 512, 513, 777, 1023],
				[7, 65, 256, 512, 777, 888, 1200],
			],
			[
				Array.from({ length: 120 }, (_, i) => i * 7),
				Array.from({ length: 120 }, (_, i) => i * 5),
			],
		];

		for (const [aIndices, bIndices] of cases) {
			const setA = new Set(aIndices);
			const setB = new Set(bIndices);
			const expectedSet = new Set([...setA].filter((x) => !setB.has(x)));

			const bitsetA = indexSetToBitset(setA);
			const bitsetB = indexSetToBitset(setB);
			const actualBitset = setDifferenceBitsetRecursive(bitsetA, bitsetB);

			assert.deepEqual(bitsetToIndexSet(actualBitset), expectedSet);
			assert.equal(actualBitset, indexSetToBitset(expectedSet));
		}
	});

	it('throws TypeError for non-BigInt inputs', () => {
		const invalidValues = [0, 1, 42, NaN, Infinity, '1', '0n', null, undefined, {}, [], true, Symbol('x')];
		for (const bad of invalidValues) {
			assert.throws(() => setDifferenceBitsetRecursive(bad, 1n), TypeError);
			assert.throws(() => setDifferenceBitsetRecursive(1n, bad), TypeError);
		}
	});

	it('throws RangeError for negative BigInt inputs', () => {
		assert.throws(() => setDifferenceBitsetRecursive(-1n, 0n), RangeError);
		assert.throws(() => setDifferenceBitsetRecursive(0n, -1n), RangeError);
		assert.throws(() => setDifferenceBitsetRecursive(-1n, -1n), RangeError);
		assert.throws(() => setDifferenceBitsetRecursive(-(1n << 600n), 1n), RangeError);
		assert.throws(() => setDifferenceBitsetRecursive(1n, -(1n << 600n)), RangeError);
	});
});
