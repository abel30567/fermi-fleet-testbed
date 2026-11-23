import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { nthRootFloatMemo } from './nthRootFloatMemo.js';

/**
 * Asserts two finite float64 numbers are within a relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 */
function assertClose(actual, expected, relTol = 1e-12) {
	assert.ok(Number.isFinite(actual), `Expected finite actual value, got ${actual}`);
	assert.ok(Number.isFinite(expected), `Expected finite expected value, got ${expected}`);
	const diff = Math.abs(actual - expected);
	const scale = Math.max(1, Math.abs(expected));
	assert.ok(
		diff <= relTol * scale,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, tol=${relTol * scale})`
	);
}

describe('nthRootFloatMemo', () => {
	beforeEach(() => {
		nthRootFloatMemo.clearCache();
	});

	describe('normal cases', () => {
		it('computes exact integer square, cube, and higher roots', () => {
			assert.equal(nthRootFloatMemo(4, 2), 2);
			assert.equal(nthRootFloatMemo(9, 2), 3);
			assert.equal(nthRootFloatMemo(8, 3), 2);
			assert.equal(nthRootFloatMemo(27, 3), 3);
			assert.equal(nthRootFloatMemo(1000, 3), 10);
			assert.equal(nthRootFloatMemo(16, 4), 2);
			assert.equal(nthRootFloatMemo(81, 4), 3);
			assert.equal(nthRootFloatMemo(243, 5), 3);
			assert.equal(nthRootFloatMemo(100000, 5), 10);
			assert.equal(nthRootFloatMemo(78125, 7), 5);
			assert.equal(nthRootFloatMemo(1024, 10), 2);
		});

		it('computes non-integer irrational roots accurately', () => {
			assertClose(nthRootFloatMemo(2, 2), Math.SQRT2, 1e-15);
			assertClose(nthRootFloatMemo(2, 3), Math.cbrt(2), 1e-15);
			assertClose(nthRootFloatMemo(10, 4), Math.pow(10, 0.25), 1e-15);
			assertClose(nthRootFloatMemo(12345.6789, 5), Math.pow(12345.6789, 0.2), 1e-14);
			assertClose(nthRootFloatMemo(0.25, 2), 0.5, 1e-15);
			assertClose(nthRootFloatMemo(0.125, 3), 0.5, 1e-15);
		});

		it('handles fractional positive root degrees', () => {
			assert.equal(nthRootFloatMemo(4, 0.5), 16);
			assertClose(nthRootFloatMemo(3, 0.25), 81, 1e-14);
			assertClose(nthRootFloatMemo(9, 2 / 3), 27, 1e-14);
		});

		it('handles x = 1 across diverse degrees', () => {
			for (const n of [1, 2, 3, 7, -1, -2, -3, 0.5, -0.5, 1000, -1000]) {
				assert.equal(nthRootFloatMemo(1, n), 1);
			}
		});
	});

	describe('edge cases', () => {
		it('handles n = 1, n = 2, n = 3 and negative n = -1, -2, -3', () => {
			assert.equal(nthRootFloatMemo(42.5, 1), 42.5);
			assert.equal(nthRootFloatMemo(-42.5, 1), -42.5);
			assert.equal(nthRootFloatMemo(25, 2), 5);
			assert.equal(nthRootFloatMemo(64, 3), 4);

			assert.equal(nthRootFloatMemo(4, -1), 0.25);
			assert.equal(nthRootFloatMemo(-4, -1), -0.25);
			assert.equal(nthRootFloatMemo(16, -2), 0.25);
			assert.equal(nthRootFloatMemo(8, -3), 0.5);
			assert.equal(nthRootFloatMemo(-8, -3), -0.5);
			assert.equal(nthRootFloatMemo(16, -4), 0.5);
		});

		it('handles negative fractional root degrees including subnormal-safe ranges', () => {
			assert.equal(nthRootFloatMemo(4, -0.5), 1 / 16);
			assertClose(nthRootFloatMemo(2, -0.25), 1 / 16, 1e-14);
			// Ensure large x with -1 < n < 0 does not prematurely underflow to 0 via overflow
			const subnormalResult = nthRootFloatMemo(1e308, -0.98);
			assert.ok(subnormalResult > 0 && Number.isFinite(subnormalResult));
		});

		it('distinguishes odd vs even and non-integer roots of negative numbers', () => {
			// Odd integer roots of negative numbers are real and negative
			assert.equal(nthRootFloatMemo(-1, 3), -1);
			assert.equal(nthRootFloatMemo(-8, 3), -2);
			assert.equal(nthRootFloatMemo(-27, 3), -3);
			assert.equal(nthRootFloatMemo(-32, 5), -2);
			assert.equal(nthRootFloatMemo(-243, 5), -3);
			assert.equal(nthRootFloatMemo(-128, 7), -2);
			assert.equal(nthRootFloatMemo(-27, -3), -1 / 3);
			assert.equal(nthRootFloatMemo(-32, -5), -0.5);

			// Even integer roots of negative numbers are NaN
			assert.ok(Number.isNaN(nthRootFloatMemo(-1, 2)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-4, 2)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-16, 4)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-16, -2)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-64, 6)));

			// Non-integer roots of negative numbers are NaN
			assert.ok(Number.isNaN(nthRootFloatMemo(-8, 2.5)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-8, 0.5)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-8, -0.5)));

			// Huge float64 integer (> MAX_SAFE_INTEGER) is always even
			assert.ok(Number.isNaN(nthRootFloatMemo(-8, 2 ** 53)));
		});

		it('throws RangeError when n = 0 or n = -0', () => {
			assert.throws(() => nthRootFloatMemo(8, 0), RangeError);
			assert.throws(() => nthRootFloatMemo(8, -0), RangeError);
			assert.throws(() => nthRootFloatMemo(0, 0), RangeError);
			assert.throws(() => nthRootFloatMemo(-8, 0), RangeError);
		});

		it('handles +0 and -0 radicands with IEEE-754 sign semantics', () => {
			assert.ok(Object.is(nthRootFloatMemo(0, 1), 0));
			assert.ok(Object.is(nthRootFloatMemo(0, 2), 0));
			assert.ok(Object.is(nthRootFloatMemo(0, 3), 0));
			assert.ok(Object.is(nthRootFloatMemo(-0, 1), -0));
			assert.ok(Object.is(nthRootFloatMemo(-0, 3), -0));
			assert.ok(Object.is(nthRootFloatMemo(-0, 5), -0));
			assert.ok(Object.is(nthRootFloatMemo(-0, 2), 0));
			assert.ok(Object.is(nthRootFloatMemo(-0, 4), 0));

			assert.equal(nthRootFloatMemo(0, -1), Infinity);
			assert.equal(nthRootFloatMemo(0, -2), Infinity);
			assert.equal(nthRootFloatMemo(0, -3), Infinity);
			assert.equal(nthRootFloatMemo(-0, -1), -Infinity);
			assert.equal(nthRootFloatMemo(-0, -3), -Infinity);
			assert.equal(nthRootFloatMemo(-0, -2), Infinity);
			assert.equal(nthRootFloatMemo(-0, -4), Infinity);
		});

		it('handles +Infinity and -Infinity for x and n', () => {
			assert.equal(nthRootFloatMemo(Infinity, 1), Infinity);
			assert.equal(nthRootFloatMemo(Infinity, 2), Infinity);
			assert.equal(nthRootFloatMemo(Infinity, 3), Infinity);
			assert.ok(Object.is(nthRootFloatMemo(Infinity, -1), 0));
			assert.ok(Object.is(nthRootFloatMemo(Infinity, -2), 0));
			assert.ok(Object.is(nthRootFloatMemo(Infinity, -3), 0));

			assert.equal(nthRootFloatMemo(-Infinity, 1), -Infinity);
			assert.equal(nthRootFloatMemo(-Infinity, 3), -Infinity);
			assert.ok(Object.is(nthRootFloatMemo(-Infinity, -1), -0));
			assert.ok(Object.is(nthRootFloatMemo(-Infinity, -3), -0));
			assert.ok(Number.isNaN(nthRootFloatMemo(-Infinity, 2)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-Infinity, -2)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-Infinity, 2.5)));

			// n = ±Infinity
			assert.equal(nthRootFloatMemo(5, Infinity), 1);
			assert.equal(nthRootFloatMemo(0.25, Infinity), 1);
			assert.equal(nthRootFloatMemo(5, -Infinity), 1);
			assert.equal(nthRootFloatMemo(1, Infinity), 1);
			assert.ok(Number.isNaN(nthRootFloatMemo(0, Infinity)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-5, Infinity)));
			assert.ok(Number.isNaN(nthRootFloatMemo(Infinity, Infinity)));
			assert.ok(Number.isNaN(nthRootFloatMemo(-Infinity, -Infinity)));
		});

		it('propagates NaN inputs without throwing', () => {
			assert.ok(Number.isNaN(nthRootFloatMemo(NaN, 2)));
			assert.ok(Number.isNaN(nthRootFloatMemo(NaN, 0)));
			assert.ok(Number.isNaN(nthRootFloatMemo(8, NaN)));
			assert.ok(Number.isNaN(nthRootFloatMemo(NaN, NaN)));
		});

		it('handles extreme IEEE-754 magnitudes (MAX_VALUE and MIN_VALUE)', () => {
			const rMax = nthRootFloatMemo(Number.MAX_VALUE, 5);
			assertClose(Math.pow(rMax, 5), Number.MAX_VALUE, 1e-13);

			const rMin = nthRootFloatMemo(Number.MIN_VALUE, 5);
			assert.ok(rMin > 0 && Number.isFinite(rMin));
			assertClose(Math.pow(rMin, 5) / Number.MIN_VALUE, 1, 1e-2);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-number x or n', () => {
			const invalidValues = [
				undefined,
				null,
				'8',
				'2',
				true,
				false,
				8n,
				{},
				[8],
				Symbol('x'),
				() => 8,
			];

			for (const bad of invalidValues) {
				assert.throws(() => nthRootFloatMemo(bad, 2), TypeError);
				assert.throws(() => nthRootFloatMemo(8, bad), TypeError);
			}
		});
	});

	describe('memoization and precomputed table behavior', () => {
		it('serves small integer roots and perfect powers from precomputed tables', () => {
			assert.equal(nthRootFloatMemo(64, 3), 4); // small table
			assert.equal(nthRootFloatMemo(256, 8), 2); // small table
			assert.equal(nthRootFloatMemo(1000, 3), 10); // perfect-power table
			assert.equal(nthRootFloatMemo(243, 5), 3); // small table
			assert.equal(nthRootFloatMemo(1000000, 6), 10); // perfect-power table

			const stats = nthRootFloatMemo.getStats();
			assert.equal(stats.tableHits, 5);
			assert.equal(stats.cacheMisses, 0);
			assert.equal(stats.cacheSize, 0);
		});

		it('memoizes dynamic non-table queries and shares entries across sign/reciprocal', () => {
			const first = nthRootFloatMemo(777.125, 5);
			let stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheMisses, 1);
			assert.equal(stats.cacheHits, 0);
			assert.equal(stats.cacheSize, 1);

			// Exact repeat hits cache
			const second = nthRootFloatMemo(777.125, 5);
			assert.equal(second, first);
			stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheHits, 1);
			assert.equal(stats.cacheMisses, 1);

			// Negative radicand with odd n reuses canonical positive entry
			const neg = nthRootFloatMemo(-777.125, 5);
			assert.equal(neg, -first);
			stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheHits, 2);
			assert.equal(stats.cacheSize, 1);

			// Negative n <= -1 reuses canonical positive entry
			const recip = nthRootFloatMemo(777.125, -5);
			assert.equal(recip, 1 / first);
			stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheHits, 3);
			assert.equal(stats.cacheSize, 1);
		});

		it('enforces bounded LRU eviction and supports clearCache', () => {
			const { maxCacheSize } = nthRootFloatMemo.getStats();
			const total = maxCacheSize + 25;

			for (let i = 1; i <= total; i += 1) {
				// Use fractional radicands to bypass precomputed integer tables
				nthRootFloatMemo(i + 0.375, 5);
			}

			let stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheSize, maxCacheSize);
			assert.equal(stats.cacheMisses, total);

			// Most recent entry should still be cached
			nthRootFloatMemo(total + 0.375, 5);
			stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheHits, 1);

			// Evicted oldest entry should miss
			nthRootFloatMemo(1 + 0.375, 5);
			stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheMisses, total + 1);

			nthRootFloatMemo.clearCache();
			stats = nthRootFloatMemo.getStats();
			assert.equal(stats.cacheSize, 0);
			assert.equal(stats.cacheHits, 0);
			assert.equal(stats.cacheMisses, 0);
			assert.equal(stats.tableHits, 0);
		});
	});

	describe('independent cross-checks (r ** n === x)', () => {
		it('satisfies r ** n ≈ x across positive, negative, integer, and fractional inputs', () => {
			const positiveCases = [
				[0.001234, 3],
				[0.5, 4],
				[2.718281828459045, 5],
				[3.141592653589793, 7],
				[98765.4321, 9],
				[1e18, 6],
				[1e-18, 6],
				[123456789, 13],
				[42.42, 2.5],
				[7.5, -3],
				[0.04, -4],
				[50, -0.5],
				[999.99, 31],
			];

			for (const [x, n] of positiveCases) {
				const r = nthRootFloatMemo(x, n);
				const reconstructed = Math.pow(r, n);
				assertClose(reconstructed, x, 1e-12);
			}

			const negativeOddCases = [
				[-0.001234, 3],
				[-2.718281828459045, 5],
				[-98765.4321, 7],
				[-1e15, 5],
				[-7.5, -3],
				[-1024.5, -9],
			];

			for (const [x, n] of negativeOddCases) {
				const r = nthRootFloatMemo(x, n);
				assert.ok(r < 0, `Expected negative root for (${x}, ${n}), got ${r}`);
				const reconstructed = Math.pow(r, n);
				assertClose(reconstructed, x, 1e-12);
			}
		});
	});
});
