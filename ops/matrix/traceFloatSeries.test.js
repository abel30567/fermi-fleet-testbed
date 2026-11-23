import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceFloatSeries } from './traceFloatSeries.js';

/**
 * Helper: transpose an m x n matrix.
 * @param {number[][]} m
 * @returns {number[][]}
 */
function transpose(m) {
	const rows = m.length;
	const cols = m[0].length;
	const out = Array.from({ length: cols }, () => new Array(rows));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j][i] = m[i][j];
		}
	}
	return out;
}

/**
 * Helper: multiply matrices A (m x k) and B (k x n).
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function matMul(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const C = Array.from({ length: m }, () => new Array(n).fill(0));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let s = 0;
			for (let p = 0; p < k; p++) {
				s += A[i][p] * B[p][j];
			}
			C[i][j] = s;
		}
	}
	return C;
}

/**
 * Helper: linear combination a*A + b*B of same-dimension matrices.
 * @param {number} a
 * @param {number[][]} A
 * @param {number} b
 * @param {number[][]} B
 * @returns {number[][]}
 */
function linearCombo(a, A, b, B) {
	return A.map((row, i) => row.map((v, j) => a * v + b * B[i][j]));
}

describe('traceFloatSeries', () => {
	describe('normal cases', () => {
		it('computes trace of 1x1 matrices', () => {
			assert.equal(traceFloatSeries([[42]]), 42);
			assert.equal(traceFloatSeries([[-3.5]]), -3.5);
			assert.equal(traceFloatSeries([[0]]), 0);
			assert.ok(Object.is(traceFloatSeries([[-0]]), 0));
		});

		it('computes trace of 2x2 matrices', () => {
			assert.equal(
				traceFloatSeries([
					[1, 2],
					[3, 4],
				]),
				5
			);
		});

		it('computes trace of 3x3 matrices', () => {
			assert.equal(
				traceFloatSeries([
					[2, -1, 0],
					[4, 5, 6],
					[7, 8, -3],
				]),
				4
			);
		});

		it('computes trace of identity matrices equal to dimension n', () => {
			for (const n of [1, 2, 4, 8]) {
				const I = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
				);
				assert.equal(traceFloatSeries(I), n);
			}
		});

		it('computes trace of zero matrices as 0', () => {
			const Z = [
				[0, 0, 0],
				[0, 0, 0],
				[0, 0, 0],
			];
			assert.equal(traceFloatSeries(Z), 0);
		});

		it('computes trace with negative and fractional values', () => {
			const M = [
				[-1.25, 99.9, -42.1],
				[12.3, 0.5, 8.8],
				[-7.7, 3.3, -2.75],
			];
			assert.equal(traceFloatSeries(M), -3.5);
		});

		it('preserves precision via Neumaier compensated summation under cancellation', () => {
			// Classic Neumaier test case: naive and standard Kahan summation yield 0,
			// while Neumaier summation yields 2.
			const diag = [1, 1e100, 1, -1e100];
			const M = diag.map((d, i) => diag.map((_, j) => (i === j ? d : 0)));
			assert.equal(traceFloatSeries(M), 2);
		});

		it('reduces drift when summing many small fractional diagonal entries', () => {
			const n = 1000;
			const M = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => (i === j ? 0.1 : 0))
			);
			const tr = traceFloatSeries(M);
			assert.ok(Math.abs(tr - 100) < 1e-13, `expected ~100, got ${tr}`);
		});
	});

	describe('edge cases and input validation', () => {
		it('rejects non-array inputs', () => {
			for (const bad of [null, undefined, 123, '[[1]]', {}, () => {}]) {
				assert.throws(() => traceFloatSeries(bad), TypeError);
			}
		});

		it('rejects empty matrices', () => {
			assert.throws(() => traceFloatSeries([]), RangeError);
			assert.throws(() => traceFloatSeries([[]]), RangeError);
		});

		it('rejects non-square matrices', () => {
			assert.throws(
				() =>
					traceFloatSeries([
						[1, 2, 3],
						[4, 5, 6],
					]),
				RangeError
			);
			assert.throws(
				() =>
					traceFloatSeries([
						[1, 2],
						[3, 4],
						[5, 6],
					]),
				RangeError
			);
			assert.throws(() => traceFloatSeries([[1, 2]]), RangeError);
		});

		it('rejects ragged matrices and non-array rows', () => {
			assert.throws(
				() =>
					traceFloatSeries([
						[1, 2],
						[3],
					]),
				RangeError
			);
			assert.throws(
				() =>
					traceFloatSeries([
						[1, 2],
						[3, 4, 5],
					]),
				RangeError
			);
			assert.throws(() => traceFloatSeries([[1, 2], 'bad']), TypeError);
		});

		it('rejects NaN and Infinity on or off the diagonal', () => {
			assert.throws(() => traceFloatSeries([[NaN]]), RangeError);
			assert.throws(() => traceFloatSeries([[Infinity]]), RangeError);
			assert.throws(() => traceFloatSeries([[-Infinity]]), RangeError);
			assert.throws(
				() =>
					traceFloatSeries([
						[1, NaN],
						[0, 2],
					]),
				RangeError
			);
			assert.throws(
				() =>
					traceFloatSeries([
						[1, 0],
						[Infinity, 2],
					]),
				RangeError
			);
		});

		it('rejects non-number matrix elements', () => {
			assert.throws(() => traceFloatSeries([['1']]), TypeError);
			assert.throws(
				() =>
					traceFloatSeries([
						[1, null],
						[0, 2],
					]),
				TypeError
			);
			assert.throws(() => traceFloatSeries([[1n]]), TypeError);
			assert.throws(() => traceFloatSeries([[true]]), TypeError);
		});
	});

	describe('mathematical cross-checks', () => {
		const A = [
			[1.5, -2.25, 3.75],
			[4.125, -5.5, 6.25],
			[-7.5, 8.25, 9.125],
		];
		const B = [
			[-0.5, 1.25, -2.5],
			[3.5, 4.75, -1.25],
			[2.25, -3.5, 0.75],
		];

		it('satisfies linearity: tr(aA + bB) = a*tr(A) + b*tr(B)', () => {
			const a = 2.5;
			const b = -1.75;
			const lhs = traceFloatSeries(linearCombo(a, A, b, B));
			const rhs = a * traceFloatSeries(A) + b * traceFloatSeries(B);
			assert.ok(Math.abs(lhs - rhs) < 1e-12, `lhs=${lhs}, rhs=${rhs}`);
		});

		it('satisfies transpose invariance: tr(A^T) = tr(A)', () => {
			assert.equal(traceFloatSeries(transpose(A)), traceFloatSeries(A));
			assert.equal(traceFloatSeries(transpose(B)), traceFloatSeries(B));
		});

		it('satisfies cyclic property: tr(AB) = tr(BA) for square and rectangular factors', () => {
			// Square 3x3
			const trAB = traceFloatSeries(matMul(A, B));
			const trBA = traceFloatSeries(matMul(B, A));
			assert.ok(Math.abs(trAB - trBA) < 1e-12, `tr(AB)=${trAB}, tr(BA)=${trBA}`);

			// Rectangular: P is 2x3, Q is 3x2 => PQ is 2x2, QP is 3x3
			const P = [
				[1.2, -3.4, 5.6],
				[-2.1, 4.3, -6.5],
			];
			const Q = [
				[0.5, -1.5],
				[2.5, 3.5],
				[-4.5, 1.25],
			];
			const trPQ = traceFloatSeries(matMul(P, Q));
			const trQP = traceFloatSeries(matMul(Q, P));
			assert.ok(Math.abs(trPQ - trQP) < 1e-12, `tr(PQ)=${trPQ}, tr(QP)=${trQP}`);
		});
	});
});
