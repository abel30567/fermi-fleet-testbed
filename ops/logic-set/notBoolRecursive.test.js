import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { notBoolRecursive } from './notBoolRecursive.js';

/**
 * Independent iterative reference implementation of relative set complement.
 *
 * @template T
 * @param {Set<T>} value
 * @param {Set<T>} universe
 * @returns {Set<T>}
 */
function referenceSetNot(value, universe) {
	const result = new Set();
	for (const item of universe) {
		if (!value.has(item)) {
			result.add(item);
		}
	}
	return result;
}

describe('notBoolRecursive', () => {
	describe('plain booleans', () => {
		it('negates true to false and false to true', () => {
			assert.strictEqual(notBoolRecursive(true), false);
			assert.strictEqual(notBoolRecursive(false), true);
		});

		it('satisfies double negation (involution) for booleans', () => {
			for (const b of [true, false]) {
				assert.strictEqual(notBoolRecursive(notBoolRecursive(b)), b);
			}
		});
	});

	describe('JS Set objects (normal cases)', () => {
		it('computes relative complement for a standard subset', () => {
			const input = new Set([1, 2]);
			const universe = new Set([1, 2, 3, 4, 5]);
			assert.deepStrictEqual(notBoolRecursive(input, universe), new Set([3, 4, 5]));
		});

		it('handles odd and even universe sizes cleanly', () => {
			for (let size = 1; size <= 17; size++) {
				const universe = new Set(Array.from({ length: size }, (_, i) => i));
				const evens = new Set(Array.from({ length: size }, (_, i) => i).filter((x) => x % 2 === 0));
				const expectedOdds = new Set(
					Array.from({ length: size }, (_, i) => i).filter((x) => x % 2 !== 0),
				);
				assert.deepStrictEqual(notBoolRecursive(evens, universe), expectedOdds);
			}
		});

		it('does not mutate input or universe and returns a fresh Set instance', () => {
			const input = new Set(['a']);
			const universe = new Set(['a', 'b', 'c']);
			const result = notBoolRecursive(input, universe);

			assert.notStrictEqual(result, input);
			assert.notStrictEqual(result, universe);
			assert.deepStrictEqual(input, new Set(['a']));
			assert.deepStrictEqual(universe, new Set(['a', 'b', 'c']));
			assert.deepStrictEqual(result, new Set(['b', 'c']));
		});
	});

	describe('edge cases', () => {
		it('handles empty input set (returns copy of universe)', () => {
			const universe = new Set(['x', 'y', 'z']);
			const result = notBoolRecursive(new Set(), universe);
			assert.deepStrictEqual(result, universe);
			assert.notStrictEqual(result, universe);
		});

		it('handles empty universe and both sets empty', () => {
			assert.deepStrictEqual(notBoolRecursive(new Set([1, 2]), new Set()), new Set());
			assert.deepStrictEqual(notBoolRecursive(new Set(), new Set()), new Set());
		});

		it('handles input equal to universe and aliased same Set reference', () => {
			const s = new Set([10, 20, 30]);
			assert.deepStrictEqual(notBoolRecursive(new Set([10, 20, 30]), s), new Set());
			assert.deepStrictEqual(notBoolRecursive(s, s), new Set());
		});

		it('ignores elements in input that are not present in universe', () => {
			const input = new Set([2, 99, 100]);
			const universe = new Set([1, 2, 3]);
			assert.deepStrictEqual(notBoolRecursive(input, universe), new Set([1, 3]));
		});

		it('handles single-element universe base case', () => {
			assert.deepStrictEqual(notBoolRecursive(new Set(), new Set([42])), new Set([42]));
			assert.deepStrictEqual(notBoolRecursive(new Set([42]), new Set([42])), new Set());
		});

		it('respects JS Set SameValueZero semantics (NaN, -0/+0, objects, symbols, null, undefined)', () => {
			const objA = { id: 1 };
			const objB = { id: 2 };
			const symA = Symbol('a');
			const symB = Symbol('b');
			const universe = new Set([NaN, 0, objA, objB, symA, symB, null, undefined, true, false]);
			const input = new Set([NaN, -0, objA, symA, null, true]);

			const result = notBoolRecursive(input, universe);
			assert.deepStrictEqual(result, new Set([objB, symB, undefined, false]));
		});

		it('handles large sets without stack overflow (divide-and-conquer O(log n) depth)', () => {
			const size = 20000;
			const universe = new Set();
			const exclude = new Set();
			for (let i = 0; i < size; i++) {
				universe.add(i);
				if (i % 3 === 0) {
					exclude.add(i);
				}
			}

			const result = notBoolRecursive(exclude, universe);
			assert.strictEqual(result.size, size - exclude.size);
			assert.strictEqual(result.has(0), false);
			assert.strictEqual(result.has(1), true);
			assert.strictEqual(result.has(19999), true);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when value is not a plain boolean or Set', () => {
			const invalidValues = [
				undefined,
				null,
				0,
				1,
				NaN,
				'',
				'true',
				{},
				[],
				[true],
				new Map(),
				new WeakSet(),
				new Boolean(true),
				Symbol('x'),
				() => true,
			];

			for (const bad of invalidValues) {
				assert.throws(
					() => notBoolRecursive(bad),
					{ name: 'TypeError' },
					`Expected TypeError for value: ${String(bad)}`,
				);
			}
		});

		it('throws TypeError when value is a Set and universe is missing or not a Set', () => {
			const validSet = new Set([1, 2]);
			const invalidUniverses = [undefined, null, [1, 2, 3], { 1: true }, true, 123, '123', new Map()];

			for (const badUniverse of invalidUniverses) {
				assert.throws(
					() => notBoolRecursive(validSet, badUniverse),
					{ name: 'TypeError' },
					`Expected TypeError for universe: ${String(badUniverse)}`,
				);
			}
		});

		it('throws TypeError when value is a boolean and a universe argument is supplied', () => {
			assert.throws(() => notBoolRecursive(true, new Set([true, false])), { name: 'TypeError' });
			assert.throws(() => notBoolRecursive(false, null), { name: 'TypeError' });
			assert.throws(() => notBoolRecursive(true, false), { name: 'TypeError' });
		});
	});

	describe('independent cross-checks and algebraic laws', () => {
		it('matches independent iterative reference implementation across generated cases', () => {
			let seed = 0x12345678;
			const nextRand = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				return seed / 0x100000000;
			};

			for (let trial = 0; trial < 50; trial++) {
				const uSize = Math.floor(nextRand() * 60);
				const universe = new Set();
				const input = new Set();

				for (let i = 0; i < uSize; i++) {
					const val = Math.floor(nextRand() * 80);
					universe.add(val);
					if (nextRand() < 0.5) {
						input.add(val);
					}
				}
				// Also inject some elements outside universe
				for (let i = 0; i < 5; i++) {
					input.add(100 + Math.floor(nextRand() * 20));
				}

				const actual = notBoolRecursive(input, universe);
				const expected = referenceSetNot(input, universe);
				assert.deepStrictEqual(actual, expected);
			}
		});

		it('satisfies Boolean and Set algebra laws (involution, excluded middle, De Morgan)', () => {
			const universe = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
			const a = new Set([1, 2, 3, 4]);
			const b = new Set([3, 4, 5, 6]);

			const notA = notBoolRecursive(a, universe);
			const notB = notBoolRecursive(b, universe);

			// Involution: ¬(¬A) = A
			assert.deepStrictEqual(notBoolRecursive(notA, universe), a);

			// Excluded middle & non-contradiction: A ∪ ¬A = U and A ∩ ¬A = ∅
			const unionWithNot = new Set([...a, ...notA]);
			const intersectWithNot = new Set([...a].filter((x) => notA.has(x)));
			assert.deepStrictEqual(unionWithNot, universe);
			assert.deepStrictEqual(intersectWithNot, new Set());

			// De Morgan's Laws for sets:
			// ¬(A ∪ B) = ¬A ∩ ¬B
			const unionAB = new Set([...a, ...b]);
			const intersectNotANotB = new Set([...notA].filter((x) => notB.has(x)));
			assert.deepStrictEqual(notBoolRecursive(unionAB, universe), intersectNotANotB);

			// ¬(A ∩ B) = ¬A ∪ ¬B
			const intersectAB = new Set([...a].filter((x) => b.has(x)));
			const unionNotANotB = new Set([...notA, ...notB]);
			assert.deepStrictEqual(notBoolRecursive(intersectAB, universe), unionNotANotB);

			// De Morgan's Laws for plain booleans:
			for (const p of [true, false]) {
				for (const q of [true, false]) {
					assert.strictEqual(
						notBoolRecursive(p || q),
						notBoolRecursive(p) && notBoolRecursive(q),
					);
					assert.strictEqual(
						notBoolRecursive(p && q),
						notBoolRecursive(p) || notBoolRecursive(q),
					);
				}
			}
		});

		it('is isomorphic between plain booleans and subsets of a singleton universe', () => {
			const unit = new Set(['unit']);
			const toSet = (b) => (b ? new Set(['unit']) : new Set());
			const toBool = (s) => s.has('unit');

			for (const b of [true, false]) {
				assert.strictEqual(
					toBool(notBoolRecursive(toSet(b), unit)),
					notBoolRecursive(b),
				);
			}
		});
	});
});
