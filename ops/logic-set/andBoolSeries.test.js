import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andBoolSeries } from './andBoolSeries.js';

/**
 * Helper to check exact set equality (same size and identical membership).
 */
function setsEqual(a, b) {
	if (a.size !== b.size) return false;
	for (const x of a) {
		if (!b.has(x)) return false;
	}
	return true;
}

/**
 * Helper for set complement relative to a finite universe U.
 */
function complement(universe, set) {
	const out = new Set();
	for (const x of universe) {
		if (!set.has(x)) out.add(x);
	}
	return out;
}

/**
 * Helper for set union of 2 or more sets.
 */
function union(...sets) {
	const out = new Set();
	for (const s of sets) {
		for (const x of s) out.add(x);
	}
	return out;
}

describe('andBoolSeries', () => {
	describe('boolean conjunction', () => {
		it('matches the complete 2-argument truth table', () => {
			assert.strictEqual(andBoolSeries(false, false), false);
			assert.strictEqual(andBoolSeries(false, true), false);
			assert.strictEqual(andBoolSeries(true, false), false);
			assert.strictEqual(andBoolSeries(true, true), true);
		});

		it('matches exhaustive truth tables for arities 2 through 5 against native evaluation', () => {
			for (let arity = 2; arity <= 5; arity++) {
				const total = 1 << arity;
				for (let mask = 0; mask < total; mask++) {
					const args = [];
					for (let bit = 0; bit < arity; bit++) {
						args.push(((mask >> bit) & 1) === 1);
					}
					const expected = args.every(Boolean);
					assert.strictEqual(andBoolSeries(...args), expected);
				}
			}
		});

		it('handles large numbers of boolean operands accurately', () => {
			const allTrue = Array(500).fill(true);
			assert.strictEqual(andBoolSeries(...allTrue), true);

			const firstFalse = [false, ...Array(499).fill(true)];
			assert.strictEqual(andBoolSeries(...firstFalse), false);

			const midFalse = [...Array(250).fill(true), false, ...Array(249).fill(true)];
			assert.strictEqual(andBoolSeries(...midFalse), false);

			const lastFalse = [...Array(499).fill(true), false];
			assert.strictEqual(andBoolSeries(...lastFalse), false);
		});
	});

	describe('Set intersection', () => {
		it('computes intersection of two sets (overlapping, disjoint, subset, empty)', () => {
			assert.deepStrictEqual(
				andBoolSeries(new Set([1, 2, 3]), new Set([2, 3, 4])),
				new Set([2, 3])
			);
			assert.deepStrictEqual(
				andBoolSeries(new Set([1, 2]), new Set([3, 4])),
				new Set()
			);
			assert.deepStrictEqual(
				andBoolSeries(new Set([2, 3]), new Set([1, 2, 3, 4])),
				new Set([2, 3])
			);
			assert.deepStrictEqual(
				andBoolSeries(new Set(), new Set([1, 2, 3])),
				new Set()
			);
			assert.deepStrictEqual(
				andBoolSeries(new Set([1, 2, 3]), new Set()),
				new Set()
			);
			assert.deepStrictEqual(
				andBoolSeries(new Set(), new Set()),
				new Set()
			);
		});

		it('computes intersection of 3 or more sets', () => {
			const a = new Set([1, 2, 3, 4, 5]);
			const b = new Set([2, 3, 4, 6]);
			const c = new Set([3, 4, 5, 7]);
			const d = new Set([0, 3, 8]);
			assert.deepStrictEqual(andBoolSeries(a, b, c), new Set([3, 4]));
			assert.deepStrictEqual(andBoolSeries(a, b, c, d), new Set([3]));
		});

		it('supports SameValueZero and diverse JS value types (NaN, -0/+0, objects, symbols, bigints)', () => {
			const objShared = { id: 1 };
			const objOnlyA = { id: 2 };
			const objOnlyB = { id: 2 }; // distinct reference
			const symShared = Symbol('shared');
			const symOnlyA = Symbol('a');

			const a = new Set([NaN, -0, null, undefined, 'x', 42n, objShared, objOnlyA, symShared, symOnlyA]);
			const b = new Set([NaN, +0, null, 'x', 42n, objShared, objOnlyB, symShared]);

			const result = andBoolSeries(a, b);
			assert.strictEqual(result.size, 7);
			assert.strictEqual(result.has(NaN), true);
			assert.strictEqual(result.has(0), true);
			assert.strictEqual(result.has(null), true);
			assert.strictEqual(result.has(undefined), false);
			assert.strictEqual(result.has('x'), true);
			assert.strictEqual(result.has(42n), true);
			assert.strictEqual(result.has(objShared), true);
			assert.strictEqual(result.has(objOnlyA), false);
			assert.strictEqual(result.has(objOnlyB), false);
			assert.strictEqual(result.has(symShared), true);
			assert.strictEqual(result.has(symOnlyA), false);
		});

		it('does not mutate input sets and always returns a fresh Set instance', () => {
			const a = new Set([1, 2, 3]);
			const b = new Set([2, 3, 4]);
			const res = andBoolSeries(a, b);

			assert.notStrictEqual(res, a);
			assert.notStrictEqual(res, b);
			assert.deepStrictEqual(a, new Set([1, 2, 3]));
			assert.deepStrictEqual(b, new Set([2, 3, 4]));

			// Idempotent call still returns a distinct Set instance
			const selfRes = andBoolSeries(a, a);
			assert.notStrictEqual(selfRes, a);
			assert.deepStrictEqual(selfRes, a);

			// Mutating the returned set does not affect inputs
			res.add(999);
			assert.strictEqual(a.has(999), false);
			assert.strictEqual(b.has(999), false);
		});

		it('efficiently intersects heavily asymmetric set sizes regardless of argument order', () => {
			const large = new Set();
			for (let i = 0; i < 100_000; i++) large.add(i);
			const small = new Set([-5, 0, 50_000, 99_999, 100_000]);

			const expected = new Set([0, 50_000, 99_999]);
			assert.deepStrictEqual(andBoolSeries(large, small), expected);
			assert.deepStrictEqual(andBoolSeries(small, large), expected);
		});
	});

	describe('algebraic laws and independent cross-checks', () => {
		it('satisfies commutativity, associativity, idempotence, and identity/absorption for booleans', () => {
			const bools = [false, true];
			for (const a of bools) {
				// Idempotence
				assert.strictEqual(andBoolSeries(a, a), a);
				assert.strictEqual(andBoolSeries(a, a, a), a);
				// Identity and absorption
				assert.strictEqual(andBoolSeries(a, true), a);
				assert.strictEqual(andBoolSeries(a, false), false);

				for (const b of bools) {
					// Commutativity
					assert.strictEqual(andBoolSeries(a, b), andBoolSeries(b, a));

					for (const c of bools) {
						// Associativity
						const left = andBoolSeries(andBoolSeries(a, b), c);
						const right = andBoolSeries(a, andBoolSeries(b, c));
						const ternary = andBoolSeries(a, b, c);
						assert.strictEqual(left, right);
						assert.strictEqual(left, ternary);
						// Permutation invariance
						assert.strictEqual(andBoolSeries(c, a, b), ternary);
					}
				}
			}
		});

		it("satisfies De Morgan's laws for booleans: !(A ∧ B) === (!A ∨ !B)", () => {
			const bools = [false, true];
			for (const a of bools) {
				for (const b of bools) {
					assert.strictEqual(!andBoolSeries(a, b), !a || !b);
					for (const c of bools) {
						assert.strictEqual(!andBoolSeries(a, b, c), !a || !b || !c);
					}
				}
			}
		});

		it('satisfies commutativity, associativity, idempotence, De Morgan, and bitmask cross-check over finite universe', () => {
			const universe = new Set([0, 1, 2, 3]);
			const allSubsets = [];
			for (let mask = 0; mask < 16; mask++) {
				const s = new Set();
				for (let bit = 0; bit < 4; bit++) {
					if ((mask >> bit) & 1) s.add(bit);
				}
				allSubsets.push({ mask, set: s });
			}

			// Check every pair (256 combinations) against bitmask AND and De Morgan's law
			for (const { mask: mA, set: A } of allSubsets) {
				// Idempotence & identity/absorption
				assert.ok(setsEqual(andBoolSeries(A, A), A));
				assert.ok(setsEqual(andBoolSeries(A, universe), A));
				assert.ok(setsEqual(andBoolSeries(A, new Set()), new Set()));

				for (const { mask: mB, set: B } of allSubsets) {
					const ab = andBoolSeries(A, B);
					const ba = andBoolSeries(B, A);

					// Commutativity
					assert.ok(setsEqual(ab, ba));

					// Independent bitmask cross-check
					const expectedMask = mA & mB;
					const expectedSet = allSubsets[expectedMask].set;
					assert.ok(setsEqual(ab, expectedSet));

					// De Morgan's law: ¬(A ∩ B) = ¬A ∪ ¬B
					const lhs = complement(universe, ab);
					const rhs = union(complement(universe, A), complement(universe, B));
					assert.ok(setsEqual(lhs, rhs));
				}
			}

			// Associativity and 3-way De Morgan over representative subsets
			const sample = [allSubsets[0].set, allSubsets[3].set, allSubsets[6].set, allSubsets[11].set, allSubsets[15].set];
			for (const A of sample) {
				for (const B of sample) {
					for (const C of sample) {
						const left = andBoolSeries(andBoolSeries(A, B), C);
						const right = andBoolSeries(A, andBoolSeries(B, C));
						const ternary = andBoolSeries(A, B, C);
						assert.ok(setsEqual(left, right));
						assert.ok(setsEqual(left, ternary));

						// 3-way De Morgan: ¬(A ∩ B ∩ C) = ¬A ∪ ¬B ∪ ¬C
						const lhs = complement(universe, ternary);
						const rhs = union(
							complement(universe, A),
							complement(universe, B),
							complement(universe, C)
						);
						assert.ok(setsEqual(lhs, rhs));
					}
				}
			}
		});
	});

	describe('input validation', () => {
		it('throws TypeError when given fewer than 2 arguments', () => {
			assert.throws(() => andBoolSeries(), TypeError);
			assert.throws(() => andBoolSeries(true), TypeError);
			assert.throws(() => andBoolSeries(false), TypeError);
			assert.throws(() => andBoolSeries(new Set([1])), TypeError);
		});

		it('throws TypeError when mixing booleans and Sets', () => {
			assert.throws(() => andBoolSeries(true, new Set()), TypeError);
			assert.throws(() => andBoolSeries(false, new Set([1])), TypeError);
			assert.throws(() => andBoolSeries(new Set(), true), TypeError);
			assert.throws(() => andBoolSeries(new Set([1]), false), TypeError);
			assert.throws(() => andBoolSeries(true, true, new Set()), TypeError);
			assert.throws(() => andBoolSeries(new Set([1]), new Set([1]), true), TypeError);
		});

		it('throws TypeError for non-boolean, non-Set arguments (including boxed Booleans and truthy/falsy values)', () => {
			const invalidValues = [
				0,
				1,
				NaN,
				'',
				'true',
				null,
				undefined,
				[],
				[true],
				{},
				new Boolean(true),
				new Map(),
				new WeakSet(),
				() => true
			];

			for (const bad of invalidValues) {
				assert.throws(() => andBoolSeries(bad, true), TypeError);
				assert.throws(() => andBoolSeries(true, bad), TypeError);
				assert.throws(() => andBoolSeries(bad, new Set()), TypeError);
				assert.throws(() => andBoolSeries(new Set([1]), bad), TypeError);
			}
		});

		it('validates all arguments even when an earlier operand is false or an empty Set', () => {
			assert.throws(() => andBoolSeries(false, 'invalid'), TypeError);
			assert.throws(() => andBoolSeries(false, null), TypeError);
			assert.throws(() => andBoolSeries(false, true, 123), TypeError);
			assert.throws(() => andBoolSeries(new Set(), 'invalid'), TypeError);
			assert.throws(() => andBoolSeries(new Set(), 0), TypeError);
			assert.throws(() => andBoolSeries(new Set(), new Set([1]), {}), TypeError);
		});
	});
});
