import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dotProductFloatSeries } from './dotProductFloatSeries.js';

function naiveDot(a, b) {
	let sum = 0;
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i];
	}
	return sum;
}

function normSquared(v) {
	return dotProductFloatSeries(v, v);
}

describe('dotProductFloatSeries', () => {
	describe('basic and edge cases', () => {
		it('returns +0 for empty arrays', () => {
			const res = dotProductFloatSeries([], []);
			assert.ok(Object.is(res, 0));
		});

		it('computes single-element dot products', () => {
			assert.equal(dotProductFloatSeries([3], [4]), 12);
			assert.equal(dotProductFloatSeries([-2.5], [4]), -10);
			assert.ok(Object.is(dotProductFloatSeries([0], [-1]), 0));
		});

		it('computes standard multi-dimensional dot products', () => {
			assert.equal(dotProductFloatSeries([1, 2, 3], [4, 5, 6]), 32);
			assert.equal(dotProductFloatSeries([-1, 0, 2.5, -4], [3, 100, -2, -0.5]), -6);
		});

		it('returns 0 for orthogonal vectors and zero vectors', () => {
			assert.equal(dotProductFloatSeries([1, 0, -1], [1, 5, 1]), 0);
			assert.equal(dotProductFloatSeries([0, 0, 0], [7, -8, 9]), 0);
			assert.equal(dotProductFloatSeries([3, -4], [4, 3]), 0);
		});

		it('handles extreme magnitudes near float64 overflow/subnormal boundaries', () => {
			assert.equal(dotProductFloatSeries([2 ** 1010, 2 ** -1010], [2 ** -1010, 2 ** 1010]), 2);
			// Rescaling preserves TwoProd residual even when |x| > 2^996 (above Veltkamp split limit)
			const eps = 2 ** -27;
			const big = 2 ** 1005;
			const small = 2 ** -1005;
			assert.equal(
				dotProductFloatSeries([big * (1 + eps), 1], [small * (1 - eps), -1]),
				-(2 ** -54)
			);
			const sub = Number.MIN_VALUE;
			const scale = 2 ** 100;
			assert.equal(dotProductFloatSeries([sub, -sub], [scale, scale]), 0);
			assert.equal(dotProductFloatSeries([sub], [scale]), sub * scale);
		});
	});

	describe('compensated precision under catastrophic cancellation', () => {
		it('recovers small terms lost in naive summation', () => {
			const a = [1e16, 1, -1e16];
			const b = [1, 1, 1];
			assert.equal(naiveDot(a, b), 0); // Naive fails due to absorption
			assert.equal(dotProductFloatSeries(a, b), 1);
		});

		it('handles multi-scale cancellation spanning 32 orders of magnitude', () => {
			const a = [1e16, 1, -1e16, 1e-16, -1];
			const b = [1, 1, 1, 1, 1];
			assert.equal(dotProductFloatSeries(a, b), 1e-16);
		});

		it('preserves product rounding residuals via Dekker TwoProd', () => {
			// (1 + 2^-27) * (1 - 2^-27) = 1 - 2^-54, which rounds to 1 in float64
			const eps = 2 ** -27;
			const a = [1 + eps, 1];
			const b = [1 - eps, -1];
			assert.equal(naiveDot(a, b), 0); // Naive loses the -2^-54 residual completely
			assert.equal(dotProductFloatSeries(a, b), -(2 ** -54));
		});

		it('accurately evaluates a long ill-conditioned cancelling series', () => {
			const n = 1000;
			const a = [1e16];
			const b = [1];
			for (let i = 0; i < n; i++) {
				a.push(0.1);
				b.push(1);
			}
			a.push(-1e16);
			b.push(1);

			const result = dotProductFloatSeries(a, b);
			assert.ok(Math.abs(result - 100) < 1e-12, `Expected ~100, got ${result}`);
		});
	});

	describe('cross-checks against independent identities and naive sum', () => {
		it('matches the polarization identity 0.25 * (||a + b||^2 - ||a - b||^2)', () => {
			const pairs = [
				[[1, 2, 3, 4], [5, -6, 7, -8]],
				[[0.1, 0.2, 0.3, 0.4, 0.5], [1.5, -2.5, 3.5, -4.5, 5.5]],
				[[-3.25, 7.125, 0.5, -1.75], [2.5, 4.25, -8.125, 3.0]],
				[[12.34, -56.78, 90.12], [-0.45, 67.89, -12.34]],
			];

			for (const [a, b] of pairs) {
				const sumVec = a.map((v, i) => v + b[i]);
				const diffVec = a.map((v, i) => v - b[i]);
				const polarization = 0.25 * (normSquared(sumVec) - normSquared(diffVec));
				const dot = dotProductFloatSeries(a, b);
				const naive = naiveDot(a, b);

				assert.ok(
					Math.abs(dot - polarization) <= 1e-11 * Math.max(1, Math.abs(dot)),
					`Polarization mismatch: dot=${dot}, polarization=${polarization}`
				);
				assert.ok(
					Math.abs(dot - naive) <= 1e-12 * Math.max(1, Math.abs(dot)),
					`Naive mismatch: dot=${dot}, naive=${naive}`
				);
			}
		});

		it('satisfies symmetry, bilinearity, and Cauchy-Schwarz inequality', () => {
			const a = [1.2, -3.4, 5.6, -7.8, 9.1];
			const b = [-2.3, 4.5, -6.7, 8.9, -1.1];
			const c = [0.5, 1.5, -2.5, 3.5, -4.5];
			const alpha = 2.75;
			const beta = -1.25;

			// Symmetry
			assert.equal(dotProductFloatSeries(a, b), dotProductFloatSeries(b, a));

			// Bilinearity
			const linearComb = a.map((v, i) => alpha * v + beta * b[i]);
			const lhs = dotProductFloatSeries(linearComb, c);
			const rhs = alpha * dotProductFloatSeries(a, c) + beta * dotProductFloatSeries(b, c);
			assert.ok(Math.abs(lhs - rhs) <= 1e-12 * Math.max(1, Math.abs(rhs)));

			// Cauchy-Schwarz: |a . b| <= ||a|| * ||b||
			const ab = Math.abs(dotProductFloatSeries(a, b));
			const bound = Math.sqrt(normSquared(a)) * Math.sqrt(normSquared(b));
			assert.ok(ab <= bound + 1e-15);
		});

		it('matches closed-form sum of squares and geometric series', () => {
			const n = 200;
			const seq = Array.from({ length: n }, (_, i) => i + 1);
			const expectedSquares = (n * (n + 1) * (2 * n + 1)) / 6;
			assert.equal(dotProductFloatSeries(seq, seq), expectedSquares);

			const r = 0.5;
			const m = 40;
			const geom = Array.from({ length: m }, (_, k) => r ** k);
			const expectedGeom = (1 - r ** (2 * m)) / (1 - r * r);
			const actualGeom = dotProductFloatSeries(geom, geom);
			assert.ok(Math.abs(actualGeom - expectedGeom) <= 1e-15);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array arguments', () => {
			assert.throws(() => dotProductFloatSeries(null, []), TypeError);
			assert.throws(() => dotProductFloatSeries([], undefined), TypeError);
			assert.throws(() => dotProductFloatSeries(123, [1]), TypeError);
			assert.throws(() => dotProductFloatSeries('123', [1, 2, 3]), TypeError);
			assert.throws(() => dotProductFloatSeries({}, {}), TypeError);
			assert.throws(() => dotProductFloatSeries(new Float64Array([1]), [1]), TypeError);
		});

		it('throws RangeError for mismatched vector lengths', () => {
			assert.throws(() => dotProductFloatSeries([1, 2], [1]), RangeError);
			assert.throws(() => dotProductFloatSeries([], [0]), RangeError);
			assert.throws(() => dotProductFloatSeries([1], [1, 2, 3]), RangeError);
		});

		it('throws TypeError for non-number elements or sparse array holes', () => {
			assert.throws(() => dotProductFloatSeries(['1'], [1]), TypeError);
			assert.throws(() => dotProductFloatSeries([1], [null]), TypeError);
			assert.throws(() => dotProductFloatSeries([1, undefined], [1, 2]), TypeError);
			assert.throws(() => dotProductFloatSeries([true], [1]), TypeError);
			assert.throws(() => dotProductFloatSeries([1n], [1]), TypeError);
			// Sparse array with hole
			const sparse = new Array(2);
			sparse[0] = 1;
			assert.throws(() => dotProductFloatSeries(sparse, [1, 2]), TypeError);
		});

		it('throws RangeError for NaN and non-finite elements', () => {
			assert.throws(() => dotProductFloatSeries([NaN], [1]), RangeError);
			assert.throws(() => dotProductFloatSeries([1], [NaN]), RangeError);
			assert.throws(() => dotProductFloatSeries([Infinity], [1]), RangeError);
			assert.throws(() => dotProductFloatSeries([1], [-Infinity]), RangeError);
		});
	});
});
