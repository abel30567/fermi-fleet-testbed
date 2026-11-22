import test from "node:test";
import assert from "node:assert/strict";
import { intersectionMultisetSeries } from "./intersectionMultisetSeries.js";

/**
 * Independent reference implementation: expands a numeric multiset Map into a
 * sorted array of repeated values and computes the two-pointer sorted-list
 * intersection, returning a Map<number, count>.
 *
 * @param {Map<number, number>} map
 * @returns {number[]}
 */
function multisetToSortedList(map) {
	const list = [];
	for (const [value, count] of map.entries()) {
		for (let i = 0; i < count; i += 1) {
			list.push(value);
		}
	}
	list.sort((x, y) => x - y);
	return list;
}

/**
 * Two-pointer intersection of two sorted arrays.
 *
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {number[]}
 */
function intersectSortedLists(xs, ys) {
	const out = [];
	let i = 0;
	let j = 0;
	while (i < xs.length && j < ys.length) {
		if (xs[i] === ys[j]) {
			out.push(xs[i]);
			i += 1;
			j += 1;
		} else if (xs[i] < ys[j]) {
			i += 1;
		} else {
			j += 1;
		}
	}
	return out;
}

/**
 * Converts a sorted list of values back into a Map<number, count>.
 *
 * @param {number[]} list
 * @returns {Map<number, number>}
 */
function sortedListToMultiset(list) {
	const map = new Map();
	for (const value of list) {
		map.set(value, (map.get(value) ?? 0) + 1);
	}
	return map;
}

/**
 * Computes total cardinality |M| = sum_x m_M(x).
 *
 * @param {Map<unknown, number>} map
 * @returns {number}
 */
function cardinality(map) {
	let total = 0;
	for (const count of map.values()) {
		total += count;
	}
	return total;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property checks.
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

test("normal two-multiset intersection computes pairwise min counts", () => {
	const a = new Map([
		["apple", 3],
		["banana", 2],
		["cherry", 5],
	]);
	const b = new Map([
		["apple", 1],
		["banana", 4],
		["date", 2],
	]);

	const res = intersectionMultisetSeries(a, b);
	assert.deepStrictEqual(
		res,
		new Map([
			["apple", 1],
			["banana", 2],
		])
	);
	assert.notEqual(res, a);
	assert.notEqual(res, b);
	// Ensure inputs were not mutated
	assert.deepStrictEqual(
		a,
		new Map([
			["apple", 3],
			["banana", 2],
			["cherry", 5],
		])
	);
	assert.deepStrictEqual(
		b,
		new Map([
			["apple", 1],
			["banana", 4],
			["date", 2],
		])
	);
});

test("multi-way intersection (3+ multisets)", () => {
	const a = new Map([
		["x", 5],
		["y", 3],
		["z", 2],
		["w", 4],
	]);
	const b = new Map([
		["x", 2],
		["y", 4],
		["z", 2],
	]);
	const c = new Map([
		["x", 3],
		["y", 1],
		["z", 0],
		["q", 7],
	]);
	const d = new Map([
		["x", 4],
		["y", 2],
	]);

	assert.deepStrictEqual(
		intersectionMultisetSeries(a, b, c, d),
		new Map([
			["x", 2],
			["y", 1],
		])
	);
});

test("supports arbitrary Map key types (objects, symbols, NaN, booleans, null)", () => {
	const objKey = { id: 1 };
	const otherObj = { id: 1 };
	const symKey = Symbol("k");

	const a = new Map([
		[objKey, 4],
		[symKey, 2],
		[Number.NaN, 3],
		[null, 1],
		[true, 5],
	]);
	const b = new Map([
		[objKey, 2],
		[otherObj, 9],
		[symKey, 5],
		[Number.NaN, 1],
		[null, 3],
		[false, 2],
	]);

	const res = intersectionMultisetSeries(a, b);
	assert.deepStrictEqual(
		res,
		new Map([
			[objKey, 2],
			[symKey, 2],
			[Number.NaN, 1],
			[null, 1],
		])
	);
	assert.equal(res.has(otherObj), false);
});

test("edge cases: empty maps, zero counts, and disjoint multisets", () => {
	const empty1 = new Map();
	const empty2 = new Map();
	const nonEmpty = new Map([
		["a", 2],
		["b", 0],
	]);
	const disjoint = new Map([
		["c", 3],
		["d", 1],
	]);
	const zeroOverlap = new Map([
		["a", 0],
		["b", 5],
	]);

	assert.deepStrictEqual(intersectionMultisetSeries(empty1, empty2), new Map());
	assert.deepStrictEqual(intersectionMultisetSeries(empty1, nonEmpty), new Map());
	assert.deepStrictEqual(intersectionMultisetSeries(nonEmpty, empty1), new Map());
	assert.deepStrictEqual(
		intersectionMultisetSeries(nonEmpty, disjoint),
		new Map()
	);
	assert.deepStrictEqual(
		intersectionMultisetSeries(nonEmpty, zeroOverlap),
		new Map()
	);
	// Negative zero count is treated as 0 and omitted
	assert.deepStrictEqual(
		intersectionMultisetSeries(
			new Map([["a", -0]]),
			new Map([["a", 3]])
		),
		new Map()
	);
});

test("edge case: large safe integer counts near Number.MAX_SAFE_INTEGER", () => {
	const max = Number.MAX_SAFE_INTEGER;
	const a = new Map([
		["max", max],
		["near", max - 1],
		["mixed", max],
	]);
	const b = new Map([
		["max", max],
		["near", max],
		["mixed", max - 5],
	]);

	assert.deepStrictEqual(
		intersectionMultisetSeries(a, b),
		new Map([
			["max", max],
			["near", max - 1],
			["mixed", max - 5],
		])
	);
});

test("algebraic laws: idempotence, commutativity, and associativity", () => {
	const a = new Map([
		["a", 4],
		["b", 0],
		["c", 2],
		["d", 7],
	]);
	const b = new Map([
		["a", 1],
		["c", 5],
		["d", 7],
		["e", 3],
	]);
	const c = new Map([
		["a", 3],
		["c", 1],
		["d", 2],
		["f", 9],
	]);

	// Idempotence: A ∩ A = A (with zero-count keys omitted)
	assert.deepStrictEqual(
		intersectionMultisetSeries(a, a),
		new Map([
			["a", 4],
			["c", 2],
			["d", 7],
		])
	);

	// Commutativity: A ∩ B = B ∩ A
	assert.deepStrictEqual(
		intersectionMultisetSeries(a, b),
		intersectionMultisetSeries(b, a)
	);

	// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C) = A ∩ B ∩ C
	const leftAssoc = intersectionMultisetSeries(
		intersectionMultisetSeries(a, b),
		c
	);
	const rightAssoc = intersectionMultisetSeries(
		a,
		intersectionMultisetSeries(b, c)
	);
	const multiWay = intersectionMultisetSeries(a, b, c);
	assert.deepStrictEqual(leftAssoc, rightAssoc);
	assert.deepStrictEqual(leftAssoc, multiWay);
});

test("invalid inputs throw appropriate TypeError or RangeError", () => {
	// Fewer than 2 arguments
	assert.throws(() => intersectionMultisetSeries(), RangeError);
	assert.throws(() => intersectionMultisetSeries(new Map()), RangeError);

	// Non-Map arguments (including when first Map is empty)
	assert.throws(() => intersectionMultisetSeries({}, new Map()), TypeError);
	assert.throws(
		() => intersectionMultisetSeries(new Map(), { a: 1 }),
		TypeError
	);
	assert.throws(
		() => intersectionMultisetSeries(new Map(), new Map(), null),
		TypeError
	);
	assert.throws(
		() => intersectionMultisetSeries(new Map(), [["a", 1]]),
		TypeError
	);

	// Non-number counts
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map([["a", "2"]]),
				new Map([["a", 1]])
			),
		TypeError
	);
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map(),
				new Map([["a", 2n]])
			),
		TypeError
	);
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map([["a", 1]]),
				new Map([["a", undefined]])
			),
		TypeError
	);

	// Negative, non-integer, non-finite, or unsafe integer counts
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map([["a", -1]]),
				new Map([["a", 1]])
			),
		RangeError
	);
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map([["a", 1]]),
				new Map([["a", 1.5]])
			),
		RangeError
	);
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map([["a", Number.NaN]]),
				new Map([["a", 1]])
			),
		RangeError
	);
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map([["a", Number.POSITIVE_INFINITY]]),
				new Map([["a", 1]])
			),
		RangeError
	);
	assert.throws(
		() =>
			intersectionMultisetSeries(
				new Map(),
				new Map([["a", Number.MAX_SAFE_INTEGER + 1]])
			),
		RangeError
	);
});

test("cross-check against independent sorted-list intersection and cardinality identities", () => {
	const rand = createRng(0x5eed15);
	const domainSize = 12;

	for (let trial = 0; trial < 50; trial += 1) {
		const mapA = new Map();
		const mapB = new Map();
		const mapC = new Map();

		for (let key = 0; key < domainSize; key += 1) {
			if (rand() < 0.7) {
				mapA.set(key, Math.floor(rand() * 7));
			}
			if (rand() < 0.7) {
				mapB.set(key, Math.floor(rand() * 7));
			}
			if (rand() < 0.7) {
				mapC.set(key, Math.floor(rand() * 7));
			}
		}

		// 1. Two-way cross-check against sorted-list merge intersection
		const actualAB = intersectionMultisetSeries(mapA, mapB);
		const expectedAB = sortedListToMultiset(
			intersectSortedLists(
				multisetToSortedList(mapA),
				multisetToSortedList(mapB)
			)
		);
		assert.deepStrictEqual(actualAB, expectedAB);

		// 2. Three-way cross-check against sorted-list merge intersection
		const actualABC = intersectionMultisetSeries(mapA, mapB, mapC);
		const expectedABC = sortedListToMultiset(
			intersectSortedLists(
				intersectSortedLists(
					multisetToSortedList(mapA),
					multisetToSortedList(mapB)
				),
				multisetToSortedList(mapC)
			)
		);
		assert.deepStrictEqual(actualABC, expectedABC);

		// 3. Cardinality identities:
		//    |A ∩ B| + |A ∪ B| = |A| + |B|
		//    2|A ∩ B| = |A| + |B| - |A Δ B|
		const keys = new Set([...mapA.keys(), ...mapB.keys()]);
		let unionCard = 0;
		let symDiffCard = 0;
		for (const k of keys) {
			const ca = mapA.get(k) ?? 0;
			const cb = mapB.get(k) ?? 0;
			unionCard += Math.max(ca, cb);
			symDiffCard += Math.abs(ca - cb);
		}
		const cardA = cardinality(mapA);
		const cardB = cardinality(mapB);
		const cardInter = cardinality(actualAB);

		assert.equal(cardInter + unionCard, cardA + cardB);
		assert.equal(2 * cardInter, cardA + cardB - symDiffCard);
	}
});
