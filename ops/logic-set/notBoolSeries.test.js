import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notBoolSeries } from './notBoolSeries.js';

/**
 * Helper: compares two Sets for exact element equality.
 * @template T
 * @param {Set<T>} actual
 * @param {Set<T>} expected
 */
function assertSetsEqual(actual, expected) {
	assert.ok(actual instanceof Set, 'expected a Set instance');
	assert.equal(actual.size, expected.size);
	for (const item of expected) {
		assert.ok(actual.has(item), `expected set to contain ${String(item)}`);
	}
}

describe('notBoolSeries', () => {
	describe('plain booleans', () => {
		it('negates true to false and false to true', () => {
			assert.equal(notBoolSeries(true), false);
			assert.equal(notBoolSeries(false), true);
		});

		it('satisfies involution (double negation)', () => {
			for (const b of [true, false]) {
				assert.equal(notBoolSeries(notBoolSeries(b)), b);
			}
		});

		it('matches independent boolean identities (!x, XOR with 1, NAND(x,x))', () => {
			for (const b of [true, false]) {
				const expectedNot = !b;
				const expectedXor = ((b ? 1 : 0) ^ 1) === 1;
				const expectedNand = !(b && b);
				const actual = notBoolSeries(b);
				assert.equal(actual, expectedNot);
				assert.equal(actual, expectedXor);
				assert.equal(actual, expectedNand);
			}
		});
	});

	describe('JS Set complement', () => {
		it('computes relative complement for numeric sets', () => {
			const a = new Set([1, 2]);
			const u = new Set([1, 2, 3, 4]);
			const result = notBoolSeries(a, u);
			assertSetsEqual(result, new Set([3, 4]));
		});

		it('computes relative complement for string and mixed-type sets', () => {
			const objA = { id: 1 };
			const objB = { id: 2 };
			const sym = Symbol('k');
			const a = new Set(['a', objA, null, NaN]);
			const u = new Set(['a', 'b', objA, objB, null, undefined, NaN, sym]);
			const result = notBoolSeries(a, u);
			assertSetsEqual(result, new Set(['b', objB, undefined, sym]));
		});

		it('does not mutate input sets and returns a fresh Set', () => {
			const a = new Set([1, 2]);
			const u = new Set([1, 2, 3]);
			const result = notBoolSeries(a, u);
			assert.notEqual(result, a);
			assert.notEqual(result, u);
			assertSetsEqual(a, new Set([1, 2]));
			assertSetsEqual(u, new Set([1, 2, 3]));
		});
	});

	describe('edge cases', () => {
		it('returns a copy of universe when negating the empty set', () => {
			const u = new Set([10, 20, 30]);
			const result = notBoolSeries(new Set(), u);
			assert.notEqual(result, u);
			assertSetsEqual(result, u);
		});

		it('returns empty set when set equals universe', () => {
			const u = new Set([1, 2, 3]);
			assertSetsEqual(notBoolSeries(u, u), new Set());
			assertSetsEqual(notBoolSeries(new Set([1, 2, 3]), u), new Set());
		});

		it('returns empty set when both set and universe are empty', () => {
			assertSetsEqual(notBoolSeries(new Set(), new Set()), new Set());
		});

		it('returns copy of universe when set and universe are disjoint', () => {
			const a = new Set([4, 5, 6]);
			const u = new Set([1, 2, 3]);
			assertSetsEqual(notBoolSeries(a, u), u);
		});

		it('ignores elements in set that are outside universe', () => {
			const a = new Set([2, 3, 99, 100]);
			const u = new Set([1, 2, 3, 4]);
			assertSetsEqual(notBoolSeries(a, u), new Set([1, 4]));
		});

		it('handles SameValueZero semantics for NaN and -0/+0', () => {
			const a = new Set([NaN, -0]);
			const u = new Set([NaN, +0, 1]);
			assertSetsEqual(notBoolSeries(a, u), new Set([1]));
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-boolean, non-Set values', () => {
			const invalidValues = [
				null,
				undefined,
				0,
				1,
				'true',
				'',
				[],
				{},
				new Map(),
				new Boolean(true),
			];
			for (const bad of invalidValues) {
				assert.throws(() => notBoolSeries(bad), TypeError);
			}
		});

		it('throws TypeError when value is a Set and universe is missing or not a Set', () => {
			const a = new Set([1]);
			assert.throws(() => notBoolSeries(a), TypeError);
			for (const badUniverse of [null, undefined, [1, 2], {}, true, 42, new Map()]) {
				assert.throws(() => notBoolSeries(a, badUniverse), TypeError);
			}
		});

		it('throws TypeError when universe is supplied for a boolean value', () => {
			assert.throws(() => notBoolSeries(true, new Set([true, false])), TypeError);
			assert.throws(() => notBoolSeries(false, null), TypeError);
		});
	});

	describe('independent cross-checks and algebraic laws', () => {
		/**
		 * Independent reference implementation via array filtering.
		 * @template T
		 * @param {Set<T>} a
		 * @param {Set<T>} u
		 * @returns {Set<T>}
		 */
		function referenceComplement(a, u) {
			return new Set([...u].filter((x) => !a.has(x)));
		}

		it('matches array-filter reference across all subsets of a 5-element universe', () => {
			const elements = [0, 1, 2, 3, 4];
			const universe = new Set(elements);
			for (let mask = 0; mask < 1 << elements.length; mask++) {
				const subset = new Set(elements.filter((_, idx) => (mask & (1 << idx)) !== 0));
				const actual = notBoolSeries(subset, universe);
				const expected = referenceComplement(subset, universe);
				assertSetsEqual(actual, expected);

				// Involution: (A^c)^c = A
				assertSetsEqual(notBoolSeries(actual, universe), subset);

				// Partition law: |A| + |A^c| = |U| and A ∩ A^c = ∅
				assert.equal(subset.size + actual.size, universe.size);
				for (const x of subset) {
					assert.equal(actual.has(x), false);
				}
			}
		});

		it('satisfies De Morgan laws and antitonicity', () => {
			const u = new Set([1, 2, 3, 4, 5, 6]);
			const a = new Set([1, 2, 3]);
			const b = new Set([2, 3, 4]);

			const union = new Set([...a, ...b]);
			const intersection = new Set([...a].filter((x) => b.has(x)));

			const notA = notBoolSeries(a, u);
			const notB = notBoolSeries(b, u);

			// (A ∪ B)^c = A^c ∩ B^c
			const notUnion = notBoolSeries(union, u);
			const intersectComplements = new Set([...notA].filter((x) => notB.has(x)));
			assertSetsEqual(notUnion, intersectComplements);

			// (A ∩ B)^c = A^c ∪ B^c
			const notIntersection = notBoolSeries(intersection, u);
			const unionComplements = new Set([...notA, ...notB]);
			assertSetsEqual(notIntersection, unionComplements);

			// Antitonicity: if C ⊆ A then A^c ⊆ C^c
			const c = new Set([1, 2]);
			const notC = notBoolSeries(c, u);
			for (const x of notA) {
				assert.ok(notC.has(x));
			}

			// Inclusion-exclusion cardinality when A is not a subset of U
			const superset = new Set([1, 2, 7, 8, 9]);
			const intersectionWithU = new Set([...superset].filter((x) => u.has(x)));
			const comp = notBoolSeries(superset, u);
			assert.equal(comp.size, u.size - intersectionWithU.size);
		});
	});
});
