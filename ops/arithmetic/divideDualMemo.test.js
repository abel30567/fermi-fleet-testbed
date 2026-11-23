import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	divideDualMemo,
	clearDivideDualMemoCache,
	getDivideDualMemoStats,
} from './divideDualMemo.js';

/**
 * Independent helper: dual-number multiplication (a * b).
 * Used to verify the inverse identity (a / b) * b === a.
 */
function multiplyDual(a, b) {
	return {
		v: a.v * b.v,
		d: a.d * b.v + a.v * b.d,
	};
}

function assertClose(actual, expected, tol = 1e-12, msg = '') {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		`${msg} expected ${expected} ± ${tol}, got ${actual}`,
	);
}

describe('divideDualMemo', () => {
	beforeEach(() => {
		clearDivideDualMemoCache();
	});

	describe('normal cases', () => {
		it('divides dual numbers with positive values and derivatives', () => {
			// (6 + 5ε) / (2 + 1ε) = 3 + (5*2 - 6*1)/4 ε = 3 + 1ε
			const res = divideDualMemo({ v: 6, d: 5 }, { v: 2, d: 1 });
			assert.deepEqual(res, { v: 3, d: 1 });
		});

		it('handles fractional and irrational values accurately', () => {
			const a = { v: Math.PI, d: Math.E };
			const b = { v: 1.5, d: 0.25 };
			const res = divideDualMemo(a, b);
			assertClose(res.v, Math.PI / 1.5, 1e-15);
			assertClose(res.d, (Math.E * 1.5 - Math.PI * 0.25) / (1.5 * 1.5), 1e-15);
		});

		it('serves small-integer dual quotients from the precomputed table accurately', () => {
			// (1 + 2ε) / (2 - 1ε) = 0.5 + (2*2 - 1*(-1))/4 ε = 0.5 + 1.25ε
			const res = divideDualMemo({ v: 1, d: 2 }, { v: 2, d: -1 });
			assert.deepEqual(res, { v: 0.5, d: 1.25 });
			const stats = getDivideDualMemoStats();
			assert.equal(stats.precomputedHits, 1);
			assert.equal(stats.cacheMisses, 0);
		});

		it('dividing by a constant dual number {v: c, d: 0} scales both v and d by 1/c', () => {
			const res = divideDualMemo({ v: 10, d: -4 }, { v: 5, d: 0 });
			assert.deepEqual(res, { v: 2, d: -0.8 });
		});

		it('dividing a dual number by itself yields {v: 1, d: 0}', () => {
			const x = { v: 7.25, d: -3.5 };
			const res = divideDualMemo(x, x);
			assertClose(res.v, 1, 1e-15);
			assertClose(res.d, 0, 1e-15);
		});
	});

	describe('edge cases', () => {
		it('handles zero numerator value with non-zero derivative', () => {
			// (0 + 3ε) / (2 + 7ε) = 0 + (3*2 - 0)/4 ε = 0 + 1.5ε
			const res = divideDualMemo({ v: 0, d: 3 }, { v: 2, d: 7 });
			assert.equal(res.v, 0);
			assert.equal(res.d, 1.5);
		});

		it('handles zero numerator value and zero numerator derivative', () => {
			const res = divideDualMemo({ v: 0, d: 0 }, { v: 4, d: 9 });
			assert.equal(res.v, 0);
			assert.equal(res.d, 0);
		});

		it('handles negative values and negative derivatives', () => {
			// (-9 - 3ε) / (-3 + 6ε) = 3 + ((-3)*(-3) - (-9)*6)/9 ε = 3 + (9 + 54)/9 ε = 3 + 7ε
			const res = divideDualMemo({ v: -9, d: -3 }, { v: -3, d: 6 });
			assert.deepEqual(res, { v: 3, d: 7 });
		});

		it('distinguishes -0 from +0 without cache key collision', () => {
			const pos = divideDualMemo({ v: 0, d: 0 }, { v: 3, d: 0 });
			const neg = divideDualMemo({ v: -0, d: 0 }, { v: 3, d: 0 });
			assert.ok(Object.is(pos.v, 0));
			assert.ok(Object.is(neg.v, -0));
		});

		it('handles extreme magnitudes without spurious overflow/underflow in b.v^2', () => {
			const big = divideDualMemo({ v: 2e200, d: 1e200 }, { v: 1e200, d: 0 });
			assertClose(big.v, 2, 1e-12);
			assertClose(big.d, 1, 1e-12);

			const tiny = divideDualMemo({ v: 4e-200, d: 2e-200 }, { v: 2e-200, d: 0 });
			assertClose(tiny.v, 2, 1e-12);
			assertClose(tiny.d, 1, 1e-12);
		});

		it('throws RangeError on division by zero (b.v === 0 or -0)', () => {
			assert.throws(
				() => divideDualMemo({ v: 1, d: 1 }, { v: 0, d: 1 }),
				RangeError,
			);
			assert.throws(
				() => divideDualMemo({ v: 1, d: 1 }, { v: -0, d: 0 }),
				RangeError,
			);
		});
	});

	describe('input validation', () => {
		it('rejects null, primitives, arrays, and missing operands with TypeError', () => {
			const valid = { v: 1, d: 1 };
			const invalidObjects = [null, undefined, 42, '1', true, [1, 2], () => {}];
			for (const bad of invalidObjects) {
				assert.throws(() => divideDualMemo(bad, valid), TypeError);
				assert.throws(() => divideDualMemo(valid, bad), TypeError);
			}
		});

		it('rejects objects with missing or non-number v/d fields with TypeError', () => {
			const valid = { v: 2, d: 1 };
			const badFields = [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '1', d: 0 },
				{ v: 1, d: '0' },
				{ v: null, d: 0 },
				{ v: 1, d: undefined },
			];
			for (const bad of badFields) {
				assert.throws(() => divideDualMemo(bad, valid), TypeError);
				assert.throws(() => divideDualMemo(valid, bad), TypeError);
			}
		});

		it('rejects NaN and ±Infinity components with RangeError', () => {
			const valid = { v: 2, d: 1 };
			const nonFinite = [
				{ v: Number.NaN, d: 0 },
				{ v: 1, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			];
			for (const bad of nonFinite) {
				assert.throws(() => divideDualMemo(bad, valid), RangeError);
				assert.throws(() => divideDualMemo(valid, bad), RangeError);
			}
		});
	});

	describe('memoization and cache safety', () => {
		it('records cache miss on first non-table call and cache hit on repeat call', () => {
			const a = { v: 12.5, d: 3.25 };
			const b = { v: 2.5, d: -0.5 };

			const first = divideDualMemo(a, b);
			let stats = getDivideDualMemoStats();
			assert.equal(stats.cacheMisses, 1);
			assert.equal(stats.cacheHits, 0);
			assert.equal(stats.cacheSize, 1);

			const second = divideDualMemo(a, b);
			stats = getDivideDualMemoStats();
			assert.equal(stats.cacheMisses, 1);
			assert.equal(stats.cacheHits, 1);
			assert.deepEqual(second, first);
			assert.notEqual(second, first, 'must return a fresh object instance');
		});

		it('prevents caller mutation from corrupting the dynamic cache or precomputed table', () => {
			// Dynamic cache entry
			const a = { v: 15, d: 4 };
			const b = { v: 3, d: 1 };
			const r1 = divideDualMemo(a, b);
			r1.v = 9999;
			r1.d = -9999;
			const r2 = divideDualMemo(a, b);
			assert.deepEqual(r2, { v: 5, d: -1 / 3 });

			// Precomputed table entry
			const p1 = divideDualMemo({ v: 2, d: 1 }, { v: 2, d: 0 });
			p1.v = -123;
			p1.d = 456;
			const p2 = divideDualMemo({ v: 2, d: 1 }, { v: 2, d: 0 });
			assert.deepEqual(p2, { v: 1, d: 0.5 });
		});

		it('enforces bounded cache capacity via LRU eviction', () => {
			const { maxCacheSize } = getDivideDualMemoStats();
			const totalCalls = maxCacheSize + 50;

			for (let i = 1; i <= totalCalls; i += 1) {
				divideDualMemo({ v: i + 100, d: 1 }, { v: 7, d: 0.5 });
			}

			const stats = getDivideDualMemoStats();
			assert.equal(stats.cacheSize, maxCacheSize);
			assert.equal(stats.evictions, 50);
			assert.equal(stats.cacheMisses, totalCalls);

			// Most recent entry should still be cached (cache hit)
			divideDualMemo({ v: totalCalls + 100, d: 1 }, { v: 7, d: 0.5 });
			assert.equal(getDivideDualMemoStats().cacheHits, 1);

			// Oldest entry (i = 1) should have been evicted (cache miss)
			const missesBefore = getDivideDualMemoStats().cacheMisses;
			divideDualMemo({ v: 101, d: 1 }, { v: 7, d: 0.5 });
			assert.equal(getDivideDualMemoStats().cacheMisses, missesBefore + 1);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies algebraic inverse identity: (a / b) * b === a', () => {
			const pairs = [
				[{ v: 7.5, d: -2.25 }, { v: 3.125, d: 1.75 }],
				[{ v: -11.3, d: 4.9 }, { v: -2.7, d: -0.8 }],
				[{ v: 0, d: 5.5 }, { v: -4.2, d: 3.1 }],
				[{ v: 1.23456, d: 0.789 }, { v: 9.87654, d: -0.321 }],
			];

			for (const [a, b] of pairs) {
				const q = divideDualMemo(a, b);
				const reconstructed = multiplyDual(q, b);
				assertClose(reconstructed.v, a.v, 1e-12, 'reconstructed v');
				assertClose(reconstructed.d, a.d, 1e-12, 'reconstructed d');
			}
		});

		it('matches central finite-difference derivative for smooth rational functions f(x) = g(x) / h(x)', () => {
			// g(x) = x^3 - 2x + 5  => g'(x) = 3x^2 - 2
			// h(x) = x^2 + 3x + 4  => h'(x) = 2x + 3
			const g = (x) => x ** 3 - 2 * x + 5;
			const gPrime = (x) => 3 * x ** 2 - 2;
			const h = (x) => x ** 2 + 3 * x + 4;
			const hPrime = (x) => 2 * x + 3;
			const f = (x) => g(x) / h(x);

			const eps = 1e-6;
			const xs = [-3.5, -1.2, 0, 0.75, 2.4, 5.1];

			for (const x of xs) {
				const dualRes = divideDualMemo(
					{ v: g(x), d: gPrime(x) },
					{ v: h(x), d: hPrime(x) },
				);
				const approxDeriv = (f(x + eps) - f(x - eps)) / (2 * eps);

				assertClose(dualRes.v, f(x), 1e-12, `value at x=${x}`);
				assertClose(dualRes.d, approxDeriv, 1e-7, `derivative at x=${x}`);
			}
		});
	});
});
