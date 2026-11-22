import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceBitsetSeries } from './setDifferenceBitsetSeries.js';

/**
 * Helper: convert a non-negative BigInt bitset to a JS Set of bit indices.
 */
function bitsetToSet(bits) {
	const result = new Set();
	let remaining = bits;
	let index = 0;
	while (remaining > 0n) {
		if ((remaining & 1n) === 1n) {
			result.add(index);
		}
		remaining >>= 1n;
		index += 1;
	}
	return result;
}

/**
 * Helper: convert a JS Set of non-negative integer indices to a BigInt bitset.
 */
function setToBitset(set) {
	let result = 0n;
	for (const index of set) {
		result |= 1n << BigInt(index);
	}
	return result;
}

/**
 * Independent reference: explicit JS Set difference.
 */
function referenceSetDifference(a, b) {
	const setA = bitsetToSet(a);
	const setB = bitsetToSet(b);
	const diff = new Set();
	for (const elem of setA) {
		if (!setB.has(elem)) {
			diff.add(elem);
		}
	}
	return setToBitset(diff);
}

/**
 * Independent reference: term-by-term characteristic-function series
 * sum_{k >= 0} a_k * (1 - b_k) * 2^k.
 */
function referenceCharacteristicSeries(a, b) {
	let sum = 0n;
	let remA = a;
	let remB = b;
	let weight = 1n;
	while (remA > 0n) {
		const ak = remA & 1n;
		const bk = remB & 1n;
		sum += ak * (1n - bk) * weight;
		remA >>= 1n;
		remB >>= 1n;
		weight <<= 1n;
	}
	return sum;
}

/**
 * Deterministic PRNG (xorshift64*) for reproducible multi-width bitset generation.
 */
function makeRng(seed) {
	let state = seed;
	return () => {
		state ^= state >> 12n;
		state ^= (state << 25n) & ((1n << 64n) - 1n);
		state ^= state >> 27n;
		return (state * 0x2545f4914f6cdd1dn) & ((1n << 64n) - 1n);
	};
}

function randomBitset(nextWord, numWords) {
	let acc = 0n;
	for (let i = 0; i < numWords; i += 1) {
		acc = (acc << 64n) | nextWord();
	}
	return acc;
}

describe('setDifferenceBitsetSeries', () => {
	describe('normal cases', () => {
		it('computes set difference for small overlapping sets', () => {
			// A = {0, 2, 3} = 0b1101, B = {0, 1, 2} = 0b0111 => A \ B = {3} = 0b1000
			assert.equal(setDifferenceBitsetSeries(0b1101n, 0b0111n), 0b1000n);
			// Reverse direction: B \ A = {1} = 0b0010 (non-commutative)
			assert.equal(setDifferenceBitsetSeries(0b0111n, 0b1101n), 0b0010n);
		});

		it('computes set difference for multi-byte bitsets', () => {
			const a = 0xf0f0_aaaa_1234_5678n;
			const b = 0x0ff0_5555_1234_00ffn;
			assert.equal(setDifferenceBitsetSeries(a, b), 0xf000_aaaa_0000_5600n);
		});

		it('removes a single element from a set', () => {
			const a = (1n << 10n) | (1n << 42n) | (1n << 99n);
			const b = 1n << 42n;
			assert.equal(setDifferenceBitsetSeries(a, b), (1n << 10n) | (1n << 99n));
		});
	});

	describe('edge cases', () => {
		it('handles empty sets', () => {
			assert.equal(setDifferenceBitsetSeries(0n, 0n), 0n);
			assert.equal(setDifferenceBitsetSeries(0n, 0b101010n), 0n);
			assert.equal(setDifferenceBitsetSeries(0n, (1n << 300n) - 1n), 0n);
			assert.equal(setDifferenceBitsetSeries(0b101010n, 0n), 0b101010n);
			assert.equal(setDifferenceBitsetSeries(1n << 512n, 0n), 1n << 512n);
		});

		it('returns 0n for A \\ A across widths', () => {
			const samples = [
				0n,
				1n,
				0b10110101n,
				(1n << 64n) - 1n,
				(1n << 257n) | (1n << 128n) | 1n,
				(1n << 1024n) - 1n,
			];
			for (const a of samples) {
				assert.equal(setDifferenceBitsetSeries(a, a), 0n);
			}
		});

		it('leaves A unchanged when A and B are disjoint', () => {
			// Alternating even vs odd bit positions across 320 bits
			let evenMask = 0n;
			let oddMask = 0n;
			for (let i = 0; i < 320; i += 2) {
				evenMask |= 1n << BigInt(i);
				oddMask |= 1n << BigInt(i + 1);
			}
			assert.equal(setDifferenceBitsetSeries(evenMask, oddMask), evenMask);
			assert.equal(setDifferenceBitsetSeries(oddMask, evenMask), oddMask);
		});

		it('handles subset and superset relationships', () => {
			const subset = 0b1010_0001n | (1n << 300n);
			const superset = subset | 0b0101_1110n | (1n << 301n) | (1n << 500n);

			// subset \ superset === empty
			assert.equal(setDifferenceBitsetSeries(subset, superset), 0n);
			// superset \ subset === exact complement within superset
			assert.equal(
				setDifferenceBitsetSeries(superset, subset),
				0b0101_1110n | (1n << 301n) | (1n << 500n),
			);
		});

		it('handles arbitrary-width (>256-bit and >4096-bit) bitsets', () => {
			const all300 = (1n << 300n) - 1n;
			const low150 = (1n << 150n) - 1n;
			const high150 = all300 - low150;
			assert.equal(setDifferenceBitsetSeries(all300, low150), high150);
			assert.equal(setDifferenceBitsetSeries(all300, high150), low150);

			// Sparse >4096-bit sets
			const sparseA = (1n << 4096n) | (1n << 2048n) | (1n << 512n) | 1n;
			const sparseB = (1n << 4097n) | (1n << 2048n) | (1n << 256n) | 1n;
			assert.equal(
				setDifferenceBitsetSeries(sparseA, sparseB),
				(1n << 4096n) | (1n << 512n),
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when a or b is not a bigint', () => {
			const invalidTypes = [
				0,
				1,
				42,
				-1,
				NaN,
				Infinity,
				'0',
				'123',
				true,
				false,
				null,
				undefined,
				{},
				[],
				Symbol('x'),
				() => 0n,
				Object(1n),
			];

			for (const bad of invalidTypes) {
				assert.throws(
					() => setDifferenceBitsetSeries(bad, 0n),
					{ name: 'TypeError' },
				);
				assert.throws(
					() => setDifferenceBitsetSeries(0n, bad),
					{ name: 'TypeError' },
				);
			}

			// Missing arguments
			assert.throws(() => setDifferenceBitsetSeries(), { name: 'TypeError' });
			assert.throws(() => setDifferenceBitsetSeries(5n), { name: 'TypeError' });
		});

		it('throws RangeError when a or b is a negative bigint', () => {
			const negatives = [-1n, -2n, -42n, -(1n << 64n), -(1n << 300n)];
			for (const neg of negatives) {
				assert.throws(
					() => setDifferenceBitsetSeries(neg, 0n),
					{ name: 'RangeError' },
				);
				assert.throws(
					() => setDifferenceBitsetSeries(0n, neg),
					{ name: 'RangeError' },
				);
				assert.throws(
					() => setDifferenceBitsetSeries(neg, neg),
					{ name: 'RangeError' },
				);
			}
		});

		it('validates types before range when combining invalid type and negative value', () => {
			assert.throws(() => setDifferenceBitsetSeries(-1n, 5), { name: 'TypeError' });
			assert.throws(() => setDifferenceBitsetSeries('5', -1n), { name: 'TypeError' });
		});
	});

	describe('cross-checks and algebraic identities', () => {
		it('matches explicit JS Set difference, a & ~b, (a | b) - b, and term-by-term series', () => {
			const nextWord = makeRng(0x1234_5678_9abc_def1n);
			const pairs = [
				[0n, 0n],
				[0n, 0xffn],
				[0xffn, 0n],
				[0b1010101n, 0b0110011n],
				[1n << 256n, (1n << 256n) - 1n],
				[(1n << 260n) - 1n, (1n << 130n) | (1n << 259n)],
			];

			for (let words = 1; words <= 6; words += 1) {
				for (let trial = 0; trial < 8; trial += 1) {
					pairs.push([randomBitset(nextWord, words), randomBitset(nextWord, words)]);
				}
			}

			for (const [a, b] of pairs) {
				const actual = setDifferenceBitsetSeries(a, b);
				const expectedSet = referenceSetDifference(a, b);
				const expectedBitwise = a & ~b;
				const expectedUnionMinus = (a | b) - b;
				const expectedSeries = referenceCharacteristicSeries(a, b);

				assert.equal(actual, expectedSet);
				assert.equal(actual, expectedBitwise);
				assert.equal(actual, expectedUnionMinus);
				assert.equal(actual, expectedSeries);
			}
		});

		it('satisfies set-algebraic identities across >256-bit sets', () => {
			const nextWord = makeRng(0xfedc_ba98_7654_3210n);

			for (let trial = 0; trial < 20; trial += 1) {
				const a = randomBitset(nextWord, 5); // 320-bit
				const b = randomBitset(nextWord, 5);
				const c = randomBitset(nextWord, 5);

				const diffAB = setDifferenceBitsetSeries(a, b);
				const diffBA = setDifferenceBitsetSeries(b, a);

				// Result is non-negative and disjoint from B
				assert.ok(diffAB >= 0n);
				assert.equal(diffAB & b, 0n);

				// Partitioning of A: (A \ B) union (A & B) = A, and they are disjoint
				assert.equal(diffAB | (a & b), a);
				assert.equal(diffAB & (a & b), 0n);

				// Symmetric difference: (A \ B) | (B \ A) === A ^ B
				assert.equal(diffAB | diffBA, a ^ b);

				// Right chaining: (A \ B) \ C === A \ (B | C)
				assert.equal(
					setDifferenceBitsetSeries(diffAB, c),
					setDifferenceBitsetSeries(a, b | c),
				);

				// Relative De Morgan laws:
				// A \ (B & C) === (A \ B) | (A \ C)
				assert.equal(
					setDifferenceBitsetSeries(a, b & c),
					setDifferenceBitsetSeries(a, b) | setDifferenceBitsetSeries(a, c),
				);
				// A \ (B | C) === (A \ B) & (A \ C)
				assert.equal(
					setDifferenceBitsetSeries(a, b | c),
					setDifferenceBitsetSeries(a, b) & setDifferenceBitsetSeries(a, c),
				);

				// Distributivity over union and intersection:
				assert.equal(
					setDifferenceBitsetSeries(a | b, c),
					setDifferenceBitsetSeries(a, c) | setDifferenceBitsetSeries(b, c),
				);
				assert.equal(
					setDifferenceBitsetSeries(a & b, c),
					setDifferenceBitsetSeries(a, c) & setDifferenceBitsetSeries(b, c),
				);
			}
		});
	});
});
