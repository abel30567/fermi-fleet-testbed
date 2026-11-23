import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { multiplyTypedMemo } from './multiplyTypedMemo.js';

/**
 * Independent reference implementation for element-wise Float64Array multiplication.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceMultiply(a, b) {
	const out = new Float64Array(a.length);
	for (let i = 0; i < a.length; i++) {
		out[i] = a[i] * b[i];
	}
	return out;
}

/**
 * Asserts bit-exact element-wise equality (distinguishing +0 vs -0 and matching NaN).
 *
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 */
function assertBitExactFloat64Array(actual, expected) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array');
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Object.is(actual[i], expected[i]),
			`Mismatch at index ${i}: actual=${Object.is(actual[i], -0) ? '-0' : actual[i]}, expected=${Object.is(expected[i], -0) ? '-0' : expected[i]}`,
		);
	}
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check fuzzing.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('multiplyTypedMemo', () => {
	beforeEach(() => {
		multiplyTypedMemo.clearCache();
	});

	describe('normal cases', () => {
		it('multiplies positive small integers element-wise', () => {
			const a = new Float64Array([1, 2, 3, 4, 5]);
			const b = new Float64Array([10, 20, 30, 40, 50]);
			const res = multiplyTypedMemo(a, b);
			assertBitExactFloat64Array(res, new Float64Array([10, 40, 90, 160, 250]));
		});

		it('multiplies negative integers and mixed signs', () => {
			const a = new Float64Array([-64, -1, 1, 64, -7]);
			const b = new Float64Array([64, -1, -64, 64, 9]);
			const res = multiplyTypedMemo(a, b);
			assertBitExactFloat64Array(res, new Float64Array([-4096, 1, -64, 4096, -63]));
		});

		it('multiplies floating-point numbers accurately', () => {
			const a = new Float64Array([1.5, -2.25, Math.PI, 0.1, 1e10]);
			const b = new Float64Array([2.5, 4.0, 2.0, 0.2, 3.5e-5]);
			const res = multiplyTypedMemo(a, b);
			assertBitExactFloat64Array(res, referenceMultiply(a, b));
		});

		it('handles values outside the precomputed table range', () => {
			const a = new Float64Array([-65, 65, 1000, -100000]);
			const b = new Float64Array([65, -65, 2000, -300000]);
			const res = multiplyTypedMemo(a, b);
			assertBitExactFloat64Array(res, new Float64Array([-4225, -4225, 2000000, 30000000000]));
		});

		it('does not mutate input arrays', () => {
			const a = new Float64Array([3, 6, 9]);
			const b = new Float64Array([2, 4, 6]);
			const res = multiplyTypedMemo(a, b);
			assert.notEqual(res, a);
			assert.notEqual(res, b);
			assertBitExactFloat64Array(a, new Float64Array([3, 6, 9]));
			assertBitExactFloat64Array(b, new Float64Array([2, 4, 6]));
		});
	});

	describe('edge cases', () => {
		it('handles empty Float64Arrays', () => {
			const res = multiplyTypedMemo(new Float64Array(0), new Float64Array(0));
			assert.ok(res instanceof Float64Array);
			assert.equal(res.length, 0);
		});

		it('handles single-element Float64Arrays', () => {
			const res = multiplyTypedMemo(new Float64Array([42]), new Float64Array([-2]));
			assertBitExactFloat64Array(res, new Float64Array([-84]));
		});

		it('preserves IEEE 754 signed zero (-0 vs +0) including across cache lookups', () => {
			const posZero = new Float64Array([0, 0, -0, -0, 5, -5]);
			const factors = new Float64Array([5, -5, 5, -5, -0, 0]);
			const res = multiplyTypedMemo(posZero, factors);
			assertBitExactFloat64Array(res, new Float64Array([0, -0, -0, 0, -0, -0]));

			// Ensure +0 and -0 do not collide in the memoization cache
			const r1 = multiplyTypedMemo(new Float64Array([0]), new Float64Array([3]));
			const r2 = multiplyTypedMemo(new Float64Array([-0]), new Float64Array([3]));
			assert.ok(Object.is(r1[0], 0));
			assert.ok(Object.is(r2[0], -0));
		});

		it('handles NaN, Infinity, and -Infinity properly', () => {
			const a = new Float64Array([NaN, 0, -0, Infinity, Infinity, -Infinity, Infinity]);
			const b = new Float64Array([5, Infinity, Infinity, Infinity, -Infinity, -Infinity, -2]);
			const res = multiplyTypedMemo(a, b);
			assertBitExactFloat64Array(
				res,
				new Float64Array([NaN, NaN, NaN, Infinity, -Infinity, Infinity, -Infinity]),
			);
		});

		it('handles overflow, underflow, and subnormal numbers', () => {
			const a = new Float64Array([
				Number.MAX_VALUE,
				-Number.MAX_VALUE,
				Number.MIN_VALUE,
				-Number.MIN_VALUE,
				Number.MIN_VALUE,
				Number.EPSILON,
			]);
			const b = new Float64Array([2, 2, 0.5, 0.5, 2, Number.EPSILON]);
			const res = multiplyTypedMemo(a, b);
			assertBitExactFloat64Array(res, referenceMultiply(a, b));
			assert.equal(res[0], Infinity);
			assert.equal(res[1], -Infinity);
			assert.ok(Object.is(res[2], 0));
			assert.ok(Object.is(res[3], -0));
		});

		it('handles Float64Array subarrays with non-zero byteOffset', () => {
			const backingA = new Float64Array([99, 3, 4, 5, 88]);
			const backingB = new Float64Array([77, 10, 20, 30, 66]);
			const subA = backingA.subarray(1, 4);
			const subB = backingB.subarray(1, 4);
			assert.equal(subA.byteOffset, 8);
			assert.equal(subB.byteOffset, 8);

			const res = multiplyTypedMemo(subA, subB);
			assertBitExactFloat64Array(res, new Float64Array([30, 80, 150]));

			// Same values in a fresh un-offset array should hit the cache
			const statsBefore = multiplyTypedMemo.getStats();
			const res2 = multiplyTypedMemo(new Float64Array([3, 4, 5]), new Float64Array([10, 20, 30]));
			const statsAfter = multiplyTypedMemo.getStats();
			assertBitExactFloat64Array(res2, new Float64Array([30, 80, 150]));
			assert.equal(statsAfter.hits, statsBefore.hits + 1);
		});
	});

	describe('memoization and table behavior', () => {
		it('uses the precomputed table for non-zero integers in [-64, 64] and computes others', () => {
			assert.equal(multiplyTypedMemo.TABLE_MIN, -64);
			assert.equal(multiplyTypedMemo.TABLE_MAX, 64);

			// 3 table-eligible pairs: (-64, 64), (1, -1), (12, 5)
			// 4 computed pairs: (0, 5), (-0, 5), (65, 2), (1.5, 2)
			const a = new Float64Array([-64, 1, 12, 0, -0, 65, 1.5]);
			const b = new Float64Array([64, -1, 5, 5, 5, 2, 2]);
			const res = multiplyTypedMemo(a, b);

			assertBitExactFloat64Array(res, new Float64Array([-4096, -1, 60, 0, -0, 130, 3]));
			const s = multiplyTypedMemo.getStats();
			assert.equal(s.misses, 1);
			assert.equal(s.hits, 0);
			assert.equal(s.tableHits, 3);
			assert.equal(s.computed, 4);
			assert.equal(s.cacheSize, 1);
		});

		it('returns memoized results on repeated identical value inputs without recomputing', () => {
			const a1 = new Float64Array([2, 3, 1.25]);
			const b1 = new Float64Array([4, 5, 2.5]);
			const first = multiplyTypedMemo(a1, b1);

			// Distinct Float64Array instances with identical contents
			const a2 = new Float64Array([2, 3, 1.25]);
			const b2 = new Float64Array([4, 5, 2.5]);
			const second = multiplyTypedMemo(a2, b2);

			assertBitExactFloat64Array(first, second);
			assert.notEqual(first, second, 'cached calls must return a fresh Float64Array copy');

			const s = multiplyTypedMemo.getStats();
			assert.equal(s.misses, 1);
			assert.equal(s.hits, 1);
			assert.equal(s.tableHits, 2);
			assert.equal(s.computed, 1);
		});

		it('protects cached values from external mutation of returned arrays', () => {
			const a = new Float64Array([7, 8]);
			const b = new Float64Array([9, 10]);

			const first = multiplyTypedMemo(a, b);
			first[0] = -999999;

			const second = multiplyTypedMemo(a, b);
			assertBitExactFloat64Array(second, new Float64Array([63, 80]));
		});

		it('evicts least-recently-used entries when maxCacheSize is reached', () => {
			const customCache = new Map();
			const opts = { cache: customCache, maxCacheSize: 2 };

			const a1 = new Float64Array([1]);
			const a2 = new Float64Array([2]);
			const a3 = new Float64Array([3]);
			const b = new Float64Array([10]);

			// Insert a1, a2
			multiplyTypedMemo(a1, b, opts);
			multiplyTypedMemo(a2, b, opts);
			assert.equal(customCache.size, 2);

			// Access a1 to mark it most-recently-used (so a2 becomes LRU)
			multiplyTypedMemo(a1, b, opts);
			assert.equal(multiplyTypedMemo.getStats().hits, 1);

			// Insert a3 -> should evict a2, keep a1
			multiplyTypedMemo(a3, b, opts);
			assert.equal(customCache.size, 2);

			// a1 should still hit
			const hitsBeforeA1 = multiplyTypedMemo.getStats().hits;
			multiplyTypedMemo(a1, b, opts);
			assert.equal(multiplyTypedMemo.getStats().hits, hitsBeforeA1 + 1);

			// a2 should miss (it was evicted)
			const missesBeforeA2 = multiplyTypedMemo.getStats().misses;
			multiplyTypedMemo(a2, b, opts);
			assert.equal(multiplyTypedMemo.getStats().misses, missesBeforeA2 + 1);
		});

		it('skips caching when useCache is false or array length exceeds maxCacheableLength', () => {
			const a = new Float64Array([2, 3, 4]);
			const b = new Float64Array([5, 6, 7]);

			multiplyTypedMemo(a, b, { useCache: false });
			multiplyTypedMemo(a, b, { useCache: false });
			assert.equal(multiplyTypedMemo.getStats().cacheSize, 0);
			assert.equal(multiplyTypedMemo.getStats().hits, 0);
			assert.equal(multiplyTypedMemo.getStats().misses, 0);

			// Length 3 > maxCacheableLength 2 -> computed without caching
			const res = multiplyTypedMemo(a, b, { maxCacheableLength: 2 });
			assertBitExactFloat64Array(res, new Float64Array([10, 18, 28]));
			assert.equal(multiplyTypedMemo.getStats().cacheSize, 0);
		});

		it('caches arrays containing NaN canonically', () => {
			const a = new Float64Array([NaN, 2]);
			const b = new Float64Array([3, 4]);

			const r1 = multiplyTypedMemo(a, b);
			const r2 = multiplyTypedMemo(new Float64Array([NaN, 2]), new Float64Array([3, 4]));
			assertBitExactFloat64Array(r1, new Float64Array([NaN, 8]));
			assertBitExactFloat64Array(r2, new Float64Array([NaN, 8]));
			assert.equal(multiplyTypedMemo.getStats().hits, 1);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when first or second argument is not a Float64Array', () => {
			const valid = new Float64Array([1, 2]);
			const invalidValues = [
				undefined,
				null,
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				new ArrayBuffer(16),
				42,
				'12',
				{ 0: 1, 1: 2, length: 2 },
			];

			for (const bad of invalidValues) {
				assert.throws(() => multiplyTypedMemo(bad, valid), TypeError);
				assert.throws(() => multiplyTypedMemo(valid, bad), TypeError);
			}
		});

		it('throws RangeError when input lengths differ', () => {
			assert.throws(
				() => multiplyTypedMemo(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
				RangeError,
			);
			assert.throws(
				() => multiplyTypedMemo(new Float64Array(0), new Float64Array(1)),
				RangeError,
			);
		});

		it('validates options thoroughly', () => {
			const a = new Float64Array([1, 2]);
			const b = new Float64Array([3, 4]);

			assert.throws(() => multiplyTypedMemo(a, b, null), TypeError);
			assert.throws(() => multiplyTypedMemo(a, b, []), TypeError);
			assert.throws(() => multiplyTypedMemo(a, b, 'opts'), TypeError);

			assert.throws(() => multiplyTypedMemo(a, b, { cache: {} }), TypeError);
			assert.throws(() => multiplyTypedMemo(a, b, { cache: null }), TypeError);

			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheSize: '10' }), TypeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheSize: 0 }), RangeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheSize: -5 }), RangeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheSize: 1.5 }), RangeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheSize: NaN }), RangeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheSize: Infinity }), RangeError);

			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheableLength: '10' }), TypeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheableLength: -1 }), RangeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheableLength: 2.5 }), RangeError);
			assert.throws(() => multiplyTypedMemo(a, b, { maxCacheableLength: NaN }), RangeError);

			assert.throws(() => multiplyTypedMemo(a, b, { useCache: 1 }), TypeError);
			assert.throws(() => multiplyTypedMemo(a, b, { useCache: 'true' }), TypeError);
		});
	});

	describe('independent cross-check', () => {
		it('matches reference implementation across seeded randomized Float64Array workloads', () => {
			const rand = mulberry32(0x5eed1234);
			const specials = [
				0,
				-0,
				1,
				-1,
				64,
				-64,
				65,
				-65,
				NaN,
				Infinity,
				-Infinity,
				Number.MAX_VALUE,
				Number.MIN_VALUE,
				Number.EPSILON,
			];

			for (let trial = 0; trial < 40; trial++) {
				const len = trial === 39 ? 5000 : Math.floor(rand() * 128);
				const a = new Float64Array(len);
				const b = new Float64Array(len);

				for (let i = 0; i < len; i++) {
					const pickA = rand();
					const pickB = rand();
					if (pickA < 0.35) {
						// Small integer in [-64, 64]
						a[i] = Math.floor(rand() * 129) - 64;
					} else if (pickA < 0.5) {
						a[i] = specials[Math.floor(rand() * specials.length)];
					} else {
						a[i] = (rand() - 0.5) * 1e6;
					}

					if (pickB < 0.35) {
						b[i] = Math.floor(rand() * 129) - 64;
					} else if (pickB < 0.5) {
						b[i] = specials[Math.floor(rand() * specials.length)];
					} else {
						b[i] = (rand() - 0.5) * 1e6;
					}
				}

				const expected = referenceMultiply(a, b);
				const actualFirst = multiplyTypedMemo(a, b);
				const actualSecond = multiplyTypedMemo(a, b);

				assertBitExactFloat64Array(actualFirst, expected);
				assertBitExactFloat64Array(actualSecond, expected);
			}
		});

		it('satisfies algebraic laws (commutativity, identity, distributivity) on exact integers', () => {
			const a = new Float64Array([-64, -17, -1, 0, 1, 23, 64, 128]);
			const b = new Float64Array([19, -42, 64, -7, 0, 11, -64, 256]);
			const c = new Float64Array([3, 5, -2, 8, -4, 6, 9, -10]);
			const ones = new Float64Array(a.length).fill(1);

			// Commutativity: a * b === b * a
			assertBitExactFloat64Array(multiplyTypedMemo(a, b), multiplyTypedMemo(b, a));

			// Identity: a * 1 === a
			assertBitExactFloat64Array(multiplyTypedMemo(a, ones), a);

			// Distributivity: a * (b + c) === (a * b) + (a * c)
			const bPlusC = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) bPlusC[i] = b[i] + c[i];
			const lhs = multiplyTypedMemo(a, bPlusC);
			const ab = multiplyTypedMemo(a, b);
			const ac = multiplyTypedMemo(a, c);
			const rhs = new Float64Array(a.length);
			for (let i = 0; i < a.length; i++) rhs[i] = ab[i] + ac[i];
			assertBitExactFloat64Array(lhs, rhs);
		});
	});
});
