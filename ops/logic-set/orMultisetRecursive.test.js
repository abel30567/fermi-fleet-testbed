import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { orMultisetRecursive } from './orMultisetRecursive.js';

/**
 * Independent iterative reference implementation of multiset OR (max count).
 */
function orMultisetReference(a, b) {
	const result = new Map();
	for (const [k, v] of a) {
		if (v > 0) {
			result.set(k, v);
		}
	}
	for (const [k, v] of b) {
		const prev = result.get(k) ?? 0;
		const next = Math.max(prev, v);
		if (next > 0) {
			result.set(k, next);
		}
	}
	return result;
}

/**
 * Independent iterative multiset AND (min count) for absorption law verification.
 */
function andMultisetReference(a, b) {
	const result = new Map();
	for (const [k, countA] of a) {
		const countB = b.get(k) ?? 0;
		const minCount = Math.min(countA, countB);
		if (minCount > 0) {
			result.set(k, minCount);
		}
	}
	return result;
}

/**
 * Normalizes a multiset by dropping zero-count entries.
 */
function normalizeMultiset(m) {
	const out = new Map();
	for (const [k, v] of m) {
		if (v > 0) {
			out.set(k, v);
		}
	}
	return out;
}

function formatKey(k) {
	if (typeof k === 'symbol') {
		return k.toString();
	}
	try {
		return String(k);
	} catch {
		return '[object null-prototype]';
	}
}

/**
 * Order-independent equality check for two multisets.
 */
function assertMultisetsEqual(actual, expected) {
	assert.equal(actual.size, expected.size, `size mismatch: ${actual.size} !== ${expected.size}`);
	for (const [k, v] of expected) {
		assert.equal(actual.has(k), true, `missing expected key: ${formatKey(k)}`);
		assert.equal(actual.get(k), v, `count mismatch for key ${formatKey(k)}`);
	}
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible property tests.
 */
function mulberry32(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function randomMultiset(rng, universe, maxCount = 6) {
	const m = new Map();
	for (const key of universe) {
		if (rng() < 0.65) {
			const count = Math.floor(rng() * (maxCount + 1)); // includes 0
			m.set(key, count);
		}
	}
	return m;
}

describe('orMultisetRecursive', () => {
	test('handles normal overlapping multisets', () => {
		const a = new Map([
			['apple', 2],
			['banana', 5],
			['cherry', 1],
		]);
		const b = new Map([
			['apple', 4],
			['banana', 3],
			['date', 2],
		]);

		const result = orMultisetRecursive(a, b);
		assertMultisetsEqual(
			result,
			new Map([
				['apple', 4],
				['banana', 5],
				['cherry', 1],
				['date', 2],
			]),
		);
	});

	test('handles disjoint multisets', () => {
		const a = new Map([
			['x', 1],
			['y', 3],
		]);
		const b = new Map([
			['z', 2],
			['w', 4],
		]);

		const result = orMultisetRecursive(a, b);
		assertMultisetsEqual(
			result,
			new Map([
				['x', 1],
				['y', 3],
				['z', 2],
				['w', 4],
			]),
		);
	});

	test('handles identical multisets', () => {
		const a = new Map([
			['a', 1],
			['b', 2],
			['c', 7],
		]);
		const b = new Map([
			['a', 1],
			['b', 2],
			['c', 7],
		]);

		const result = orMultisetRecursive(a, b);
		assert.notEqual(result, a);
		assert.notEqual(result, b);
		assertMultisetsEqual(result, a);
		assertMultisetsEqual(orMultisetRecursive(a, a), a);
	});

	test('handles empty multisets', () => {
		const empty = new Map();
		const nonEmpty = new Map([
			['k1', 3],
			['k2', 1],
		]);

		assertMultisetsEqual(orMultisetRecursive(empty, empty), new Map());
		assertMultisetsEqual(orMultisetRecursive(nonEmpty, empty), nonEmpty);
		assertMultisetsEqual(orMultisetRecursive(empty, nonEmpty), nonEmpty);
	});

	test('omits zero-count entries and handles -0', () => {
		const a = new Map([
			['zeroBoth', 0],
			['zeroAOnly', 0],
			['zeroAPosB', 0],
			['posAZeroB', 3],
			['negZero', -0],
		]);
		const b = new Map([
			['zeroBoth', 0],
			['zeroBOnly', 0],
			['zeroAPosB', 5],
			['posAZeroB', 0],
			['negZero', 0],
		]);

		const result = orMultisetRecursive(a, b);
		assertMultisetsEqual(
			result,
			new Map([
				['zeroAPosB', 5],
				['posAZeroB', 3],
			]),
		);
		assert.equal(result.has('zeroBoth'), false);
		assert.equal(result.has('zeroAOnly'), false);
		assert.equal(result.has('zeroBOnly'), false);
		assert.equal(result.has('negZero'), false);
	});

	test('supports diverse key types (primitives, NaN, symbols, objects, BigInt, null, undefined)', () => {
		const symShared = Symbol('shared');
		const symOnlyB = Symbol('onlyB');
		const objShared = { id: 1 };
		const objA = { id: 2 };
		const objB = { id: 2 }; // distinct reference
		const nullProto = Object.create(null);

		const a = new Map([
			[1, 2],
			['1', 4],
			[NaN, 3],
			[true, 1],
			[null, 2],
			[undefined, 5],
			[10n, 1],
			[symShared, 2],
			[objShared, 6],
			[objA, 1],
			[nullProto, 2],
		]);
		const b = new Map([
			[1, 5],
			['1', 1],
			[NaN, 7],
			[false, 3],
			[null, 0],
			[undefined, 2],
			[10n, 4],
			[symShared, 9],
			[symOnlyB, 3],
			[objShared, 2],
			[objB, 8],
			[nullProto, 5],
		]);

		const result = orMultisetRecursive(a, b);
		const expected = new Map([
			[1, 5],
			['1', 4],
			[NaN, 7],
			[true, 1],
			[false, 3],
			[null, 2],
			[undefined, 5],
			[10n, 4],
			[symShared, 9],
			[symOnlyB, 3],
			[objShared, 6],
			[objA, 1],
			[objB, 8],
			[nullProto, 5],
		]);

		assertMultisetsEqual(result, expected);
	});

	test('handles MAX_SAFE_INTEGER counts and larger inputs cleanly', () => {
		const a = new Map([['max', Number.MAX_SAFE_INTEGER]]);
		const b = new Map([['max', 42]]);
		assertMultisetsEqual(
			orMultisetRecursive(a, b),
			new Map([['max', Number.MAX_SAFE_INTEGER]]),
		);

		const largeA = new Map();
		const largeB = new Map();
		for (let i = 0; i < 1500; i++) {
			if (i % 3 !== 0) largeA.set(`k${i}`, i % 11);
			if (i % 5 !== 0) largeB.set(`k${i}`, (i * 7) % 13);
		}
		assertMultisetsEqual(orMultisetRecursive(largeA, largeB), orMultisetReference(largeA, largeB));
	});

	test('does not mutate inputs and returns an independent Map', () => {
		const a = new Map([
			['a', 2],
			['b', 0],
		]);
		const b = new Map([
			['b', 3],
			['c', 1],
		]);
		const snapshotA = [...a.entries()];
		const snapshotB = [...b.entries()];

		const result = orMultisetRecursive(a, b);
		assert.deepEqual([...a.entries()], snapshotA);
		assert.deepEqual([...b.entries()], snapshotB);

		result.set('a', 999);
		result.set('newKey', 42);
		assert.equal(a.get('a'), 2);
		assert.equal(a.has('newKey'), false);
		assert.equal(b.has('newKey'), false);
	});

	test('rejects invalid arguments and invalid counts', () => {
		const valid = new Map([['a', 1]]);

		// Invalid map arguments
		for (const bad of [null, undefined, {}, [], new Set(['a']), 'map', 42, true]) {
			assert.throws(() => orMultisetRecursive(bad, valid), TypeError);
			assert.throws(() => orMultisetRecursive(valid, bad), TypeError);
		}

		// Non-number counts -> TypeError
		for (const badCount of ['1', null, undefined, true, false, {}, [], 1n, Symbol('n')]) {
			assert.throws(() => orMultisetRecursive(new Map([['x', badCount]]), valid), TypeError);
			assert.throws(() => orMultisetRecursive(valid, new Map([['x', badCount]])), TypeError);
		}

		// Out-of-range / non-safe-integer number counts -> RangeError
		for (const badNum of [-1, -100, 1.5, 0.1, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
			assert.throws(() => orMultisetRecursive(new Map([['x', badNum]]), valid), RangeError);
			assert.throws(() => orMultisetRecursive(valid, new Map([['x', badNum]])), RangeError);
		}

		// Error formatting works safely with Symbol and null-prototype object keys
		assert.throws(() => orMultisetRecursive(new Map([[Symbol('s'), -1]]), valid), RangeError);
		assert.throws(
			() => orMultisetRecursive(new Map([[Object.create(null), 'bad']]), valid),
			TypeError,
		);
	});

	test('matches independent iterative reference across randomized multisets', () => {
		const rng = mulberry32(0xc0ffee19);
		const universe = Array.from({ length: 25 }, (_, i) => `elem_${i}`);

		for (let trial = 0; trial < 100; trial++) {
			const a = randomMultiset(rng, universe);
			const b = randomMultiset(rng, universe);
			const actual = orMultisetRecursive(a, b);
			const expected = orMultisetReference(a, b);
			assertMultisetsEqual(actual, expected);
		}
	});

	test('satisfies lattice / algebraic laws (commutativity, idempotence, associativity, identity, absorption)', () => {
		const rng = mulberry32(0x5eed19);
		const universe = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
		const empty = new Map();

		for (let trial = 0; trial < 60; trial++) {
			const a = randomMultiset(rng, universe);
			const b = randomMultiset(rng, universe);
			const c = randomMultiset(rng, universe);
			const normA = normalizeMultiset(a);

			// Commutativity: a ∨ b = b ∨ a
			assertMultisetsEqual(orMultisetRecursive(a, b), orMultisetRecursive(b, a));

			// Idempotence: a ∨ a = normalize(a)
			assertMultisetsEqual(orMultisetRecursive(a, a), normA);

			// Identity: a ∨ ∅ = ∅ ∨ a = normalize(a)
			assertMultisetsEqual(orMultisetRecursive(a, empty), normA);
			assertMultisetsEqual(orMultisetRecursive(empty, a), normA);

			// Associativity: (a ∨ b) ∨ c = a ∨ (b ∨ c)
			assertMultisetsEqual(
				orMultisetRecursive(orMultisetRecursive(a, b), c),
				orMultisetRecursive(a, orMultisetRecursive(b, c)),
			);

			// Absorption with min (AND): a ∨ (a ∧ b) = normalize(a) and a ∧ (a ∨ b) = normalize(a)
			assertMultisetsEqual(orMultisetRecursive(a, andMultisetReference(a, b)), normA);
			assertMultisetsEqual(andMultisetReference(a, orMultisetRecursive(a, b)), normA);
		}
	});
});
