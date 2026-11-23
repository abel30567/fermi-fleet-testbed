import test from 'node:test';
import assert from 'node:assert/strict';
import { notSortedArrSeries } from './notSortedArrSeries.js';

/**
 * Independent reference implementation using JavaScript Set lookup.
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} universe
 * @returns {T[]}
 */
function referenceSetNot(a, universe) {
	const setA = new Set(a);
	return universe.filter((x) => !setA.has(x));
}

/**
 * Independent binary-search reference implementation in O(|universe| log |a|).
 *
 * @template T
 * @param {readonly T[]} a
 * @param {readonly T[]} universe
 * @param {(x: T, y: T) => number} cmp
 * @returns {T[]}
 */
function binarySearchNot(a, universe, cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0)) {
	const result = [];
	for (const x of universe) {
		let lo = 0;
		let hi = a.length - 1;
		let found = false;
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1;
			const order = cmp(a[mid], x);
			if (order === 0) {
				found = true;
				break;
			}
			if (order < 0) {
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		if (!found) {
			result.push(x);
		}
	}
	return result;
}

/**
 * Reference sorted set union for algebraic identity verification.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function refUnion(a, b) {
	return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

/**
 * Reference sorted set intersection for algebraic identity verification.
 *
 * @param {readonly number[]} a
 * @param {readonly number[]} b
 * @returns {number[]}
 */
function refIntersect(a, b) {
	const setB = new Set(b);
	return a.filter((x) => setB.has(x));
}

/**
 * Deterministic xorshift32 PRNG for reproducible property-based cross-checks.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

/**
 * Generates a sorted, de-duplicated integer array in [minVal, maxVal].
 *
 * @param {() => number} rng
 * @param {number} minVal
 * @param {number} maxVal
 * @param {number} prob
 * @returns {number[]}
 */
function randomSortedSet(rng, minVal, maxVal, prob) {
	const out = [];
	for (let v = minVal; v <= maxVal; v++) {
		if (rng() < prob) {
			out.push(v);
		}
	}
	return out;
}

test('normal cases: integer subsets and elements outside universe', () => {
	assert.deepEqual(notSortedArrSeries([2, 4], [1, 2, 3, 4, 5]), [1, 3, 5]);
	assert.deepEqual(notSortedArrSeries([0, 2, 4, 6], [1, 2, 3, 4, 5]), [1, 3, 5]);
	assert.deepEqual(notSortedArrSeries([-10, -2, 0, 7, 100], [-5, -2, 0, 3, 7]), [-5, 3]);
});

test('normal cases: floats, negative zero, and infinities', () => {
	assert.deepEqual(
		notSortedArrSeries([-Infinity, -0.5, 1.5], [-Infinity, -1.5, -0.5, 0, 1.5, Infinity]),
		[-1.5, 0, Infinity],
	);
	// -0 and +0 are equal under standard numeric ordering
	assert.deepEqual(notSortedArrSeries([0], [-0, 1]), [1]);
	assert.deepEqual(notSortedArrSeries([1], [-0, 1]), [-0]);
});

test('normal cases: strings and bigints', () => {
	assert.deepEqual(
		notSortedArrSeries(['banana', 'date'], ['apple', 'banana', 'cherry', 'date', 'elderberry']),
		['apple', 'cherry', 'elderberry'],
	);
	assert.deepEqual(
		notSortedArrSeries([2n, 10n ** 30n], [1n, 2n, 3n, 10n ** 30n, 10n ** 30n + 1n]),
		[1n, 3n, 10n ** 30n + 1n],
	);
});

test('normal cases: custom comparator with objects and reverse ordering', () => {
	const byId = (x, y) => x.id - y.id;
	const u = [{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' }];
	const a = [{ id: 2, label: 'other' }, { id: 4, label: 'd' }];
	const res = notSortedArrSeries(a, u, byId);

	assert.deepEqual(res, [{ id: 1, label: 'a' }, { id: 3, label: 'c' }]);
	assert.equal(res[0], u[0]);
	assert.equal(res[1], u[2]);

	// Strictly descending arrays with descending comparator
	const desc = (x, y) => y - x;
	assert.deepEqual(notSortedArrSeries([8, 4, 2], [10, 8, 6, 4, 2, 0], desc), [10, 6, 0]);
});

test('normal cases: does not mutate inputs and returns a fresh array', () => {
	const a = [2, 4];
	const u = [1, 2, 3, 4, 5];
	const aCopy = [...a];
	const uCopy = [...u];

	const res = notSortedArrSeries(a, u);
	assert.deepEqual(a, aCopy);
	assert.deepEqual(u, uCopy);

	const full = notSortedArrSeries([], u);
	assert.deepEqual(full, u);
	assert.notEqual(full, u);
	full.push(999);
	assert.deepEqual(u, uCopy);
});

test('edge cases: empty arrays, full complement, disjoint sets, and singletons', () => {
	assert.deepEqual(notSortedArrSeries([], []), []);
	assert.deepEqual(notSortedArrSeries([], [1, 2, 3]), [1, 2, 3]);
	assert.deepEqual(notSortedArrSeries([1, 2, 3], []), []);
	assert.deepEqual(notSortedArrSeries([1, 2, 3], [1, 2, 3]), []);

	// Same array reference for both arguments
	const same = [1, 2, 3];
	assert.deepEqual(notSortedArrSeries(same, same), []);

	// Disjoint sets
	assert.deepEqual(notSortedArrSeries([1, 2], [3, 4, 5]), [3, 4, 5]);
	assert.deepEqual(notSortedArrSeries([6, 7], [3, 4, 5]), [3, 4, 5]);
	assert.deepEqual(notSortedArrSeries([2, 4, 6], [1, 3, 5]), [1, 3, 5]);

	// Superset
	assert.deepEqual(notSortedArrSeries([0, 1, 2, 3, 4], [1, 2, 3]), []);

	// Singletons
	assert.deepEqual(notSortedArrSeries([5], [5]), []);
	assert.deepEqual(notSortedArrSeries([4], [5]), [5]);
});

test('edge cases: large sorted arrays (10,000 elements)', () => {
	const universe = Array.from({ length: 10000 }, (_, i) => i);
	const evens = Array.from({ length: 5000 }, (_, i) => i * 2);
	const expectedOdds = Array.from({ length: 5000 }, (_, i) => i * 2 + 1);

	assert.deepEqual(notSortedArrSeries(evens, universe), expectedOdds);
});

test('invalid inputs: non-array arguments and invalid comparator', () => {
	for (const bad of [null, undefined, 42, '123', {}, new Set([1, 2])]) {
		assert.throws(() => notSortedArrSeries(bad, [1, 2]), TypeError);
		assert.throws(() => notSortedArrSeries([1, 2], bad), TypeError);
	}

	for (const badCmp of [null, 123, 'cmp', {}]) {
		assert.throws(() => notSortedArrSeries([1], [1, 2], badCmp), TypeError);
	}
});

test('invalid inputs: unsorted and duplicate elements', () => {
	// Unsorted
	assert.throws(() => notSortedArrSeries([3, 1, 2], [1, 2, 3]), RangeError);
	assert.throws(() => notSortedArrSeries([1, 2], [1, 3, 2]), RangeError);
	assert.throws(() => notSortedArrSeries(['b', 'a'], ['a', 'b']), RangeError);

	// Duplicates
	assert.throws(() => notSortedArrSeries([1, 2, 2], [1, 2, 3]), RangeError);
	assert.throws(() => notSortedArrSeries([1], [1, 1, 2]), RangeError);
	assert.throws(() => notSortedArrSeries([-0, 0], [0, 1]), RangeError);

	// Custom comparator duplicates / unsorted
	const byId = (x, y) => x.id - y.id;
	assert.throws(
		() => notSortedArrSeries([{ id: 1 }, { id: 1 }], [{ id: 1 }, { id: 2 }], byId),
		RangeError,
	);
	assert.throws(
		() => notSortedArrSeries([{ id: 2 }, { id: 1 }], [{ id: 1 }, { id: 2 }], byId),
		RangeError,
	);
});

test('invalid inputs: NaN, mixed types, unsupported primitives, sparse arrays, and bad comparator output', () => {
	assert.throws(() => notSortedArrSeries([1, Number.NaN], [1, 2]), TypeError);
	assert.throws(() => notSortedArrSeries([1], [1, Number.NaN]), TypeError);

	// Mixed types within an array or across a and universe
	assert.throws(() => notSortedArrSeries([1, '2'], [1, 2]), TypeError);
	assert.throws(() => notSortedArrSeries([1, 2], ['1', '2']), TypeError);
	assert.throws(() => notSortedArrSeries([1n], [1, 2]), TypeError);

	// Unsupported types with default comparator
	assert.throws(() => notSortedArrSeries([null], [1, 2]), TypeError);
	assert.throws(() => notSortedArrSeries([undefined], [1, 2]), TypeError);
	assert.throws(() => notSortedArrSeries([true], [false, true]), TypeError);
	assert.throws(() => notSortedArrSeries([{ a: 1 }], [{ a: 1 }]), TypeError);
	assert.throws(() => notSortedArrSeries([Symbol('a')], [Symbol('a')]), TypeError);

	// Sparse arrays
	const sparse = [1, , 3]; // eslint-disable-line no-sparse-arrays
	assert.throws(() => notSortedArrSeries(sparse, [1, 2, 3]), TypeError);
	assert.throws(() => notSortedArrSeries([1], sparse), TypeError);

	// Comparator returning NaN or non-number
	assert.throws(() => notSortedArrSeries([1, 2], [1, 2], () => Number.NaN), TypeError);
	assert.throws(() => notSortedArrSeries([1], [2], () => '0'), TypeError);
});

test('independent cross-checks: Set filter, binary search, and Boolean algebra identities', () => {
	const rng = makeRng(0x5eed1234);

	for (let trial = 0; trial < 200; trial++) {
		const universe = randomSortedSet(rng, -25, 25, 0.55);
		const a = randomSortedSet(rng, -30, 30, 0.45);
		const b = randomSortedSet(rng, -30, 30, 0.45);

		const notA = notSortedArrSeries(a, universe);
		const notB = notSortedArrSeries(b, universe);

		// 1. Cross-check against independent Set-based reference
		assert.deepEqual(notA, referenceSetNot(a, universe));

		// 2. Cross-check against independent binary-search reference
		assert.deepEqual(notA, binarySearchNot(a, universe));

		// 3. Double negation (involution): ¬(¬A) = A ∩ U
		assert.deepEqual(notSortedArrSeries(notA, universe), refIntersect(a, universe));

		// 4. De Morgan's laws:
		//    ¬(A ∪ B) = (¬A) ∩ (¬B)
		//    ¬(A ∩ B) = (¬A) ∪ (¬B)
		assert.deepEqual(notSortedArrSeries(refUnion(a, b), universe), refIntersect(notA, notB));
		assert.deepEqual(notSortedArrSeries(refIntersect(a, b), universe), refUnion(notA, notB));

		// 5. Law of excluded middle & non-contradiction:
		//    (A ∩ U) ∪ ¬A = U  and  A ∩ ¬A = ∅
		assert.deepEqual(refUnion(refIntersect(a, universe), notA), universe);
		assert.deepEqual(refIntersect(a, notA), []);

		// 6. Cardinality / inclusion-exclusion identity: |¬A| = |U| - |U ∩ A|
		assert.equal(notA.length, universe.length - refIntersect(universe, a).length);
	}
});
