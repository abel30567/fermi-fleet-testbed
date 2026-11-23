import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orBoolSeries } from "./orBoolSeries.js";

/**
 * Helper to assert two Sets have identical elements.
 * @param {Set<*>} actual
 * @param {Set<*>} expected
 */
function assertSetEqual(actual, expected) {
	assert.ok(actual instanceof Set, "result must be a Set");
	assert.equal(actual.size, expected.size, "Set sizes must match");
	for (const elem of expected) {
		assert.ok(actual.has(elem), `expected Set to contain ${String(elem)}`);
	}
}

/**
 * Helper to compute the intersection of two Sets.
 * @param {Set<*>} a
 * @param {Set<*>} b
 * @returns {Set<*>}
 */
function intersect(a, b) {
	const out = new Set();
	for (const x of a) {
		if (b.has(x)) out.add(x);
	}
	return out;
}

/**
 * Helper to compute set difference (universe \ s).
 * @param {Set<*>} universe
 * @param {Set<*>} s
 * @returns {Set<*>}
 */
function complement(universe, s) {
	const out = new Set();
	for (const x of universe) {
		if (!s.has(x)) out.add(x);
	}
	return out;
}

describe("orBoolSeries - booleans", () => {
	it("satisfies the complete 2-ary boolean truth table", () => {
		assert.equal(orBoolSeries(false, false), false);
		assert.equal(orBoolSeries(false, true), true);
		assert.equal(orBoolSeries(true, false), true);
		assert.equal(orBoolSeries(true, true), true);
	});

	it("handles n-ary boolean disjunctions", () => {
		assert.equal(orBoolSeries(false, false, false), false);
		assert.equal(orBoolSeries(false, false, true), true);
		assert.equal(orBoolSeries(false, true, false), true);
		assert.equal(orBoolSeries(true, false, false), true);
		assert.equal(orBoolSeries(true, true, true), true);
		assert.equal(
			orBoolSeries(false, false, false, false, false, false),
			false,
		);
		assert.equal(
			orBoolSeries(false, false, false, true, false, false),
			true,
		);
	});

	it("cross-checks De Morgan's law across binary and 4-ary boolean tuples", () => {
		const bools = [false, true];
		for (const a of bools) {
			for (const b of bools) {
				assert.equal(!orBoolSeries(a, b), !a && !b);
			}
		}

		for (let mask = 0; mask < 16; mask++) {
			const tuple = [
				Boolean(mask & 1),
				Boolean(mask & 2),
				Boolean(mask & 4),
				Boolean(mask & 8),
			];
			const lhs = !orBoolSeries(...tuple);
			const rhs = tuple.every((v) => !v);
			assert.equal(lhs, rhs);
		}
	});

	it("satisfies commutativity, associativity, idempotence, identity, annihilation, and absorption", () => {
		const bools = [false, true];
		for (const a of bools) {
			// Idempotence, identity, annihilation
			assert.equal(orBoolSeries(a, a), a);
			assert.equal(orBoolSeries(a, false), a);
			assert.equal(orBoolSeries(a, true), true);

			for (const b of bools) {
				// Commutativity
				assert.equal(orBoolSeries(a, b), orBoolSeries(b, a));
				// Absorption: a || (a && b) === a
				assert.equal(orBoolSeries(a, a && b), a);

				for (const c of bools) {
					// Associativity
					const left = orBoolSeries(orBoolSeries(a, b), c);
					const right = orBoolSeries(a, orBoolSeries(b, c));
					const direct = orBoolSeries(a, b, c);
					assert.equal(left, right);
					assert.equal(left, direct);
				}
			}
		}
	});
});

describe("orBoolSeries - Set unions", () => {
	it("computes disjoint, overlapping, subset, and empty Set unions", () => {
		// Disjoint
		assertSetEqual(
			orBoolSeries(new Set([1, 2]), new Set([3, 4])),
			new Set([1, 2, 3, 4]),
		);

		// Overlapping
		assertSetEqual(
			orBoolSeries(new Set([1, 2, 3]), new Set([2, 3, 4])),
			new Set([1, 2, 3, 4]),
		);

		// Subset / superset
		assertSetEqual(
			orBoolSeries(new Set([1, 2]), new Set([1, 2, 3])),
			new Set([1, 2, 3]),
		);
		assertSetEqual(
			orBoolSeries(new Set([1, 2, 3]), new Set([1, 2])),
			new Set([1, 2, 3]),
		);

		// Empty sets
		assertSetEqual(orBoolSeries(new Set(), new Set()), new Set());
		assertSetEqual(
			orBoolSeries(new Set(), new Set(["a", "b"])),
			new Set(["a", "b"]),
		);
		assertSetEqual(
			orBoolSeries(new Set(["a", "b"]), new Set()),
			new Set(["a", "b"]),
		);
	});

	it("handles n-ary Set unions and special JS values", () => {
		const sym = Symbol("k");
		const obj = { id: 1 };
		const result = orBoolSeries(
			new Set([1, NaN, null]),
			new Set([undefined, obj]),
			new Set([sym, 1, NaN]),
			new Set([true, false]),
		);
		assertSetEqual(
			result,
			new Set([1, NaN, null, undefined, obj, sym, true, false]),
		);
	});

	it("does not mutate input Sets and returns a fresh Set instance", () => {
		const a = new Set([1, 2]);
		const b = new Set([2, 3]);
		const c = new Set([4]);

		const res = orBoolSeries(a, b, c);

		assert.notEqual(res, a);
		assert.notEqual(res, b);
		assert.notEqual(res, c);
		assertSetEqual(a, new Set([1, 2]));
		assertSetEqual(b, new Set([2, 3]));
		assertSetEqual(c, new Set([4]));

		// Mutating result does not affect inputs
		res.add(99);
		assert.equal(a.has(99), false);
		assert.equal(b.has(99), false);
		assert.equal(c.has(99), false);

		// Identical inputs still produce a distinct Set instance
		const same = new Set([10, 20]);
		const resSame = orBoolSeries(same, same);
		assert.notEqual(resSame, same);
		assertSetEqual(resSame, new Set([10, 20]));
	});

	it("cross-checks inclusion-exclusion cardinality, De Morgan's law, and set algebra laws", () => {
		const universe = new Set([1, 2, 3, 4, 5, 6, 7, 8]);
		const sets = [
			new Set(),
			new Set([1, 2, 3]),
			new Set([2, 3, 4, 5]),
			new Set([5, 6, 7]),
			new Set([1, 2, 3, 4, 5, 6, 7, 8]),
		];

		for (const A of sets) {
			// Idempotence: A U A = A
			assertSetEqual(orBoolSeries(A, A), A);

			for (const B of sets) {
				const unionAB = orBoolSeries(A, B);
				const interAB = intersect(A, B);

				// Binary inclusion-exclusion: |A U B| = |A| + |B| - |A n B|
				assert.equal(unionAB.size, A.size + B.size - interAB.size);

				// Commutativity: A U B = B U A
				assertSetEqual(unionAB, orBoolSeries(B, A));

				// Absorption: A U (A n B) = A
				assertSetEqual(orBoolSeries(A, interAB), A);

				// Set De Morgan: U \ (A U B) = (U \ A) n (U \ B)
				assertSetEqual(
					complement(universe, unionAB),
					intersect(complement(universe, A), complement(universe, B)),
				);
			}
		}

		// Ternary inclusion-exclusion & associativity
		const A = new Set([1, 2, 3, 4]);
		const B = new Set([3, 4, 5, 6]);
		const C = new Set([2, 4, 6, 7]);
		const unionABC = orBoolSeries(A, B, C);
		const expectedSize =
			A.size +
			B.size +
			C.size -
			intersect(A, B).size -
			intersect(A, C).size -
			intersect(B, C).size +
			intersect(intersect(A, B), C).size;
		assert.equal(unionABC.size, expectedSize);
		assertSetEqual(
			orBoolSeries(orBoolSeries(A, B), C),
			orBoolSeries(A, orBoolSeries(B, C)),
		);
		assertSetEqual(orBoolSeries(orBoolSeries(A, B), C), unionABC);
	});
});

describe("orBoolSeries - input validation and edge cases", () => {
	it("throws TypeError when fewer than 2 arguments are passed", () => {
		assert.throws(() => orBoolSeries(), TypeError);
		assert.throws(() => orBoolSeries(true), TypeError);
		assert.throws(() => orBoolSeries(false), TypeError);
		assert.throws(() => orBoolSeries(new Set([1])), TypeError);
	});

	it("throws TypeError when booleans and Sets are mixed", () => {
		assert.throws(() => orBoolSeries(true, new Set()), TypeError);
		assert.throws(() => orBoolSeries(false, new Set([1])), TypeError);
		assert.throws(() => orBoolSeries(new Set([1]), true), TypeError);
		assert.throws(() => orBoolSeries(true, false, new Set()), TypeError);
		assert.throws(
			() => orBoolSeries(new Set([1]), new Set([2]), false),
			TypeError,
		);
	});

	it("throws TypeError on non-boolean and non-Set values including boxed Booleans", () => {
		assert.throws(() => orBoolSeries(1, 0), TypeError);
		assert.throws(() => orBoolSeries("true", "false"), TypeError);
		assert.throws(() => orBoolSeries(null, false), TypeError);
		assert.throws(() => orBoolSeries(undefined, true), TypeError);
		assert.throws(() => orBoolSeries(true, 1), TypeError);
		assert.throws(() => orBoolSeries(true, null), TypeError);
		assert.throws(() => orBoolSeries(new Boolean(true), false), TypeError);
		assert.throws(() => orBoolSeries(false, new Boolean(false)), TypeError);
		assert.throws(() => orBoolSeries([1], [2]), TypeError);
		assert.throws(() => orBoolSeries(new Set([1]), [2]), TypeError);
		assert.throws(() => orBoolSeries(new Map(), new Map()), TypeError);
		assert.throws(() => orBoolSeries({}, {}), TypeError);
	});
});
