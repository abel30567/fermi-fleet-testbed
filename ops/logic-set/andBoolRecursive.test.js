import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { andBoolRecursive } from './andBoolRecursive.js';

/**
 * Independent iterative reference for boolean conjunction.
 * @param {boolean[]} values
 * @returns {boolean}
 */
function referenceAndBool(values) {
	for (const v of values) {
		if (!v) return false;
	}
	return true;
}

/**
 * Independent iterative reference for n-ary set intersection.
 * @param {Set<*>[]} sets
 * @returns {Set<*>}
 */
function referenceAndSets(sets) {
	const [first, ...rest] = sets;
	const out = new Set();
	for (const elem of first) {
		if (rest.every((s) => s.has(elem))) {
			out.add(elem);
		}
	}
	return out;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 * @param {number} seed
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

function setsEqual(a, b) {
	if (a.size !== b.size) return false;
	for (const v of a) {
		if (!b.has(v)) return false;
	}
	return true;
}

describe('andBoolRecursive', () => {
	describe('plain booleans - normal cases', () => {
		it('evaluates binary truth table correctly', () => {
			assert.equal(andBoolRecursive(true, true), true);
			assert.equal(andBoolRecursive(true, false), false);
			assert.equal(andBoolRecursive(false, true), false);
			assert.equal(andBoolRecursive(false, false), false);
		});

		it('evaluates multi-argument variadic boolean calls', () => {
			assert.equal(andBoolRecursive(true, true, true, true, true), true);
			assert.equal(andBoolRecursive(false, true, true, true, true), false);
			assert.equal(andBoolRecursive(true, true, false, true, true), false);
			assert.equal(andBoolRecursive(true, true, true, true, false), false);
		});

		it('accepts a single array of booleans', () => {
			assert.equal(andBoolRecursive([true, true, true]), true);
			assert.equal(andBoolRecursive([true, false, true]), false);
			assert.equal(andBoolRecursive([false]), false);
			assert.equal(andBoolRecursive([true]), true);
		});
	});

	describe('plain booleans - edge cases', () => {
		it('handles single boolean operand', () => {
			assert.equal(andBoolRecursive(true), true);
			assert.equal(andBoolRecursive(false), false);
		});

		it('returns true (vacuous truth) for an empty array', () => {
			assert.equal(andBoolRecursive([]), true);
		});

		it('handles large boolean arrays without stack overflow', () => {
			const allTrue = new Array(20000).fill(true);
			assert.equal(andBoolRecursive(allTrue), true);

			const falseAtEnd = [...allTrue];
			falseAtEnd[19999] = false;
			assert.equal(andBoolRecursive(falseAtEnd), false);

			const falseInMiddle = [...allTrue];
			falseInMiddle[10000] = false;
			assert.equal(andBoolRecursive(falseInMiddle), false);

			const falseAtStart = [...allTrue];
			falseAtStart[0] = false;
			assert.equal(andBoolRecursive(falseAtStart), false);
		});
	});

	describe('JS Set objects - normal cases', () => {
		it('intersects two overlapping sets', () => {
			const a = new Set([1, 2, 3, 4]);
			const b = new Set([3, 4, 5, 6]);
			const result = andBoolRecursive(a, b);
			assert.ok(result instanceof Set);
			assert.deepEqual([...result].sort((x, y) => x - y), [3, 4]);
		});

		it('intersects multiple sets variadically', () => {
			const a = new Set(['a', 'b', 'c', 'd']);
			const b = new Set(['b', 'c', 'd', 'e']);
			const c = new Set(['c', 'd', 'e', 'f']);
			const d = new Set(['a', 'c', 'f']);
			const result = andBoolRecursive(a, b, c, d);
			assert.deepEqual([...result], ['c']);
		});

		it('intersects a single array of sets', () => {
			const sets = [
				new Set([10, 20, 30, 40]),
				new Set([20, 30, 50]),
				new Set([5, 20, 30, 60]),
			];
			const result = andBoolRecursive(sets);
			assert.deepEqual([...result].sort((x, y) => x - y), [20, 30]);
		});

		it('does not mutate input sets and returns a fresh Set instance', () => {
			const a = new Set([1, 2, 3]);
			const b = new Set([2, 3, 4]);
			const result = andBoolRecursive(a, b);
			assert.notEqual(result, a);
			assert.notEqual(result, b);
			assert.deepEqual([...a], [1, 2, 3]);
			assert.deepEqual([...b], [2, 3, 4]);

			const single = andBoolRecursive(a);
			assert.notEqual(single, a);
			assert.deepEqual([...single], [1, 2, 3]);
			single.add(99);
			assert.equal(a.has(99), false);
		});
	});

	describe('JS Set objects - edge cases', () => {
		it('returns an empty set for disjoint sets', () => {
			const result = andBoolRecursive(new Set([1, 2]), new Set([3, 4]));
			assert.equal(result.size, 0);
		});

		it('returns an empty set when any input set is empty', () => {
			assert.equal(andBoolRecursive(new Set(), new Set([1, 2])).size, 0);
			assert.equal(andBoolRecursive(new Set([1, 2]), new Set()).size, 0);
			assert.equal(andBoolRecursive(new Set(), new Set()).size, 0);
			assert.equal(
				andBoolRecursive(new Set([1, 2]), new Set([1, 2]), new Set(), new Set([1, 2])).size,
				0
			);
		});

		it('preserves SameValueZero semantics (NaN, -0/+0, objects, symbols, undefined, null)', () => {
			const obj1 = { id: 1 };
			const obj2 = { id: 2 };
			const sym = Symbol('shared');
			const a = new Set([NaN, -0, null, undefined, obj1, obj2, sym, true]);
			const b = new Set([NaN, +0, null, undefined, obj1, { id: 2 }, sym, false]);
			const result = andBoolRecursive(a, b);

			assert.equal(result.has(NaN), true);
			assert.equal(result.has(0), true);
			assert.equal(result.has(null), true);
			assert.equal(result.has(undefined), true);
			assert.equal(result.has(obj1), true);
			assert.equal(result.has(obj2), false);
			assert.equal(result.has(sym), true);
			assert.equal(result.has(true), false);
			assert.equal(result.has(false), false);
			assert.equal(result.size, 6);
		});

		it('handles large sets without stack overflow', () => {
			const a = new Set();
			const b = new Set();
			for (let i = 0; i < 15000; i++) {
				a.add(i);
			}
			for (let i = 5000; i < 20000; i++) {
				b.add(i);
			}
			const result = andBoolRecursive(a, b);
			assert.equal(result.size, 10000);
			assert.equal(result.has(4999), false);
			assert.equal(result.has(5000), true);
			assert.equal(result.has(14999), true);
			assert.equal(result.has(15000), false);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when called with no arguments', () => {
			assert.throws(() => andBoolRecursive(), TypeError);
		});

		it('throws TypeError for non-boolean, non-Set primitives and objects', () => {
			for (const bad of [0, 1, '', 'true', null, undefined, {}, Symbol('x'), new Map(), new Boolean(true)]) {
				assert.throws(() => andBoolRecursive(bad), TypeError);
			}
		});

		it('throws TypeError when mixing booleans and Sets', () => {
			assert.throws(() => andBoolRecursive(true, new Set([1])), TypeError);
			assert.throws(() => andBoolRecursive(new Set([1]), true), TypeError);
			assert.throws(() => andBoolRecursive([true, new Set([1])]), TypeError);
			assert.throws(() => andBoolRecursive([new Set([1]), false]), TypeError);
		});

		it('throws TypeError even if an earlier operand would short-circuit', () => {
			assert.throws(() => andBoolRecursive(false, 1), TypeError);
			assert.throws(() => andBoolRecursive(false, 'false'), TypeError);
			assert.throws(() => andBoolRecursive([false, null]), TypeError);
			assert.throws(() => andBoolRecursive(new Set(), 'not-a-set'), TypeError);
			assert.throws(() => andBoolRecursive([new Set(), 42]), TypeError);
		});

		it('throws TypeError for arrays combined with extra arguments or sparse arrays', () => {
			assert.throws(() => andBoolRecursive([true], true), TypeError);
			assert.throws(() => andBoolRecursive([new Set([1])], new Set([1])), TypeError);
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [true, , true];
			assert.throws(() => andBoolRecursive(sparse), TypeError);
		});
	});

	describe('independent cross-checks and algebraic properties', () => {
		it('matches exhaustive truth tables for arities 1 through 5', () => {
			for (let arity = 1; arity <= 5; arity++) {
				const total = 1 << arity;
				for (let mask = 0; mask < total; mask++) {
					const bits = [];
					for (let i = 0; i < arity; i++) {
						bits.push(Boolean((mask >> i) & 1));
					}
					const expected = referenceAndBool(bits);
					assert.equal(andBoolRecursive(...bits), expected);
					assert.equal(andBoolRecursive(bits), expected);
				}
			}
		});

		it('matches iterative reference across deterministic randomized boolean inputs', () => {
			const rand = createRng(0x5eed1234);
			for (let trial = 0; trial < 200; trial++) {
				const len = Math.floor(rand() * 64);
				// Bias towards true so many trials do not trivially short-circuit on index 0
				const pTrue = 0.85 + rand() * 0.15;
				const values = Array.from({ length: len }, () => rand() < pTrue);
				const expected = referenceAndBool(values);
				assert.equal(andBoolRecursive(values), expected);
				if (len > 0) {
					assert.equal(andBoolRecursive(...values), expected);
				}
			}
		});

		it('matches iterative reference across deterministic randomized Set collections', () => {
			const rand = createRng(0xc0ffee99);
			for (let trial = 0; trial < 150; trial++) {
				const numSets = 1 + Math.floor(rand() * 8);
				const universeSize = 1 + Math.floor(rand() * 30);
				const sets = [];
				for (let s = 0; s < numSets; s++) {
					const set = new Set();
					for (let v = 0; v < universeSize; v++) {
						if (rand() < 0.65) {
							set.add(v);
						}
					}
					sets.push(set);
				}
				const expected = referenceAndSets(sets);
				const fromVariadic = andBoolRecursive(...sets);
				const fromArray = andBoolRecursive(sets);
				assert.ok(setsEqual(fromVariadic, expected));
				assert.ok(setsEqual(fromArray, expected));
			}
		});

		it('satisfies Boolean algebra laws (commutativity, associativity, idempotence, De Morgan, distributivity)', () => {
			// Booleans: De Morgan's law !(a && b) === (!a || !b)
			for (const a of [false, true]) {
				for (const b of [false, true]) {
					assert.equal(andBoolRecursive(a, b), andBoolRecursive(b, a));
					assert.equal(andBoolRecursive(a, a), a);
					assert.equal(!andBoolRecursive(a, b), !a || !b);
				}
			}

			// Sets: commutativity, associativity, idempotence, distributivity over union
			const A = new Set([1, 2, 3, 4, 5]);
			const B = new Set([3, 4, 5, 6, 7]);
			const C = new Set([2, 4, 6, 8]);

			assert.ok(setsEqual(andBoolRecursive(A, B), andBoolRecursive(B, A)));
			assert.ok(setsEqual(andBoolRecursive(A, A), A));
			assert.ok(
				setsEqual(
					andBoolRecursive(andBoolRecursive(A, B), C),
					andBoolRecursive(A, andBoolRecursive(B, C))
				)
			);

			// Distributivity: A ∩ (B ∪ C) === (A ∩ B) ∪ (A ∩ C)
			const unionBC = new Set([...B, ...C]);
			const lhs = andBoolRecursive(A, unionBC);
			const rhs = new Set([...andBoolRecursive(A, B), ...andBoolRecursive(A, C)]);
			assert.ok(setsEqual(lhs, rhs));
		});
	});
});
