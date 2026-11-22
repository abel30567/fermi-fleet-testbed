import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionSortedArrSeries } from './unionSortedArrSeries.js';

/**
 * Independent reference union using JavaScript's built-in Set + numeric sort.
 * Normalizes -0 to 0 to match canonical numeric set representation.
 *
 * @param {...(readonly number[])} arrays
 * @returns {number[]}
 */
function referenceSetUnion(...arrays) {
	const set = new Set();
	for (const arr of arrays) {
		for (const x of arr) {
			set.add(x === 0 ? 0 : x);
		}
	}
	return [...set].sort((a, b) => a - b);
}

/**
 * Independent reference intersection cardinality using Set.
 *
 * @param {...(readonly number[])} arrays
 * @returns {number}
 */
function referenceIntersectionSize(...arrays) {
	if (arrays.length === 0) return 0;
	let acc = new Set(arrays[0].map((x) => (x === 0 ? 0 : x)));
	for (let i = 1; i < arrays.length; i++) {
		const nextSet = new Set(arrays[i].map((x) => (x === 0 ? 0 : x)));
		const filtered = new Set();
		for (const v of acc) {
			if (nextSet.has(v)) filtered.add(v);
		}
		acc = filtered;
	}
	return acc.size;
}

/**
 * Deterministic PRNG (LCG) for reproducible cross-check test generation.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

/**
 * Generates a sorted, de-duplicated finite numeric array using the given PRNG.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function generateSortedUnique(rng, maxLen, minVal, maxVal) {
	const count = Math.floor(rng() * (maxLen + 1));
	const set = new Set();
	for (let i = 0; i < count; i++) {
		const val = minVal + Math.floor(rng() * (maxVal - minVal + 1));
		set.add(val === 0 ? 0 : val);
	}
	return [...set].sort((a, b) => a - b);
}

describe('unionSortedArrSeries', () => {
	describe('normal binary and k-way cases', () => {
		it('computes union of two disjoint sorted arrays', () => {
			assert.deepStrictEqual(
				unionSortedArrSeries([1, 3, 5], [2, 4, 6]),
				[1, 2, 3, 4, 5, 6]
			);
			assert.deepStrictEqual(
				unionSortedArrSeries([-10, -5], [0, 5, 10]),
				[-10, -5, 0, 5, 10]
			);
		});

		it('computes union of overlapping arrays without duplicates', () => {
			assert.deepStrictEqual(
				unionSortedArrSeries([1, 2, 3, 4], [3, 4, 5, 6]),
				[1, 2, 3, 4, 5, 6]
			);
		});

		it('handles subset, superset, and identical arrays', () => {
			assert.deepStrictEqual(
				unionSortedArrSeries([2, 4], [1, 2, 3, 4, 5]),
				[1, 2, 3, 4, 5]
			);
			assert.deepStrictEqual(
				unionSortedArrSeries([1, 2, 3, 4, 5], [2, 4]),
				[1, 2, 3, 4, 5]
			);
			assert.deepStrictEqual(
				unionSortedArrSeries([-3, 0, 7], [-3, 0, 7]),
				[-3, 0, 7]
			);
		});

		it('handles floating-point, extreme finite, and subnormal numbers', () => {
			const a = [-Number.MAX_VALUE, -1.5, -Number.MIN_VALUE, 0.25, Number.MAX_SAFE_INTEGER];
			const b = [Number.MIN_SAFE_INTEGER, -1.5, 0, Number.MIN_VALUE, 0.25, Number.MAX_VALUE];
			assert.deepStrictEqual(
				unionSortedArrSeries(a, b),
				[
					-Number.MAX_VALUE,
					Number.MIN_SAFE_INTEGER,
					-1.5,
					-Number.MIN_VALUE,
					0,
					Number.MIN_VALUE,
					0.25,
					Number.MAX_SAFE_INTEGER,
					Number.MAX_VALUE
				]
			);
		});

		it('computes k-way union for even and odd numbers of arrays', () => {
			// 3 arrays (odd)
			assert.deepStrictEqual(
				unionSortedArrSeries([1, 4, 7], [2, 4, 8], [3, 7, 9]),
				[1, 2, 3, 4, 7, 8, 9]
			);
			// 4 arrays (even)
			assert.deepStrictEqual(
				unionSortedArrSeries([-5, 0], [-2, 0, 2], [1, 2, 3], [-5, 4]),
				[-5, -2, 0, 1, 2, 3, 4]
			);
			// 5 arrays (odd, exercises unpaired carry across passes)
			assert.deepStrictEqual(
				unionSortedArrSeries([10], [2, 10], [1, 5], [3, 5, 8], [0, 9]),
				[0, 1, 2, 3, 5, 8, 9, 10]
			);
		});
	});

	describe('edge cases', () => {
		it('returns empty array for 0 arguments (nullary union)', () => {
			assert.deepStrictEqual(unionSortedArrSeries(), []);
		});

		it('returns a fresh copy for a single argument', () => {
			const input = [1, 2, 3];
			const result = unionSortedArrSeries(input);
			assert.deepStrictEqual(result, [1, 2, 3]);
			assert.notStrictEqual(result, input);
			assert.deepStrictEqual(unionSortedArrSeries([]), []);
		});

		it('handles empty arrays in binary and k-way calls', () => {
			assert.deepStrictEqual(unionSortedArrSeries([], []), []);
			assert.deepStrictEqual(unionSortedArrSeries([], [1, 2, 3]), [1, 2, 3]);
			assert.deepStrictEqual(unionSortedArrSeries([1, 2, 3], []), [1, 2, 3]);
			assert.deepStrictEqual(unionSortedArrSeries([], [], [], []), []);
			assert.deepStrictEqual(
				unionSortedArrSeries([], [2, 5], [], [1, 5, 9], []),
				[1, 2, 5, 9]
			);
		});

		it('normalizes -0 to +0 across all code paths', () => {
			const single = unionSortedArrSeries([-0]);
			assert.equal(Object.is(single[0], 0), true);

			const binaryMatch = unionSortedArrSeries([-1, -0, 2], [0, 3]);
			assert.deepStrictEqual(binaryMatch, [-1, 0, 2, 3]);
			assert.equal(Object.is(binaryMatch[1], 0), true);

			const binaryEmptyOther = unionSortedArrSeries([], [-0, 1]);
			assert.equal(Object.is(binaryEmptyOther[0], 0), true);

			const kway = unionSortedArrSeries([], [-0], [-2, 2]);
			assert.deepStrictEqual(kway, [-2, 0, 2]);
			assert.equal(Object.is(kway[1], 0), true);
		});

		it('does not mutate frozen input arrays', () => {
			const a = Object.freeze([1, 3, 5]);
			const b = Object.freeze([2, 3, 6]);
			const c = Object.freeze([0, 6, 7]);
			const result = unionSortedArrSeries(a, b, c);
			assert.deepStrictEqual(result, [0, 1, 2, 3, 5, 6, 7]);
			assert.deepStrictEqual(a, [1, 3, 5]);
			assert.deepStrictEqual(b, [2, 3, 6]);
			assert.deepStrictEqual(c, [0, 6, 7]);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Array arguments', () => {
			const invalidArgs = [
				null,
				undefined,
				42,
				'123',
				{ 0: 1, length: 1 },
				new Set([1, 2]),
				new Float64Array([1, 2])
			];
			for (const bad of invalidArgs) {
				assert.throws(() => unionSortedArrSeries(bad), TypeError);
				assert.throws(() => unionSortedArrSeries([1, 2], bad), TypeError);
				assert.throws(() => unionSortedArrSeries([], [1], bad), TypeError);
			}
		});

		it('throws TypeError for non-number elements', () => {
			const badElements = ['1', null, undefined, true, 1n, {}, []];
			for (const elem of badElements) {
				assert.throws(() => unionSortedArrSeries([elem]), TypeError);
				assert.throws(() => unionSortedArrSeries([1, 2], [0, elem]), TypeError);
			}
		});

		it('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
			assert.throws(() => unionSortedArrSeries([NaN]), RangeError);
			assert.throws(() => unionSortedArrSeries([1, NaN, 3]), RangeError);
			assert.throws(() => unionSortedArrSeries([1, Infinity]), RangeError);
			assert.throws(() => unionSortedArrSeries([-Infinity, 0]), RangeError);
			assert.throws(() => unionSortedArrSeries([1, 2], [3, Infinity]), RangeError);
		});

		it('throws RangeError for unsorted arrays', () => {
			assert.throws(() => unionSortedArrSeries([2, 1]), RangeError);
			assert.throws(() => unionSortedArrSeries([1, 3, 2, 4]), RangeError);
			assert.throws(() => unionSortedArrSeries([1, 2], [5, 4, 6]), RangeError);
			assert.throws(() => unionSortedArrSeries([], [1, 2], [3, 0]), RangeError);
		});

		it('throws RangeError for arrays containing duplicates (including -0 and +0)', () => {
			assert.throws(() => unionSortedArrSeries([1, 1]), RangeError);
			assert.throws(() => unionSortedArrSeries([1, 2, 2, 3]), RangeError);
			assert.throws(() => unionSortedArrSeries([-0, 0]), RangeError);
			assert.throws(() => unionSortedArrSeries([1, 2], [3, 4, 4]), RangeError);
		});
	});

	describe('mathematical cross-checks and identities', () => {
		it('matches Set-based union + sort across deterministic randomized trials', () => {
			const rng = makeRng(0x5eed1234);
			for (const k of [1, 2, 3, 5, 8, 11]) {
				for (let trial = 0; trial < 25; trial++) {
					const inputs = [];
					for (let i = 0; i < k; i++) {
						inputs.push(generateSortedUnique(rng, 25, -40, 40));
					}
					const actual = unionSortedArrSeries(...inputs);
					const expected = referenceSetUnion(...inputs);
					assert.deepStrictEqual(actual, expected);

					// Output invariant: strictly increasing
					for (let j = 1; j < actual.length; j++) {
						assert.ok(actual[j] > actual[j - 1]);
					}
				}
			}
		});

		it('satisfies binary inclusion-exclusion identity |A ∪ B| = |A| + |B| - |A ∩ B|', () => {
			const rng = makeRng(0xabcde123);
			for (let trial = 0; trial < 50; trial++) {
				const a = generateSortedUnique(rng, 30, -25, 25);
				const b = generateSortedUnique(rng, 30, -25, 25);
				const unionAB = unionSortedArrSeries(a, b);
				const interAB = referenceIntersectionSize(a, b);
				assert.equal(unionAB.length, a.length + b.length - interAB);
			}
		});

		it('satisfies ternary inclusion-exclusion identity |A ∪ B ∪ C|', () => {
			const rng = makeRng(0x98765432);
			for (let trial = 0; trial < 40; trial++) {
				const a = generateSortedUnique(rng, 20, -15, 15);
				const b = generateSortedUnique(rng, 20, -15, 15);
				const c = generateSortedUnique(rng, 20, -15, 15);
				const unionABC = unionSortedArrSeries(a, b, c);
				const expectedSize =
					a.length +
					b.length +
					c.length -
					referenceIntersectionSize(a, b) -
					referenceIntersectionSize(a, c) -
					referenceIntersectionSize(b, c) +
					referenceIntersectionSize(a, b, c);
				assert.equal(unionABC.length, expectedSize);
			}
		});

		it('satisfies set algebra laws (commutativity, associativity, idempotence, identity)', () => {
			const rng = makeRng(0x13579bdf);
			for (let trial = 0; trial < 25; trial++) {
				const a = generateSortedUnique(rng, 18, -20, 20);
				const b = generateSortedUnique(rng, 18, -20, 20);
				const c = generateSortedUnique(rng, 18, -20, 20);

				// Commutativity: A ∪ B = B ∪ A
				assert.deepStrictEqual(
					unionSortedArrSeries(a, b),
					unionSortedArrSeries(b, a)
				);

				// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C) = union(A, B, C)
				const leftAssoc = unionSortedArrSeries(unionSortedArrSeries(a, b), c);
				const rightAssoc = unionSortedArrSeries(a, unionSortedArrSeries(b, c));
				const kway = unionSortedArrSeries(a, b, c);
				assert.deepStrictEqual(leftAssoc, rightAssoc);
				assert.deepStrictEqual(leftAssoc, kway);

				// Idempotence: A ∪ A = A
				assert.deepStrictEqual(unionSortedArrSeries(a, a), a);

				// Identity: A ∪ ∅ = ∅ ∪ A = A
				assert.deepStrictEqual(unionSortedArrSeries(a, []), a);
				assert.deepStrictEqual(unionSortedArrSeries([], a), a);
			}
		});
	});
});
