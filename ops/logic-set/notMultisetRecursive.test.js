import test from 'node:test';
import assert from 'node:assert/strict';
import { notMultisetRecursive } from './notMultisetRecursive.js';

/**
 * Independent iterative reference implementation for cross-checking.
 *
 * @template T
 * @param {Map<T, number>} multiset
 * @param {Map<T, number>} universe
 * @returns {Map<T, number>}
 */
function notMultisetIterativeRef(multiset, universe) {
	const result = new Map();
	for (const [key, uCount] of universe.entries()) {
		const aCount = multiset.has(key) ? multiset.get(key) : 0;
		const diff = uCount - aCount;
		if (diff > 0) {
			result.set(key, diff);
		}
	}
	return result;
}

test('normal case: subtracts counts from universe and omits zero entries', () => {
	const a = new Map([
		['a', 1],
		['b', 3],
		['c', 2],
	]);
	const u = new Map([
		['a', 4],
		['b', 3],
		['c', 5],
		['d', 2],
	]);

	const res = notMultisetRecursive(a, u);
	assert.deepEqual(
		res,
		new Map([
			['a', 3],
			['c', 3],
			['d', 2],
		])
	);
	assert.equal(res.has('b'), false);
});

test('edge case: empty multiset returns positive entries of universe', () => {
	const a = new Map();
	const u = new Map([
		['x', 2],
		['y', 0],
		['z', 5],
	]);

	const res = notMultisetRecursive(a, u);
	assert.deepEqual(
		res,
		new Map([
			['x', 2],
			['z', 5],
		])
	);
	assert.notEqual(res, u);
});

test('edge case: empty universe returns empty map even if multiset is non-empty', () => {
	const a = new Map([
		['a', 3],
		['b', 1],
	]);
	const u = new Map();

	const res = notMultisetRecursive(a, u);
	assert.deepEqual(res, new Map());
});

test('edge case: both empty returns empty map', () => {
	const res = notMultisetRecursive(new Map(), new Map());
	assert.deepEqual(res, new Map());
});

test('edge case: multiset equal to universe returns empty map', () => {
	const a = new Map([
		['p', 4],
		['q', 1],
		['r', 7],
	]);
	const u = new Map([
		['p', 4],
		['q', 1],
		['r', 7],
	]);

	const res = notMultisetRecursive(a, u);
	assert.deepEqual(res, new Map());
});

test('edge case: counts exceeding universe and extra keys in multiset are clamped to 0 and omitted', () => {
	const a = new Map([
		['a', 10],
		['b', 2],
		['extra', 5],
	]);
	const u = new Map([
		['a', 3],
		['b', 5],
		['c', 1],
	]);

	const res = notMultisetRecursive(a, u);
	assert.deepEqual(
		res,
		new Map([
			['b', 3],
			['c', 1],
		])
	);
});

test('edge case: single-element maps and non-string keys (objects, symbols, NaN, null, undefined)', () => {
	const objKey = { id: 1 };
	const symKey = Symbol('s');

	assert.deepEqual(
		notMultisetRecursive(new Map([[objKey, 1]]), new Map([[objKey, 4]])),
		new Map([[objKey, 3]])
	);

	const a = new Map([
		[objKey, 2],
		[symKey, 3],
		[NaN, 1],
		[null, 0],
		[undefined, 5],
	]);
	const u = new Map([
		[objKey, 5],
		[symKey, 3],
		[NaN, 4],
		[null, 2],
		[undefined, 2],
	]);

	const res = notMultisetRecursive(a, u);
	assert.deepEqual(
		res,
		new Map([
			[objKey, 3],
			[NaN, 3],
			[null, 2],
		])
	);
});

test('immutability: does not mutate input multiset or universe', () => {
	const a = new Map([
		['a', 1],
		['b', 2],
	]);
	const u = new Map([
		['a', 3],
		['b', 2],
		['c', 4],
	]);

	const aSnap = Array.from(a.entries());
	const uSnap = Array.from(u.entries());

	notMultisetRecursive(a, u);

	assert.deepEqual(Array.from(a.entries()), aSnap);
	assert.deepEqual(Array.from(u.entries()), uSnap);
});

test('invalid inputs: throws TypeError when multiset or universe is not a Map', () => {
	const valid = new Map([['a', 1]]);

	for (const bad of [null, undefined, {}, [], new Set(['a']), 'map', 123, true]) {
		assert.throws(() => notMultisetRecursive(bad, valid), TypeError);
		assert.throws(() => notMultisetRecursive(valid, bad), TypeError);
	}
});

test('invalid inputs: throws on negative, non-integer, non-finite, or non-number counts', () => {
	const valid = new Map([['a', 2]]);
	const empty = new Map();

	const badRangeCounts = [-1, -100, 1.5, 0.001, NaN, Infinity, -Infinity];
	for (const count of badRangeCounts) {
		assert.throws(
			() => notMultisetRecursive(new Map([['a', count]]), valid),
			RangeError
		);
		assert.throws(
			() => notMultisetRecursive(valid, new Map([['a', count]])),
			RangeError
		);
		// Invalid count in multiset must still be caught even when universe is empty
		assert.throws(
			() => notMultisetRecursive(new Map([['other', count]]), empty),
			RangeError
		);
	}

	const badTypeCounts = ['1', null, undefined, true, {}, [], 2n];
	for (const count of badTypeCounts) {
		assert.throws(
			() => notMultisetRecursive(new Map([['a', count]]), valid),
			TypeError
		);
		assert.throws(
			() => notMultisetRecursive(valid, new Map([['a', count]])),
			TypeError
		);
	}
});

test('cross-check: matches independent iterative reference across deterministic pseudo-random cases', () => {
	let seed = 0x12345678;
	const nextRand = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed;
	};

	const keys = Array.from({ length: 40 }, (_, i) => `k${i}`);

	for (let trial = 0; trial < 50; trial++) {
		const a = new Map();
		const u = new Map();

		for (const k of keys) {
			if ((nextRand() & 3) !== 0) {
				u.set(k, nextRand() % 8);
			}
			if ((nextRand() & 1) === 0) {
				a.set(k, nextRand() % 10);
			}
		}

		const actual = notMultisetRecursive(a, u);
		const expected = notMultisetIterativeRef(a, u);
		assert.deepEqual(actual, expected);
	}
});

test('algebraic property: involution not(not(A, U), U) === A when A <= U (no zero-count entries)', () => {
	let seed = 0xdeadbeef;
	const nextRand = () => {
		seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
		return seed;
	};

	for (let trial = 0; trial < 30; trial++) {
		const u = new Map();
		const a = new Map();
		const size = (nextRand() % 25) + 1;

		for (let i = 0; i < size; i++) {
			const key = `elem_${i}`;
			const uCount = (nextRand() % 10) + 1;
			u.set(key, uCount);
			const aCount = nextRand() % (uCount + 1);
			if (aCount > 0) {
				a.set(key, aCount);
			}
		}

		const firstNot = notMultisetRecursive(a, u);
		const doubleNot = notMultisetRecursive(firstNot, u);
		assert.deepEqual(doubleNot, a);
	}
});

test('scalability: handles large multisets without stack overflow', () => {
	const size = 2000;
	const a = new Map();
	const u = new Map();

	for (let i = 0; i < size; i++) {
		u.set(i, (i % 7) + 1);
		if (i % 2 === 0) {
			a.set(i, i % 5);
		}
	}

	const actual = notMultisetRecursive(a, u);
	const expected = notMultisetIterativeRef(a, u);
	assert.deepEqual(actual, expected);
});
