import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { subtractTypedMemo } from './subtractTypedMemo.js';

/**
 * Independent reference implementation for element-wise Float64Array subtraction.
 *
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @returns {Float64Array}
 */
function referenceSubtract(a, b) {
	const out = new Float64Array(a.length);
	for (let i = 0; i < a.length; i++) {
		out[i] = a[i] - b[i];
	}
	return out;
}

/**
 * Deterministic xorshift32 PRNG for reproducible cross-check tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makePrng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

describe('subtractTypedMemo', () => {
	beforeEach(() => {
		subtractTypedMemo.clearCache();
	});

	describe('normal cases', () => {
		it('subtracts positive, negative, and fractional values element-wise', () => {
			const a = new Float64Array([10, -5, 3.5, 0, 1000.25]);
			const b = new Float64Array([4, -12, 1.25, 7, 500.75]);
			const res = subtractTypedMemo(a, b);

			assert.ok(res instanceof Float64Array);
			assert.deepEqual(res, new Float64Array([6, 7, 2.25, -7, 499.5]));
		});

		it('handles table-range integers and out-of-range values together', () => {
			const a = new Float64Array([-128, 0, 127, 128, -129, 1e12, 0.1]);
			const b = new Float64Array([127, -128, -128, 1, -1, 1e11, 0.2]);
			const res = subtractTypedMemo(a, b);

			assert.deepEqual(res, new Float64Array([-255, 128, 255, 127, -128, 9e11, 0.1 - 0.2]));
		});

		it('does not mutate its input arrays', () => {
			const a = new Float64Array([5, 10, 15]);
			const b = new Float64Array([1, 2, 3]);
			const aCopy = new Float64Array(a);
			const bCopy = new Float64Array(b);

			subtractTypedMemo(a, b);

			assert.deepEqual(a, aCopy);
			assert.deepEqual(b, bCopy);
		});
	});

	describe('edge cases', () => {
		it('handles empty Float64Arrays', () => {
			const res = subtractTypedMemo(new Float64Array(0), new Float64Array(0));
			assert.ok(res instanceof Float64Array);
			assert.equal(res.length, 0);
		});

		it('handles single-element Float64Arrays', () => {
			const res = subtractTypedMemo(new Float64Array([42]), new Float64Array([17]));
			assert.deepEqual(res, new Float64Array([25]));
		});

		it('preserves IEEE-754 signed zero semantics for all four zero combinations', () => {
			const res1 = subtractTypedMemo(new Float64Array([0]), new Float64Array([0]));
			const res2 = subtractTypedMemo(new Float64Array([0]), new Float64Array([-0]));
			const res3 = subtractTypedMemo(new Float64Array([-0]), new Float64Array([0]));
			const res4 = subtractTypedMemo(new Float64Array([-0]), new Float64Array([-0]));

			assert.ok(Object.is(res1[0], 0));
			assert.ok(Object.is(res2[0], 0));
			assert.ok(Object.is(res3[0], -0));
			assert.ok(Object.is(res4[0], 0));

			// Ensure repeated calls from memo cache still preserve -0 vs +0.
			const res3Again = subtractTypedMemo(new Float64Array([-0]), new Float64Array([0]));
			const res1Again = subtractTypedMemo(new Float64Array([0]), new Float64Array([0]));
			assert.ok(Object.is(res3Again[0], -0));
			assert.ok(Object.is(res1Again[0], 0));
		});

		it('handles NaN, Infinity, -Infinity, subnormals, and overflow', () => {
			const a = new Float64Array([
				NaN,
				1,
				Infinity,
				Infinity,
				-Infinity,
				Number.MAX_VALUE,
				Number.MIN_VALUE,
			]);
			const b = new Float64Array([
				1,
				NaN,
				1,
				Infinity,
				Infinity,
				-Number.MAX_VALUE,
				Number.MIN_VALUE,
			]);
			const res = subtractTypedMemo(a, b);

			assert.ok(Number.isNaN(res[0]));
			assert.ok(Number.isNaN(res[1]));
			assert.equal(res[2], Infinity);
			assert.ok(Number.isNaN(res[3]));
			assert.equal(res[4], -Infinity);
			assert.equal(res[5], Infinity);
			assert.equal(res[6], 0);
		});

		it('handles subarrays with non-zero byteOffsets and aliased buffers', () => {
			const backing = new Float64Array([100, 10, 20, 30, 40, 200]);
			const subA = backing.subarray(1, 4); // [10, 20, 30], byteOffset = 8
			const subB = backing.subarray(2, 5); // [20, 30, 40], byteOffset = 16

			const res = subtractTypedMemo(subA, subB);
			assert.deepEqual(res, new Float64Array([-10, -10, -10]));

			// Identical reference aliasing: a === b
			const selfRes = subtractTypedMemo(subA, subA);
			assert.deepEqual(selfRes, new Float64Array([0, 0, 0]));
		});

		it('bypasses memoization when input length exceeds maxMemoLength', () => {
			const a = new Float64Array([1, 2, 3, 4]);
			const b = new Float64Array([4, 3, 2, 1]);

			const res = subtractTypedMemo(a, b, { maxMemoLength: 2 });
			assert.deepEqual(res, new Float64Array([-3, -1, 1, 3]));

			const stats = subtractTypedMemo.getStats();
			assert.equal(stats.bypasses, 1);
			assert.equal(stats.size, 0);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when inputs are not Float64Array instances', () => {
			const valid = new Float64Array([1, 2]);

			for (const bad of [
				undefined,
				null,
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				new Uint8Array([1, 2]),
				'12',
				42,
				{ length: 2, 0: 1, 1: 2 },
			]) {
				assert.throws(() => subtractTypedMemo(bad, valid), TypeError);
				assert.throws(() => subtractTypedMemo(valid, bad), TypeError);
			}
		});

		it('throws RangeError on mismatched Float64Array lengths', () => {
			assert.throws(
				() => subtractTypedMemo(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
				RangeError
			);
			assert.throws(
				() => subtractTypedMemo(new Float64Array([1]), new Float64Array(0)),
				RangeError
			);
		});

		it('throws TypeError when an input ArrayBuffer is detached', () => {
			const buf = new ArrayBuffer(16);
			const a = new Float64Array(buf);
			const b = new Float64Array([1, 2]);
			structuredClone(buf, { transfer: [buf] });

			assert.throws(() => subtractTypedMemo(a, b), TypeError);
			assert.throws(() => subtractTypedMemo(b, a), TypeError);
		});

		it('validates options argument strictly', () => {
			const a = new Float64Array([1]);
			const b = new Float64Array([2]);

			assert.throws(() => subtractTypedMemo(a, b, null), TypeError);
			assert.throws(() => subtractTypedMemo(a, b, 'fast'), TypeError);
			assert.throws(() => subtractTypedMemo(a, b, []), TypeError);
			assert.throws(() => subtractTypedMemo(a, b, new Float64Array([1])), TypeError);
			assert.throws(() => subtractTypedMemo(a, b, { useCache: 1 }), TypeError);
			assert.throws(() => subtractTypedMemo(a, b, { maxCacheSize: 0 }), RangeError);
			assert.throws(() => subtractTypedMemo(a, b, { maxCacheSize: -5 }), RangeError);
			assert.throws(() => subtractTypedMemo(a, b, { maxCacheSize: 2.5 }), RangeError);
			assert.throws(() => subtractTypedMemo(a, b, { maxCacheSize: NaN }), RangeError);
			assert.throws(() => subtractTypedMemo(a, b, { maxMemoLength: -1 }), RangeError);
			assert.throws(() => subtractTypedMemo(a, b, { maxMemoLength: 1.5 }), RangeError);
		});
	});

	describe('memoization and precomputed table behavior', () => {
		it('memoizes repeated calls across distinct Float64Array instances with identical contents', () => {
			const a1 = new Float64Array([10, 20, 30]);
			const b1 = new Float64Array([3, 5, 7]);
			const r1 = subtractTypedMemo(a1, b1);

			assert.deepEqual(r1, new Float64Array([7, 15, 23]));
			assert.equal(subtractTypedMemo.getStats().misses, 1);
			assert.equal(subtractTypedMemo.getStats().hits, 0);
			assert.equal(subtractTypedMemo.getStats().tableLookups, 3);

			const a2 = new Float64Array([10, 20, 30]);
			const b2 = new Float64Array([3, 5, 7]);
			const r2 = subtractTypedMemo(a2, b2);

			assert.deepEqual(r2, r1);
			assert.notEqual(r2, r1);
			assert.equal(subtractTypedMemo.getStats().hits, 1);
			assert.equal(subtractTypedMemo.getStats().misses, 1);
			// Cache hit should not redo table lookups.
			assert.equal(subtractTypedMemo.getStats().tableLookups, 3);
		});

		it('isolates cached entries from caller mutations of returned or input arrays', () => {
			const a = new Float64Array([50, 60]);
			const b = new Float64Array([10, 20]);

			const first = subtractTypedMemo(a, b);
			first[0] = 99999;

			const second = subtractTypedMemo(a, b);
			assert.deepEqual(second, new Float64Array([40, 40]));
			assert.equal(subtractTypedMemo.getStats().hits, 1);

			// Mutating input array produces a new key (cache miss) and updated answer.
			a[0] = 100;
			const third = subtractTypedMemo(a, b);
			assert.deepEqual(third, new Float64Array([90, 40]));
			assert.equal(subtractTypedMemo.getStats().misses, 2);
		});

		it('evicts least-recently-used entries when maxCacheSize is exceeded', () => {
			const opts = { maxCacheSize: 2 };
			const b = new Float64Array([1]);

			subtractTypedMemo(new Float64Array([10]), b, opts); // cache: [10]
			subtractTypedMemo(new Float64Array([20]), b, opts); // cache: [10, 20]
			// Touch [10] so [20] becomes LRU.
			subtractTypedMemo(new Float64Array([10]), b, opts); // cache: [20, 10], hit=1
			// Insert [30] -> evicts [20].
			subtractTypedMemo(new Float64Array([30]), b, opts); // cache: [10, 30], evictions=1

			let stats = subtractTypedMemo.getStats();
			assert.equal(stats.size, 2);
			assert.equal(stats.hits, 1);
			assert.equal(stats.evictions, 1);

			// [10] should still be cached (hit), while [20] was evicted (miss).
			subtractTypedMemo(new Float64Array([10]), b, opts);
			assert.equal(subtractTypedMemo.getStats().hits, 2);

			subtractTypedMemo(new Float64Array([20]), b, opts);
			stats = subtractTypedMemo.getStats();
			assert.equal(stats.misses, 4);
			assert.equal(stats.evictions, 2);
		});

		it('supports bypassing cache with useCache: false and clearing cache with clearCache()', () => {
			const a = new Float64Array([5, 6]);
			const b = new Float64Array([2, 1]);

			const uncached = subtractTypedMemo(a, b, { useCache: false });
			assert.deepEqual(uncached, new Float64Array([3, 5]));
			assert.equal(subtractTypedMemo.getStats().bypasses, 1);
			assert.equal(subtractTypedMemo.getStats().size, 0);

			subtractTypedMemo(a, b);
			assert.equal(subtractTypedMemo.getStats().size, 1);

			subtractTypedMemo.clearCache();
			const afterClear = subtractTypedMemo.getStats();
			assert.equal(afterClear.size, 0);
			assert.equal(afterClear.hits, 0);
			assert.equal(afterClear.misses, 0);
			assert.equal(afterClear.tableLookups, 0);
		});

		it('uses the precomputed table for every integer pair in [-128, 127] and matches direct subtraction', () => {
			const { tableMin, tableMax } = subtractTypedMemo.getStats();
			assert.equal(tableMin, -128);
			assert.equal(tableMax, 127);

			const span = tableMax - tableMin + 1;
			const rowA = new Float64Array(span);
			const rowB = new Float64Array(span);
			for (let i = 0; i < span; i++) {
				rowB[i] = tableMin + i;
			}

			for (let av = tableMin; av <= tableMax; av++) {
				rowA.fill(av);
				const actual = subtractTypedMemo(rowA, rowB, { useCache: false });
				for (let j = 0; j < span; j++) {
					assert.equal(actual[j], av - rowB[j]);
				}
			}

			const stats = subtractTypedMemo.getStats();
			assert.equal(stats.tableLookups, span * span);
			assert.equal(stats.directComputations, 0);
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent reference implementation across pseudo-random mixed vectors', () => {
			const rand = makePrng(0x5eed1234);

			for (let trial = 0; trial < 25; trial++) {
				const len = Math.floor(rand() * 128);
				const a = new Float64Array(len);
				const b = new Float64Array(len);

				for (let i = 0; i < len; i++) {
					const bucket = i % 4;
					if (bucket === 0) {
						// Small integers within table bounds [-128, 127]
						a[i] = Math.floor(rand() * 256) - 128;
						b[i] = Math.floor(rand() * 256) - 128;
					} else if (bucket === 1) {
						// Arbitrary finite floats
						a[i] = (rand() - 0.5) * 1e6;
						b[i] = (rand() - 0.5) * 1e6;
					} else if (bucket === 2) {
						// Very small / subnormal-adjacent values
						a[i] = (rand() - 0.5) * 1e-300;
						b[i] = (rand() - 0.5) * 1e-300;
					} else {
						// Large integers outside table bounds
						a[i] = Math.floor((rand() - 0.5) * 1e9);
						b[i] = Math.floor((rand() - 0.5) * 1e9);
					}
				}

				const expected = referenceSubtract(a, b);
				const actual = subtractTypedMemo(a, b);
				const actualCached = subtractTypedMemo(a, b);

				assert.deepEqual(actual, expected);
				assert.deepEqual(actualCached, expected);
			}
		});

		it('satisfies algebraic subtraction identities (anti-symmetry, self-cancellation, add-back)', () => {
			const a = new Float64Array([-128, -42, 0, 19, 127, 1024, -65536]);
			const b = new Float64Array([127, 15, -0, -88, -128, -2048, 32768]);

			const ab = subtractTypedMemo(a, b);
			const ba = subtractTypedMemo(b, a);
			const aa = subtractTypedMemo(a, a);

			for (let i = 0; i < a.length; i++) {
				// Anti-symmetry: (a - b) === -(b - a) (treating +0/-0 numerically equal via ==)
				assert.equal(ab[i], -ba[i]);
				// Self-cancellation: a - a === 0
				assert.equal(aa[i], 0);
				// Exact integer add-back: (a - b) + b === a
				assert.equal(ab[i] + b[i], a[i]);
			}
		});
	});
});
