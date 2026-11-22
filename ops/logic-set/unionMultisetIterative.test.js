import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { unionMultisetIterative } from './unionMultisetIterative.js';

/**
 * Order-independent structural equality assertion for canonical multisets.
 *
 * @param {Map<unknown, number>} actual
 * @param {Map<unknown, number>} expected
 */
function assertMultisetEqual(actual, expected) {
	assert.ok(actual instanceof Map, 'result must be a Map');
	assert.equal(actual.size, expected.size, `expected size ${expected.size}, got ${actual.size}`);
	for (const [key, count] of actual.entries()) {
		assert.ok(
			Number.isSafeInteger(count) && count > 0,
			`result must be canonical (positive safe integer counts), found ${count}`
		);
		assert.ok(expected.has(key), `unexpected key in result: ${String(key)}`);
		assert.equal(count, expected.get(key));
	}
	for (const [key, count] of expected.entries()) {
		assert.ok(actual.has(key), `missing expected key: ${String(key)}`);
		assert.equal(actual.get(key), count);
	}
}

/**
 * Independent reference implementation via explicit bag expansion into arrays
 * and element-wise Set evaluation using SameValueZero matching.
 *
 * @param {Map<unknown, number>} a
 * @param {Map<unknown, number>} b
 * @returns {Map<unknown, number>}
 */
function referenceUnionViaArraySet(a, b) {
	const bagA = [];
	for (const [key, count] of a.entries()) {
		for (let i = 0; i < count; i += 1) {
			bagA.push(key);
		}
	}

	const bagB = [];
	for (const [key, count] of b.entries()) {
		for (let i = 0; i < count; i += 1) {
			bagB.push(key);
		}
	}

	const universe = new Set([...bagA, ...bagB]);
	const expected = new Map();
	for (const elem of universe) {
		const countInA = bagA.filter((x) => Object.is(x, elem) || (x === 0 && elem === 0)).length;
		const countInB = bagB.filter((x) => Object.is(x, elem) || (x === 0 && elem === 0)).length;
		const maxCount = Math.max(countInA, countInB);
		if (maxCount > 0) {
			expected.set(elem, maxCount);
		}
	}
	return expected;
}

/**
 * Deterministic LCG PRNG for reproducible property tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

/**
 * Generates a random multiset over a fixed domain, occasionally including 0 counts.
 *
 * @param {() => number} nextRand
 * @param {unknown[]} domain
 * @param {number} maxCount
 * @returns {Map<unknown, number>}
 */
function randomMultiset(nextRand, domain, maxCount = 6) {
	const map = new Map();
	for (const key of domain) {
		const roll = nextRand();
		if (roll < 0.25) {
			continue;
		}
		const count = Math.floor(nextRand() * (maxCount + 1));
		map.set(key, count);
	}
	return map;
}

/**
 * Computes total cardinality (sum of multiplicities) of a multiset.
 *
 * @param {Map<unknown, number>} map
 * @returns {number}
 */
function multisetCardinality(map) {
	let total = 0;
	for (const count of map.values()) {
		total += count;
	}
	return total;
}

describe('unionMultisetIterative', () => {
	test('computes union for disjoint and overlapping multisets', () => {
		const a = new Map([
			['apple', 3],
			['banana', 1],
			['cherry', 4]
		]);
		const b = new Map([
			['banana', 5],
			['cherry', 4],
			['date', 2]
		]);

		const res = unionMultisetIterative(a, b);
		assertMultisetEqual(
			res,
			new Map([
				['apple', 3],
				['banana', 5],
				['cherry', 4],
				['date', 2]
			])
		);
	});

	test('supports diverse JavaScript key types using Map SameValueZero semantics', () => {
		const sym = Symbol('tag');
		const objA = { id: 1 };
		const objB = { id: 2 };

		const a = new Map([
			[NaN, 2],
			[-0, 3],
			[null, 1],
			[undefined, 4],
			[sym, 2],
			[objA, 1],
			[true, 5]
		]);
		const b = new Map([
			[NaN, 5],
			[+0, 1],
			[null, 3],
			[sym, 2],
			[objB, 4],
			[false, 2]
		]);

		const res = unionMultisetIterative(a, b);
		assertMultisetEqual(
			res,
			new Map([
				[NaN, 5],
				[0, 3],
				[null, 3],
				[undefined, 4],
				[sym, 2],
				[objA, 1],
				[objB, 4],
				[true, 5],
				[false, 2]
			])
		);
	});

	test('omits zero and negative-zero entries for canonical output', () => {
		const a = new Map([
			['zeroOnlyA', 0],
			['negZero', -0],
			['zeroInA_posInB', 0],
			['posInA_zeroInB', 3],
			['bothZero', 0]
		]);
		const b = new Map([
			['zeroOnlyB', 0],
			['zeroInA_posInB', 4],
			['posInA_zeroInB', 0],
			['bothZero', -0]
		]);

		const res = unionMultisetIterative(a, b);
		assertMultisetEqual(
			res,
			new Map([
				['zeroInA_posInB', 4],
				['posInA_zeroInB', 3]
			])
		);
		assert.equal(res.has('zeroOnlyA'), false);
		assert.equal(res.has('zeroOnlyB'), false);
		assert.equal(res.has('negZero'), false);
		assert.equal(res.has('bothZero'), false);
	});

	test('handles empty multisets and Number.MAX_SAFE_INTEGER counts', () => {
		const emptyA = new Map();
		const emptyB = new Map();
		assertMultisetEqual(unionMultisetIterative(emptyA, emptyB), new Map());

		const big = new Map([
			['max', Number.MAX_SAFE_INTEGER],
			['one', 1]
		]);
		assertMultisetEqual(unionMultisetIterative(big, emptyA), big);
		assertMultisetEqual(unionMultisetIterative(emptyA, big), big);
		assertMultisetEqual(
			unionMultisetIterative(
				new Map([['max', Number.MAX_SAFE_INTEGER - 1]]),
				new Map([['max', Number.MAX_SAFE_INTEGER]])
			),
			new Map([['max', Number.MAX_SAFE_INTEGER]])
		);
	});

	test('does not mutate input maps and returns a new Map instance', () => {
		const a = new Map([
			['x', 2],
			['z', 0]
		]);
		const b = new Map([
			['x', 5],
			['y', 1]
		]);
		const snapshotA = [...a.entries()];
		const snapshotB = [...b.entries()];

		const res = unionMultisetIterative(a, b);
		assert.notEqual(res, a);
		assert.notEqual(res, b);
		assert.deepEqual([...a.entries()], snapshotA);
		assert.deepEqual([...b.entries()], snapshotB);

		const sameRefRes = unionMultisetIterative(a, a);
		assert.notEqual(sameRefRes, a);
		assert.deepEqual([...a.entries()], snapshotA);
		assertMultisetEqual(sameRefRes, new Map([['x', 2]]));
	});

	test('throws TypeError when inputs are not Map instances', () => {
		const valid = new Map([['a', 1]]);
		const badInputs = [null, undefined, {}, [], new Set(['a']), 'map', 42, true];

		for (const bad of badInputs) {
			assert.throws(() => unionMultisetIterative(bad, valid), TypeError);
			assert.throws(() => unionMultisetIterative(valid, bad), TypeError);
		}
	});

	test('throws TypeError for non-number counts and handles symbol/null-proto keys safely', () => {
		const valid = new Map([['a', 1]]);
		const nullProtoKey = Object.create(null);
		const symKey = Symbol('badCount');

		const badValues = ['1', null, undefined, 2n, {}, [], true];
		for (const badVal of badValues) {
			assert.throws(() => unionMultisetIterative(new Map([['k', badVal]]), valid), TypeError);
			assert.throws(() => unionMultisetIterative(valid, new Map([['k', badVal]])), TypeError);
		}

		assert.throws(
			() => unionMultisetIterative(new Map([[symKey, '2']]), valid),
			TypeError
		);
		assert.throws(
			() => unionMultisetIterative(valid, new Map([[nullProtoKey, null]])),
			TypeError
		);
	});

	test('throws RangeError for negative, non-integer, non-finite, or unsafe counts', () => {
		const valid = new Map([['x', 10]]);
		const badCounts = [
			-1,
			-100,
			0.5,
			3.14,
			NaN,
			Infinity,
			-Infinity,
			Number.MAX_SAFE_INTEGER + 1,
			-Number.MAX_SAFE_INTEGER - 1,
			1e20
		];

		for (const badCount of badCounts) {
			assert.throws(() => unionMultisetIterative(new Map([['x', badCount]]), valid), RangeError);
			assert.throws(() => unionMultisetIterative(valid, new Map([['x', badCount]])), RangeError);
		}
	});

	test('cross-checks against independent array/set bag expansion over 50 random pairs', () => {
		const nextRand = makeRng(20261122);
		const domain = ['a', 'b', 'c', 0, 1, 2, null, NaN];

		for (let i = 0; i < 50; i += 1) {
			const a = randomMultiset(nextRand, domain, 6);
			const b = randomMultiset(nextRand, domain, 6);

			const actual = unionMultisetIterative(a, b);
			const expected = referenceUnionViaArraySet(a, b);

			assertMultisetEqual(actual, expected);
		}
	});

	test('satisfies multiset algebraic identities (commutativity, associativity, idempotence, empty identity, inclusion-exclusion)', () => {
		const nextRand = makeRng(1337);
		const domain = ['k1', 'k2', 'k3', 'k4', 'k5', 'k6'];
		const empty = new Map();

		for (let i = 0; i < 40; i += 1) {
			const a = randomMultiset(nextRand, domain, 8);
			const b = randomMultiset(nextRand, domain, 8);
			const c = randomMultiset(nextRand, domain, 8);

			// Commutativity: A ∪ B = B ∪ A
			const ab = unionMultisetIterative(a, b);
			const ba = unionMultisetIterative(b, a);
			assertMultisetEqual(ab, ba);

			// Associativity: (A ∪ B) ∪ C = A ∪ (B ∪ C)
			const leftAssoc = unionMultisetIterative(ab, c);
			const rightAssoc = unionMultisetIterative(a, unionMultisetIterative(b, c));
			assertMultisetEqual(leftAssoc, rightAssoc);

			// Idempotence: A ∪ A = canonical(A)
			const aa = unionMultisetIterative(a, a);
			const canonicalA = new Map([...a.entries()].filter(([, v]) => v > 0));
			assertMultisetEqual(aa, canonicalA);

			// Empty identity: A ∪ ∅ = ∅ ∪ A = canonical(A)
			assertMultisetEqual(unionMultisetIterative(a, empty), canonicalA);
			assertMultisetEqual(unionMultisetIterative(empty, a), canonicalA);

			// Inclusion-exclusion cardinality identity: |A ∪ B| + |A ∩ B| = |A| + |B|
			let interCard = 0;
			for (const [key, countA] of a.entries()) {
				const countB = b.get(key) ?? 0;
				interCard += Math.min(countA, countB);
			}
			const cardA = multisetCardinality(a);
			const cardB = multisetCardinality(b);
			const cardUnion = multisetCardinality(ab);

			assert.ok(cardUnion >= Math.max(cardA, cardB));
			assert.ok(cardUnion <= cardA + cardB);
			assert.equal(cardUnion + interCard, cardA + cardB);
		}
	});
});
