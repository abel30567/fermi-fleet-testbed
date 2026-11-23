import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { setDifferenceFuzzyMemo } from './setDifferenceFuzzyMemo.js';

/**
 * Independent reference oracle for Zadeh fuzzy set difference:
 * μ_{A \ B}(x) = min(μ_A(x), 1 - μ_B(x))
 */
function oracleZadehDiff(setA, setB, includeZeros = false) {
	const out = {};
	const keys = new Set([...Object.keys(setA), ...(includeZeros ? Object.keys(setB) : [])]);
	for (const k of keys) {
		const muA = Object.hasOwn(setA, k) ? setA[k] : 0;
		const muB = Object.hasOwn(setB, k) ? setB[k] : 0;
		const val = Math.min(muA, 1 - muB);
		const clean = val <= 0 ? 0 : val;
		if (includeZeros || clean > 0) {
			out[k] = clean;
		}
	}
	return out;
}

/**
 * Independent Zadeh union and intersection helpers for algebraic cross-checks.
 */
function zadehUnion(a, b) {
	const out = {};
	for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
		const v = Math.max(a[k] ?? 0, b[k] ?? 0);
		if (v > 0) out[k] = v;
	}
	return out;
}

function zadehIntersection(a, b) {
	const out = {};
	for (const k of Object.keys(a)) {
		if (Object.hasOwn(b, k)) {
			const v = Math.min(a[k], b[k]);
			if (v > 0) out[k] = v;
		}
	}
	return out;
}

function assertFuzzyClose(actual, expected, eps = 1e-12) {
	const actualKeys = Object.keys(actual).sort();
	const expectedKeys = Object.keys(expected).sort();
	assert.deepEqual(actualKeys, expectedKeys);
	for (const k of actualKeys) {
		assert.ok(
			Math.abs(actual[k] - expected[k]) <= eps,
			`Key "${k}": expected ${expected[k]}, got ${actual[k]}`
		);
	}
}

describe('setDifferenceFuzzyMemo', () => {
	describe('normal cases', () => {
		it('computes Zadeh fuzzy set difference for overlapping plain objects', () => {
			const a = { x: 0.8, y: 0.4, z: 0.9, w: 0.2 };
			const b = { y: 0.7, z: 0.3, u: 0.6 };
			const res = setDifferenceFuzzyMemo(a, b);
			// x: min(0.8, 1-0) = 0.8
			// y: min(0.4, 1-0.7) = 0.3
			// z: min(0.9, 1-0.3) = 0.7
			// w: min(0.2, 1-0) = 0.2
			assert.deepEqual(res, { x: 0.8, y: 0.3, z: 0.7, w: 0.2 });
		});

		it('matches classical crisp set difference for {0, 1} memberships', () => {
			const a = { a: 1, b: 1, c: 0, d: 1 };
			const b = { b: 1, c: 1, e: 1 };
			assert.deepEqual(setDifferenceFuzzyMemo(a, b), { a: 1, d: 1 });
		});

		it('returns identical memberships when sets are disjoint', () => {
			const a = { a: 0.25, b: 0.75 };
			const b = { c: 0.9, d: 0.1 };
			assert.deepEqual(setDifferenceFuzzyMemo(a, b), { a: 0.25, b: 0.75 });
		});

		it('handles fuzzy self-difference A \\ A = min(μ_A, 1 - μ_A)', () => {
			const a = { zero: 0, quarter: 0.25, half: 0.5, threeQuarters: 0.75, one: 1 };
			const res = setDifferenceFuzzyMemo(a, a);
			assert.deepEqual(res, { quarter: 0.25, half: 0.5, threeQuarters: 0.25 });
		});

		it('supports Map inputs including non-string keys and returns a Map', () => {
			const objKey = { id: 1 };
			const a = new Map([
				[1, 0.8],
				[2, 0.6],
				[objKey, 0.9],
			]);
			const b = new Map([
				[2, 0.5],
				[objKey, 0.7],
				[3, 0.4],
			]);
			const res = setDifferenceFuzzyMemo(a, b);
			assert.ok(res instanceof Map);
			assert.equal(res.size, 3);
			assert.equal(res.get(1), 0.8);
			assert.equal(res.get(2), 0.5);
			assert.equal(res.get(objKey), 0.3);
		});

		it('supports mixed plain object and Map inputs matching setA container type', () => {
			const objA = { a: 0.9, b: 0.5 };
			const mapB = new Map([['a', 0.4], ['b', 1]]);
			const resObj = setDifferenceFuzzyMemo(objA, mapB);
			assert.ok(!(resObj instanceof Map));
			assert.deepEqual(resObj, { a: 0.6 });

			const mapA = new Map([['a', 0.9], ['b', 0.5]]);
			const objB = { a: 0.4, b: 1 };
			const resMap = setDifferenceFuzzyMemo(mapA, objB);
			assert.ok(resMap instanceof Map);
			assert.deepEqual([...resMap.entries()], [['a', 0.6]]);
		});
	});

	describe('edge cases', () => {
		it('handles empty sets', () => {
			assert.deepEqual(setDifferenceFuzzyMemo({}, {}), {});
			assert.deepEqual(setDifferenceFuzzyMemo({ a: 0.5 }, {}), { a: 0.5 });
			assert.deepEqual(setDifferenceFuzzyMemo({}, { a: 0.5 }), {});
			assert.deepEqual(setDifferenceFuzzyMemo({}, { a: 0.5 }, { includeZeros: true }), {
				a: 0,
			});
		});

		it('retains zero-membership entries when includeZeros is true', () => {
			const a = { a: 0.5, b: 0, c: 0.8 };
			const b = { a: 1, d: 0.4 };
			assert.deepEqual(setDifferenceFuzzyMemo(a, b, { includeZeros: true }), {
				a: 0,
				b: 0,
				c: 0.8,
				d: 0,
			});
		});

		it('normalizes -0 to +0 and handles boundary floats near 0 and 1', () => {
			const res = setDifferenceFuzzyMemo(
				{ z: -0, tiny: Number.EPSILON, almostOne: 1 - Number.EPSILON },
				{ z: -0, tiny: 0, almostOne: Number.EPSILON },
				{ includeZeros: true }
			);
			assert.ok(Object.is(res.z, 0));
			assert.equal(res.tiny, Number.EPSILON);
			assert.equal(res.almostOne, 1 - Number.EPSILON);
		});

		it('handles null-prototype objects and __proto__ keys safely', () => {
			const a = Object.create(null);
			a.x = 0.7;
			a['__proto__'] = 0.9;
			const b = Object.create(null);
			b['__proto__'] = 0.2;

			const res = setDifferenceFuzzyMemo(a, b);
			assert.equal(Object.getPrototypeOf(res), Object.prototype);
			assert.equal(res.x, 0.7);
			assert.ok(Object.hasOwn(res, '__proto__'));
			assert.equal(res['__proto__'], 0.8);
		});

		it('does not mutate input sets', () => {
			const a = { a: 0.7, b: 0.5 };
			const b = { a: 0.4, c: 0.9 };
			const aSnap = { ...a };
			const bSnap = { ...b };
			setDifferenceFuzzyMemo(a, b);
			assert.deepEqual(a, aSnap);
			assert.deepEqual(b, bSnap);
		});

		it('uses precomputed table for grid values and memoizes off-grid pairs', () => {
			const cache = new Map();
			// Pure 0.01 grid inputs should hit the precomputed table without using the off-grid cache
			const gridRes = setDifferenceFuzzyMemo({ a: 0.8, b: 0.7 }, { a: 0.3, b: 0.7 }, { cache });
			assert.deepEqual(gridRes, { a: 0.7, b: 0.3 });
			assert.equal(cache.size, 0);

			// Off-grid inputs should populate and reuse the memoization cache
			const third = 1 / 3;
			const seventh = 1 / 7;
			const offRes1 = setDifferenceFuzzyMemo(
				{ p: third, q: 0.123456 },
				{ p: seventh, q: 0.654321 },
				{ cache }
			);
			assert.equal(cache.size, 2);
			const offRes2 = setDifferenceFuzzyMemo(
				{ p: third, q: 0.123456 },
				{ p: seventh, q: 0.654321 },
				{ cache }
			);
			assert.deepEqual(offRes1, offRes2);
			assert.equal(cache.size, 2);
		});

		it('handles > 5000 unique off-grid pairs cleanly with bounded internal cache', () => {
			const a = {};
			const b = {};
			for (let i = 1; i <= 5000; i++) {
				const k = `k${i}`;
				a[k] = i / 5003;
				b[k] = (i * 7 % 5003) / 5003;
			}
			const res = setDifferenceFuzzyMemo(a, b);
			const expected = oracleZadehDiff(a, b);
			assertFuzzyClose(res, expected, 1e-15);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for invalid set containers', () => {
			for (const bad of [null, undefined, 42, 'abc', true, [0.5], new Set([0.5]), new Date()]) {
				assert.throws(() => setDifferenceFuzzyMemo(bad, {}), TypeError);
				assert.throws(() => setDifferenceFuzzyMemo({}, bad), TypeError);
			}
		});

		it('throws TypeError for non-numeric membership values', () => {
			assert.throws(() => setDifferenceFuzzyMemo({ a: '0.5' }, {}), TypeError);
			assert.throws(() => setDifferenceFuzzyMemo({}, { b: null }), TypeError);
			assert.throws(() => setDifferenceFuzzyMemo(new Map([['a', true]]), new Map()), TypeError);
		});

		it('throws RangeError for out-of-range or non-finite memberships in setA or setB', () => {
			for (const badVal of [-0.0001, 1.0001, NaN, Infinity, -Infinity]) {
				assert.throws(() => setDifferenceFuzzyMemo({ a: badVal }, {}), RangeError);
				// Even when key is absent from setA, invalid setB value must still be rejected
				assert.throws(() => setDifferenceFuzzyMemo({}, { onlyInB: badVal }), RangeError);
			}
		});

		it('throws TypeError for invalid options', () => {
			assert.throws(() => setDifferenceFuzzyMemo({}, {}, null), TypeError);
			assert.throws(() => setDifferenceFuzzyMemo({}, {}, []), TypeError);
			assert.throws(() => setDifferenceFuzzyMemo({}, {}, { includeZeros: 1 }), TypeError);
			assert.throws(() => setDifferenceFuzzyMemo({}, {}, { cache: {} }), TypeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent oracle across all 10,201 precomputed grid pairs (0.00..1.00)', () => {
			for (let i = 0; i <= 100; i++) {
				const a = {};
				const b = {};
				const muA = i / 100;
				for (let j = 0; j <= 100; j++) {
					const k = `k${j}`;
					a[k] = muA;
					b[k] = j / 100;
				}
				const actual = setDifferenceFuzzyMemo(a, b, { includeZeros: true });
				const expected = oracleZadehDiff(a, b, true);
				assertFuzzyClose(actual, expected, 1e-15);
			}
		});

		it('matches independent oracle on 1,000 deterministic pseudo-random off-grid pairs', () => {
			// Linear congruential generator for deterministic reproducibility
			let state = 0x12345678;
			const nextRand = () => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				return state / 0x100000000;
			};

			const a = {};
			const b = {};
			for (let i = 0; i < 1000; i++) {
				a[`e${i}`] = nextRand();
				b[`e${i}`] = nextRand();
			}
			const actual = setDifferenceFuzzyMemo(a, b);
			const expected = oracleZadehDiff(a, b);
			assertFuzzyClose(actual, expected, 1e-15);
		});

		it('satisfies Zadeh De Morgan difference laws and monotonicity', () => {
			const a = { e1: 0.9, e2: 0.65, e3: 0.333333, e4: 0.12, e5: 1.0 };
			const b = { e1: 0.4, e2: 0.8, e3: 0.25, e4: 0.712345, e6: 0.5 };
			const c = { e1: 0.7, e2: 0.2, e3: 0.666667, e4: 0.3, e5: 0.45 };

			// A \ (B ∪ C) == (A \ B) ∩ (A \ C)
			const lhs1 = setDifferenceFuzzyMemo(a, zadehUnion(b, c));
			const rhs1 = zadehIntersection(
				setDifferenceFuzzyMemo(a, b),
				setDifferenceFuzzyMemo(a, c)
			);
			assertFuzzyClose(lhs1, rhs1, 1e-15);

			// A \ (B ∩ C) == (A \ B) ∪ (A \ C)
			const lhs2 = setDifferenceFuzzyMemo(a, zadehIntersection(b, c));
			const rhs2 = zadehUnion(
				setDifferenceFuzzyMemo(a, b),
				setDifferenceFuzzyMemo(a, c)
			);
			assertFuzzyClose(lhs2, rhs2, 1e-15);

			// Monotonicity in A (A1 ⊆ A2 => A1 \ B ⊆ A2 \ B) and antitonicity in B (B1 ⊆ B2 => A \ B2 ⊆ A \ B1)
			const aSmall = { e1: 0.3, e2: 0.4, e3: 0.1 };
			const aLarge = { e1: 0.8, e2: 0.9, e3: 0.6 };
			const bSmall = { e1: 0.2, e2: 0.1, e3: 0.4 };
			const bLarge = { e1: 0.7, e2: 0.6, e3: 0.9 };

			const dSmallA = setDifferenceFuzzyMemo(aSmall, bSmall, { includeZeros: true });
			const dLargeA = setDifferenceFuzzyMemo(aLarge, bSmall, { includeZeros: true });
			const dSmallB = setDifferenceFuzzyMemo(aLarge, bSmall, { includeZeros: true });
			const dLargeB = setDifferenceFuzzyMemo(aLarge, bLarge, { includeZeros: true });

			for (const k of ['e1', 'e2', 'e3']) {
				assert.ok(dSmallA[k] <= dLargeA[k] + 1e-15);
				assert.ok(dLargeB[k] <= dSmallB[k] + 1e-15);
			}
		});
	});
});
