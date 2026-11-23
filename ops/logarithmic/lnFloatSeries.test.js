import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { lnFloatSeries } from './lnFloatSeries.js';

/**
 * Compute the ULP (unit in the last place) distance between two finite float64
 * numbers `a` and `b`.
 *
 * @param {number} a
 * @param {number} b
 * @returns {bigint}
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) {
		return 0n;
	}
	const buf = new ArrayBuffer(8);
	const f64 = new Float64Array(buf);
	const i64 = new BigInt64Array(buf);

	const toOrdered = (v) => {
		f64[0] = v;
		const bits = i64[0];
		return bits < 0n ? (-0x8000000000000000n - bits) : bits;
	};

	const diff = toOrdered(a) - toOrdered(b);
	return diff < 0n ? -diff : diff;
}

/**
 * Independent composite Simpson's rule integration of `1 / t` on `[1, x]`,
 * approximating `ln(x)` without using `Math.log` or `Math.exp`.
 *
 * @param {number} x - Positive finite upper limit.
 * @param {number} steps - Even number of subintervals.
 * @returns {number}
 */
function simpsonLn(x, steps = 2000) {
	const h = (x - 1) / steps;
	let sum = 1 + 1 / x;
	for (let i = 1; i < steps; i += 1) {
		const t = 1 + i * h;
		sum += (i % 2 === 0 ? 2 : 4) / t;
	}
	return (h / 3) * sum;
}

describe('lnFloatSeries', () => {
	describe('normal cases', () => {
		it('computes exact +0 for ln(1)', () => {
			const result = lnFloatSeries(1);
			assert.equal(Object.is(result, 0), true);
		});

		it('computes known mathematical constants accurately', () => {
			assert.ok(ulpDistance(lnFloatSeries(Math.E), 1) <= 1n);
			assert.ok(ulpDistance(lnFloatSeries(2), Math.LN2) <= 1n);
			assert.ok(ulpDistance(lnFloatSeries(10), Math.LN10) <= 1n);
			assert.ok(ulpDistance(lnFloatSeries(0.5), -Math.LN2) <= 1n);
			assert.ok(ulpDistance(lnFloatSeries(Math.SQRT2), 0.5 * Math.LN2) <= 2n);
			assert.ok(ulpDistance(lnFloatSeries(Math.SQRT1_2), -0.5 * Math.LN2) <= 2n);
		});

		it('computes accurate values across typical positive magnitudes', () => {
			const samples = [
				1e-100, 1e-10, 1e-5, 0.001, 0.1, 0.25, 0.7, 0.7071, 0.7072,
				0.99, 1.01, 1.4142, 1.4143, 1.5, Math.PI, 7.5, 42, 1000, 1e10, 1e100,
			];
			for (const x of samples) {
				const actual = lnFloatSeries(x);
				const expected = Math.log(x);
				assert.ok(
					ulpDistance(actual, expected) <= 2n,
					`Expected lnFloatSeries(${x}) = ${actual} within 2 ULP of ${expected}`,
				);
			}
		});
	});

	describe('edge cases', () => {
		it('handles IEEE-754 special values', () => {
			assert.equal(lnFloatSeries(0), -Infinity);
			assert.equal(lnFloatSeries(-0), -Infinity);
			assert.equal(lnFloatSeries(Infinity), Infinity);
			assert.equal(Number.isNaN(lnFloatSeries(-Infinity)), true);
			assert.equal(Number.isNaN(lnFloatSeries(Number.NaN)), true);
		});

		it('returns NaN for negative finite numbers', () => {
			for (const x of [-Number.MIN_VALUE, -1e-15, -0.5, -1, -Math.E, -1e100, -Number.MAX_VALUE]) {
				assert.equal(Number.isNaN(lnFloatSeries(x)), true, `Expected NaN for ${x}`);
			}
		});

		it('handles extreme IEEE-754 float64 values and subnormals', () => {
			const extremes = [
				Number.MIN_VALUE,
				Number.MIN_VALUE * 2,
				Number.MIN_VALUE * 1234567,
				2 ** -1074,
				2 ** -1050,
				2 ** -1023,
				2 ** -1022,
				(2 ** -1022) * (1 - Number.EPSILON / 2), // largest subnormal
				Number.MAX_VALUE,
				Number.MAX_VALUE / 2,
				2 ** 1023,
			];
			for (const x of extremes) {
				const actual = lnFloatSeries(x);
				const expected = Math.log(x);
				assert.ok(
					ulpDistance(actual, expected) <= 2n,
					`Expected lnFloatSeries(${x}) = ${actual} within 2 ULP of ${expected}`,
				);
			}
		});

		it('preserves high relative accuracy very close to 1', () => {
			const nearOne = [
				1 + Number.EPSILON,
				1 - Number.EPSILON / 2,
				1 + 1e-15,
				1 - 1e-15,
				1 + 1e-12,
				1 - 1e-12,
				1 + 1e-8,
				1 - 1e-8,
				1 + 1e-4,
				1 - 1e-4,
			];
			for (const x of nearOne) {
				const actual = lnFloatSeries(x);
				const expected = Math.log(x);
				assert.ok(
					ulpDistance(actual, expected) <= 2n,
					`Expected lnFloatSeries(${x}) = ${actual} within 2 ULP of ${expected}`,
				);
			}
		});

		it('handles every exact power of two across the entire float64 range', () => {
			for (let k = -1074; k <= 1023; k += 1) {
				const x = 2 ** k;
				const actual = lnFloatSeries(x);
				const expected = Math.log(x);
				assert.ok(
					ulpDistance(actual, expected) <= 2n,
					`Expected lnFloatSeries(2^${k}) = ${actual} within 2 ULP of ${expected}`,
				);
			}
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError for non-number arguments and missing input', () => {
			assert.throws(() => lnFloatSeries(), TypeError);
			const invalid = [
				undefined,
				null,
				'1',
				'2.718',
				'',
				true,
				false,
				1n,
				0n,
				{},
				[],
				[1],
				Symbol('ln'),
				() => 1,
			];
			for (const bad of invalid) {
				assert.throws(
					() => lnFloatSeries(bad),
					TypeError,
					`Expected TypeError for input ${String(bad)}`,
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('agrees with Simpson numerical integration of 1/t from 1 to x', () => {
			const targets = [0.25, 0.5, 0.75, 1.5, 2, 3, 5, 10];
			for (const x of targets) {
				const seriesVal = lnFloatSeries(x);
				const integralVal = simpsonLn(x, 4000);
				assert.ok(
					Math.abs(seriesVal - integralVal) < 1e-11,
					`lnFloatSeries(${x})=${seriesVal} vs Simpson=${integralVal}`,
				);
			}
		});

		it('satisfies algebraic logarithm identities', () => {
			const pairs = [
				[2, 3],
				[0.125, 7.25],
				[1.23456789, 9876.54321],
				[1e-50, 1e80],
			];
			for (const [a, b] of pairs) {
				// Product rule: ln(a * b) = ln(a) + ln(b)
				const prodDiff = Math.abs(lnFloatSeries(a * b) - (lnFloatSeries(a) + lnFloatSeries(b)));
				const prodScale = Math.max(1, Math.abs(lnFloatSeries(a)) + Math.abs(lnFloatSeries(b)));
				assert.ok(prodDiff <= 1e-14 * prodScale, `Product rule failed for (${a}, ${b})`);

				// Quotient rule: ln(a / b) = ln(a) - ln(b)
				const quotDiff = Math.abs(lnFloatSeries(a / b) - (lnFloatSeries(a) - lnFloatSeries(b)));
				assert.ok(quotDiff <= 1e-14 * prodScale, `Quotient rule failed for (${a}, ${b})`);

				// Reciprocal rule: ln(1 / a) = -ln(a)
				const recipDiff = Math.abs(lnFloatSeries(1 / a) + lnFloatSeries(a));
				assert.ok(recipDiff <= 1e-14 * Math.max(1, Math.abs(lnFloatSeries(a))), `Reciprocal rule failed for ${a}`);
			}

			// Power rule: ln(x^n) = n * ln(x)
			for (const x of [0.3, 1.7, 5.2]) {
				for (const n of [2, 3, 5, -2, 0.5]) {
					const lhs = lnFloatSeries(x ** n);
					const rhs = n * lnFloatSeries(x);
					assert.ok(
						Math.abs(lhs - rhs) <= 1e-13 * Math.max(1, Math.abs(rhs)),
						`Power rule failed for ${x}^${n}`,
					);
				}
			}
		});

		it('inverts Math.exp and is strictly monotonic', () => {
			const ys = [-500, -50, -2.5, -1e-6, 0, 1e-6, 1, 2.5, 50, 500];
			let prev = -Infinity;
			for (const y of ys) {
				const x = Math.exp(y);
				const recovered = lnFloatSeries(x);
				assert.ok(
					Math.abs(recovered - y) <= 1e-14 * Math.max(1, Math.abs(y)),
					`ln(exp(${y})) = ${recovered}`,
				);
				assert.ok(recovered > prev, `Monotonicity failed at y=${y}`);
				prev = recovered;
			}
		});

		it('matches Math.log within 2 ULP across a dense deterministic sweep', () => {
			// Deterministic LCG sweep over exponents [-1074, 1023] and mantissas in [1, 2).
			let state = 0x12345678;
			const nextRand = () => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
				return state / 0x100000000;
			};

			let maxUlp = 0n;
			for (let i = 0; i < 2000; i += 1) {
				const exp = Math.floor(nextRand() * 2097) - 1074;
				const mantissa = 1 + nextRand();
				const x = mantissa * (2 ** exp);
				if (x <= 0 || !Number.isFinite(x)) {
					continue;
				}
				const d = ulpDistance(lnFloatSeries(x), Math.log(x));
				if (d > maxUlp) {
					maxUlp = d;
				}
			}
			assert.ok(maxUlp <= 2n, `Max ULP distance in sweep was ${maxUlp}, expected <= 2`);
		});
	});
});
