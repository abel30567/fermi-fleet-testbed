import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantFloatSeries } from './determinantFloatSeries.js';

/**
 * Independent reference determinant via recursive Laplace cofactor expansion along row 0.
 * Used for cross-checking small matrices (n <= 6).
 */
function cofactorDet(matrix) {
	const n = matrix.length;
	if (n === 1) return matrix[0][0];
	if (n === 2) return matrix[0][0] * matrix[1][1] - matrix[0][1] * matrix[1][0];
	let sum = 0;
	for (let col = 0; col < n; col++) {
		const minor = [];
		for (let i = 1; i < n; i++) {
			const row = [];
			for (let j = 0; j < n; j++) {
				if (j !== col) row.push(matrix[i][j]);
			}
			minor.push(row);
		}
		const sign = col % 2 === 0 ? 1 : -1;
		sum += sign * matrix[0][col] * cofactorDet(minor);
	}
	return sum;
}

/**
 * Independent reference determinant via Leibniz permutation formula for small matrices.
 */
function leibnizDet(matrix) {
	const n = matrix.length;
	const perm = Array.from({ length: n }, (_, i) => i);
	let total = 0;

	function permute(k, parity) {
		if (k === n) {
			let prod = parity;
			for (let i = 0; i < n; i++) {
				prod *= matrix[i][perm[i]];
			}
			total += prod;
			return;
		}
		for (let i = k; i < n; i++) {
			[perm[k], perm[i]] = [perm[i], perm[k]];
			permute(k + 1, i === k ? parity : -parity);
			[perm[k], perm[i]] = [perm[i], perm[k]];
		}
	}

	permute(0, 1);
	return total;
}

function matMul(A, B) {
	const n = A.length;
	const C = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			for (let j = 0; j < n; j++) {
				C[i][j] += A[i][k] * B[k][j];
			}
		}
	}
	return C;
}

function transpose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	);
}

function scale(A, c) {
	return A.map((row) => row.map((v) => v * c));
}

function assertClose(actual, expected, relTol = 1e-11, absTol = 1e-11) {
	const diff = Math.abs(actual - expected);
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= bound,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, bound=${bound})`
	);
}

describe('determinantFloatSeries', () => {
	describe('closed-form small matrices (1x1, 2x2, 3x3)', () => {
		it('computes 1x1 determinants including zero and negative zero', () => {
			assert.strictEqual(determinantFloatSeries([[7]]), 7);
			assert.strictEqual(determinantFloatSeries([[-3.5]]), -3.5);
			assert.strictEqual(determinantFloatSeries([[0]]), 0);
			assert.ok(Object.is(determinantFloatSeries([[-0]]), 0));
		});

		it('computes 2x2 determinants accurately', () => {
			assert.strictEqual(
				determinantFloatSeries([
					[1, 0],
					[0, 1],
				]),
				1
			);
			assert.strictEqual(
				determinantFloatSeries([
					[3, 8],
					[4, 6],
				]),
				-14
			);
			assert.strictEqual(
				determinantFloatSeries([
					[2, 4],
					[1, 2],
				]),
				0
			);
			assertClose(
				determinantFloatSeries([
					[1.5, -2.25],
					[4.0, 0.5],
				]),
				9.75,
				1e-15,
				1e-15
			);
		});

		it('computes 3x3 determinants accurately', () => {
			assert.strictEqual(
				determinantFloatSeries([
					[1, 0, 0],
					[0, 1, 0],
					[0, 0, 1],
				]),
				1
			);
			assert.strictEqual(
				determinantFloatSeries([
					[6, 1, 1],
					[4, -2, 5],
					[2, 8, 7],
				]),
				-306
			);
			assert.strictEqual(
				determinantFloatSeries([
					[1, 2, 3],
					[4, 5, 6],
					[7, 8, 9],
				]),
				0
			);
			assert.strictEqual(
				determinantFloatSeries([
					[0, 1, 0],
					[0, 0, 1],
					[1, 0, 0],
				]),
				1
			);
		});
	});

	describe('general n x n matrices via partial-pivoting LU', () => {
		it('computes 4x4 and 5x5 determinants requiring row pivoting', () => {
			// Leading zero in (0,0) forces pivoting immediately
			const m4 = [
				[0, 2, 1, 3],
				[1, 0, 4, 2],
				[2, 1, 0, 5],
				[3, 4, 2, 0],
			];
			assertClose(determinantFloatSeries(m4), leibnizDet(m4), 1e-12, 1e-12);

			// 5x5 antidiagonal permutation matrix: floor(5/2) = 2 swaps -> det = +1
			const anti5 = [
				[0, 0, 0, 0, 1],
				[0, 0, 0, 1, 0],
				[0, 0, 1, 0, 0],
				[0, 1, 0, 0, 0],
				[1, 0, 0, 0, 0],
			];
			assert.strictEqual(determinantFloatSeries(anti5), 1);

			// 4x4 cyclic shift permutation matrix: 3 swaps -> det = -1
			const cycle4 = [
				[0, 1, 0, 0],
				[0, 0, 1, 0],
				[0, 0, 0, 1],
				[1, 0, 0, 0],
			];
			assert.strictEqual(determinantFloatSeries(cycle4), -1);
		});

		it('returns 0 for singular n x n matrices', () => {
			// Zero row
			assert.strictEqual(
				determinantFloatSeries([
					[1, 2, 3, 4],
					[0, 0, 0, 0],
					[5, 6, 7, 8],
					[9, 1, 2, 3],
				]),
				0
			);

			// Zero column
			assert.strictEqual(
				determinantFloatSeries([
					[1, 0, 3, 4],
					[2, 0, 5, 6],
					[7, 0, 8, 9],
					[4, 0, 1, 2],
				]),
				0
			);

			// Duplicate rows
			assertClose(
				determinantFloatSeries([
					[1, 3, -2, 4],
					[2, -1, 5, 0],
					[1, 3, -2, 4],
					[7, 2, 1, -3],
				]),
				0,
				1e-12,
				1e-12
			);

			// Linearly dependent row (row 3 = row 0 + 2*row 1 - row 2)
			assertClose(
				determinantFloatSeries([
					[1, 2, 3, 4],
					[5, -1, 2, 0],
					[0, 3, -4, 2],
					[11, -3, 11, 2],
				]),
				0,
				1e-11,
				1e-11
			);
		});

		it('matches closed-form Vandermonde determinants for n = 4, 5, 6', () => {
			const nodeSets = [
				[1, 2, 3, 5],
				[-2, -0.5, 0.5, 1.5, 3],
				[1, 2, 4, 5, 7, 8],
			];

			for (const xs of nodeSets) {
				const n = xs.length;
				const V = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => xs[i] ** j)
				);
				let expected = 1;
				for (let i = 0; i < n; i++) {
					for (let j = i + 1; j < n; j++) {
						expected *= xs[j] - xs[i];
					}
				}
				assertClose(determinantFloatSeries(V), expected, 1e-10, 1e-10);
			}
		});

		it('matches known 4x4 Hilbert matrix determinant', () => {
			const H4 = Array.from({ length: 4 }, (_, i) =>
				Array.from({ length: 4 }, (_, j) => 1 / (i + j + 1))
			);
			// Exact det(H_4) = 1 / 6048000
			assertClose(determinantFloatSeries(H4), 1 / 6048000, 1e-10, 1e-18);
		});

		it('matches Householder reflection (det = -1) and orthogonal rotation (det = +1)', () => {
			// Householder H = I - 2 * u * u^T / ||u||^2 has det = -1
			const u = [1, -2, 3, -4, 2];
			const normSq = u.reduce((s, x) => s + x * x, 0);
			const H = Array.from({ length: u.length }, (_, i) =>
				Array.from(
					{ length: u.length },
					(_, j) => (i === j ? 1 : 0) - (2 * u[i] * u[j]) / normSq
				)
			);
			assertClose(determinantFloatSeries(H), -1, 1e-12, 1e-12);

			// Product of two Householder reflections is a proper rotation (det = +1)
			const v = [2, 1, -1, 3, -5];
			const vNormSq = v.reduce((s, x) => s + x * x, 0);
			const H2 = Array.from({ length: v.length }, (_, i) =>
				Array.from(
					{ length: v.length },
					(_, j) => (i === j ? 1 : 0) - (2 * v[i] * v[j]) / vNormSq
				)
			);
			assertClose(determinantFloatSeries(matMul(H, H2)), 1, 1e-12, 1e-12);
		});

		it('handles intermediate overflow/underflow and small nonzero diagonal entries', () => {
			const balancedOverflow = [
				[1e200, 0, 0, 0],
				[0, 1e200, 0, 0],
				[0, 0, 1e-200, 0],
				[0, 0, 0, 1e-200],
			];
			assertClose(determinantFloatSeries(balancedOverflow), 1, 1e-12, 1e-12);

			const balancedUnderflow = [
				[1e-200, 0, 0, 0],
				[0, -1e-200, 0, 0],
				[0, 0, 1e200, 0],
				[0, 0, 0, 1e200],
			];
			assertClose(determinantFloatSeries(balancedUnderflow), -1, 1e-12, 1e-12);

			// Genuine small determinant must not be falsely zeroed
			const smallDiag = [
				[1e-50, 0, 0, 0],
				[0, 1e-50, 0, 0],
				[0, 0, 1e-50, 0],
				[0, 0, 0, 1e-50],
			];
			assertClose(determinantFloatSeries(smallDiag), 1e-200, 1e-12, 0);
		});

		it('does not mutate the input matrix', () => {
			const original = [
				[0, 3, -1, 2, 5],
				[4, 1, 2, -3, 0],
				[-2, 5, 0, 1, 3],
				[1, -4, 3, 2, -1],
				[3, 0, -2, 4, 1],
			];
			const snapshot = original.map((row) => row.slice());
			determinantFloatSeries(original);
			assert.deepStrictEqual(original, snapshot);
		});
	});

	describe('cross-checks against independent algorithms and algebraic identities', () => {
		const sampleMatrices = [
			[[4.25]],
			[
				[2.5, -1.5],
				[3.2, 4.1],
			],
			[
				[1.2, -3.4, 2.1],
				[0.5, 4.0, -1.7],
				[-2.3, 1.1, 3.3],
			],
			[
				[2, -1, 3, 0.5],
				[0, 4, -2, 1.5],
				[-3, 2, 1, -2],
				[1.5, -0.5, 2.5, 3],
			],
			[
				[0, 2, -1, 3, 1],
				[3, -1, 2, 0, -2],
				[1, 4, -3, 2, 1],
				[-2, 0, 5, -1, 3],
				[2, -3, 1, 4, -1],
			],
			[
				[2, 1, -1, 0, 3, -2],
				[-1, 3, 2, 1, -2, 1],
				[0, -2, 4, -1, 1, 3],
				[3, 0, -1, 2, -3, 1],
				[1, 2, 0, -3, 2, -1],
				[-2, 1, 3, 2, 1, 4],
			],
		];

		it('agrees with Laplace cofactor expansion and Leibniz formula for n = 1..6', () => {
			for (const A of sampleMatrices) {
				const det = determinantFloatSeries(A);
				const refCofactor = cofactorDet(A);
				assertClose(det, refCofactor, 1e-11, 1e-11);
				if (A.length <= 5) {
					const refLeibniz = leibnizDet(A);
					assertClose(det, refLeibniz, 1e-11, 1e-11);
				}
			}
		});

		it('satisfies transpose invariance det(A^T) = det(A)', () => {
			for (const A of sampleMatrices) {
				assertClose(
					determinantFloatSeries(transpose(A)),
					determinantFloatSeries(A),
					1e-11,
					1e-11
				);
			}
		});

		it('satisfies homogeneous scaling det(cA) = c^n det(A)', () => {
			const scalars = [-2.5, -1, 0, 0.5, 3];
			for (const A of sampleMatrices) {
				const n = A.length;
				const detA = determinantFloatSeries(A);
				for (const c of scalars) {
					assertClose(
						determinantFloatSeries(scale(A, c)),
						c ** n * detA,
						1e-11,
						1e-11
					);
				}
			}
		});

		it('satisfies multiplicativity det(AB) = det(A) * det(B)', () => {
			const partnerMatrices = [
				[[-2.5]],
				[
					[-1.2, 3.1],
					[2.4, -0.8],
				],
				[
					[2.0, 0.5, -1.5],
					[-1.0, 3.0, 2.5],
					[0.5, -2.0, 1.5],
				],
				[
					[1, 2, -1, 3],
					[-2, 0, 3, -1],
					[4, -1, 2, 0],
					[0, 3, -2, 1],
				],
				[
					[1, -2, 0, 3, -1],
					[2, 1, -3, 0, 2],
					[-1, 3, 2, -2, 1],
					[0, -1, 4, 1, -3],
					[3, 2, -1, 2, 1],
				],
				[
					[1, -1, 2, 0, -2, 1],
					[2, 0, -1, 3, 1, -2],
					[-1, 2, 1, -2, 0, 3],
					[0, 3, -2, 1, 2, -1],
					[3, -2, 0, 1, -1, 2],
					[-2, 1, 3, -1, 2, 1],
				],
			];

			for (let idx = 0; idx < sampleMatrices.length; idx++) {
				const A = sampleMatrices[idx];
				const B = partnerMatrices[idx];
				const detAB = determinantFloatSeries(matMul(A, B));
				const prodDet = determinantFloatSeries(A) * determinantFloatSeries(B);
				assertClose(detAB, prodDet, 1e-10, 1e-10);
			}
		});

		it('negates determinant on row swap and preserves it under row addition', () => {
			const A = sampleMatrices[4];
			const detA = determinantFloatSeries(A);

			// Swap rows 1 and 4
			const swapped = A.map((r) => r.slice());
			[swapped[1], swapped[4]] = [swapped[4], swapped[1]];
			assertClose(determinantFloatSeries(swapped), -detA, 1e-11, 1e-11);

			// Add 2.75 * row 0 to row 3
			const sheared = A.map((r) => r.slice());
			for (let j = 0; j < sheared.length; j++) {
				sheared[3][j] += 2.75 * sheared[0][j];
			}
			assertClose(determinantFloatSeries(sheared), detA, 1e-11, 1e-11);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when input is not a 2D array of numbers', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, new Float64Array([1])]) {
				assert.throws(() => determinantFloatSeries(bad), TypeError);
			}
			assert.throws(() => determinantFloatSeries([1, 2]), TypeError);
			assert.throws(() => determinantFloatSeries([[1, 2], null]), TypeError);
			assert.throws(() => determinantFloatSeries([['1']]), TypeError);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, null],
						[3, 4],
					]),
				TypeError
			);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, undefined],
						[3, 4],
					]),
				TypeError
			);
			assert.throws(() => determinantFloatSeries([[1n]]), TypeError);
		});

		it('throws RangeError for empty, non-square, or non-finite matrices', () => {
			assert.throws(() => determinantFloatSeries([]), RangeError);
			assert.throws(() => determinantFloatSeries([[]]), RangeError);
			assert.throws(() => determinantFloatSeries([[1, 2]]), RangeError);
			assert.throws(() => determinantFloatSeries([[1], [2]]), RangeError);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, 2],
						[3],
					]),
				RangeError
			);
			assert.throws(() => determinantFloatSeries([[NaN]]), RangeError);
			assert.throws(() => determinantFloatSeries([[Infinity]]), RangeError);
			assert.throws(() => determinantFloatSeries([[-Infinity]]), RangeError);
			assert.throws(
				() =>
					determinantFloatSeries([
						[1, 2],
						[3, NaN],
					]),
				RangeError
			);
			// Even if the first column is all zeros, validation must still catch trailing Infinity
			assert.throws(
				() =>
					determinantFloatSeries([
						[0, 0, 0, 0],
						[0, 0, 0, 0],
						[0, 0, 0, 0],
						[0, 0, 0, Infinity],
					]),
				RangeError
			);
		});
	});
});
