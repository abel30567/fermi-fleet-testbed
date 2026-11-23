import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { unionBoolIterative } from './unionBoolIterative.js';

function setsEqual(a, b) {
	if (a.size !== b.size) return false;
	for (const item of a) {
		if (!b.has(item)) return false;
	}
	return true;
}

describe('unionBoolIterative - Set union', () => {
	it('computes the union of two overlapping sets', () => {
		const a = new Set([1, 2, 3]);
		const b = new Set([3, 4, 5]);
		const result = unionBoolIterative(a, b);
		assert.deepEqual([...result], [1, 2, 3, 4, 5]);
	});

	it('computes the union of two disjoint sets', () => {
		const a = new Set(['a', 'b']);
		const b = new Set(['c', 'd']);
		const result = unionBoolIterative(a, b);
		assert.deepEqual([...result], ['a', 'b', 'c', 'd']);
	});

	it('handles empty sets', () => {
		const empty1 = new Set();
		const empty2 = new Set();
		const nonEmpty = new Set([10, 20]);

		const uEmpty = unionBoolIterative(empty1, empty2);
		assert.equal(uEmpty.size, 0);
		assert.notEqual(uEmpty, empty1);
		assert.notEqual(uEmpty, empty2);

		assert.deepEqual([...unionBoolIterative(empty1, nonEmpty)], [10, 20]);
		assert.deepEqual([...unionBoolIterative(nonEmpty, empty1)], [10, 20]);
	});

	it('does not mutate input sets and always returns a new Set instance', () => {
		const a = new Set([1, 2]);
		const b = new Set([2, 3]);
		const result = unionBoolIterative(a, b);

		assert.notEqual(result, a);
		assert.notEqual(result, b);
		assert.deepEqual([...a], [1, 2]);
		assert.deepEqual([...b], [2, 3]);

		const selfUnion = unionBoolIterative(a, a);
		assert.notEqual(selfUnion, a);
		assert.deepEqual([...selfUnion], [1, 2]);
	});

	it('handles special JS values (NaN, -0/+0, null, undefined, objects, symbols)', () => {
		const obj1 = { id: 1 };
		const obj2 = { id: 2 };
		const sym = Symbol('s');

		const a = new Set([NaN, -0, null, obj1]);
		const b = new Set([NaN, +0, undefined, obj1, obj2, sym]);
		const result = unionBoolIterative(a, b);

		assert.equal(result.size, 7);
		assert.equal(result.has(NaN), true);
		assert.equal(result.has(0), true);
		assert.equal(result.has(null), true);
		assert.equal(result.has(undefined), true);
		assert.equal(result.has(obj1), true);
		assert.equal(result.has(obj2), true);
		assert.equal(result.has(sym), true);
	});

	it('supports union of three or more sets', () => {
		const a = new Set([1, 2]);
		const b = new Set([2, 3]);
		const c = new Set([3, 4, 5]);
		const d = new Set();
		const result = unionBoolIterative(a, b, c, d);
		assert.deepEqual([...result], [1, 2, 3, 4, 5]);
	});
});

describe('unionBoolIterative - plain boolean union (logical OR)', () => {
	it('matches the complete binary truth table', () => {
		assert.equal(unionBoolIterative(false, false), false);
		assert.equal(unionBoolIterative(false, true), true);
		assert.equal(unionBoolIterative(true, false), true);
		assert.equal(unionBoolIterative(true, true), true);
	});

	it('supports n-ary boolean disjunction', () => {
		assert.equal(unionBoolIterative(false, false, false, false), false);
		assert.equal(unionBoolIterative(false, false, true, false), true);
		assert.equal(unionBoolIterative(true, true, true), true);
	});
});

describe('unionBoolIterative - input validation', () => {
	it('throws TypeError when fewer than two arguments are passed', () => {
		assert.throws(() => unionBoolIterative(), TypeError);
		assert.throws(() => unionBoolIterative(new Set([1])), TypeError);
		assert.throws(() => unionBoolIterative(true), TypeError);
	});

	it('throws TypeError for non-Set, non-boolean inputs', () => {
		const invalidValues = [null, undefined, 0, 1, 'true', [], [1, 2], {}, new Map(), new WeakSet()];
		for (const bad of invalidValues) {
			assert.throws(() => unionBoolIterative(bad, new Set()), TypeError);
			assert.throws(() => unionBoolIterative(new Set(), bad), TypeError);
			assert.throws(() => unionBoolIterative(bad, false), TypeError);
			assert.throws(() => unionBoolIterative(false, bad), TypeError);
		}
	});

	it('throws TypeError when mixing Set and boolean arguments or invalid extra args', () => {
		assert.throws(() => unionBoolIterative(new Set([1]), true), TypeError);
		assert.throws(() => unionBoolIterative(false, new Set([1])), TypeError);
		assert.throws(() => unionBoolIterative(new Set([1]), new Set([2]), [3]), TypeError);
		assert.throws(() => unionBoolIterative(true, false, 1), TypeError);
	});
});

describe('unionBoolIterative - algebraic & independent cross-checks', () => {
	it('satisfies inclusion-exclusion |A ∪ B| = |A| + |B| - |A ∩ B| across varied pairs', () => {
		const pairs = [
			[new Set(), new Set()],
			[new Set([1, 2, 3]), new Set()],
			[new Set([1, 2, 3]), new Set([4, 5, 6])],
			[new Set([1, 2, 3, 4]), new Set([3, 4, 5, 6])],
			[new Set([1, 2, 3]), new Set([1, 2, 3])],
			[
				new Set(Array.from({ length: 100 }, (_, i) => i * 2)),
				new Set(Array.from({ length: 100 }, (_, i) => i * 3)),
			],
		];

		for (const [a, b] of pairs) {
			const union = unionBoolIterative(a, b);
			let intersectionCount = 0;
			for (const x of a) {
				if (b.has(x)) intersectionCount++;
			}
			assert.equal(union.size, a.size + b.size - intersectionCount);
		}
	});

	it('satisfies commutativity, associativity, idempotence, and boolean membership duality', () => {
		const universe = Array.from({ length: 30 }, (_, i) => i);
		const a = new Set(universe.filter((x) => x % 2 === 0));
		const b = new Set(universe.filter((x) => x % 3 === 0));
		const c = new Set(universe.filter((x) => x % 5 === 0));

		// Commutativity: A ∪ B == B ∪ A
		assert.equal(setsEqual(unionBoolIterative(a, b), unionBoolIterative(b, a)), true);

		// Associativity: (A ∪ B) ∪ C == A ∪ (B ∪ C) == union(A, B, C)
		const leftAssoc = unionBoolIterative(unionBoolIterative(a, b), c);
		const rightAssoc = unionBoolIterative(a, unionBoolIterative(b, c));
		const ternary = unionBoolIterative(a, b, c);
		assert.equal(setsEqual(leftAssoc, rightAssoc), true);
		assert.equal(setsEqual(leftAssoc, ternary), true);

		// Idempotence: A ∪ A == A
		assert.equal(setsEqual(unionBoolIterative(a, a), a), true);

		// Characteristic-function / boolean duality: x ∈ (A ∪ B) ⇔ (x ∈ A) ∨ (x ∈ B)
		const ab = unionBoolIterative(a, b);
		for (const x of universe) {
			assert.equal(ab.has(x), unionBoolIterative(a.has(x), b.has(x)));
			assert.equal(ab.has(x), a.has(x) || b.has(x));
		}
	});
});
