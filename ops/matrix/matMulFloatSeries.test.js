import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulFloatSeries } from './matMulFloatSeries.js';

/**
 * Helper to transpose a rectangular 2D matrix.
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
 * Helper to compute the determinant of a 2x2 matrix.
 * @param {number[][]} m
 * @returns {number}
 */
function det2x2(m) {
	return m[0][0] * m[1][1] - m[0][1] * m[1][0];
}

/**
 * Helper to assert two matrices are element-wise close within tolerance.
 * @param {number[][]} actual
 * @param {number[][]} expected
 * @param {number} [eps=1e-12]
 */
function assertMatrixClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length, 'Row count mismatch');
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `Column count mismatch at row ${i}`);
		for (let j = 0; j < expected[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j]);
			const scale = Math.max(1, Math.abs(expected[i][j]));
			assert.ok(
				diff <= eps * scale,
				`Entry [${i}][${j}] mismatch: got ${actual[i][j]}, expected ${expected[i][j]} (diff=${diff})`
			);
		}
	}
}

describe('matMulFloatSeries', () => {
	describe('normal cases', () => {
		it('multiplies 1x1 matrices', () => {
			assert.deepStrictEqual(matMulFloatSeries([[3.5]], [[-2]]), [[-7]]);
			assert.deepStrictEqual(matMulFloatSeries([[0]], [[-5]]), [[0]]);
		});

		it('multiplies square matrices (2x2 and 3x3)', () => {
			const a2 = [
				[1, 2],
				[3, 4],
			];
			const b2 = [
				[5, 6],
				[7, 8],
			];
			assert.deepStrictEqual(matMulFloatSeries(a2, b2), [
				[19, 22],
				[43, 50],
			]);

			const a3 = [
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			];
			const b3 = [
				[9, 8, 7],
				[6, 5, 4],
				[3, 2, 1],
			];
			assert.deepStrictEqual(matMulFloatSeries(a3, b3), [
				[30, 24, 18],
				[84, 69, 54],
				[138, 114, 90],
			]);
		});

		it('multiplies rectangular matrices (2x3 by 3x4, row by col, col by row)', () => {
			const a = [
				[1, -2, 3],
				[4, 0, -1],
			];
			const b = [
				[2, 1, 0, -1],
				[-3, 2, 4, 1],
				[5, -1, 2, 3],
			];
			assert.deepStrictEqual(matMulFloatSeries(a, b), [
				[23, -6, -2, 6],
				[3, 5, -2, -7],
			]);

			// 1x3 times 3x1 -> 1x1 scalar inner product
			assert.deepStrictEqual(
				matMulFloatSeries([[1, 2, 3]], [[4], [5], [6]]),
				[[32]]
			);

			// 3x1 times 1x3 -> 3x3 outer product
			assert.deepStrictEqual(
				matMulFloatSeries([[2], [-1], [3]], [[4, 5, -2]]),
				[
					[8, 10, -4],
					[-4, -5, 2],
					[12, 15, -6],
				]
			);
		});

		it('preserves matrices under identity multiplication (AI = A and IA = A)', () => {
			const a = [
				[1.25, -3.5, 7.125],
				[0.5, 4.0, -2.75],
			];
			const i2 = [
				[1, 0],
				[0, 1],
			];
			const i3 = [
				[1, 0, 0],
				[0, 1, 0],
				[0, 0, 1],
			];
			assert.deepStrictEqual(matMulFloatSeries(i2, a), a);
			assert.deepStrictEqual(matMulFloatSeries(a, i3), a);
		});

		it('produces zero matrices when multiplied by zero matrices', () => {
			const a = [
				[1.5, -2.5, 3.5],
				[-4.5, 5.5, -6.5],
			];
			const z3x2 = [
				[0, 0],
				[0, 0],
				[0, 0],
			];
			const z2x2 = [
				[0, 0],
				[0, 0],
			];
			assert.deepStrictEqual(matMulFloatSeries(a, z3x2), z2x2);
			assert.deepStrictEqual(matMulFloatSeries(z2x2, a), [
				[0, 0, 0],
				[0, 0, 0],
			]);
		});

		it('does not mutate input matrices', () => {
			const a = [
				[1, 2],
				[3, 4],
			];
			const b = [
				[5, 6],
				[7, 8],
			];
			const aCopy = structuredClone(a);
			const bCopy = structuredClone(b);
			matMulFloatSeries(a, b);
			assert.deepStrictEqual(a, aCopy);
			assert.deepStrictEqual(b, bCopy);
		});
	});

	describe('compensated summation accuracy', () => {
		it('avoids catastrophic cancellation in inner products', () => {
			// Naive left-to-right float64 summation yields (1e16 + 1 + 1 + 1) - 1e16 = 0
			const a = [[1e16, 1, 1, 1, -1e16]];
			const b = [[1], [1], [1], [1], [1]];
			assert.deepStrictEqual(matMulFloatSeries(a, b), [[3]]);
		});

		it('preserves product rounding residuals via TwoProd + TwoSum', () => {
			// (1 + 2^-27)^2 - (1 + 2^-26) = 2^-54 exactly, which naive dot product drops to 0
			const eps = 2 ** -27;
			const a = [[1 + eps, -1]];
			const b = [[1 + eps], [1 + 2 * eps]];
			const [[val]] = matMulFloatSeries(a, b);
			assert.equal(val, 2 ** -54);
		});
	});

	describe('edge cases and input validation', () => {
		it('rejects non-array inputs and non-array rows', () => {
			assert.throws(() => matMulFloatSeries(null, [[1]]), TypeError);
			assert.throws(() => matMulFloatSeries([[1]], undefined), TypeError);
			assert.throws(() => matMulFloatSeries('[[1]]', [[1]]), TypeError);
			assert.throws(() => matMulFloatSeries([1, 2], [[1], [2]]), TypeError);
			assert.throws(() => matMulFloatSeries([[1, 2]], [1, 2]), TypeError);
		});

		it('rejects empty matrices', () => {
			assert.throws(() => matMulFloatSeries([], [[1]]), RangeError);
			assert.throws(() => matMulFloatSeries([[1]], []), RangeError);
			assert.throws(() => matMulFloatSeries([[]], [[1]]), RangeError);
			assert.throws(() => matMulFloatSeries([[1]], [[]]), RangeError);
			assert.throws(() => matMulFloatSeries([[], []], [[1]]), RangeError);
		});

		it('rejects ragged matrices', () => {
			assert.throws(
				() => matMulFloatSeries([[1, 2], [3]], [[1], [2]]),
				RangeError
			);
			assert.throws(
				() => matMulFloatSeries([[1, 2]], [[1, 2], [3]]),
				RangeError
			);
		});

		it('rejects incompatible inner dimensions', () => {
			assert.throws(
				() => matMulFloatSeries([[1, 2, 3]], [[1, 2], [3, 4]]),
				RangeError
			);
			assert.throws(
				() => matMulFloatSeries([[1], [2]], [[1], [2]]),
				RangeError
			);
		});

		it('rejects NaN, Infinity, -Infinity, and non-numeric entries', () => {
			assert.throws(() => matMulFloatSeries([[NaN]], [[1]]), TypeError);
			assert.throws(() => matMulFloatSeries([[1]], [[NaN]]), TypeError);
			assert.throws(() => matMulFloatSeries([[Infinity]], [[1]]), TypeError);
			assert.throws(() => matMulFloatSeries([[1]], [[-Infinity]]), TypeError);
			assert.throws(() => matMulFloatSeries([['1']], [[1]]), TypeError);
			assert.throws(() => matMulFloatSeries([[1]], [[1n]]), TypeError);
		});
	});

	describe('algebraic cross-checks', () => {
		it('satisfies associativity: (A * B) * C === A * (B * C)', () => {
			const a = [
				[1.2, -0.7, 3.4],
				[-2.1, 4.5, 0.3],
			];
			const b = [
				[0.5, -1.2, 2.3, 0.8],
				[3.1, 0.4, -0.9, 1.7],
				[-1.5, 2.2, 1.1, -0.6],
			];
			const c = [
				[2.0, -1.1],
				[0.3, 1.9],
				[-0.8, 0.4],
				[1.5, -2.3],
			];

			const left = matMulFloatSeries(matMulFloatSeries(a, b), c);
			const right = matMulFloatSeries(a, matMulFloatSeries(b, c));
			assertMatrixClose(left, right, 1e-13);
		});

		it('satisfies transpose identity: (A * B)^T === B^T * A^T', () => {
			const a = [
				[1.5, -2.25, 3.75, 0.5],
				[-0.25, 4.125, -1.5, 2.0],
				[3.0, 0.75, -2.5, 1.25],
			];
			const b = [
				[2.5, -1.0],
				[0.5, 3.25],
				[-1.75, 0.25],
				[4.0, -2.5],
			];

			const lhs = transpose(matMulFloatSeries(a, b));
			const rhs = matMulFloatSeries(transpose(b), transpose(a));
			assertMatrixClose(lhs, rhs, 1e-14);
		});

		it('satisfies multiplicativity of determinant for 2x2 matrices: det(A * B) === det(A) * det(B)', () => {
			const pairs = [
				[
					[
						[3.5, -1.25],
						[2.75, 4.5],
					],
					[
						[-2.1, 5.3],
						[1.4, -3.7],
					],
				],
				[
					[
						[0.1, 0.2],
						[0.3, 0.7],
					],
					[
						[1.3, -2.9],
						[4.1, 0.6],
					],
				],
			];

			for (const [a, b] of pairs) {
				const ab = matMulFloatSeries(a, b);
				const lhs = det2x2(ab);
				const rhs = det2x2(a) * det2x2(b);
				assert.ok(
					Math.abs(lhs - rhs) <= 1e-13 * Math.max(1, Math.abs(rhs)),
					`det(AB)=${lhs} vs det(A)det(B)=${rhs}`
				);
			}
		});

		it('satisfies distributivity: A * (B + C) === A * B + A * C', () => {
			const a = [
				[2.3, -1.7, 0.9],
				[-0.4, 3.1, 2.2],
			];
			const b = [
				[1.1, -0.5],
				[2.4, 1.8],
				[-1.3, 0.7],
			];
			const c = [
				[-0.6, 2.2],
				[0.9, -1.4],
				[3.5, -2.1],
			];
			const bPlusC = b.map((row, i) => row.map((v, j) => v + c[i][j]));
			const lhs = matMulFloatSeries(a, bPlusC);
			const ab = matMulFloatSeries(a, b);
			const ac = matMulFloatSeries(a, c);
			const rhs = ab.map((row, i) => row.map((v, j) => v + ac[i][j]));
			assertMatrixClose(lhs, rhs, 1e-13);
		});
	});
});
