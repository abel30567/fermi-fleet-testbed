import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matMulComplexRecursive } from './matMulComplexRecursive.js';

/**
 * Helper to construct a complex object.
 * @param {number} re
 * @param {number} im
 */
const c = (re, im = 0) => ({ re, im });

/**
 * Independent iterative triple-loop reference implementation for complex matrix multiplication.
 * @param {{ re: number, im: number }[][]} A
 * @param {{ re: number, im: number }[][]} B
 */
function matMulComplexIterative(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const C = Array.from({ length: m }, () =>
		Array.from({ length: n }, () => ({ re: 0, im: 0 })),
	);
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let re = 0;
			let im = 0;
			for (let p = 0; p < k; p++) {
				const a = A[i][p];
				const b = B[p][j];
				re += a.re * b.re - a.im * b.im;
				im += a.re * b.im + a.im * b.re;
			}
			C[i][j] = { re: re === 0 ? 0 : re, im: im === 0 ? 0 : im };
		}
	}
	return C;
}

/**
 * Asserts two complex matrices are elementwise equal within tolerance.
 * @param {{ re: number, im: number }[][]} actual
 * @param {{ re: number, im: number }[][]} expected
 * @param {number} [eps=1e-10]
 */
function assertMatricesClose(actual, expected, eps = 1e-10) {
	assert.equal(actual.length, expected.length, 'Row count mismatch');
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `Column count mismatch at row ${i}`);
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].re - expected[i][j].re) <= eps,
				`Mismatch at [${i}][${j}].re: got ${actual[i][j].re}, expected ${expected[i][j].re}`,
			);
			assert.ok(
				Math.abs(actual[i][j].im - expected[i][j].im) <= eps,
				`Mismatch at [${i}][${j}].im: got ${actual[i][j].im}, expected ${expected[i][j].im}`,
			);
		}
	}
}

/**
 * Generates a deterministic pseudo-random complex matrix using an LCG.
 * @param {number} rows
 * @param {number} cols
 * @param {number} seed
 */
function randomComplexMatrix(rows, cols, seed) {
	let state = seed >>> 0;
	const next = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return (state / 0xffffffff) * 10 - 5;
	};
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => ({
			re: Math.round(next() * 100) / 100,
			im: Math.round(next() * 100) / 100,
		})),
	);
}

/**
 * Creates a complex identity matrix of size n x n.
 * @param {number} n
 */
function identityComplex(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? c(1, 0) : c(0, 0))),
	);
}

/**
 * Creates a complex zero matrix of size rows x cols.
 * @param {number} rows
 * @param {number} cols
 */
function zeroComplex(rows, cols) {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => c(0, 0)),
	);
}

/**
 * Elementwise complex matrix addition.
 * @param {{ re: number, im: number }[][]} A
 * @param {{ re: number, im: number }[][]} B
 */
function addComplexMatrices(A, B) {
	return A.map((row, i) =>
		row.map((val, j) => ({ re: val.re + B[i][j].re, im: val.im + B[i][j].im })),
	);
}

/**
 * Conjugate transpose (Hermitian adjoint) of a complex matrix.
 * @param {{ re: number, im: number }[][]} A
 */
function conjugateTranspose(A) {
	const m = A.length;
	const n = A[0].length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: m }, (_, j) => ({
			re: A[j][i].re,
			im: A[j][i].im === 0 ? 0 : -A[j][i].im,
		})),
	);
}

describe('matMulComplexRecursive', () => {
	describe('normal cases', () => {
		it('multiplies 1x1 complex matrices', () => {
			// (3 + 4i) * (1 - 2i) = (3 + 8) + (-6 + 4)i = 11 - 2i
			const result = matMulComplexRecursive([[c(3, 4)]], [[c(1, -2)]]);
			assert.deepStrictEqual(result, [[c(11, -2)]]);
		});

		it('multiplies 2x2 complex matrices accurately and respects non-commutativity', () => {
			const A = [
				[c(1, 2), c(3, -1)],
				[c(0, 4), c(2, 1)],
			];
			const B = [
				[c(2, 0), c(-1, 3)],
				[c(1, 1), c(0, -2)],
			];
			// C[0][0] = (1+2i)(2) + (3-i)(1+i) = (2+4i) + (4+2i) = 6+6i
			// C[0][1] = (1+2i)(-1+3i) + (3-i)(-2i) = (-7+i) + (-2-6i) = -9-5i
			// C[1][0] = (4i)(2) + (2+i)(1+i) = 8i + (1+3i) = 1+11i
			// C[1][1] = (4i)(-1+3i) + (2+i)(-2i) = (-12-4i) + (2-4i) = -10-8i
			const AB = matMulComplexRecursive(A, B);
			assert.deepStrictEqual(AB, [
				[c(6, 6), c(-9, -5)],
				[c(1, 11), c(-10, -8)],
			]);

			const BA = matMulComplexRecursive(B, A);
			assert.notDeepStrictEqual(AB, BA);
			assertMatricesClose(BA, matMulComplexIterative(B, A));
		});

		it('multiplies 3x3 complex matrices', () => {
			const A = [
				[c(1, 1), c(2, 0), c(0, -1)],
				[c(3, -2), c(1, 1), c(4, 0)],
				[c(0, 2), c(-1, 3), c(2, -1)],
			];
			const B = [
				[c(2, -1), c(0, 1), c(1, 2)],
				[c(1, 0), c(3, -2), c(-1, 1)],
				[c(0, 2), c(1, 1), c(2, 0)],
			];
			assertMatricesClose(matMulComplexRecursive(A, B), matMulComplexIterative(A, B));
		});

		it('multiplies 4x4 complex matrices (power-of-two blocks)', () => {
			const A = randomComplexMatrix(4, 4, 42);
			const B = randomComplexMatrix(4, 4, 99);
			assertMatricesClose(matMulComplexRecursive(A, B), matMulComplexIterative(A, B));
		});

		it('multiplies non-square matrices (2x3 * 3x4)', () => {
			const A = [
				[c(1, 1), c(2, -1), c(0, 3)],
				[c(-2, 0), c(1, 2), c(3, -1)],
			];
			const B = [
				[c(1, 0), c(0, 1), c(2, 1), c(-1, 2)],
				[c(3, -1), c(1, 1), c(0, -2), c(2, 0)],
				[c(0, 2), c(-1, 0), c(1, 1), c(0, -1)],
			];
			const result = matMulComplexRecursive(A, B);
			assert.equal(result.length, 2);
			assert.equal(result[0].length, 4);
			assertMatricesClose(result, matMulComplexIterative(A, B));
		});

		it('handles row vector by column vector (1x4 * 4x1) and outer product (3x1 * 1x3)', () => {
			const row = [[c(1, 2), c(3, -1), c(0, 4), c(-2, 1)]];
			const col = [[c(2, -1)], [c(1, 1)], [c(0, -2)], [c(3, 0)]];
			// (1+2i)(2-i) + (3-i)(1+i) + (4i)(-2i) + (-2+i)(3)
			// = (4+3i) + (4+2i) + (8) + (-6+3i) = 10 + 8i
			assert.deepStrictEqual(matMulComplexRecursive(row, col), [[c(10, 8)]]);

			const col3 = [[c(1, 1)], [c(0, -2)], [c(3, 0)]];
			const row3 = [[c(2, 0), c(1, -1), c(0, 1)]];
			assertMatricesClose(
				matMulComplexRecursive(col3, row3),
				matMulComplexIterative(col3, row3),
			);
		});
	});

	describe('edge cases', () => {
		it('preserves matrix under left and right identity multiplication', () => {
			const A = randomComplexMatrix(3, 4, 7);
			const I3 = identityComplex(3);
			const I4 = identityComplex(4);
			assertMatricesClose(matMulComplexRecursive(I3, A), A);
			assertMatricesClose(matMulComplexRecursive(A, I4), A);
		});

		it('produces exact +0 zero matrix when multiplied by zero matrix', () => {
			const A = [
				[c(-1, -2), c(-3, 4)],
				[c(5, -6), c(-7, -8)],
			];
			const Z = zeroComplex(2, 3);
			const AZ = matMulComplexRecursive(A, Z);
			assert.deepStrictEqual(AZ, zeroComplex(2, 3));
			for (const row of AZ) {
				for (const cell of row) {
					assert.ok(Object.is(cell.re, 0), 'Expected +0 for re');
					assert.ok(Object.is(cell.im, 0), 'Expected +0 for im');
				}
			}

			const Z2 = zeroComplex(3, 2);
			assert.deepStrictEqual(matMulComplexRecursive(Z2, A), zeroComplex(3, 2));
		});

		it('handles odd dimensions (3x5 * 5x7 and 7x3 * 3x5)', () => {
			const A = randomComplexMatrix(3, 5, 101);
			const B = randomComplexMatrix(5, 7, 202);
			assertMatricesClose(matMulComplexRecursive(A, B), matMulComplexIterative(A, B));

			const C = randomComplexMatrix(7, 3, 303);
			const D = randomComplexMatrix(3, 5, 404);
			assertMatricesClose(matMulComplexRecursive(C, D), matMulComplexIterative(C, D));
		});

		it('satisfies Pauli matrix algebra (sigma_x * sigma_y = i * sigma_z)', () => {
			const sigmaX = [
				[c(0, 0), c(1, 0)],
				[c(1, 0), c(0, 0)],
			];
			const sigmaY = [
				[c(0, 0), c(0, -1)],
				[c(0, 1), c(0, 0)],
			];
			const iSigmaZ = [
				[c(0, 1), c(0, 0)],
				[c(0, 0), c(0, -1)],
			];
			assert.deepStrictEqual(matMulComplexRecursive(sigmaX, sigmaY), iSigmaZ);
		});

		it('does not mutate input matrices', () => {
			const A = [
				[c(1, 2), c(3, 4)],
				[c(5, 6), c(7, 8)],
			];
			const B = [
				[c(2, -1), c(0, 3)],
				[c(-4, 1), c(1, 1)],
			];
			const copyA = structuredClone(A);
			const copyB = structuredClone(B);
			matMulComplexRecursive(A, B);
			assert.deepStrictEqual(A, copyA);
			assert.deepStrictEqual(B, copyB);
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when A or B is not an array', () => {
			const valid = [[c(1, 0)]];
			for (const bad of [null, undefined, 42, 'matrix', { re: 1, im: 0 }]) {
				assert.throws(() => matMulComplexRecursive(bad, valid), TypeError);
				assert.throws(() => matMulComplexRecursive(valid, bad), TypeError);
			}
		});

		it('throws RangeError for empty matrices or empty rows', () => {
			const valid = [[c(1, 0)]];
			assert.throws(() => matMulComplexRecursive([], valid), RangeError);
			assert.throws(() => matMulComplexRecursive(valid, []), RangeError);
			assert.throws(() => matMulComplexRecursive([[]], valid), RangeError);
			assert.throws(() => matMulComplexRecursive(valid, [[]]), RangeError);
		});

		it('throws TypeError when rows are not arrays', () => {
			const valid = [[c(1, 0)]];
			assert.throws(() => matMulComplexRecursive([c(1, 0)], valid), TypeError);
			assert.throws(() => matMulComplexRecursive(valid, [c(1, 0)]), TypeError);
		});

		it('throws RangeError for ragged matrices', () => {
			const ragged = [
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			];
			const valid = [
				[c(1, 0)],
				[c(2, 0)],
			];
			assert.throws(() => matMulComplexRecursive(ragged, valid), RangeError);
			assert.throws(() => matMulComplexRecursive([[c(1, 0), c(2, 0)]], ragged), RangeError);
		});

		it('throws RangeError for incompatible inner dimensions', () => {
			const A = randomComplexMatrix(2, 3, 1);
			const B = randomComplexMatrix(2, 3, 2);
			assert.throws(() => matMulComplexRecursive(A, B), RangeError);
		});

		it('throws TypeError for invalid complex entries', () => {
			const valid = [[c(1, 0)]];
			const invalidEntries = [
				null,
				undefined,
				5,
				[1, 2],
				{ re: 1 },
				{ im: 2 },
				{ re: '1', im: 0 },
				{ re: 0, im: '2' },
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			];
			for (const entry of invalidEntries) {
				assert.throws(() => matMulComplexRecursive([[entry]], valid), TypeError);
				assert.throws(() => matMulComplexRecursive(valid, [[entry]]), TypeError);
			}
		});
	});

	describe('independent cross-checks and algebraic properties', () => {
		it('matches iterative triple-loop multiplication across diverse shapes', () => {
			const shapes = [
				[1, 1, 1],
				[1, 7, 1],
				[5, 1, 4],
				[2, 3, 4],
				[5, 7, 3],
				[8, 8, 8],
				[9, 5, 11],
			];
			let seed = 1000;
			for (const [m, k, n] of shapes) {
				const A = randomComplexMatrix(m, k, seed++);
				const B = randomComplexMatrix(k, n, seed++);
				const recursiveResult = matMulComplexRecursive(A, B);
				const iterativeResult = matMulComplexIterative(A, B);
				assertMatricesClose(recursiveResult, iterativeResult, 1e-9);
			}
		});

		it('satisfies associativity: (A * B) * C == A * (B * C)', () => {
			const A = randomComplexMatrix(3, 4, 501);
			const B = randomComplexMatrix(4, 5, 502);
			const C = randomComplexMatrix(5, 2, 503);

			const left = matMulComplexRecursive(matMulComplexRecursive(A, B), C);
			const right = matMulComplexRecursive(A, matMulComplexRecursive(B, C));
			assertMatricesClose(left, right, 1e-9);
		});

		it('satisfies distributivity and conjugate-transpose identity (A * B)^H == B^H * A^H', () => {
			const A = randomComplexMatrix(3, 5, 601);
			const B = randomComplexMatrix(5, 4, 602);
			const C = randomComplexMatrix(5, 4, 603);

			// Distributivity: A * (B + C) == A * B + A * C
			const lhsDist = matMulComplexRecursive(A, addComplexMatrices(B, C));
			const rhsDist = addComplexMatrices(
				matMulComplexRecursive(A, B),
				matMulComplexRecursive(A, C),
			);
			assertMatricesClose(lhsDist, rhsDist, 1e-9);

			// Hermitian adjoint identity: (A * B)^H == B^H * A^H
			const lhsAdj = conjugateTranspose(matMulComplexRecursive(A, B));
			const rhsAdj = matMulComplexRecursive(conjugateTranspose(B), conjugateTranspose(A));
			assertMatricesClose(lhsAdj, rhsAdj, 1e-9);
		});
	});
});
