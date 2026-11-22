import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summationFloatSeries } from './summationFloatSeries.js';

describe('summationFloatSeries', () => {
	describe('closed-form identity cross-checks', () => {
		it('matches Gauss arithmetic series n(n+1)/2', () => {
			for (const n of [0, 1, 2, 10, 100, 1000, 10000]) {
				const actual = summationFloatSeries((k) => k, 1, n);
				const expected = (n * (n + 1)) / 2;
				assert.strictEqual(actual, expected);
			}
		});

		it('matches general arithmetic progression sum_{k=a}^{b} (c + d*k)', () => {
			const a = -25;
			const b = 75;
			const c = 3.5;
			const d = -1.25;
			const actual = summationFloatSeries((k) => c + d * k, a, b);
			const count = b - a + 1;
			const expected = (count / 2) * (2 * c + d * (a + b));
			assert.ok(
				Math.abs(actual - expected) <= 1e-12,
				`Expected ${actual} to match ${expected}`,
			);
		});

		it('matches sum of squares n(n+1)(2n+1)/6', () => {
			for (const n of [1, 5, 25, 100, 500]) {
				const actual = summationFloatSeries((k) => k * k, 1, n);
				const expected = (n * (n + 1) * (2 * n + 1)) / 6;
				assert.strictEqual(actual, expected);
			}
		});

		it('matches sum of cubes [n(n+1)/2]^2 (Nicomachus theorem)', () => {
			for (const n of [1, 4, 20, 100]) {
				const actual = summationFloatSeries((k) => k * k * k, 1, n);
				const tri = (n * (n + 1)) / 2;
				assert.strictEqual(actual, tri * tri);
			}
		});

		it('matches geometric series (1 - r^(n+1)) / (1 - r)', () => {
			const cases = [
				{ r: 0.5, n: 40 },
				{ r: -0.5, n: 35 },
				{ r: 1 / 3, n: 30 },
				{ r: 0.9, n: 100 },
				{ r: 2, n: 20 },
				{ r: -2, n: 15 },
			];

			for (const { r, n } of cases) {
				const actual = summationFloatSeries((k) => r ** k, 0, n);
				const expected = (1 - r ** (n + 1)) / (1 - r);
				const tol = Math.max(1e-13, Math.abs(expected) * 1e-14);
				assert.ok(
					Math.abs(actual - expected) <= tol,
					`r=${r}, n=${n}: got ${actual}, expected ${expected}`,
				);
			}
		});

		it('matches telescoping series identities', () => {
			const n = 5000;

			// sum_{k=1}^{n} 1/(k*(k+1)) = n / (n + 1)
			const partialFractions = summationFloatSeries(
				(k) => 1 / (k * (k + 1)),
				1,
				n,
			);
			const expectedFrac = n / (n + 1);
			assert.ok(
				Math.abs(partialFractions - expectedFrac) <= 1e-14,
				`Expected ${partialFractions} ≈ ${expectedFrac}`,
			);

			// sum_{k=1}^{n} (1/k - 1/(k+1)) = 1 - 1/(n+1)
			const reciprocalDiff = summationFloatSeries(
				(k) => 1 / k - 1 / (k + 1),
				1,
				n,
			);
			assert.ok(
				Math.abs(reciprocalDiff - (1 - 1 / (n + 1))) <= 1e-14,
				`Expected ${reciprocalDiff} ≈ ${1 - 1 / (n + 1)}`,
			);

			// sum_{k=1}^{n} (sqrt(k+1) - sqrt(k)) = sqrt(n+1) - 1
			const radicalDiff = summationFloatSeries(
				(k) => Math.sqrt(k + 1) - Math.sqrt(k),
				1,
				n,
			);
			const expectedRadical = Math.sqrt(n + 1) - 1;
			assert.ok(
				Math.abs(radicalDiff - expectedRadical) <= 1e-12,
				`Expected ${radicalDiff} ≈ ${expectedRadical}`,
			);
		});

		it('converges toward pi^2 / 6 for the Basel series', () => {
			const n = 20000;
			const partial = summationFloatSeries((k) => 1 / (k * k), 1, n);
			const piSqOver6 = (Math.PI * Math.PI) / 6;
			// Tail bound: 1/(n+1) < sum_{k=n+1}^inf 1/k^2 < 1/n
			const diff = piSqOver6 - partial;
			assert.ok(diff > 1 / (n + 1) && diff < 1 / n);
		});
	});

	describe('algebraic properties', () => {
		it('satisfies linearity: sum(a*f + b*g) = a*sum(f) + b*sum(g)', () => {
			const f = (k) => Math.sin(k);
			const g = (k) => 1 / (k + 1);
			const a = 2.75;
			const b = -4.5;

			const combined = summationFloatSeries((k) => a * f(k) + b * g(k), 1, 200);
			const separate =
				a * summationFloatSeries(f, 1, 200) +
				b * summationFloatSeries(g, 1, 200);

			assert.ok(Math.abs(combined - separate) <= 1e-13);
		});

		it('satisfies interval splitting: sum_{a}^{c} = sum_{a}^{b} + sum_{b+1}^{c}', () => {
			const f = (k) => k / (k * k + 1);
			const whole = summationFloatSeries(f, -50, 150);
			const left = summationFloatSeries(f, -50, 37);
			const right = summationFloatSeries(f, 38, 150);
			assert.ok(Math.abs(whole - (left + right)) <= 1e-14);
		});

		it('satisfies index shifting: sum_{a}^{b} f(k) = sum_{a+s}^{b+s} f(j - s)', () => {
			const f = (k) => Math.cos(0.1 * k);
			const shift = 137;
			const original = summationFloatSeries(f, -20, 80);
			const shifted = summationFloatSeries(
				(j) => f(j - shift),
				-20 + shift,
				80 + shift,
			);
			assert.ok(Math.abs(original - shifted) <= 1e-14);
		});

		it('produces identical results for array mode and functional mode', () => {
			const values = Array.from({ length: 500 }, (_, i) =>
				Math.sin(i * 0.37) / (i + 1),
			);
			const fromArray = summationFloatSeries(values);
			const fromFn = summationFloatSeries((i) => values[i], 0, values.length - 1);
			assert.strictEqual(fromArray, fromFn);
		});
	});

	describe('Kahan-Babuška-Neumaier compensated accuracy', () => {
		it('handles Neumaier ill-conditioned cancellation [1, 1e100, 1, -1e100] === 2', () => {
			const terms = [1, 1e100, 1, -1e100];
			// Naive summation yields 0 here
			assert.strictEqual(
				terms.reduce((acc, x) => acc + x, 0),
				0,
			);
			assert.strictEqual(summationFloatSeries(terms), 2);
			assert.strictEqual(
				summationFloatSeries((i) => terms[i], 0, terms.length - 1),
				2,
			);
		});

		it('outperforms naive summation when adding 0.1 ten thousand times', () => {
			const n = 10000;
			let naive = 0;
			for (let i = 0; i < n; i += 1) {
				naive += 0.1;
			}
			const compensatedFn = summationFloatSeries(() => 0.1, 1, n);
			const compensatedArr = summationFloatSeries(Array(n).fill(0.1));

			const naiveError = Math.abs(naive - 1000);
			const compError = Math.abs(compensatedFn - 1000);

			assert.strictEqual(compensatedFn, compensatedArr);
			assert.ok(
				compError < naiveError,
				`Expected compensated error (${compError}) < naive error (${naiveError})`,
			);
			assert.ok(compError <= 1e-12, `Expected error <= 1e-12, got ${compError}`);
		});

		it('preserves small increments added to a large baseline', () => {
			const values = [1e12, ...Array(10000).fill(1e-4)];
			const actual = summationFloatSeries(values);
			assert.strictEqual(actual, 1e12 + 1);
		});
	});

	describe('edge cases and boundaries', () => {
		it('returns 0 when start > end without invoking termFn', () => {
			let called = false;
			const result = summationFloatSeries(
				() => {
					called = true;
					return 1;
				},
				5,
				4,
			);
			assert.strictEqual(result, 0);
			assert.strictEqual(called, false);
		});

		it('returns single term when start === end', () => {
			assert.strictEqual(summationFloatSeries((k) => k * k, 7, 7), 49);
			assert.strictEqual(summationFloatSeries((k) => k, -3, -3), -3);
		});

		it('handles negative bounds and symmetric cancellation', () => {
			assert.strictEqual(summationFloatSeries((k) => k, -5, -1), -15);
			assert.strictEqual(summationFloatSeries((k) => k, -50, 50), 0);
			assert.strictEqual(summationFloatSeries((k) => k * k * k, -10, 10), 0);
		});

		it('normalizes -0 results to +0', () => {
			assert.ok(Object.is(summationFloatSeries(() => -0, 1, 3), 0));
			assert.ok(Object.is(summationFloatSeries([-0, -0]), 0));
		});

		it('handles bounds at Number.MAX_SAFE_INTEGER and Number.MIN_SAFE_INTEGER without loop overflow', () => {
			const hi = Number.MAX_SAFE_INTEGER;
			assert.strictEqual(summationFloatSeries(() => 2, hi - 3, hi), 8);

			const lo = Number.MIN_SAFE_INTEGER;
			assert.strictEqual(summationFloatSeries(() => -1.5, lo, lo + 3), -6);
		});

		it('handles empty and single-element arrays', () => {
			assert.strictEqual(summationFloatSeries([]), 0);
			assert.strictEqual(summationFloatSeries([42.25]), 42.25);
			assert.strictEqual(summationFloatSeries([-7.5]), -7.5);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for invalid first argument', () => {
			for (const bad of [null, undefined, 42, 'sum', {}, new Set([1, 2])]) {
				assert.throws(() => summationFloatSeries(bad), TypeError);
			}
		});

		it('throws TypeError if extra arguments are passed with an array', () => {
			assert.throws(() => summationFloatSeries([1, 2, 3], 0, 2), TypeError);
			assert.throws(() => summationFloatSeries([1, 2, 3], 0), TypeError);
		});

		it('throws TypeError for non-number elements or sparse holes in arrays', () => {
			assert.throws(() => summationFloatSeries([1, '2', 3]), TypeError);
			assert.throws(() => summationFloatSeries([1, null]), TypeError);
			assert.throws(() => summationFloatSeries([undefined]), TypeError);
			// Sparse array
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3];
			assert.throws(() => summationFloatSeries(sparse), TypeError);
		});

		it('throws RangeError for non-finite elements in arrays', () => {
			assert.throws(() => summationFloatSeries([1, Number.NaN]), RangeError);
			assert.throws(
				() => summationFloatSeries([Number.POSITIVE_INFINITY]),
				RangeError,
			);
			assert.throws(
				() => summationFloatSeries([1, Number.NEGATIVE_INFINITY]),
				RangeError,
			);
		});

		it('throws TypeError for missing or non-number bounds', () => {
			assert.throws(() => summationFloatSeries((k) => k), TypeError);
			assert.throws(() => summationFloatSeries((k) => k, 1), TypeError);
			assert.throws(() => summationFloatSeries((k) => k, '1', 5), TypeError);
			assert.throws(() => summationFloatSeries((k) => k, 1, '5'), TypeError);
			assert.throws(() => summationFloatSeries((k) => k, null, 5), TypeError);
			assert.throws(() => summationFloatSeries((k) => k, 1n, 5), TypeError);
		});

		it('throws RangeError for non-finite, non-integer, or unsafe integer bounds', () => {
			assert.throws(
				() => summationFloatSeries((k) => k, Number.NaN, 5),
				RangeError,
			);
			assert.throws(
				() => summationFloatSeries((k) => k, 1, Number.POSITIVE_INFINITY),
				RangeError,
			);
			assert.throws(
				() => summationFloatSeries((k) => k, Number.NEGATIVE_INFINITY, 5),
				RangeError,
			);
			assert.throws(() => summationFloatSeries((k) => k, 1.5, 5), RangeError);
			assert.throws(() => summationFloatSeries((k) => k, 1, 5.25), RangeError);
			assert.throws(
				() =>
					summationFloatSeries(
						(k) => k,
						Number.MAX_SAFE_INTEGER,
						Number.MAX_SAFE_INTEGER + 1,
					),
				RangeError,
			);
			assert.throws(
				() =>
					summationFloatSeries(
						(k) => k,
						Number.MIN_SAFE_INTEGER - 1,
						Number.MIN_SAFE_INTEGER,
					),
				RangeError,
			);
			assert.throws(
				() => summationFloatSeries((k) => k, 0, 1e20),
				RangeError,
			);
		});

		it('throws TypeError or RangeError when termFn returns invalid values', () => {
			assert.throws(
				() => summationFloatSeries(() => 'not a number', 1, 3),
				TypeError,
			);
			assert.throws(
				() => summationFloatSeries(() => undefined, 1, 1),
				TypeError,
			);
			assert.throws(
				() => summationFloatSeries((k) => (k === 3 ? Number.NaN : k), 1, 5),
				RangeError,
			);
			assert.throws(
				() =>
					summationFloatSeries(
						(k) => (k === 2 ? Number.POSITIVE_INFINITY : k),
						1,
						5,
					),
				RangeError,
			);
			assert.throws(
				() => summationFloatSeries(() => Number.NEGATIVE_INFINITY, 0, 0),
				RangeError,
			);
		});

		it('throws RangeError when running sum overflows finite float64 range', () => {
			assert.throws(
				() => summationFloatSeries([Number.MAX_VALUE, Number.MAX_VALUE]),
				RangeError,
			);
			assert.throws(
				() => summationFloatSeries(() => -Number.MAX_VALUE, 1, 2),
				RangeError,
			);
		});
	});
});
