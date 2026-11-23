import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orSortedArrSeries } from './orSortedArrSeries.js';

/**
 * Independent reference oracle using Set + numeric sort.
 *
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function referenceUnion(...arrays) {
	const set = new Set();
	for (const arr of arrays) {
		for (const x of arr) {
			set.add(x === 0 ? 0 : x);
		}
	}
	return Array.from(set).sort((x, y) => x - y);
}

/**
 * Independent set intersection helper for algebraic cross-checks.
 *
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number[]}
 */
function referenceIntersection(a, b) {
	const setB = new Set(b.map((x) => (x === 0 ? 0 : x)));
	return a.map((x) => (x === 0 ? 0 : x)).filter((x) => setB.has(x));
}

/**
 * Independent set difference helper (U \ A) for De Morgan cross-checks.
 *
 * @param {number[]} universe
 * @param {number[]} subset
 * @returns {number[]}
 */
function referenceDifference(universe, subset) {
	const setSub = new Set(subset.map((x) => (x === 0 ? 0 : x)));
	return universe.map((x) => (x === 0 ? 0 : x)).filter((x) => !setSub.has(x));
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates a sorted, de-duplicated integer array using the supplied RNG.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @returns {number[]}
 */
function genSortedUnique(rng, maxLen, minVal, maxVal) {
	const targetLen = Math.floor(rng() * (maxLen + 1));
	const set = new Set();
	const span = maxVal - minVal + 1;
	for (let i = 0; i < targetLen; i++) {
		set.add(minVal + Math.floor(rng() * span));
	}
	return Array.from(set).sort((x, y) => x - y);
}

describe('orSortedArrSeries', () => {
	describe('normal cases', () => {
		it('computes logical OR (union) of interleaved arrays with overlap', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 3, 5, 7], [2, 3, 6, 7, 8]),
				[1, 2, 3, 5, 6, 7, 8],
			);
		});

		it('handles negative numbers and floating-point values', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([-10.5, -2, 0, 1.25], [-5, -2, 0.5, 1.25, 3.14]),
				[-10.5, -5, -2, 0, 0.5, 1.25, 3.14],
			);
		});

		it('handles absorption when one array is a subset of the other', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([2, 4], [1, 2, 3, 4, 5]),
				[1, 2, 3, 4, 5],
			);
			assert.deepStrictEqual(
				orSortedArrSeries([1, 2, 3, 4, 5], [2, 4]),
				[1, 2, 3, 4, 5],
			);
		});

		it('handles identical arrays with distinct references (idempotence)', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 2, 3], [1, 2, 3]),
				[1, 2, 3],
			);
		});

		it('handles multi-array variadic union via balanced merge reduction', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 4, 7], [2, 4, 6], [3, 6, 9], [0, 5, 10], [-2, 7]),
				[-2, 0, 1, 2, 3, 4, 5, 6, 7, 9, 10],
			);
		});
	});

	describe('edge cases', () => {
		it('handles empty arrays (identity law)', () => {
			assert.deepStrictEqual(orSortedArrSeries([], []), []);
			assert.deepStrictEqual(orSortedArrSeries([], [1, 2, 3]), [1, 2, 3]);
			assert.deepStrictEqual(orSortedArrSeries([1, 2, 3], []), [1, 2, 3]);
		});

		it('handles single-element arrays', () => {
			assert.deepStrictEqual(orSortedArrSeries([5], [5]), [5]);
			assert.deepStrictEqual(orSortedArrSeries([3], [5]), [3, 5]);
			assert.deepStrictEqual(orSortedArrSeries([5], [3]), [3, 5]);
		});

		it('handles disjoint ordered intervals in both orders', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 2, 3], [10, 20, 30]),
				[1, 2, 3, 10, 20, 30],
			);
			assert.deepStrictEqual(
				orSortedArrSeries([10, 20, 30], [1, 2, 3]),
				[1, 2, 3, 10, 20, 30],
			);
		});

		it('handles overlap only at boundary endpoints', () => {
			assert.deepStrictEqual(
				orSortedArrSeries([1, 2, 3], [3, 4, 5]),
				[1, 2, 3, 4, 5],
			);
			assert.deepStrictEqual(
				orSortedArrSeries([3, 4, 5], [1, 2, 3]),
				[1, 2, 3, 4, 5],
			);
		});

		it('normalizes -0 to +0 so commutativity holds under Object.is', () => {
			const ab = orSortedArrSeries([-0, 1], [0, 2]);
			const ba = orSortedArrSeries([0, 2], [-0, 1]);
			assert.deepStrictEqual(ab, [0, 1, 2]);
			assert.deepStrictEqual(ba, [0, 1, 2]);
			assert.ok(Object.is(ab[0], 0));
			assert.ok(Object.is(orSortedArrSeries([-0], [])[0], 0));
		});

		it('handles extreme finite numbers', () => {
			const a = [-Number.MAX_VALUE, -Number.MIN_VALUE, Number.MAX_SAFE_INTEGER];
			const b = [Number.MIN_SAFE_INTEGER, 0, Number.MIN_VALUE, Number.MAX_VALUE];
			assert.deepStrictEqual(
				orSortedArrSeries(a, b),
				[
					-Number.MAX_VALUE,
					Number.MIN_SAFE_INTEGER,
					-Number.MIN_VALUE,
					0,
					Number.MIN_VALUE,
					Number.MAX_SAFE_INTEGER,
					Number.MAX_VALUE,
				],
			);
		});

		it('never mutates inputs and always returns a fresh array reference', () => {
			const a = [1, 2, 3];
			const b = [2, 3, 4];
			const sameRef = orSortedArrSeries(a, a);
			const emptyRight = orSortedArrSeries(a, []);
			const emptyLeft = orSortedArrSeries([], b);
			const merged = orSortedArrSeries(a, b);

			assert.notEqual(sameRef, a);
			assert.notEqual(emptyRight, a);
			assert.notEqual(emptyLeft, b);
			assert.notEqual(merged, a);
			assert.notEqual(merged, b);

			sameRef.push(999);
			emptyRight.push(999);
			assert.deepStrictEqual(a, [1, 2, 3]);
			assert.deepStrictEqual(b, [2, 3, 4]);
		});

		it('handles large sorted arrays efficiently', () => {
			const n = 10000;
			const evens = Array.from({ length: n }, (_, i) => i * 2);
			const mult3 = Array.from({ length: n }, (_, i) => i * 3);
			const result = orSortedArrSeries(evens, mult3);

			// Verify strictly ascending and cardinality via inclusion-exclusion
			for (let i = 1; i < result.length; i++) {
				assert.ok(result[i - 1] < result[i]);
			}
			// Intersection of {0, 2, ..., 2(n-1)} and {0, 3, ..., 3(n-1)} is multiples of 6 <= 2(n-1)
			const maxOverlap = Math.min(evens[n - 1], mult3[n - 1]);
			const expectedOverlap = Math.floor(maxOverlap / 6) + 1;
			assert.equal(result.length, evens.length + mult3.length - expectedOverlap);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when fewer than 2 arguments are provided', () => {
			assert.throws(() => orSortedArrSeries(), TypeError);
			assert.throws(() => orSortedArrSeries([1, 2]), TypeError);
		});

		it('throws TypeError for non-array arguments', () => {
			for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2]), new Int32Array([1, 2])]) {
				assert.throws(() => orSortedArrSeries(bad, [1, 2]), TypeError);
				assert.throws(() => orSortedArrSeries([1, 2], bad), TypeError);
				assert.throws(() => orSortedArrSeries([1], [2], bad), TypeError);
			}
		});

		it('throws TypeError for non-number or non-finite elements', () => {
			assert.throws(() => orSortedArrSeries([1, '2'], [3]), TypeError);
			assert.throws(() => orSortedArrSeries([1, null], [3]), TypeError);
			assert.throws(() => orSortedArrSeries([1, undefined], [3]), TypeError);
			assert.throws(() => orSortedArrSeries([1, true], [3]), TypeError);
			assert.throws(() => orSortedArrSeries([1, 2n], [3]), TypeError);
			assert.throws(() => orSortedArrSeries([1, NaN], [3]), TypeError);
			assert.throws(() => orSortedArrSeries([1, Infinity], [3]), TypeError);
			assert.throws(() => orSortedArrSeries([-Infinity, 1], [3]), TypeError);
		});

		it('throws TypeError for sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3];
			assert.throws(() => orSortedArrSeries(sparse, [2]), TypeError);
			assert.throws(() => orSortedArrSeries([2], sparse), TypeError);
		});

		it('throws RangeError for unsorted arrays', () => {
			assert.throws(() => orSortedArrSeries([3, 1, 2], [1]), RangeError);
			assert.throws(() => orSortedArrSeries([1], [2, 1]), RangeError);
			assert.throws(() => orSortedArrSeries([1], [2], [5, 4, 6]), RangeError);
		});

		it('throws RangeError for arrays with duplicate elements', () => {
			assert.throws(() => orSortedArrSeries([1, 2, 2, 3], [4]), RangeError);
			assert.throws(() => orSortedArrSeries([4], [1, 1]), RangeError);
			assert.throws(() => orSortedArrSeries([-0, 0], [1]), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches Set+sort reference oracle across 100 deterministic random test cases', () => {
			const rng = makeRng(0x5eed1234);
			for (let trial = 0; trial < 100; trial++) {
				const a = genSortedUnique(rng, 40, -30, 30);
				const b = genSortedUnique(rng, 40, -30, 30);
				const expected = referenceUnion(a, b);
				const actual = orSortedArrSeries(a, b);
				assert.deepStrictEqual(actual, expected);
			}
		});

		it('satisfies Boolean / set-algebraic identities (commutativity, associativity, inclusion-exclusion, De Morgan)', () => {
			const rng = makeRng(0xabcdef01);
			const universe = Array.from({ length: 41 }, (_, i) => i - 20);

			for (let trial = 0; trial < 40; trial++) {
				const a = genSortedUnique(rng, 25, -20, 20);
				const b = genSortedUnique(rng, 25, -20, 20);
				const c = genSortedUnique(rng, 25, -20, 20);

				const ab = orSortedArrSeries(a, b);
				const ba = orSortedArrSeries(b, a);
				const abcLeft = orSortedArrSeries(ab, c);
				const abcRight = orSortedArrSeries(a, orSortedArrSeries(b, c));
				const abcVariadic = orSortedArrSeries(a, b, c);

				// Commutativity: A U B = B U A
				assert.deepStrictEqual(ab, ba);

				// Associativity: (A U B) U C = A U (B U C) = U(A, B, C)
				assert.deepStrictEqual(abcLeft, abcRight);
				assert.deepStrictEqual(abcLeft, abcVariadic);
				assert.deepStrictEqual(abcVariadic, referenceUnion(a, b, c));

				// Inclusion-Exclusion (2-set): |A U B| = |A| + |B| - |A n B|
				const interAB = referenceIntersection(a, b);
				assert.equal(ab.length, a.length + b.length - interAB.length);

				// Inclusion-Exclusion series (3-set):
				// |A U B U C| = |A| + |B| + |C| - |A n B| - |A n C| - |B n C| + |A n B n C|
				const interAC = referenceIntersection(a, c);
				const interBC = referenceIntersection(b, c);
				const interABC = referenceIntersection(interAB, c);
				assert.equal(
					abcVariadic.length,
					a.length + b.length + c.length - interAB.length - interAC.length - interBC.length + interABC.length,
				);

				// De Morgan's Law over universe U: A U B = U \ ((U \ A) n (U \ B))
				const compA = referenceDifference(universe, a);
				const compB = referenceDifference(universe, b);
				const deMorgan = referenceDifference(universe, referenceIntersection(compA, compB));
				assert.deepStrictEqual(ab, deMorgan);
			}
		});
	});
});
