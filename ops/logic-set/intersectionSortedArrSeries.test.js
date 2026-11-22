import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { intersectionSortedArrSeries } from './intersectionSortedArrSeries.js';

/**
 * Independent reference implementation using JavaScript Set.
 *
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function setIntersectionRef(...arrays) {
	if (arrays.length === 0) {
		return [];
	}
	let common = new Set(arrays[0].map((v) => (v === 0 ? 0 : v)));
	for (let i = 1; i < arrays.length; i++) {
		const next = new Set(arrays[i].map((v) => (v === 0 ? 0 : v)));
		const filtered = new Set();
		for (const x of common) {
			if (next.has(x)) {
				filtered.add(x);
			}
		}
		common = filtered;
	}
	return Array.from(common).sort((a, b) => a - b);
}

/**
 * Independent reference union of sorted numeric arrays using Set.
 *
 * @param {...number[]} arrays
 * @returns {number[]}
 */
function setUnionRef(...arrays) {
	const merged = new Set();
	for (const arr of arrays) {
		for (const v of arr) {
			merged.add(v === 0 ? 0 : v);
		}
	}
	return Array.from(merged).sort((a, b) => a - b);
}

/**
 * Independent reference set difference `u \ a` using Set.
 *
 * @param {number[]} universe
 * @param {number[]} subset
 * @returns {number[]}
 */
function setDiffRef(universe, subset) {
	const sub = new Set(subset.map((v) => (v === 0 ? 0 : v)));
	return universe.filter((v) => !sub.has(v === 0 ? 0 : v));
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property-based tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates a sorted, strictly increasing numeric array using a PRNG.
 *
 * @param {() => number} rng
 * @param {number} maxLen
 * @param {number} minVal
 * @param {number} maxVal
 * @param {boolean} [fractional=false]
 * @returns {number[]}
 */
function randomSortedArray(rng, maxLen, minVal, maxVal, fractional = false) {
	const count = Math.floor(rng() * (maxLen + 1));
	const set = new Set();
	for (let i = 0; i < count; i++) {
		const raw = minVal + rng() * (maxVal - minVal);
		const val = fractional ? Math.round(raw * 4) / 4 : Math.floor(raw);
		set.add(val === 0 ? 0 : val);
	}
	return Array.from(set).sort((a, b) => a - b);
}

describe('intersectionSortedArrSeries', () => {
	describe('two-array basic and edge cases', () => {
		it('computes intersection of overlapping sorted arrays', () => {
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 2, 3, 5, 8], [2, 4, 5, 7, 8, 10]),
				[2, 5, 8],
			);
		});

		it('handles identical arrays and subset/superset pairs', () => {
			assert.deepStrictEqual(
				intersectionSortedArrSeries([-10, 0, 10], [-10, 0, 10]),
				[-10, 0, 10],
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([2, 4], [1, 2, 3, 4, 5]),
				[2, 4],
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 2, 3, 4, 5], [2, 4]),
				[2, 4],
			);
		});

		it('handles disjoint arrays (separated and interleaved)', () => {
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 2, 3], [4, 5, 6]),
				[],
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([10, 20, 30], [-5, 0, 5]),
				[],
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 3, 5, 7], [2, 4, 6, 8]),
				[],
			);
		});

		it('handles single-element overlaps at boundaries and interior', () => {
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 2, 3], [3, 4, 5]),
				[3],
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([3, 4, 5], [1, 2, 3]),
				[3],
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 5, 9], [2, 5, 8]),
				[5],
			);
			assert.deepStrictEqual(intersectionSortedArrSeries([42], [42]), [42]);
			assert.deepStrictEqual(intersectionSortedArrSeries([42], [43]), []);
		});

		it('handles empty arrays', () => {
			assert.deepStrictEqual(intersectionSortedArrSeries([], []), []);
			assert.deepStrictEqual(intersectionSortedArrSeries([], [1, 2, 3]), []);
			assert.deepStrictEqual(intersectionSortedArrSeries([1, 2, 3], []), []);
		});

		it('supports negative, fractional, and extreme finite IEEE-754 numbers', () => {
			const a = [
				-Number.MAX_VALUE,
				Number.MIN_SAFE_INTEGER,
				-1.5,
				-Number.MIN_VALUE,
				0,
				Number.EPSILON,
				3.14159,
				Number.MAX_SAFE_INTEGER,
				Number.MAX_VALUE,
			];
			const b = [
				-Number.MAX_VALUE,
				-2.5,
				-1.5,
				Number.EPSILON,
				2.71828,
				Number.MAX_VALUE,
			];
			assert.deepStrictEqual(intersectionSortedArrSeries(a, b), [
				-Number.MAX_VALUE,
				-1.5,
				Number.EPSILON,
				Number.MAX_VALUE,
			]);
		});

		it('normalizes -0 to canonical +0', () => {
			const res1 = intersectionSortedArrSeries([-1, -0, 1], [-2, 0, 2]);
			assert.deepStrictEqual(res1, [0]);
			assert.strictEqual(Object.is(res1[0], 0), true);

			const res2 = intersectionSortedArrSeries([-2, 0, 2], [-1, -0, 1]);
			assert.deepStrictEqual(res2, [0]);
			assert.strictEqual(Object.is(res2[0], 0), true);

			const res3 = intersectionSortedArrSeries([-0]);
			assert.deepStrictEqual(res3, [0]);
			assert.strictEqual(Object.is(res3[0], 0), true);
		});

		it('does not mutate inputs and always returns a fresh array', () => {
			const a = [1, 2, 3];
			const b = [1, 2, 3];
			const single = intersectionSortedArrSeries(a);
			assert.deepStrictEqual(single, [1, 2, 3]);
			assert.notStrictEqual(single, a);

			const pair = intersectionSortedArrSeries(a, b);
			assert.deepStrictEqual(pair, [1, 2, 3]);
			assert.notStrictEqual(pair, a);
			assert.notStrictEqual(pair, b);
			pair.push(999);
			assert.deepStrictEqual(a, [1, 2, 3]);
			assert.deepStrictEqual(b, [1, 2, 3]);
		});
	});

	describe('series of 1 and 3+ arrays', () => {
		it('handles a single array (1-ary intersection)', () => {
			assert.deepStrictEqual(intersectionSortedArrSeries([]), []);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([-3, 0, 4.5, 9]),
				[-3, 0, 4.5, 9],
			);
		});

		it('intersects 3+ sorted arrays cleanly', () => {
			assert.deepStrictEqual(
				intersectionSortedArrSeries(
					[1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
					[2, 4, 6, 8, 10, 12],
					[3, 6, 9, 12, 15],
				),
				[6],
			);
		});

		it('returns empty when pairwise intersections exist but k-way intersection is empty', () => {
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 2], [2, 3], [1, 3]),
				[],
			);
		});

		it('handles collapsed bounding interval L === U accurately', () => {
			// L = max(1, 5, 0) = 5, U = min(5, 9, 10) = 5, and 5 IS in all arrays
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 5], [5, 9], [0, 5, 10]),
				[5],
			);
			// L = 5, U = 5, but 5 is NOT in the third array
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 5], [5, 9], [0, 10]),
				[],
			);
		});

		it('returns empty if any array in the series is empty', () => {
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 2], [], [1, 2, 3]),
				[],
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries([1, 2], [1, 2, 3], []),
				[],
			);
		});
	});

	describe('galloping merge vs linear merge regimes', () => {
		it('handles highly skewed array lengths via galloping merge', () => {
			const huge = Array.from({ length: 50000 }, (_, i) => i * 2); // even numbers 0..99998
			const tiny = [-10, 0, 1, 2, 17, 1000, 49998, 99998, 100000];
			const expected = [0, 2, 1000, 49998, 99998];

			assert.deepStrictEqual(intersectionSortedArrSeries(tiny, huge), expected);
			assert.deepStrictEqual(intersectionSortedArrSeries(huge, tiny), expected);
		});

		it('handles skewed arrays with no overlap inside overlapping bounds', () => {
			const huge = Array.from({ length: 20000 }, (_, i) => i * 2); // evens
			const tinyOdds = [1, 501, 10001, 39999];
			assert.deepStrictEqual(intersectionSortedArrSeries(tinyOdds, huge), []);
		});

		it('handles mixed series of huge, medium, and tiny arrays in any order', () => {
			const huge = Array.from({ length: 30000 }, (_, i) => i);
			const medium = Array.from({ length: 2000 }, (_, i) => i * 15);
			const tiny = [0, 15, 45, 75, 1500, 29985, 30000];
			const expected = [0, 15, 45, 75, 1500, 29985];

			assert.deepStrictEqual(
				intersectionSortedArrSeries(huge, medium, tiny),
				expected,
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries(tiny, huge, medium),
				expected,
			);
			assert.deepStrictEqual(
				intersectionSortedArrSeries(medium, tiny, huge),
				expected,
			);
		});
	});

	describe('input validation', () => {
		it('throws RangeError when called with zero arguments', () => {
			assert.throws(() => intersectionSortedArrSeries(), RangeError);
		});

		it('throws TypeError for non-Array arguments', () => {
			for (const invalid of [
				null,
				undefined,
				42,
				'123',
				{},
				new Set([1, 2]),
				new Int32Array([1, 2]),
			]) {
				assert.throws(
					() => intersectionSortedArrSeries(invalid),
					TypeError,
				);
				assert.throws(
					() => intersectionSortedArrSeries([1, 2], invalid),
					TypeError,
				);
			}
		});

		it('throws TypeError for non-number elements and sparse arrays', () => {
			for (const badArr of [
				['1', 2],
				[1, null, 3],
				[1, undefined, 3],
				[1, true, 3],
				[1, {}, 3],
				[1, 2n, 3],
				[[1, 2]],
			]) {
				assert.throws(() => intersectionSortedArrSeries(badArr), TypeError);
			}

			// Sparse array with hole
			const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
			assert.throws(() => intersectionSortedArrSeries(sparse), TypeError);
		});

		it('throws RangeError for non-finite numbers', () => {
			for (const badArr of [
				[NaN],
				[1, NaN, 3],
				[Infinity],
				[-Infinity, 0, 1],
				[0, 1, Infinity],
			]) {
				assert.throws(() => intersectionSortedArrSeries(badArr), RangeError);
			}
		});

		it('throws RangeError for unsorted or duplicate elements', () => {
			for (const badArr of [
				[2, 1],
				[1, 3, 2],
				[1, 1],
				[1, 2, 2, 3],
				[-0, 0],
				[0, -0],
			]) {
				assert.throws(() => intersectionSortedArrSeries(badArr), RangeError);
			}
		});

		it('validates all arguments even when an earlier array is empty or disjoint', () => {
			assert.throws(
				() => intersectionSortedArrSeries([], [3, 1]),
				RangeError,
			);
			assert.throws(
				() => intersectionSortedArrSeries([], 'not-an-array'),
				TypeError,
			);
			assert.throws(
				() => intersectionSortedArrSeries([1, 2], [10, 20], [5, 5]),
				RangeError,
			);
			assert.throws(
				() => intersectionSortedArrSeries([1, 2], [10, 20], [1, NaN]),
				RangeError,
			);
		});
	});

	describe('independent cross-checks and set algebra identities', () => {
		it('matches Set-based reference implementation across 120 randomized series', () => {
			const rng = createRng(20261122);

			for (let trial = 0; trial < 120; trial++) {
				const k = 1 + Math.floor(rng() * 6); // 1 to 6 arrays
				const fractional = trial % 3 === 0;
				const series = [];

				for (let i = 0; i < k; i++) {
					// Mix small, medium, and large sizes to trigger both merge paths
					const sizeBucket = rng();
					const maxLen =
						sizeBucket < 0.3 ? 6 : sizeBucket < 0.8 ? 40 : 400;
					series.push(
						randomSortedArray(rng, maxLen, -120, 120, fractional),
					);
				}

				const actual = intersectionSortedArrSeries(...series);
				const expected = setIntersectionRef(...series);
				assert.deepStrictEqual(actual, expected);
			}
		});

		it('satisfies number-theoretic divisibility / LCM intersection identity', () => {
			const N = 1000;
			const multiples = (step) => {
				const out = [];
				for (let v = step; v <= N; v += step) {
					out.push(v);
				}
				return out;
			};

			// Multiples of 2 ∩ 3 ∩ 5 ∩ 7 = multiples of lcm(2, 3, 5, 7) = 210
			assert.deepStrictEqual(
				intersectionSortedArrSeries(
					multiples(2),
					multiples(3),
					multiples(5),
					multiples(7),
				),
				multiples(210),
			);

			// Multiples of 4 ∩ 6 ∩ 10 = multiples of lcm(4, 6, 10) = 60
			assert.deepStrictEqual(
				intersectionSortedArrSeries(
					multiples(4),
					multiples(6),
					multiples(10),
				),
				multiples(60),
			);
		});

		it('satisfies set algebra laws: idempotence, commutativity, associativity, distributivity, De Morgan, and inclusion-exclusion', () => {
			const rng = createRng(0x5eedcafe);

			for (let trial = 0; trial < 30; trial++) {
				const A = randomSortedArray(rng, 25, -20, 20);
				const B = randomSortedArray(rng, 25, -20, 20);
				const C = randomSortedArray(rng, 25, -20, 20);

				// Idempotence: A ∩ A = A and A ∩ A ∩ A = A
				assert.deepStrictEqual(intersectionSortedArrSeries(A, A), A);
				assert.deepStrictEqual(intersectionSortedArrSeries(A, A, A), A);

				// Commutativity (pairwise and all 3! = 6 permutations)
				const ab = intersectionSortedArrSeries(A, B);
				const ba = intersectionSortedArrSeries(B, A);
				assert.deepStrictEqual(ab, ba);

				const abc = intersectionSortedArrSeries(A, B, C);
				for (const perm of [
					[A, C, B],
					[B, A, C],
					[B, C, A],
					[C, A, B],
					[C, B, A],
				]) {
					assert.deepStrictEqual(
						intersectionSortedArrSeries(...perm),
						abc,
					);
				}

				// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = A ∩ B ∩ C
				const leftAssoc = intersectionSortedArrSeries(
					intersectionSortedArrSeries(A, B),
					C,
				);
				const rightAssoc = intersectionSortedArrSeries(
					A,
					intersectionSortedArrSeries(B, C),
				);
				assert.deepStrictEqual(leftAssoc, abc);
				assert.deepStrictEqual(rightAssoc, abc);

				// Annihilation & Absorption
				assert.deepStrictEqual(intersectionSortedArrSeries(A, []), []);
				assert.deepStrictEqual(
					intersectionSortedArrSeries(A, setUnionRef(A, B)),
					A,
				);

				// Distributivity:
				// A ∩ (B ∪ C) = (A ∩ B) ∪ (A ∩ C)
				assert.deepStrictEqual(
					intersectionSortedArrSeries(A, setUnionRef(B, C)),
					setUnionRef(
						intersectionSortedArrSeries(A, B),
						intersectionSortedArrSeries(A, C),
					),
				);
				// A ∪ (B ∩ C) = (A ∪ B) ∩ (A ∪ C)
				assert.deepStrictEqual(
					setUnionRef(A, intersectionSortedArrSeries(B, C)),
					intersectionSortedArrSeries(
						setUnionRef(A, B),
						setUnionRef(A, C),
					),
				);

				// De Morgan's Law over U = A ∪ B ∪ C
				const U = setUnionRef(A, B, C);
				assert.deepStrictEqual(
					setDiffRef(U, ab),
					setUnionRef(setDiffRef(U, A), setDiffRef(U, B)),
				);
				assert.deepStrictEqual(
					setDiffRef(U, setUnionRef(A, B)),
					intersectionSortedArrSeries(
						setDiffRef(U, A),
						setDiffRef(U, B),
					),
				);

				// Inclusion-Exclusion Principle (2-set and 3-set)
				assert.strictEqual(
					setUnionRef(A, B).length,
					A.length + B.length - ab.length,
				);
				const ac = intersectionSortedArrSeries(A, C);
				const bc = intersectionSortedArrSeries(B, C);
				assert.strictEqual(
					U.length,
					A.length +
						B.length +
						C.length -
						ab.length -
						ac.length -
						bc.length +
						abc.length,
				);
			}
		});
	});
});
