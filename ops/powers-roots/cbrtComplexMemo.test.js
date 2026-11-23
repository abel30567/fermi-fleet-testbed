import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
	cbrtComplexMemo,
	clearCbrtComplexMemoCache,
	getCbrtComplexMemoStats,
} from './cbrtComplexMemo.js';

/**
 * Independent reference implementation via direct polar formula.
 * @param {{ re: number, im: number }} z
 * @returns {{ re: number, im: number }}
 */
function referencePolarCbrt(z) {
	const re = z.re === 0 ? 0 : z.re;
	const im = z.im === 0 ? 0 : z.im;
	if (re === 0 && im === 0) return { re: 0, im: 0 };
	const r = Math.hypot(re, im);
	const theta = Math.atan2(im, re);
	const cbrtR = Math.cbrt(r);
	return {
		re: cbrtR * Math.cos(theta / 3),
		im: cbrtR * Math.sin(theta / 3),
	};
}

/**
 * Complex cube: w^3 for algebraic verification.
 * @param {{ re: number, im: number }} w
 * @returns {{ re: number, im: number }}
 */
function complexCube(w) {
	const { re: a, im: b } = w;
	return {
		re: a * a * a - 3 * a * b * b,
		im: 3 * a * a * b - b * b * b,
	};
}

/**
 * Assert two complex numbers are close within relative/absolute tolerance.
 */
function assertComplexClose(actual, expected, tol = 1e-12, label = '') {
	const scale = Math.max(1, Math.hypot(expected.re, expected.im));
	const errRe = Math.abs(actual.re - expected.re);
	const errIm = Math.abs(actual.im - expected.im);
	assert.ok(
		errRe <= tol * scale,
		`${label} real part mismatch: got ${actual.re}, expected ${expected.re} (err=${errRe}, limit=${tol * scale})`,
	);
	assert.ok(
		errIm <= tol * scale,
		`${label} imag part mismatch: got ${actual.im}, expected ${expected.im} (err=${errIm}, limit=${tol * scale})`,
	);
}

describe('cbrtComplexMemo', () => {
	beforeEach(() => {
		clearCbrtComplexMemoCache();
	});

	describe('normal cases & precomputed exact roots', () => {
		it('computes cube roots of positive real numbers', () => {
			assert.deepEqual(cbrtComplexMemo({ re: 1, im: 0 }), { re: 1, im: 0 });
			assert.deepEqual(cbrtComplexMemo({ re: 8, im: 0 }), { re: 2, im: 0 });
			assert.deepEqual(cbrtComplexMemo({ re: 27, im: 0 }), { re: 3, im: 0 });
			assertComplexClose(cbrtComplexMemo({ re: 2, im: 0 }), { re: Math.cbrt(2), im: 0 }, 1e-15);
		});

		it('computes principal cube roots of negative real numbers', () => {
			const s3h = Math.sqrt(3) / 2;
			assertComplexClose(cbrtComplexMemo({ re: -1, im: 0 }), { re: 0.5, im: s3h }, 1e-15);
			assertComplexClose(cbrtComplexMemo({ re: -8, im: 0 }), { re: 1, im: Math.sqrt(3) }, 1e-15);
			assertComplexClose(cbrtComplexMemo({ re: -27, im: 0 }), { re: 1.5, im: 3 * s3h }, 1e-15);
			assertComplexClose(
				cbrtComplexMemo({ re: -5, im: 0 }),
				{ re: Math.cbrt(5) * 0.5, im: Math.cbrt(5) * s3h },
				1e-14,
			);
		});

		it('computes principal cube roots of pure imaginary numbers', () => {
			const s3h = Math.sqrt(3) / 2;
			assertComplexClose(cbrtComplexMemo({ re: 0, im: 1 }), { re: s3h, im: 0.5 }, 1e-15);
			assertComplexClose(cbrtComplexMemo({ re: 0, im: -1 }), { re: s3h, im: -0.5 }, 1e-15);
			assertComplexClose(cbrtComplexMemo({ re: 0, im: 8 }), { re: Math.sqrt(3), im: 1 }, 1e-15);
			assertComplexClose(cbrtComplexMemo({ re: 0, im: -8 }), { re: Math.sqrt(3), im: -1 }, 1e-15);
			assertComplexClose(
				cbrtComplexMemo({ re: 0, im: 13 }),
				{ re: Math.cbrt(13) * s3h, im: Math.cbrt(13) * 0.5 },
				1e-14,
			);
		});

		it('returns exact principal Gaussian integer roots from the precomputed table', () => {
			// (1 + i)^3 = -2 + 2i, (1 - i)^3 = -2 - 2i
			assert.deepEqual(cbrtComplexMemo({ re: -2, im: 2 }), { re: 1, im: 1 });
			assert.deepEqual(cbrtComplexMemo({ re: -2, im: -2 }), { re: 1, im: -1 });
			// (2 + i)^3 = 2 + 11i, (2 - i)^3 = 2 - 11i
			assert.deepEqual(cbrtComplexMemo({ re: 2, im: 11 }), { re: 2, im: 1 });
			assert.deepEqual(cbrtComplexMemo({ re: 2, im: -11 }), { re: 2, im: -1 });
			// (3 + 2i)^3 = -9 + 46i
			assert.deepEqual(cbrtComplexMemo({ re: -9, im: 46 }), { re: 3, im: 2 });
		});

		it('computes roots accurately in all four quadrants', () => {
			const samples = [
				{ re: 3.5, im: 4.25 },
				{ re: -3.5, im: 4.25 },
				{ re: -3.5, im: -4.25 },
				{ re: 3.5, im: -4.25 },
			];
			for (const z of samples) {
				const w = cbrtComplexMemo(z);
				const ref = referencePolarCbrt(z);
				assertComplexClose(w, ref, 1e-14, `quadrant (${z.re}, ${z.im})`);
				assertComplexClose(complexCube(w), z, 1e-13, `cube (${z.re}, ${z.im})`);
			}
		});
	});

	describe('edge cases', () => {
		it('handles zero and signed zeros canonically', () => {
			const r0 = cbrtComplexMemo({ re: 0, im: 0 });
			assert.equal(Object.is(r0.re, 0), true);
			assert.equal(Object.is(r0.im, 0), true);

			const rNeg0 = cbrtComplexMemo({ re: -0, im: -0 });
			assert.equal(Object.is(rNeg0.re, 0), true);
			assert.equal(Object.is(rNeg0.im, 0), true);

			// Negative real axis with -0 imaginary part maps to upper-closed principal branch
			const negRealPosZero = cbrtComplexMemo({ re: -8, im: 0 });
			const negRealNegZero = cbrtComplexMemo({ re: -8, im: -0 });
			assert.deepEqual(negRealNegZero, negRealPosZero);
		});

		it('handles values very close to the negative real branch cut', () => {
			const above = cbrtComplexMemo({ re: -8, im: 1e-12 });
			const below = cbrtComplexMemo({ re: -8, im: -1e-12 });
			assertComplexClose(above, { re: 1, im: Math.sqrt(3) }, 1e-10, 'above cut');
			assertComplexClose(below, { re: 1, im: -Math.sqrt(3) }, 1e-10, 'below cut');
			assertComplexClose(complexCube(above), { re: -8, im: 1e-12 }, 1e-12);
			assertComplexClose(complexCube(below), { re: -8, im: -1e-12 }, 1e-12);
		});

		it('handles extreme magnitudes without overflow or underflow', () => {
			// Near Number.MAX_VALUE where naive hypot(re, im) would overflow to Infinity
			const huge = { re: 1e308, im: 1e308 };
			const wHuge = cbrtComplexMemo(huge);
			assert.equal(Number.isFinite(wHuge.re), true);
			assert.equal(Number.isFinite(wHuge.im), true);
			assertComplexClose(complexCube(wHuge), huge, 1e-12, 'huge');

			// Subnormal / tiny values near Number.MIN_VALUE
			const tiny = { re: 1e-315, im: -1e-315 };
			const wTiny = cbrtComplexMemo(tiny);
			assert.equal(Number.isFinite(wTiny.re), true);
			assert.equal(Number.isFinite(wTiny.im), true);
			assert.ok(Math.hypot(wTiny.re, wTiny.im) > 0);
			assertComplexClose(complexCube(wTiny), tiny, 1e-8, 'tiny');
		});

		it('isolates cached values from caller mutation', () => {
			const z = { re: 1.25, im: 2.5 };
			const first = cbrtComplexMemo(z);
			const origRe = first.re;
			const origIm = first.im;
			first.re = 9999;
			first.im = -9999;

			const second = cbrtComplexMemo(z);
			assert.equal(second.re, origRe);
			assert.equal(second.im, origIm);
			assert.notEqual(first, second);

			// Also verify precomputed table entries cannot be mutated
			const pre = cbrtComplexMemo({ re: 8, im: 0 });
			pre.re = -42;
			assert.deepEqual(cbrtComplexMemo({ re: 8, im: 0 }), { re: 2, im: 0 });
		});

		it('records memoization hits/misses and enforces bounded LRU cache size', () => {
			const stats0 = getCbrtComplexMemoStats();
			assert.ok(stats0.precomputedSize > 20);
			assert.equal(stats0.cacheSize, 0);
			assert.equal(stats0.hits, 0);
			assert.equal(stats0.misses, 0);

			// Precomputed lookup counts as a hit without growing dynamic cache
			cbrtComplexMemo({ re: 27, im: 0 });
			assert.equal(getCbrtComplexMemoStats().hits, 1);
			assert.equal(getCbrtComplexMemoStats().cacheSize, 0);

			// Dynamic input: first call misses, second call hits
			const z = { re: 7.123, im: -4.567 };
			const a = cbrtComplexMemo(z);
			assert.equal(getCbrtComplexMemoStats().misses, 1);
			assert.equal(getCbrtComplexMemoStats().cacheSize, 1);

			const b = cbrtComplexMemo(z);
			assert.deepEqual(a, b);
			assert.equal(getCbrtComplexMemoStats().hits, 2);
			assert.equal(getCbrtComplexMemoStats().misses, 1);

			// Overflow cache beyond maxCacheSize and confirm size stays bounded
			const cap = getCbrtComplexMemoStats().maxCacheSize;
			for (let i = 0; i < cap + 50; i++) {
				cbrtComplexMemo({ re: i + 0.12345, im: i * 0.5 + 0.3 });
			}
			assert.equal(getCbrtComplexMemoStats().cacheSize, cap);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-object, null, undefined, and array inputs', () => {
			for (const bad of [null, undefined, 42, '1+2i', true, [1, 2], () => ({ re: 1, im: 0 })]) {
				assert.throws(() => cbrtComplexMemo(bad), TypeError);
			}
		});

		it('throws TypeError for missing or non-numeric re / im properties', () => {
			const badInputs = [
				{},
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 0, im: '1' },
				{ re: 1n, im: 0 },
				{ re: null, im: 0 },
				{ re: 0, im: undefined },
			];
			for (const bad of badInputs) {
				assert.throws(() => cbrtComplexMemo(bad), TypeError);
			}
		});

		it('throws RangeError for non-finite re / im values (NaN, Infinity, -Infinity)', () => {
			const nonFinite = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: Number.NEGATIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.POSITIVE_INFINITY },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
				{ re: Number.POSITIVE_INFINITY, im: Number.NEGATIVE_INFINITY },
			];
			for (const bad of nonFinite) {
				assert.throws(() => cbrtComplexMemo(bad), RangeError);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches independent polar formula and satisfies w^3 = z with arg(w) in (-pi/3, pi/3]', () => {
			// Deterministic PRNG (Mulberry32) for reproducible coverage across the plane
			let seed = 0x5f3759df;
			const nextFloat = () => {
				seed = (seed + 0x6d2b79f5) | 0;
				let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
				t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
				return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
			};

			for (let i = 0; i < 200; i++) {
				const exp = (nextFloat() - 0.5) * 40; // magnitudes from ~1e-20 to ~1e20
				const mag = 10 ** exp;
				const angle = (nextFloat() * 2 - 1) * Math.PI;
				const z = { re: mag * Math.cos(angle), im: mag * Math.sin(angle) };

				const w = cbrtComplexMemo(z);
				const ref = referencePolarCbrt(z);

				// Cross-check 1: agrees with independent polar reference to ~1e-14
				assertComplexClose(w, ref, 1e-14, `sample #${i} polar`);

				// Cross-check 2: algebraic inverse w^3 == z
				assertComplexClose(complexCube(w), z, 1e-12, `sample #${i} cube`);

				// Cross-check 3: principal branch argument lies in (-pi/3, pi/3]
				const argW = Math.atan2(w.im, w.re);
				assert.ok(
					argW >= -Math.PI / 3 - 1e-15 && argW <= Math.PI / 3 + 1e-15,
					`sample #${i} arg(w)=${argW} outside principal wedge`,
				);
			}
		});
	});
});
