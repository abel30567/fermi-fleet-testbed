import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeComplexRecursive } from './transposeComplexRecursive.js';

const c = (re, im) => ({ re, im });

function referenceTransposeIterative(matrix) {
	const rows = matrix.length;
	const cols = matrix[0].length;
	const out = [];
	for (let j = 0; j < cols; j++) {
		const row = [];
		for (let i = 0; i < rows; i++) {
			const cell = matrix[i][j];
			row.push({
				re: cell.re === 0 ? 0 : cell.re,
				im: cell.im === 0 ? 0 : cell.im,
			});
		}
		out.push(row);
	}
	return out;
}

function complexAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

function complexMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function matrixAdd(A, B) {
	return A.map((row, i) => row.map((cell, j) => complexAdd(cell, B[i][j])));
}

function matrixScale(A, scalar) {
	return A.map((row) => row.map((cell) => complexMul(cell, scalar)));
}

function matrixMul(A, B) {
	const rows = A.length;
	const inner = A[0].length;
	const cols = B[0].length;
	const out = Array.from({ length: rows }, () => Array.from({ length: cols }, () => c(0, 0)));
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			let acc = c(0, 0);
			for (let k = 0; k < inner; k++) {
				acc = complexAdd(acc, complexMul(A[i][k], B[k][j]));
			}
			out[i][j] = acc;
		}
	}
	return out;
}

function assertMatricesClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < actual.length; i++) {
		assert.equal(actual[i].length, expected[i].length);
		for (let j = 0; j < actual[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].re - expected[i][j].re) <= eps,
				`re mismatch at [${i}][${j}]: ${actual[i][j].re} vs ${expected[i][j].re}`,
			);
			assert.ok(
				Math.abs(actual[i][j].im - expected[i][j].im) <= eps,
				`im mismatch at [${i}][${j}]: ${actual[i][j].im} vs ${expected[i][j].im}`,
			);
		}
	}
}

describe('transposeComplexRecursive', () => {
	describe('normal cases', () => {
		it('transposes a 2x2 complex matrix without conjugating imaginary parts', () => {
			const A = [
				[c(1, 2), c(3, -4)],
				[c(-5, 6), c(7, 8)],
			];
			const expected = [
				[c(1, 2), c(-5, 6)],
				[c(3, -4), c(7, 8)],
			];
			assert.deepEqual(transposeComplexRecursive(A), expected);
		});

		it('transposes rectangular 2x3 and 3x2 complex matrices', () => {
			const A = [
				[c(1.5, -2.25), c(0, 3), c(-4, 0)],
				[c(5, 6.5), c(-7.5, -8), c(9.25, -0.5)],
			];
			const AT = transposeComplexRecursive(A);
			assert.deepEqual(AT, [
				[c(1.5, -2.25), c(5, 6.5)],
				[c(0, 3), c(-7.5, -8)],
				[c(-4, 0), c(9.25, -0.5)],
			]);
			assert.deepEqual(transposeComplexRecursive(AT), A);
		});

		it('transposes an odd-sized 3x3 complex matrix', () => {
			const A = [
				[c(1, 1), c(2, -1), c(3, 4)],
				[c(-2, 5), c(0, 0), c(6, -7)],
				[c(8, 9), c(-10, 11), c(12, -13)],
			];
			assert.deepEqual(transposeComplexRecursive(A), [
				[c(1, 1), c(-2, 5), c(8, 9)],
				[c(2, -1), c(0, 0), c(-10, 11)],
				[c(3, 4), c(6, -7), c(12, -13)],
			]);
		});
	});

	describe('edge cases', () => {
		it('handles 1x1 complex matrices', () => {
			const A = [[c(-3.5, 4.25)]];
			assert.deepEqual(transposeComplexRecursive(A), [[c(-3.5, 4.25)]]);
		});

		it('handles row vectors (1xN) and column vectors (Nx1)', () => {
			const rowVec = [[c(1, -1), c(2, 3), c(0, -5), c(-4, 0), c(7, 2)]];
			const colVec = [[c(1, -1)], [c(2, 3)], [c(0, -5)], [c(-4, 0)], [c(7, 2)]];
			assert.deepEqual(transposeComplexRecursive(rowVec), colVec);
			assert.deepEqual(transposeComplexRecursive(colVec), rowVec);
		});

		it('handles zeros, pure real, pure imaginary, negatives, and extreme finite values', () => {
			const A = [
				[c(0, 0), c(42, 0), c(0, -17)],
				[c(-Number.MAX_VALUE, Number.MIN_VALUE), c(1e-308, -1e308), c(-1, -2)],
			];
			const expected = [
				[c(0, 0), c(-Number.MAX_VALUE, Number.MIN_VALUE)],
				[c(42, 0), c(1e-308, -1e308)],
				[c(0, -17), c(-1, -2)],
			];
			assert.deepEqual(transposeComplexRecursive(A), expected);
		});

		it('normalizes -0 to +0 in both real and imaginary components', () => {
			const A = [
				[c(-0, -0), c(-0, 5)],
				[c(-3, -0), c(0, -0)],
			];
			const AT = transposeComplexRecursive(A);
			assert.ok(Object.is(AT[0][0].re, 0));
			assert.ok(Object.is(AT[0][0].im, 0));
			assert.ok(Object.is(AT[0][1].im, 0));
			assert.ok(Object.is(AT[1][0].re, 0));
			assert.ok(Object.is(AT[1][1].re, 0));
			assert.ok(Object.is(AT[1][1].im, 0));
		});

		it('does not mutate input and returns freshly cloned complex entries', () => {
			const cell = Object.freeze({ re: 2, im: -3 });
			const row = Object.freeze([cell, Object.freeze({ re: 4, im: 5 })]);
			const A = Object.freeze([row]);

			const AT = transposeComplexRecursive(A);
			assert.notEqual(AT[0][0], cell);
			AT[0][0].re = 999;
			AT[0][0].im = -999;
			assert.equal(A[0][0].re, 2);
			assert.equal(A[0][0].im, -3);
		});

		it('preserves symmetric complex matrices and negates skew-symmetric ones', () => {
			const sym = [
				[c(1, 2), c(3, -4)],
				[c(3, -4), c(5, 6)],
			];
			assert.deepEqual(transposeComplexRecursive(sym), sym);

			const skew = [
				[c(0, 0), c(2, -3)],
				[c(-2, 3), c(0, 0)],
			];
			const negSkew = matrixScale(skew, c(-1, 0));
			assertMatricesClose(transposeComplexRecursive(skew), negSkew, 0);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array matrix or non-array rows', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, { re: 1, im: 2 }]) {
				assert.throws(() => transposeComplexRecursive(bad), TypeError);
			}
			assert.throws(() => transposeComplexRecursive([null]), TypeError);
			assert.throws(() => transposeComplexRecursive([[c(1, 0)], 'not-a-row']), TypeError);
		});

		it('throws RangeError for empty matrix, empty rows, or jagged matrices', () => {
			assert.throws(() => transposeComplexRecursive([]), RangeError);
			assert.throws(() => transposeComplexRecursive([[]]), RangeError);
			assert.throws(
				() =>
					transposeComplexRecursive([
						[c(1, 2), c(3, 4)],
						[c(5, 6)],
					]),
				RangeError,
			);
		});

		it('throws TypeError for invalid complex entries', () => {
			assert.throws(() => transposeComplexRecursive([[null]]), TypeError);
			assert.throws(() => transposeComplexRecursive([[undefined]]), TypeError);
			assert.throws(() => transposeComplexRecursive([[123]]), TypeError);
			assert.throws(() => transposeComplexRecursive([[[1, 2]]]), TypeError);
			assert.throws(() => transposeComplexRecursive([[{ re: 1 }]]), TypeError);
			assert.throws(() => transposeComplexRecursive([[{ im: 2 }]]), TypeError);
			assert.throws(() => transposeComplexRecursive([[{ re: '1', im: 2 }]]), TypeError);
			assert.throws(() => transposeComplexRecursive([[{ re: 1, im: null }]]), TypeError);
		});

		it('throws RangeError for non-finite real or imaginary components', () => {
			assert.throws(() => transposeComplexRecursive([[c(NaN, 0)]]), RangeError);
			assert.throws(() => transposeComplexRecursive([[c(0, NaN)]]), RangeError);
			assert.throws(() => transposeComplexRecursive([[c(Infinity, 1)]]), RangeError);
			assert.throws(() => transposeComplexRecursive([[c(1, -Infinity)]]), RangeError);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches an independent iterative transpose across varied dimensions', () => {
			const shapes = [
				[1, 1],
				[1, 7],
				[7, 1],
				[2, 5],
				[5, 2],
				[4, 4],
				[7, 11],
				[16, 16],
				[33, 65],
				[1, 2000],
			];

			for (const [rows, cols] of shapes) {
				const M = Array.from({ length: rows }, (_, i) =>
					Array.from({ length: cols }, (_, j) =>
						c(((i * 31 + j * 17) % 97) - 48.5, ((i * 13 - j * 29) % 89) + 0.25),
					),
				);
				const actual = transposeComplexRecursive(M);
				const expected = referenceTransposeIterative(M);
				assert.deepEqual(actual, expected);
			}
		});

		it('satisfies involution (A^T)^T = A, linearity (A + B)^T = A^T + B^T, and scaling (cA)^T = cA^T', () => {
			const A = [
				[c(1.2, -3.4), c(5.6, 7.8), c(-9.1, 0.2)],
				[c(-2.3, 4.5), c(0, -6.7), c(8.9, 1.1)],
			];
			const B = [
				[c(-0.5, 2.5), c(3.1, -1.9), c(4.4, -2.2)],
				[c(7.7, 0.3), c(-8.8, 9.9), c(-1.1, -3.3)],
			];
			const scalar = c(2.5, -1.5);

			assertMatricesClose(transposeComplexRecursive(transposeComplexRecursive(A)), A, 0);

			const lhsAdd = transposeComplexRecursive(matrixAdd(A, B));
			const rhsAdd = matrixAdd(transposeComplexRecursive(A), transposeComplexRecursive(B));
			assertMatricesClose(lhsAdd, rhsAdd);

			const lhsScale = transposeComplexRecursive(matrixScale(A, scalar));
			const rhsScale = matrixScale(transposeComplexRecursive(A), scalar);
			assertMatricesClose(lhsScale, rhsScale);
		});

		it('satisfies the reverse-order product identity (AB)^T = B^T A^T', () => {
			const A = [
				[c(1, 2), c(-3, 1), c(0, 4), c(2, -1)],
				[c(5, -2), c(1, 1), c(-2, 0), c(3, 3)],
				[c(-1, 0), c(2, -4), c(1, 2), c(-3, 5)],
			];
			const B = [
				[c(2, -1), c(0, 3)],
				[c(-1, 4), c(5, -2)],
				[c(3, 1), c(-2, -1)],
				[c(1, -2), c(4, 0)],
			];

			const lhs = transposeComplexRecursive(matrixMul(A, B));
			const rhs = matrixMul(transposeComplexRecursive(B), transposeComplexRecursive(A));
			assertMatricesClose(lhs, rhs, 1e-12);
		});
	});
});
