import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantFloatRecursive } from './determinantFloatRecursive.js';

/**
 * Independent reference implementation: iterative Gaussian elimination with partial pivoting.
 *
 * @param {number[][]} M
 * @returns {number}
 */
function detGaussianReference(M) {
	const n = M.length;
	const A = M.map((row) => row.slice());
	let det = 1;

	for (let col = 0; col < n; col++) {
		let pivotRow = col;
		let maxAbs = Math.abs(A[col][col]);
		for (let r = col + 1; r < n; r++) {
			const v = Math.abs(A[r][col]);
			if (v > maxAbs) {
				maxAbs = v;
				pivotRow = r;
			}
		}
		if (A[pivotRow][col] === 0) {
			return 0;
		}
		if (pivotRow !== col) {
			const tmp = A[col];
			A[col] = A[pivotRow];
			A[pivotRow] = tmp;
			det = -det;
		}
		const pivot = A[col][col];
		det *= pivot;
		for (let r = col + 1; r < n; r++) {
			const factor = A[r][col] / pivot;
			for (let c = col + 1; c < n; c++) {
				A[r][c] -= factor * A[col][c];
			}
		}
	}

	return det === 0 ? 0 : det;
}

/**
 * Standard matrix multiplication for cross-checking det(A * B) === det(A) * det(B).
 *
 * @param {number[][]} A
 * @param {number[][]} B
 * @returns {number[][]}
 */
function matMul(A, B) {
	const n = A.length;
	const C = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const aik = A[i][k];
			for (let j = 0; j < n; j++) {
				C[i][j] += aik * B[k][j];
			}
		}
	}
	return C;
}

/**
 * Matrix transpose helper.
 *
 * @param {number[][]} A
 * @returns {number[][]}
 */
function transpose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i]),
	);
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible matrix tests.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Generates a deterministic n x n matrix with entries in [-5, 5].
 *
 * @param {number} n
 * @param {() => number} rng
 * @returns {number[][]}
 */
function randomMatrix(n, rng) {
	return Array.from({ length: n }, () =>
		Array.from({ length: n }, () => (rng() * 10) - 5),
	);
}

/**
 * Asserts two floating-point numbers are close within relative + absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-9]
 * @param {number} [absTol=1e-9]
 */
function assertClose(actual, expected, relTol = 1e-9, absTol = 1e-9) {
	const diff = Math.abs(actual - expected);
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, limit=${limit})`,
	);
}

describe('determinantFloatRecursive', () => {
	describe('normal cases (1x1 through 5x5+)', () => {
		it('computes 1x1 determinants accurately', () => {
			assert.strictEqual(determinantFloatRecursive([[7]]), 7);
			assert.strictEqual(determinantFloatRecursive([[-3.25]]), -3.25);
			const zeroDet = determinantFloatRecursive([[-0]]);
			assert.strictEqual(Object.is(zeroDet, 0), true);
		});

		it('computes 2x2 determinants accurately', () => {
			assert.strictEqual(
				determinantFloatRecursive([
					[3, 8],
					[4, 6],
				]),
				-14,
			);
			assertClose(
				determinantFloatRecursive([
					[1.5, -2.5],
					[4.0, 2.0],
				]),
				13.0,
			);
		});

		it('computes 3x3 determinants accurately', () => {
			const M = [
				[6, 1, 1],
				[4, -2, 5],
				[2, 8, 7],
			];
			assert.strictEqual(determinantFloatRecursive(M), -306);
		});

		it('computes 4x4 determinants accurately', () => {
			const M = [
				[1, 0, 2, -1],
				[3, 0, 0, 5],
				[2, 1, 4, -3],
				[1, 0, 5, 0],
			];
			assert.strictEqual(determinantFloatRecursive(M), 30);
		});

		it('computes 5x5 determinants accurately (Schur complement path)', () => {
			// Constructed as P * L * U with 1 row swap (sign -1), unit L, diag(U) = [2, -3, 0.5, 4, -1.5]
			// det = -1 * (2 * -3 * 0.5 * 4 * -1.5) = -18
			const L = [
				[1, 0, 0, 0, 0],
				[2, 1, 0, 0, 0],
				[-1, 0.5, 1, 0, 0],
				[0.25, -2, 1.5, 1, 0],
				[-0.5, 1, -0.5, 2, 1],
			];
			const U = [
				[2, -1, 3, 0.5, -2],
				[0, -3, 1, -1, 4],
				[0, 0, 0.5, 2, -1],
				[0, 0, 0, 4, 3],
				[0, 0, 0, 0, -1.5],
			];
			const LU = matMul(L, U);
			// Swap row 0 and row 3
			const M = [LU[3], LU[1], LU[2], LU[0], LU[4]];
			assertClose(determinantFloatRecursive(M), -18, 1e-12, 1e-12);
		});

		it('does not mutate the input matrix', () => {
			const M = [
				[0, 2, 1, 3, -1],
				[4, 1, 0, -2, 5],
				[1, -3, 2, 1, 0],
				[-2, 0, 4, 1, 2],
				[3, 1, -1, 2, 1],
			];
			const snapshot = structuredClone(M);
			determinantFloatRecursive(M);
			assert.deepStrictEqual(M, snapshot);
		});
	});

	describe('edge cases', () => {
		it('returns 0 (positive zero) for singular matrices', () => {
			// Linearly dependent rows (3x3)
			const singular3 = [
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			];
			const d3 = determinantFloatRecursive(singular3);
			assert.strictEqual(Object.is(d3, 0), true);

			// Duplicate rows (5x5)
			const singular5 = [
				[1, 2, 3, 4, 5],
				[2, -1, 0, 3, 1],
				[5, 4, 3, 2, 1],
				[2, -1, 0, 3, 1],
				[-3, 1, 2, 0, 4],
			];
			assertClose(determinantFloatRecursive(singular5), 0, 1e-12, 1e-12);

			// All-zero column (6x6)
			const zeroCol6 = Array.from({ length: 6 }, (_, i) =>
				Array.from({ length: 6 }, (_, j) => (j === 0 ? 0 : i + j + 1)),
			);
			const d6 = determinantFloatRecursive(zeroCol6);
			assert.strictEqual(Object.is(d6, 0), true);
		});

		it('returns 1 for identity matrices of various sizes', () => {
			for (const n of [1, 2, 3, 4, 5, 8]) {
				const I = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
				);
				assert.strictEqual(determinantFloatRecursive(I), 1);
			}
		});

		it('computes product of diagonal for upper and lower triangular matrices', () => {
			const upper = [
				[2, 5, -1, 3, 7],
				[0, -1.5, 4, 2, -2],
				[0, 0, 3, -6, 1],
				[0, 0, 0, 0.5, 9],
				[0, 0, 0, 0, -4],
			];
			// 2 * (-1.5) * 3 * 0.5 * (-4) = 18
			assertClose(determinantFloatRecursive(upper), 18, 1e-12, 1e-12);

			const lower = transpose(upper);
			assertClose(determinantFloatRecursive(lower), 18, 1e-12, 1e-12);
		});

		it('handles zero pivots requiring row swaps across small and large sizes', () => {
			// 3x3 with zero diagonal
			const zeroPivot3 = [
				[0, 2, 1],
				[1, 0, 3],
				[4, 5, 0],
			];
			// -2*(0 - 12) + 1*(5 - 0) = 24 + 5 = 29
			assert.strictEqual(determinantFloatRecursive(zeroPivot3), 29);

			// 5x5 cyclic permutation (even permutation -> +1) with M[0][0] === 0
			const cycle5 = [
				[0, 1, 0, 0, 0],
				[0, 0, 1, 0, 0],
				[0, 0, 0, 1, 0],
				[0, 0, 0, 0, 1],
				[1, 0, 0, 0, 0],
			];
			assert.strictEqual(determinantFloatRecursive(cycle5), 1);

			// 6x6 cyclic permutation (odd permutation -> -1) with M[0][0] === 0
			const cycle6 = Array.from({ length: 6 }, (_, i) =>
				Array.from({ length: 6 }, (_, j) => (j === (i + 1) % 6 ? 1 : 0)),
			);
			assert.strictEqual(determinantFloatRecursive(cycle6), -1);

			// 6x6 dense matrix with leading zeros on first two rows
			const zeroPivot6 = [
				[0, 0, 2, 1, 3, -1],
				[0, 4, 1, -2, 0, 2],
				[3, 1, 0, 5, -1, 1],
				[1, -2, 3, 0, 4, -2],
				[-2, 3, -1, 2, 1, 5],
				[2, 0, 4, -1, 2, 1],
			];
			assertClose(
				determinantFloatRecursive(zeroPivot6),
				detGaussianReference(zeroPivot6),
				1e-11,
				1e-11,
			);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array inputs and non-array rows', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => determinantFloatRecursive(bad), TypeError);
			}
			assert.throws(() => determinantFloatRecursive([1, 2]), TypeError);
			assert.throws(() => determinantFloatRecursive([[1, 2], null]), TypeError);
		});

		it('throws RangeError for empty or non-square matrices', () => {
			assert.throws(() => determinantFloatRecursive([]), RangeError);
			assert.throws(() => determinantFloatRecursive([[]]), RangeError);
			assert.throws(
				() =>
					determinantFloatRecursive([
						[1, 2, 3],
						[4, 5, 6],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					determinantFloatRecursive([
						[1, 2],
						[3],
					]),
				RangeError,
			);
		});

		it('throws TypeError for non-number entries and RangeError for non-finite numbers', () => {
			assert.throws(() => determinantFloatRecursive([['1']]), TypeError);
			assert.throws(() => determinantFloatRecursive([[null]]), TypeError);
			assert.throws(() => determinantFloatRecursive([[undefined]]), TypeError);
			assert.throws(() => determinantFloatRecursive([[1n]]), TypeError);
			assert.throws(() => determinantFloatRecursive([[Number.NaN]]), RangeError);
			assert.throws(
				() => determinantFloatRecursive([[Number.POSITIVE_INFINITY]]),
				RangeError,
			);
			assert.throws(
				() => determinantFloatRecursive([[Number.NEGATIVE_INFINITY]]),
				RangeError,
			);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches independent Gaussian elimination with partial pivoting for n = 1..12', () => {
			const rng = createRng(0xdecafbad);
			for (const n of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
				const A = randomMatrix(n, rng);
				const actual = determinantFloatRecursive(A);
				const expected = detGaussianReference(A);
				assertClose(actual, expected, 1e-10, 1e-9);
			}
		});

		it('satisfies multiplicative property det(A * B) === det(A) * det(B)', () => {
			const rng = createRng(0x12345678);
			for (const n of [2, 3, 4, 5, 6, 8]) {
				const A = randomMatrix(n, rng);
				const B = randomMatrix(n, rng);
				const AB = matMul(A, B);
				const detAB = determinantFloatRecursive(AB);
				const detA = determinantFloatRecursive(A);
				const detB = determinantFloatRecursive(B);
				assertClose(detAB, detA * detB, 1e-9, 1e-8);
			}
		});

		it('satisfies transpose invariance det(A^T) === det(A) and scaling det(cA) === c^n det(A)', () => {
			const rng = createRng(0xabcdef01);
			for (const n of [3, 4, 5, 7]) {
				const A = randomMatrix(n, rng);
				const detA = determinantFloatRecursive(A);
				const detAT = determinantFloatRecursive(transpose(A));
				assertClose(detAT, detA, 1e-10, 1e-9);

				const c = -2.5;
				const cA = A.map((row) => row.map((v) => v * c));
				const detCA = determinantFloatRecursive(cA);
				assertClose(detCA, Math.pow(c, n) * detA, 1e-10, 1e-9);
			}
		});
	});
});
