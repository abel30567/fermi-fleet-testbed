import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { orSortedArrIterative } from './orSortedArrIterative.js';

describe('orSortedArrIterative', () => {
	describe('normal cases', () => {
		it('merges interleaved numeric arrays', () => {
			assert.deepEqual(orSortedArrIterative([1, 3, 5], [2, 4, 6]), [1, 2, 3, 4, 5, 6]);
		});

		it('computes union of overlapping numeric arrays without duplicates', () => {
			assert.deepEqual(orSortedArrIterative([1, 2, 4, 7], [2, 3, 4, 8]), [1, 2, 3, 4, 7, 8]);
		});

		it('handles disjoint ranges in both directions', () => {
			assert.deepEqual(orSortedArrIterative([1, 2, 3], [10, 20, 30]), [1, 2, 3, 10, 20, 30]);
			assert.deepEqual(orSortedArrIterative([10, 20, 30], [1, 2, 3]), [1, 2, 3, 10, 20, 30]);
		});

		it('handles identical arrays and subset/superset pairs', () => {
			assert.deepEqual(orSortedArrIterative([1, 2, 3], [1, 2, 3]), [1, 2, 3]);
			assert.deepEqual(orSortedArrIterative([2, 4], [1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]);
			assert.deepEqual(orSortedArrIterative([1, 2, 3, 4, 5], [2, 4]), [1, 2, 3, 4, 5]);
		});

		it('handles negative numbers, floats, and infinities', () => {
			assert.deepEqual(
				orSortedArrIterative([-Infinity, -2.5, 0, 1.5], [-10, -2.5, 0.5, Infinity]),
				[-Infinity, -10, -2.5, 0, 0.5, 1.5, Infinity]
			);
		});

		it('supports sorted string arrays with default comparator', () => {
			assert.deepEqual(
				orSortedArrIterative(['apple', 'cherry', 'fig'], ['banana', 'cherry', 'date']),
				['apple', 'banana', 'cherry', 'date', 'fig']
			);
		});

		it('supports sorted bigint arrays with default comparator', () => {
			assert.deepEqual(
				orSortedArrIterative([-10n, 1n, 3n], [1n, 2n, 100000000000000000000n]),
				[-10n, 1n, 2n, 3n, 100000000000000000000n]
			);
		});

		it('supports custom comparators on objects and prefers elements from `a` on ties', () => {
			const cmpById = (x, y) => x.id - y.id;
			const a = [
				{ id: 1, src: 'a' },
				{ id: 3, src: 'a' },
			];
			const b = [
				{ id: 2, src: 'b' },
				{ id: 3, src: 'b' },
				{ id: 4, src: 'b' },
			];
			assert.deepEqual(orSortedArrIterative(a, b, cmpById), [
				{ id: 1, src: 'a' },
				{ id: 2, src: 'b' },
				{ id: 3, src: 'a' },
				{ id: 4, src: 'b' },
			]);
		});

		it('supports custom descending comparator', () => {
			const desc = (x, y) => y - x;
			assert.deepEqual(orSortedArrIterative([9, 5, 1], [8, 5, 2], desc), [9, 8, 5, 2, 1]);
		});
	});

	describe('edge cases', () => {
		it('handles empty arrays', () => {
			assert.deepEqual(orSortedArrIterative([], []), []);
			assert.deepEqual(orSortedArrIterative([], [1, 2, 3]), [1, 2, 3]);
			assert.deepEqual(orSortedArrIterative([1, 2, 3], []), [1, 2, 3]);
		});

		it('handles single-element arrays', () => {
			assert.deepEqual(orSortedArrIterative([5], [5]), [5]);
			assert.deepEqual(orSortedArrIterative([5], [2]), [2, 5]);
			assert.deepEqual(orSortedArrIterative([2], [5]), [2, 5]);
		});

		it('does not mutate or alias input arrays', () => {
			const a = [1, 3, 5];
			const b = [2, 4, 6];
			const res = orSortedArrIterative(a, b);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
			assert.deepEqual(a, [1, 3, 5]);
			assert.deepEqual(b, [2, 4, 6]);

			const copyFromA = orSortedArrIterative(a, []);
			assert.notEqual(copyFromA, a);
			assert.deepEqual(copyFromA, a);

			const copyFromB = orSortedArrIterative([], b);
			assert.notEqual(copyFromB, b);
			assert.deepEqual(copyFromB, b);
		});

		it('handles large sorted arrays iteratively without stack issues', () => {
			const n = 50_000;
			const evens = [];
			const odds = [];
			for (let i = 0; i < n; i++) {
				evens.push(i * 2);
				odds.push(i * 2 + 1);
			}
			const merged = orSortedArrIterative(evens, odds);
			assert.equal(merged.length, n * 2);
			assert.equal(merged[0], 0);
			assert.equal(merged[merged.length - 1], n * 2 - 1);
			for (let i = 1; i < merged.length; i++) {
				assert.equal(merged[i], i);
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when `a` or `b` is not an array', () => {
			for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2])]) {
				assert.throws(() => orSortedArrIterative(bad, []), TypeError);
				assert.throws(() => orSortedArrIterative([], bad), TypeError);
			}
		});

		it('throws TypeError when `compare` is provided and not a function', () => {
			for (const badCmp of [null, 123, 'asc', {}]) {
				assert.throws(() => orSortedArrIterative([1], [2], badCmp), TypeError);
			}
		});

		it('throws TypeError when custom comparator returns a non-number or NaN', () => {
			assert.throws(() => orSortedArrIterative([1, 2], [3], () => '0'), TypeError);
			assert.throws(() => orSortedArrIterative([1], [2], () => NaN), TypeError);
			assert.throws(() => orSortedArrIterative([1], [2], () => undefined), TypeError);
		});

		it('throws RangeError when `a` or `b` is not sorted in ascending order', () => {
			assert.throws(() => orSortedArrIterative([3, 1, 2], [4]), RangeError);
			assert.throws(() => orSortedArrIterative([1, 2], [5, 4]), RangeError);
		});

		it('throws RangeError when `a` or `b` contains duplicate elements', () => {
			assert.throws(() => orSortedArrIterative([1, 2, 2, 3], [4]), RangeError);
			assert.throws(() => orSortedArrIterative([1], [2, 3, 3]), RangeError);
			assert.throws(() => orSortedArrIterative([-0, 0], [1]), RangeError);
		});

		it('throws RangeError when `a` or `b` contains NaN with the default comparator', () => {
			assert.throws(() => orSortedArrIterative([NaN], []), RangeError);
			assert.throws(() => orSortedArrIterative([], [NaN]), RangeError);
			assert.throws(() => orSortedArrIterative([1, NaN, 2], [3]), RangeError);
		});

		it('throws TypeError for unsupported or mismatched element types with default comparator', () => {
			assert.throws(() => orSortedArrIterative([{}], []), TypeError);
			assert.throws(() => orSortedArrIterative([null], []), TypeError);
			assert.throws(() => orSortedArrIterative([true], []), TypeError);
			assert.throws(() => orSortedArrIterative([1, 2], ['a', 'b']), TypeError);
			assert.throws(() => orSortedArrIterative([1, '2'], [3]), TypeError);
			assert.throws(() => orSortedArrIterative([1n], [1]), TypeError);
		});

		it('throws TypeError on sparse arrays', () => {
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3];
			assert.throws(() => orSortedArrIterative(sparse, [2]), TypeError);
			assert.throws(() => orSortedArrIterative([2], new Array(2)), TypeError);
		});
	});

	describe('cross-checks against independent reference and set identities', () => {
		/**
		 * Deterministic Mulberry32 PRNG for reproducible property tests.
		 */
		function createRng(seed) {
			let s = seed >>> 0;
			return () => {
				s = (s + 0x6d2b79f5) >>> 0;
				let t = Math.imul(s ^ (s >>> 15), 1 | s);
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};
		}

		function randomSortedUniqueInts(rng, maxLen, minVal, maxVal) {
			const count = Math.floor(rng() * (maxLen + 1));
			const set = new Set();
			const span = maxVal - minVal + 1;
			for (let i = 0; i < count; i++) {
				set.add(minVal + Math.floor(rng() * span));
			}
			return [...set].sort((x, y) => x - y);
		}

		function naiveUnion(a, b) {
			return [...new Set([...a, ...b])].sort((x, y) => x - y);
		}

		it('matches naive Set-based union and satisfies set-algebraic identities across 200 cases', () => {
			const rng = createRng(20261122);

			for (let trial = 0; trial < 200; trial++) {
				const a = randomSortedUniqueInts(rng, 25, -20, 20);
				const b = randomSortedUniqueInts(rng, 25, -20, 20);
				const c = randomSortedUniqueInts(rng, 25, -20, 20);

				const ab = orSortedArrIterative(a, b);
				const expected = naiveUnion(a, b);

				// 1. Cross-check against independent Set-based reference
				assert.deepEqual(ab, expected);

				// 2. Output invariant: strictly increasing
				for (let i = 1; i < ab.length; i++) {
					assert.ok(ab[i - 1] < ab[i], 'Result must be strictly ascending');
				}

				// 3. Commutativity: A ∪ B = B ∪ A
				assert.deepEqual(ab, orSortedArrIterative(b, a));

				// 4. Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C)
				assert.deepEqual(
					orSortedArrIterative(ab, c),
					orSortedArrIterative(a, orSortedArrIterative(b, c))
				);

				// 5. Idempotence & identity: A ∪ A = A, A ∪ ∅ = A
				assert.deepEqual(orSortedArrIterative(a, a), a);
				assert.deepEqual(orSortedArrIterative(a, []), a);
				assert.deepEqual(orSortedArrIterative([], a), a);

				// 6. Inclusion-exclusion cardinality: |A ∪ B| = |A| + |B| - |A ∩ B|
				const setB = new Set(b);
				let intersectionSize = 0;
				for (const x of a) {
					if (setB.has(x)) intersectionSize++;
				}
				assert.equal(ab.length, a.length + b.length - intersectionSize);
			}
		});
	});
});
