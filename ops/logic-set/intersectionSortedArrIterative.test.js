import { test } from 'node:test';
import assert from 'node:assert/strict';
import { intersectionSortedArrIterative } from './intersectionSortedArrIterative.js';

/**
 * Independent Set-based reference implementation for sorted unique arrays.
 */
function referenceSetIntersection(a, b) {
	const setB = new Set(b);
	return a.filter((x) => setB.has(x));
}

/**
 * Independent binary-search intersection for sorted unique arrays.
 */
function binarySearchIntersection(a, b) {
	const out = [];
	for (const target of a) {
		let lo = 0;
		let hi = b.length - 1;
		while (lo <= hi) {
			const mid = (lo + hi) >>> 1;
			if (b[mid] < target) {
				lo = mid + 1;
			} else if (b[mid] > target) {
				hi = mid - 1;
			} else {
				out.push(target);
				break;
			}
		}
	}
	return out;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function generateSortedUniqueInts(rng, maxLen, domainSize) {
	const len = Math.floor(rng() * (maxLen + 1));
	const set = new Set();
	for (let i = 0; i < len; i += 1) {
		set.add(Math.floor(rng() * domainSize) - Math.floor(domainSize / 2));
	}
	return [...set].sort((x, y) => x - y);
}

test('normal numeric intersections: overlap, disjoint, identical, subset/superset', () => {
	assert.deepEqual(
		intersectionSortedArrIterative([1, 2, 4, 7, 10], [2, 3, 4, 8, 10, 12]),
		[2, 4, 10]
	);
	assert.deepEqual(
		intersectionSortedArrIterative([-10, -3.5, 0, 1.25, 9], [-10, -2, 0, 1.25, 100]),
		[-10, 0, 1.25]
	);
	assert.deepEqual(
		intersectionSortedArrIterative([1, 3, 5], [2, 4, 6]),
		[]
	);
	assert.deepEqual(
		intersectionSortedArrIterative([1, 2, 3], [10, 20, 30]),
		[]
	);
	assert.deepEqual(
		intersectionSortedArrIterative([1, 2, 3, 4], [1, 2, 3, 4]),
		[1, 2, 3, 4]
	);
	assert.deepEqual(
		intersectionSortedArrIterative([2, 5], [1, 2, 3, 4, 5, 6, 7]),
		[2, 5]
	);
	assert.deepEqual(
		intersectionSortedArrIterative([1, 2, 3, 4, 5, 6, 7], [2, 5]),
		[2, 5]
	);
});

test('supports strings, bigints, and custom comparators without mutating inputs', () => {
	assert.deepEqual(
		intersectionSortedArrIterative(
			['apple', 'banana', 'cherry', 'date'],
			['apricot', 'banana', 'date', 'elderberry']
		),
		['banana', 'date']
	);

	assert.deepEqual(
		intersectionSortedArrIterative(
			[10n ** 20n, 10n ** 20n + 1n, 10n ** 20n + 5n],
			[10n ** 20n + 1n, 10n ** 20n + 2n, 10n ** 20n + 5n]
		),
		[10n ** 20n + 1n, 10n ** 20n + 5n]
	);

	const aObjs = [
		{ id: 1, src: 'a' },
		{ id: 3, src: 'a' },
		{ id: 5, src: 'a' },
	];
	const bObjs = [
		{ id: 2, src: 'b' },
		{ id: 3, src: 'b' },
		{ id: 5, src: 'b' },
	];
	const byId = (x, y) => x.id - y.id;
	const res = intersectionSortedArrIterative(aObjs, bObjs, byId);
	assert.deepEqual(res, [
		{ id: 3, src: 'a' },
		{ id: 5, src: 'a' },
	]);
	assert.strictEqual(res[0], aObjs[1]);
	assert.strictEqual(res[1], aObjs[2]);

	// Descending custom comparator
	const desc = (x, y) => y - x;
	assert.deepEqual(
		intersectionSortedArrIterative([10, 7, 4, 1], [9, 7, 3, 1], desc),
		[7, 1]
	);

	// Does not mutate inputs and returns a fresh array
	const a = [1, 2, 3];
	const b = [1, 2, 3];
	const out = intersectionSortedArrIterative(a, b);
	assert.notStrictEqual(out, a);
	assert.notStrictEqual(out, b);
	assert.deepEqual(a, [1, 2, 3]);
	assert.deepEqual(b, [1, 2, 3]);
});

test('edge cases: empty arrays, singletons, boundary overlaps, infinities, signed zeros', () => {
	assert.deepEqual(intersectionSortedArrIterative([], []), []);
	assert.deepEqual(intersectionSortedArrIterative([], [1, 2, 3]), []);
	assert.deepEqual(intersectionSortedArrIterative([1, 2, 3], []), []);

	assert.deepEqual(intersectionSortedArrIterative([42], [42]), [42]);
	assert.deepEqual(intersectionSortedArrIterative([41], [42]), []);

	// Overlap only at endpoints
	assert.deepEqual(intersectionSortedArrIterative([1, 2, 3], [3, 4, 5]), [3]);
	assert.deepEqual(intersectionSortedArrIterative([3, 4, 5], [1, 2, 3]), [3]);
	assert.deepEqual(intersectionSortedArrIterative([1, 5, 10], [1, 2, 3, 10]), [1, 10]);

	// Infinities and signed zero
	assert.deepEqual(
		intersectionSortedArrIterative([-Infinity, 0, Infinity], [-Infinity, 1, Infinity]),
		[-Infinity, Infinity]
	);
	const zeroRes = intersectionSortedArrIterative([-0], [0]);
	assert.equal(zeroRes.length, 1);
	assert.ok(Object.is(zeroRes[0], -0));
});

test('validation errors: invalid types, sparse arrays, comparator errors, NaN, unsorted, duplicates', () => {
	// Non-array inputs
	for (const bad of [null, undefined, 123, 'abc', {}, new Set([1, 2])]) {
		assert.throws(() => intersectionSortedArrIterative(bad, [1, 2]), TypeError);
		assert.throws(() => intersectionSortedArrIterative([1, 2], bad), TypeError);
	}

	// Sparse arrays
	// eslint-disable-next-line no-sparse-arrays
	const sparse = [1, , 3];
	assert.throws(() => intersectionSortedArrIterative(sparse, [1, 3]), TypeError);
	assert.throws(() => intersectionSortedArrIterative([1, 3], new Array(2)), TypeError);

	// Invalid comparator argument
	assert.throws(() => intersectionSortedArrIterative([1], [1], null), TypeError);
	assert.throws(() => intersectionSortedArrIterative([1], [1], 42), TypeError);
	assert.throws(() => intersectionSortedArrIterative([1], [1], {}), TypeError);

	// Comparator returning invalid values
	assert.throws(
		() => intersectionSortedArrIterative([1, 2], [2, 3], () => NaN),
		TypeError
	);
	assert.throws(
		() => intersectionSortedArrIterative([1], [1], () => '0'),
		TypeError
	);
	assert.throws(
		() => intersectionSortedArrIterative([1], [1], () => undefined),
		TypeError
	);

	// Unsupported and mixed types under default comparator
	assert.throws(() => intersectionSortedArrIterative([null], [null]), TypeError);
	assert.throws(() => intersectionSortedArrIterative([undefined], [undefined]), TypeError);
	assert.throws(() => intersectionSortedArrIterative([{}], [{}]), TypeError);
	assert.throws(() => intersectionSortedArrIterative([false, true], [true]), TypeError);
	assert.throws(() => intersectionSortedArrIterative([1, '2'], [1]), TypeError);
	assert.throws(() => intersectionSortedArrIterative([1, 2], ['1', '2']), TypeError);

	// NaN under default comparator
	assert.throws(() => intersectionSortedArrIterative([1, NaN], [1]), RangeError);
	assert.throws(() => intersectionSortedArrIterative([], [NaN]), RangeError);

	// Unsorted arrays (including when the other array is empty or ends early)
	assert.throws(() => intersectionSortedArrIterative([3, 1, 2], [1, 2]), RangeError);
	assert.throws(() => intersectionSortedArrIterative([1, 2], [2, 1]), RangeError);
	assert.throws(() => intersectionSortedArrIterative([], [5, 2]), RangeError);
	assert.throws(() => intersectionSortedArrIterative([1], [10, 5]), RangeError);

	// Duplicate elements (including -0 and +0)
	assert.throws(() => intersectionSortedArrIterative([1, 2, 2, 3], [2]), RangeError);
	assert.throws(() => intersectionSortedArrIterative([1, 2], [2, 2]), RangeError);
	assert.throws(() => intersectionSortedArrIterative([], [7, 7]), RangeError);
	assert.throws(() => intersectionSortedArrIterative([-0, 0], [0]), RangeError);
});

test('cross-check against Set reference, binary search, and set-theoretic identities', () => {
	const rng = makeRng(0x5eed1234);

	for (let trial = 0; trial < 200; trial += 1) {
		const a = generateSortedUniqueInts(rng, 40, 60);
		const b = generateSortedUniqueInts(rng, 40, 60);
		const c = generateSortedUniqueInts(rng, 40, 60);

		const actual = intersectionSortedArrIterative(a, b);
		const expectedSet = referenceSetIntersection(a, b);
		const expectedBinSearch = binarySearchIntersection(a, b);

		// Cross-check against two independent algorithms
		assert.deepEqual(actual, expectedSet);
		assert.deepEqual(actual, expectedBinSearch);

		// Commutativity: A ∩ B = B ∩ A
		assert.deepEqual(actual, intersectionSortedArrIterative(b, a));

		// Idempotence: A ∩ A = A
		assert.deepEqual(intersectionSortedArrIterative(a, a), a);

		// Associativity: (A ∩ B) ∩ C = A ∩ (B ∩ C)
		const lhs = intersectionSortedArrIterative(actual, c);
		const rhs = intersectionSortedArrIterative(
			a,
			intersectionSortedArrIterative(b, c)
		);
		assert.deepEqual(lhs, rhs);

		// Inclusion-exclusion cardinality identity: |A ∩ B| = |A| + |B| - |A ∪ B|
		const unionSize = new Set([...a, ...b]).size;
		assert.equal(actual.length, a.length + b.length - unionSize);
	}
});
