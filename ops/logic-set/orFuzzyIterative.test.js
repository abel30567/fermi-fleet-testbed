import { describe, test } from 'node:test';
import assert from 'node:assert';
import { orFuzzyIterative } from './orFuzzyIterative.js';

/**
 * Independent reference implementation via De Morgan's Law in Zadeh fuzzy logic:
 *   or(a1, ..., an) = 1 - min(1 - a1, ..., 1 - an)
 */
function zadehOrViaDeMorgan(...values) {
	const complements = values.map((v) => 1 - v);
	const minComplement = Math.min(...complements);
	return 1 - minComplement;
}

/**
 * Independent recursive reference implementation of Zadeh OR for scalars.
 */
function zadehOrRecursive(values, idx = 0) {
	if (idx === values.length - 1) {
		return values[idx];
	}
	const rest = zadehOrRecursive(values, idx + 1);
	return values[idx] >= rest ? values[idx] : rest;
}

/**
 * Deterministic LCG PRNG for reproducible property & cross-check testing.
 */
function createPrng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

describe('orFuzzyIterative — scalar fuzzy logic', () => {
	test('computes Zadeh OR (max) for binary and n-ary scalar inputs', () => {
		assert.strictEqual(orFuzzyIterative(0.2, 0.8), 0.8);
		assert.strictEqual(orFuzzyIterative(0.9, 0.3), 0.9);
		assert.strictEqual(orFuzzyIterative(0.5, 0.5), 0.5);
		assert.strictEqual(orFuzzyIterative(0.1, 0.4, 0.75, 0.2, 0.6), 0.75);
		assert.strictEqual(orFuzzyIterative(0.37), 0.37);
	});

	test('matches crisp Boolean truth table on {0, 1}', () => {
		assert.strictEqual(orFuzzyIterative(0, 0), 0);
		assert.strictEqual(orFuzzyIterative(0, 1), 1);
		assert.strictEqual(orFuzzyIterative(1, 0), 1);
		assert.strictEqual(orFuzzyIterative(1, 1), 1);
	});

	test('satisfies Zadeh identity, annihilator, idempotence, commutativity, associativity', () => {
		const samples = [0, 0.001, 0.25, 0.5, 0.75, 0.999, 1];
		for (const a of samples) {
			// Identity: a OR 0 = a
			assert.strictEqual(orFuzzyIterative(a, 0), a);
			assert.strictEqual(orFuzzyIterative(0, a), a);
			// Annihilator: a OR 1 = 1
			assert.strictEqual(orFuzzyIterative(a, 1), 1);
			assert.strictEqual(orFuzzyIterative(1, a), 1);
			// Idempotence: a OR a = a
			assert.strictEqual(orFuzzyIterative(a, a), a);

			for (const b of samples) {
				// Commutativity
				assert.strictEqual(orFuzzyIterative(a, b), orFuzzyIterative(b, a));
				for (const c of samples) {
					// Associativity & n-ary equivalence
					const left = orFuzzyIterative(orFuzzyIterative(a, b), c);
					const right = orFuzzyIterative(a, orFuzzyIterative(b, c));
					const nary = orFuzzyIterative(a, b, c);
					assert.strictEqual(left, right);
					assert.strictEqual(left, nary);
				}
			}
		}
	});

	test('normalizes -0 to +0', () => {
		assert.ok(Object.is(orFuzzyIterative(-0, -0), 0));
		assert.ok(Object.is(orFuzzyIterative(-0), 0));
		assert.ok(Object.is(orFuzzyIterative(-0, 0), 0));
	});
});

describe('orFuzzyIterative — fuzzy sets (arrays, plain objects, Maps)', () => {
	test('computes pointwise union over equal-length arrays without mutating inputs', () => {
		const a = [0.1, 0.8, 0.0, 1.0];
		const b = [0.6, 0.3, 0.0, 0.2];
		const c = [0.4, 0.9, 0.5, 0.7];

		const res2 = orFuzzyIterative(a, b);
		assert.deepStrictEqual(res2, [0.6, 0.8, 0, 1]);
		assert.deepStrictEqual(a, [0.1, 0.8, 0, 1]);
		assert.deepStrictEqual(b, [0.6, 0.3, 0, 0.2]);

		const res3 = orFuzzyIterative(a, b, c);
		assert.deepStrictEqual(res3, [0.6, 0.9, 0.5, 1]);

		// Unary copy (non-aliasing)
		const unary = orFuzzyIterative(a);
		assert.deepStrictEqual(unary, a);
		assert.notStrictEqual(unary, a);

		// Empty arrays
		assert.deepStrictEqual(orFuzzyIterative([], []), []);
	});

	test('computes union over plain-object fuzzy sets (missing keys treated as 0)', () => {
		const a = { cold: 0.7, warm: 0.2, hot: 0.0 };
		const b = { warm: 0.6, hot: 0.9, scorching: 0.3 };

		const result = orFuzzyIterative(a, b);
		assert.deepStrictEqual(result, {
			cold: 0.7,
			warm: 0.6,
			hot: 0.9,
			scorching: 0.3
		});

		// Inputs remain unmutated
		assert.deepStrictEqual(a, { cold: 0.7, warm: 0.2, hot: 0 });
		assert.deepStrictEqual(b, { warm: 0.6, hot: 0.9, scorching: 0.3 });

		// Empty plain objects and null-prototype objects
		assert.deepStrictEqual(orFuzzyIterative({}, {}), {});
		const nullProto = Object.assign(Object.create(null), { x: 0.4, toString: 0.8 });
		assert.deepStrictEqual(orFuzzyIterative(nullProto, { x: 0.2, constructor: 0.5 }), {
			x: 0.4,
			toString: 0.8,
			constructor: 0.5
		});
	});

	test('computes union over Map fuzzy sets including non-string keys', () => {
		const keyObj = { id: 1 };
		const m1 = new Map([
			['a', 0.2],
			[42, 0.7],
			[keyObj, 0.3]
		]);
		const m2 = new Map([
			['a', 0.8],
			['b', 0.5],
			[keyObj, 0.1]
		]);

		const res = orFuzzyIterative(m1, m2);
		assert.ok(res instanceof Map);
		assert.strictEqual(res.size, 4);
		assert.strictEqual(res.get('a'), 0.8);
		assert.strictEqual(res.get(42), 0.7);
		assert.strictEqual(res.get(keyObj), 0.3);
		assert.strictEqual(res.get('b'), 0.5);

		// Originals not mutated
		assert.strictEqual(m1.size, 3);
		assert.strictEqual(m2.size, 3);

		// Empty maps
		const emptyRes = orFuzzyIterative(new Map(), new Map());
		assert.ok(emptyRes instanceof Map);
		assert.strictEqual(emptyRes.size, 0);
	});
});

describe('orFuzzyIterative — input validation & edge cases', () => {
	test('throws TypeError when called with no arguments or unsupported/mixed types', () => {
		assert.throws(() => orFuzzyIterative(), TypeError);
		assert.throws(() => orFuzzyIterative('0.5', 0.5), TypeError);
		assert.throws(() => orFuzzyIterative(null, 0.5), TypeError);
		assert.throws(() => orFuzzyIterative(undefined), TypeError);
		assert.throws(() => orFuzzyIterative(true, false), TypeError);
		assert.throws(() => orFuzzyIterative(new Set([0.5])), TypeError);
		assert.throws(() => orFuzzyIterative(0.5, [0.5]), TypeError);
		assert.throws(() => orFuzzyIterative([0.5], { a: 0.5 }), TypeError);
		assert.throws(() => orFuzzyIterative({ a: 0.5 }, new Map([['a', 0.5]])), TypeError);
		assert.throws(() => orFuzzyIterative(new Map([['a', 0.5]]), { a: 0.5 }), TypeError);
	});

	test('throws RangeError for out-of-range or non-finite membership values', () => {
		assert.throws(() => orFuzzyIterative(-0.0001, 0.5), RangeError);
		assert.throws(() => orFuzzyIterative(0.5, 1.0001), RangeError);
		assert.throws(() => orFuzzyIterative(NaN, 0.5), RangeError);
		assert.throws(() => orFuzzyIterative(0.5, Infinity), RangeError);
		assert.throws(() => orFuzzyIterative(-Infinity, 0.5), RangeError);
		assert.throws(() => orFuzzyIterative([0.2, 1.5], [0.1, 0.3]), RangeError);
		assert.throws(() => orFuzzyIterative({ a: -0.1 }, { a: 0.5 }), RangeError);
		assert.throws(() => orFuzzyIterative(new Map([['a', Number.NaN]])), RangeError);
	});

	test('throws RangeError on mismatched array lengths and TypeError on sparse/non-numeric entries', () => {
		assert.throws(() => orFuzzyIterative([0.1, 0.2], [0.1]), RangeError);
		// Sparse array has undefined hole
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => orFuzzyIterative([, 0.5], [0.2, 0.3]), TypeError);
		assert.throws(() => orFuzzyIterative({ a: '0.5' }), TypeError);
		assert.throws(() => orFuzzyIterative(new Map([['a', null]])), TypeError);
	});

	test('handles very small subnormal values and large fuzzy sets iteratively without stack overflow', () => {
		assert.strictEqual(orFuzzyIterative(0, Number.MIN_VALUE), Number.MIN_VALUE);
		const n = 50000;
		const a = new Array(n);
		const b = new Array(n);
		for (let i = 0; i < n; i++) {
			a[i] = i / n;
			b[i] = (n - 1 - i) / n;
		}
		const union = orFuzzyIterative(a, b);
		assert.strictEqual(union.length, n);
		assert.strictEqual(union[0], (n - 1) / n);
		assert.strictEqual(union[n - 1], (n - 1) / n);
		assert.strictEqual(union[Math.floor(n / 2)], 0.5);
	});
});

describe('orFuzzyIterative — independent cross-checks', () => {
	test('cross-check against De Morgan law: 1 - min(1 - x_i) on seeded random scalars and arrays', () => {
		const rand = createPrng(20261123);

		// 100 random n-ary scalar trials
		for (let trial = 0; trial < 100; trial++) {
			const arity = 1 + (trial % 6);
			const vals = Array.from({ length: arity }, () => rand());
			const actual = orFuzzyIterative(...vals);
			const expectedDeMorgan = zadehOrViaDeMorgan(...vals);
			const expectedRecursive = zadehOrRecursive(vals);

			assert.ok(
				Math.abs(actual - expectedDeMorgan) <= 1e-12,
				`De Morgan mismatch: actual=${actual}, expected=${expectedDeMorgan}`
			);
			assert.strictEqual(actual, expectedRecursive);
		}

		// 50 random fuzzy-set array trials
		for (let trial = 0; trial < 50; trial++) {
			const len = 1 + (trial % 12);
			const s1 = Array.from({ length: len }, () => rand());
			const s2 = Array.from({ length: len }, () => rand());
			const s3 = Array.from({ length: len }, () => rand());

			const actual = orFuzzyIterative(s1, s2, s3);
			for (let i = 0; i < len; i++) {
				const expected = zadehOrViaDeMorgan(s1[i], s2[i], s3[i]);
				assert.ok(
					Math.abs(actual[i] - expected) <= 1e-12,
					`Array De Morgan mismatch at index ${i}: actual=${actual[i]}, expected=${expected}`
				);
			}
		}
	});

	test('cross-check object and Map fuzzy set union against De Morgan law and classical set union', () => {
		const rand = createPrng(424242);
		const universe = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'];

		const objA = {};
		const objB = {};
		const mapA = new Map();
		const mapB = new Map();

		for (const u of universe) {
			if (rand() > 0.3) {
				const v = rand();
				objA[u] = v;
				mapA.set(u, v);
			}
			if (rand() > 0.3) {
				const v = rand();
				objB[u] = v;
				mapB.set(u, v);
			}
		}

		const unionObj = orFuzzyIterative(objA, objB);
		const unionMap = orFuzzyIterative(mapA, mapB);

		for (const u of universe) {
			const inA = Object.hasOwn(objA, u);
			const inB = Object.hasOwn(objB, u);
			if (!inA && !inB) {
				assert.strictEqual(Object.hasOwn(unionObj, u), false);
				assert.strictEqual(unionMap.has(u), false);
			} else {
				const expected = zadehOrViaDeMorgan(inA ? objA[u] : 0, inB ? objB[u] : 0);
				assert.ok(Math.abs(unionObj[u] - expected) <= 1e-12);
				assert.ok(Math.abs(unionMap.get(u) - expected) <= 1e-12);
			}
		}

		// Classical crisp set union equivalence: membership in {0, 1}
		const crispA = { a: 1, b: 0, c: 1 };
		const crispB = { b: 1, c: 0, d: 1 };
		const crispUnion = orFuzzyIterative(crispA, crispB);
		const support = new Set(Object.keys(crispUnion).filter((k) => crispUnion[k] === 1));
		assert.deepStrictEqual(support, new Set(['a', 'b', 'c', 'd']));
	});

	test('cross-check monotonicity: a1 <= a2 and b1 <= b2 implies or(a1, b1) <= or(a2, b2)', () => {
		const rand = createPrng(98765);
		for (let i = 0; i < 200; i++) {
			const a1 = rand();
			const a2 = a1 + (1 - a1) * rand();
			const b1 = rand();
			const b2 = b1 + (1 - b1) * rand();
			assert.ok(orFuzzyIterative(a1, b1) <= orFuzzyIterative(a2, b2));
		}
	});
});
