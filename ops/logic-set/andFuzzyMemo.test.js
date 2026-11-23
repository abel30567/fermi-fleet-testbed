import test from 'node:test';
import assert from 'node:assert/strict';
import { andFuzzyMemo } from './andFuzzyMemo.js';

/**
 * Simple deterministic PRNG (Mulberry32) for reproducible cross-checks.
 * @param {number} seed
 * @returns {() => number}
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

test('scalar table-grid values return Zadeh minimum', () => {
	assert.equal(andFuzzyMemo(0, 0), 0);
	assert.equal(andFuzzyMemo(0, 1), 0);
	assert.equal(andFuzzyMemo(1, 0), 0);
	assert.equal(andFuzzyMemo(1, 1), 1);
	assert.equal(andFuzzyMemo(0.25, 0.75), 0.25);
	assert.equal(andFuzzyMemo(0.83, 0.29), 0.29);
	assert.equal(andFuzzyMemo(0.5, 0.5), 0.5);
});

test('scalar non-grid values exercise memoization and preserve full precision', () => {
	const third = 1 / 3;
	const twoThirds = 2 / 3;
	const eps = 1e-12;

	// First calls populate memo cache; repeated calls hit memo cache.
	assert.equal(andFuzzyMemo(third, twoThirds), third);
	assert.equal(andFuzzyMemo(third, twoThirds), third);
	assert.equal(andFuzzyMemo(twoThirds, third), third);
	assert.equal(andFuzzyMemo(Math.SQRT1_2, 0.5000001), 0.5000001);
	assert.equal(andFuzzyMemo(Math.SQRT1_2, 0.5000001), 0.5000001);
	assert.equal(andFuzzyMemo(eps, 2 * eps), eps);
	assert.equal(andFuzzyMemo(1 - eps, 1), 1 - eps);
});

test('normalizes -0 to +0 in scalar and set results', () => {
	assert.ok(Object.is(andFuzzyMemo(-0, 0.5), 0));
	assert.ok(Object.is(andFuzzyMemo(0.5, -0), 0));
	assert.ok(Object.is(andFuzzyMemo(-0, -0), 0));
	assert.ok(Object.is(andFuzzyMemo(-0, 1 / 3), 0));

	const arr = andFuzzyMemo([-0, 0.4], [0.9, -0]);
	assert.ok(Object.is(arr[0], 0));
	assert.ok(Object.is(arr[1], 0));
});

test('array fuzzy sets compute elementwise Zadeh intersection without mutating inputs', () => {
	const a = [0, 0.25, 0.7, 1, 1 / 3];
	const b = [0.5, 0.1, 0.9, 0.8, 2 / 3];
	const aCopy = [...a];
	const bCopy = [...b];

	const res = andFuzzyMemo(a, b);
	assert.deepEqual(res, [0, 0.1, 0.7, 0.8, 1 / 3]);
	assert.deepEqual(a, aCopy);
	assert.deepEqual(b, bCopy);
	assert.deepEqual(andFuzzyMemo([], []), []);
});

test('plain object fuzzy sets compute intersection over union of keys', () => {
	const a = { cold: 0.8, warm: 0.4, hot: 0.1 };
	const b = { warm: 0.6, hot: 0.05, boiling: 0.9 };
	const res = andFuzzyMemo(a, b);

	assert.deepEqual(res, {
		cold: 0,
		warm: 0.4,
		hot: 0.05,
		boiling: 0,
	});
	assert.deepEqual(andFuzzyMemo({}, {}), {});

	const nullProtoA = Object.create(null);
	nullProtoA.x = 0.7;
	const nullProtoB = Object.create(null);
	nullProtoB.x = 0.3;
	nullProtoB.y = 0.5;
	assert.deepEqual(andFuzzyMemo(nullProtoA, nullProtoB), { x: 0.3, y: 0 });
});

test('Map fuzzy sets compute intersection over union of keys', () => {
	const sym = Symbol('s');
	const a = new Map([
		['x', 0.9],
		[1, 0.25],
		[sym, 0.6],
	]);
	const b = new Map([
		['x', 0.4],
		[2, 0.8],
		[sym, 0.75],
	]);

	const res = andFuzzyMemo(a, b);
	assert.ok(res instanceof Map);
	assert.equal(res.size, 4);
	assert.equal(res.get('x'), 0.4);
	assert.equal(res.get(1), 0);
	assert.equal(res.get(2), 0);
	assert.equal(res.get(sym), 0.6);

	const emptyRes = andFuzzyMemo(new Map(), new Map());
	assert.ok(emptyRes instanceof Map);
	assert.equal(emptyRes.size, 0);
});

test('bounded memoization cache handles more than 4096 distinct non-grid entries cleanly', () => {
	const rand = mulberry32(42);
	for (let i = 0; i < 5000; i += 1) {
		const a = rand();
		const b = rand();
		assert.equal(andFuzzyMemo(a, b), Math.min(a, b));
	}
});

test('input validation rejects invalid types, mismatched kinds, and out-of-range values', () => {
	// Out-of-range and non-finite numbers
	assert.throws(() => andFuzzyMemo(-0.01, 0.5), RangeError);
	assert.throws(() => andFuzzyMemo(0.5, 1.01), RangeError);
	assert.throws(() => andFuzzyMemo(Number.NaN, 0.5), RangeError);
	assert.throws(() => andFuzzyMemo(0.5, Number.POSITIVE_INFINITY), RangeError);
	assert.throws(() => andFuzzyMemo(Number.NEGATIVE_INFINITY, 0.5), RangeError);

	// Wrong operand types
	assert.throws(() => andFuzzyMemo('0.5', 0.5), TypeError);
	assert.throws(() => andFuzzyMemo(true, 1), TypeError);
	assert.throws(() => andFuzzyMemo(null, 0.5), TypeError);
	assert.throws(() => andFuzzyMemo(undefined, 0.5), TypeError);
	assert.throws(() => andFuzzyMemo(new Set([0.5]), new Set([0.5])), TypeError);
	assert.throws(() => andFuzzyMemo(new Date(), new Date()), TypeError);

	// Mismatched operand kinds
	assert.throws(() => andFuzzyMemo(0.5, [0.5]), TypeError);
	assert.throws(() => andFuzzyMemo([0.5], { a: 0.5 }), TypeError);
	assert.throws(() => andFuzzyMemo({ a: 0.5 }, new Map([['a', 0.5]])), TypeError);

	// Mismatched array lengths and invalid elements
	assert.throws(() => andFuzzyMemo([0.5], [0.5, 0.5]), RangeError);
	assert.throws(() => andFuzzyMemo([0.5, 1.2], [0.5, 0.5]), RangeError);
	assert.throws(() => andFuzzyMemo([0.5, '0.2'], [0.5, 0.2]), TypeError);
	// Sparse array hole
	// eslint-disable-next-line no-sparse-arrays
	assert.throws(() => andFuzzyMemo([, 0.5], [0.5, 0.5]), TypeError);

	// Invalid object and Map values (including values on disjoint keys)
	assert.throws(() => andFuzzyMemo({ a: -0.1 }, { b: 0.5 }), RangeError);
	assert.throws(() => andFuzzyMemo({ a: 0.5 }, { b: 'bad' }), TypeError);
	assert.throws(() => andFuzzyMemo(new Map([['a', 2]]), new Map()), RangeError);
	assert.throws(() => andFuzzyMemo(new Map(), new Map([['b', null]])), TypeError);
});

test('independent cross-check: full 101x101 precomputed table matches Math.min', () => {
	for (let i = 0; i <= 100; i += 1) {
		const a = i / 100;
		for (let j = 0; j <= 100; j += 1) {
			const b = j / 100;
			assert.equal(andFuzzyMemo(a, b), Math.min(a, b));
		}
	}
});

test('independent cross-check: Zadeh axioms, De Morgan duality, and classical Boolean compatibility', () => {
	// Classical Boolean truth table compatibility on {0, 1}
	for (const a of [0, 1]) {
		for (const b of [0, 1]) {
			assert.equal(andFuzzyMemo(a, b), a && b ? 1 : 0);
		}
	}

	const rand = mulberry32(20261123);
	const samples = Array.from({ length: 200 }, () => rand());

	for (let i = 0; i < samples.length; i += 1) {
		const a = samples[i];
		const b = samples[(i + 1) % samples.length];
		const c = samples[(i + 2) % samples.length];

		// Reference oracle: Math.min
		const ab = andFuzzyMemo(a, b);
		assert.equal(ab, Math.min(a, b));

		// De Morgan duality: min(a, b) == 1 - max(1 - a, 1 - b)
		const deMorgan = 1 - Math.max(1 - a, 1 - b);
		assert.ok(Math.abs(ab - deMorgan) <= 1e-12);

		// Commutativity
		assert.equal(ab, andFuzzyMemo(b, a));

		// Associativity
		assert.equal(andFuzzyMemo(ab, c), andFuzzyMemo(a, andFuzzyMemo(b, c)));

		// Idempotence, identity (1), annihilator (0)
		assert.equal(andFuzzyMemo(a, a), a);
		assert.equal(andFuzzyMemo(a, 1), a);
		assert.equal(andFuzzyMemo(a, 0), 0);

		// Monotonicity
		const a2 = Math.min(1, a + rand() * (1 - a));
		const b2 = Math.min(1, b + rand() * (1 - b));
		assert.ok(ab <= andFuzzyMemo(a2, b2));
	}
});

test('independent cross-check: object and array fuzzy sets match reference implementation', () => {
	const rand = mulberry32(999);
	const keys = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];

	const objA = {};
	const objB = {};
	const arrA = [];
	const arrB = [];
	for (const k of keys) {
		const va = rand();
		const vb = rand();
		objA[k] = va;
		objB[k] = vb;
		arrA.push(va);
		arrB.push(vb);
	}

	const expectedArr = arrA.map((v, idx) => Math.min(v, arrB[idx]));
	const expectedObj = Object.fromEntries(
		keys.map((k) => [k, Math.min(objA[k], objB[k])]),
	);

	assert.deepEqual(andFuzzyMemo(arrA, arrB), expectedArr);
	assert.deepEqual(andFuzzyMemo(objA, objB), expectedObj);
});
