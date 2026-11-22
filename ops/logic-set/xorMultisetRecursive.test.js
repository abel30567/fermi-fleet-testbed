import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { xorMultisetRecursive } from './xorMultisetRecursive.js';

/**
 * Helper to assert two Maps have identical key-value entries regardless of insertion order.
 */
function assertMapEquals(actual, expected) {
	assert.ok(actual instanceof Map, 'Expected result to be a Map');
	assert.equal(actual.size, expected.size, `Expected size ${expected.size}, got ${actual.size}`);
	for (const [key, value] of expected.entries()) {
		assert.ok(actual.has(key), `Missing expected key: ${String(key)}`);
		assert.equal(actual.get(key), value, `Count mismatch for key ${String(key)}`);
	}
}

/**
 * Independent reference implementation via multiset difference and union: (A \ B) ∪ (B \ A).
 */
function multisetDifference(a, b) {
	const result = new Map();
	for (const [key, countA] of a.entries()) {
		const countB = b.get(key) ?? 0;
		const remaining = Math.max(0, countA - countB);
		if (remaining > 0) {
			result.set(key, remaining);
		}
	}
	return result;
}

function multisetUnion(a, b) {
	const result = new Map();
	for (const key of new Set([...a.keys(), ...b.keys()])) {
		const count = Math.max(a.get(key) ?? 0, b.get(key) ?? 0);
		if (count > 0) {
			result.set(key, count);
		}
	}
	return result;
}

function referenceXorViaDiffUnion(a, b) {
	return multisetUnion(multisetDifference(a, b), multisetDifference(b, a));
}

function referenceXorViaMaxMinusMin(a, b) {
	const result = new Map();
	for (const key of new Set([...a.keys(), ...b.keys()])) {
		const countA = a.get(key) ?? 0;
		const countB = b.get(key) ?? 0;
		const diff = Math.max(countA, countB) - Math.min(countA, countB);
		if (diff > 0) {
			result.set(key, diff);
		}
	}
	return result;
}

describe('xorMultisetRecursive', () => {
	test('computes symmetric difference for overlapping multisets', () => {
		const a = new Map([
			['apple', 3],
			['banana', 2],
			['cherry', 1],
			['date', 4],
		]);
		const b = new Map([
			['apple', 1],
			['banana', 5],
			['cherry', 1],
			['elderberry', 2],
		]);

		const result = xorMultisetRecursive(a, b);
		assertMapEquals(
			result,
			new Map([
				['apple', 2],
				['banana', 3],
				['date', 4],
				['elderberry', 2],
			]),
		);
	});

	test('returns an empty map for identical multisets', () => {
		const a = new Map([
			['a', 1],
			['b', 4],
			['c', 99],
		]);
		const b = new Map([
			['a', 1],
			['b', 4],
			['c', 99],
		]);

		const result = xorMultisetRecursive(a, b);
		assertMapEquals(result, new Map());
	});

	test('returns the union for disjoint multisets', () => {
		const a = new Map([
			['x', 2],
			['y', 5],
		]);
		const b = new Map([
			['p', 1],
			['q', 3],
			['r', 7],
		]);

		const result = xorMultisetRecursive(a, b);
		assertMapEquals(
			result,
			new Map([
				['x', 2],
				['y', 5],
				['p', 1],
				['q', 3],
				['r', 7],
			]),
		);
	});

	test('handles empty multisets', () => {
		const empty = new Map();
		const nonEmpty = new Map([
			['k1', 3],
			['k2', 1],
		]);

		assertMapEquals(xorMultisetRecursive(empty, empty), new Map());
		assertMapEquals(xorMultisetRecursive(nonEmpty, empty), nonEmpty);
		assertMapEquals(xorMultisetRecursive(empty, nonEmpty), nonEmpty);
	});

	test('omits zero-count entries from inputs and results', () => {
		const a = new Map([
			['onlyZeroA', 0],
			['negZero', -0],
			['bothZero', 0],
			['cancel', 4],
			['zeroVsPos', 0],
			['posVsZero', 6],
		]);
		const b = new Map([
			['onlyZeroB', 0],
			['bothZero', 0],
			['cancel', 4],
			['zeroVsPos', 5],
			['posVsZero', 0],
		]);

		const result = xorMultisetRecursive(a, b);
		assertMapEquals(
			result,
			new Map([
				['zeroVsPos', 5],
				['posVsZero', 6],
			]),
		);
		assert.equal(result.has('onlyZeroA'), false);
		assert.equal(result.has('onlyZeroB'), false);
		assert.equal(result.has('negZero'), false);
		assert.equal(result.has('bothZero'), false);
		assert.equal(result.has('cancel'), false);
	});

	test('supports diverse key types including primitives, NaN, symbols, and objects', () => {
		const objKey = { id: 1 };
		const arrKey = [1, 2, 3];
		const symKey = Symbol('tag');
		const fnKey = () => {};

		const a = new Map([
			[NaN, 5],
			[null, 2],
			[undefined, 1],
			[true, 3],
			[false, 4],
			[0, 2],
			[42n, 6],
			[objKey, 7],
			[arrKey, 2],
			[symKey, 1],
			[fnKey, 3],
		]);
		const b = new Map([
			[NaN, 2],
			[null, 2],
			[undefined, 4],
			[true, 1],
			[-0, 5],
			[42n, 6],
			[objKey, 3],
			[symKey, 9],
			[fnKey, 3],
		]);

		const result = xorMultisetRecursive(a, b);
		assertMapEquals(
			result,
			new Map([
				[NaN, 3],
				[undefined, 3],
				[true, 2],
				[false, 4],
				[0, 3],
				[objKey, 4],
				[arrKey, 2],
				[symKey, 8],
			]),
		);
	});

	test('handles single-key, odd/even sizes, large multisets, and MAX_SAFE_INTEGER counts', () => {
		assertMapEquals(
			xorMultisetRecursive(new Map([['solo', 7]]), new Map([['solo', 2]])),
			new Map([['solo', 5]]),
		);

		assertMapEquals(
			xorMultisetRecursive(
				new Map([['big', Number.MAX_SAFE_INTEGER]]),
				new Map([['big', Number.MAX_SAFE_INTEGER - 3]]),
			),
			new Map([['big', 3]]),
		);

		assertMapEquals(
			xorMultisetRecursive(
				new Map([['maxOnly', Number.MAX_SAFE_INTEGER]]),
				new Map(),
			),
			new Map([['maxOnly', Number.MAX_SAFE_INTEGER]]),
		);

		const largeA = new Map();
		const largeB = new Map();
		for (let i = 0; i < 1001; i++) {
			largeA.set(`k${i}`, i % 7);
			if (i % 2 === 0) {
				largeB.set(`k${i}`, (i * 3) % 11);
			}
		}
		for (let i = 1001; i < 1300; i++) {
			largeB.set(`k${i}`, (i % 5) + 1);
		}

		const result = xorMultisetRecursive(largeA, largeB);
		assertMapEquals(result, referenceXorViaDiffUnion(largeA, largeB));
	});

	test('does not mutate input maps and returns a detached map', () => {
		const a = new Map([
			['a', 3],
			['b', 0],
			['c', 2],
		]);
		const b = new Map([
			['a', 1],
			['c', 5],
			['d', 4],
		]);

		const aBefore = Array.from(a.entries());
		const bBefore = Array.from(b.entries());

		const result = xorMultisetRecursive(a, b);

		assert.deepEqual(Array.from(a.entries()), aBefore);
		assert.deepEqual(Array.from(b.entries()), bBefore);
		assert.notEqual(result, a);
		assert.notEqual(result, b);

		result.set('mutated', 99);
		assert.equal(a.has('mutated'), false);
		assert.equal(b.has('mutated'), false);
	});

	test('throws TypeError when arguments are not Map instances', () => {
		const valid = new Map([['a', 1]]);
		const invalidInputs = [null, undefined, {}, [], new Set(['a']), 'abc', 123, true];

		for (const bad of invalidInputs) {
			assert.throws(() => xorMultisetRecursive(bad, valid), TypeError);
			assert.throws(() => xorMultisetRecursive(valid, bad), TypeError);
		}
	});

	test('throws on invalid counts (negative, non-integer, unsafe integer, non-number)', () => {
		const valid = new Map([['a', 1]]);

		const typeErrorCounts = ['1', null, undefined, true, 1n, {}, NaN, Infinity, -Infinity, 1.5, -0.5];
		for (const badCount of typeErrorCounts) {
			const badMap = new Map([['x', badCount]]);
			assert.throws(() => xorMultisetRecursive(badMap, valid), TypeError);
			assert.throws(() => xorMultisetRecursive(valid, badMap), TypeError);
		}

		const rangeErrorCounts = [-1, -100, Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER];
		for (const badCount of rangeErrorCounts) {
			const badMap = new Map([['x', badCount]]);
			assert.throws(() => xorMultisetRecursive(badMap, valid), RangeError);
			assert.throws(() => xorMultisetRecursive(valid, badMap), RangeError);
		}
	});

	test('cross-checks against (A \\ B) ∪ (B \\ A), max(a,b)-min(a,b), commutativity, and self-inverse', () => {
		const pairs = [
			[new Map(), new Map()],
			[new Map([['a', 0], ['b', 3]]), new Map([['b', 3], ['c', 0]])],
			[
				new Map([['a', 5], ['b', 2], ['c', 0], ['d', 7]]),
				new Map([['a', 2], ['b', 8], ['d', 7], ['e', 4]]),
			],
			[
				new Map([['k1', 1], ['k2', 0], ['k3', 1]]),
				new Map([['k1', 1], ['k2', 1], ['k4', 1]]),
			],
		];

		// Deterministic pseudo-random cases
		let seed = 123456789;
		const nextRand = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0;
			return seed;
		};

		for (let t = 0; t < 25; t++) {
			const a = new Map();
			const b = new Map();
			const keyCount = (nextRand() % 20) + 1;
			for (let i = 0; i < keyCount; i++) {
				const key = `elem_${i}`;
				if (nextRand() % 3 !== 0) {
					a.set(key, nextRand() % 10);
				}
				if (nextRand() % 3 !== 0) {
					b.set(key, nextRand() % 10);
				}
			}
			pairs.push([a, b]);
		}

		for (const [a, b] of pairs) {
			const ab = xorMultisetRecursive(a, b);
			const ba = xorMultisetRecursive(b, a);
			const viaDiffUnion = referenceXorViaDiffUnion(a, b);
			const viaMaxMin = referenceXorViaMaxMinusMin(a, b);

			// Cross-check against (A \ B) ∪ (B \ A)
			assertMapEquals(ab, viaDiffUnion);

			// Verify max(a, b) - min(a, b) === |a - b|
			assertMapEquals(ab, viaMaxMin);
			for (const key of new Set([...a.keys(), ...b.keys()])) {
				const ca = a.get(key) ?? 0;
				const cb = b.get(key) ?? 0;
				const expectedCount = Math.max(ca, cb) - Math.min(ca, cb);
				assert.equal(expectedCount, Math.abs(ca - cb));
				assert.equal(ab.get(key) ?? 0, expectedCount);
			}

			// Commutativity: xor(A, B) === xor(B, A)
			assertMapEquals(ab, ba);

			// Self-inverse cancellation: xor(A, A) === ∅ and xor(B, B) === ∅
			assertMapEquals(xorMultisetRecursive(a, a), new Map());
			assertMapEquals(xorMultisetRecursive(b, b), new Map());
		}

		// Boolean / indicator multiset (counts in {0, 1}) self-inverse involution: xor(xor(A, B), B) === A
		const indA = new Map([
			['p', 1],
			['q', 1],
			['r', 0],
		]);
		const indB = new Map([
			['q', 1],
			['s', 1],
		]);
		const normalizedIndA = new Map([
			['p', 1],
			['q', 1],
		]);
		assertMapEquals(xorMultisetRecursive(xorMultisetRecursive(indA, indB), indB), normalizedIndA);
	});
});
