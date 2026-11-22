import assert from 'node:assert/strict';
import test from 'node:test';
import { matMulFloatRecursive } from './matMulFloatRecursive.js';

/**
 * Independent reference triple-loop matrix multiplication for cross-checking.
 */
function tripleLoopMatMul(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const C = Array.from({ length: m }, () => new Array(n).fill(0));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0;
			for (let p = 0; p < k; p++) {
				sum += A[i][p] * B[p][j];
			}
			C[i][j] = sum;
		}
	}
	return C;
}

function addMatrices(A, B) {
	return A.map((row, i) => row.map((val, j) => val + B[i][j]));
}

function transpose(A) {
	const m = A.length;
	const n = A[0].length;
	return Array.from({ length: n }, (_, j) => Array.from({ length: m }, (__, i) => A[i][j]));
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (__, j) => (i === j ? 1 : 0)),
	);
}

function zeros(m, n) {
	return Array.from({ length: m }, () => new Array(n).fill(0));
}

function deterministicMatrix(rows, cols, seed) {
	let state = seed >>> 0;
	const next = () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return (state / 0x100000000) * 20 - 10;
	};
	return Array.from({ length: rows }, () => Array.from({ length: cols }, () => next()));
}

function assertMatrixClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length);
		for (let j = 0; j < expected[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j]);
			assert.ok(
				diff <= tol,
				`Mismatch at [${i}][${j}]: got ${actual[i][j]}, expected ${expected[i][j]} (diff ${diff} > ${tol})`,
			);
		}
	}
}

test('1x1 matrices', () => {
	assert.deepEqual(matMulFloatRecursive([[3]], [[4]]), [[12]]);
	assertMatrixClose(matMulFloatRecursive([[-2.5]], [[1.2]]), [[-3.0]], 1e-12);
});

test('power-of-2 square matrices (2x2 and 4x4)', () => {
	const A2 = [
		[1, 2],
		[3, 4],
	];
	const B2 = [
		[5, 6],
		[7, 8],
	];
	assert.deepEqual(matMulFloatRecursive(A2, B2), [
		[19, 22],
		[43, 50],
	]);

	const A4 = [
		[1, 2, 3, 4],
		[5, 6, 7, 8],
		[9, 10, 11, 12],
		[13, 14, 15, 16],
	];
	const B4 = [
		[16, 15, 14, 13],
		[12, 11, 10, 9],
		[8, 7, 6, 5],
		[4, 3, 2, 1],
	];
	assert.deepEqual(matMulFloatRecursive(A4, B4), tripleLoopMatMul(A4, B4));
});

test('non-power-of-2 square matrices (3x3, 5x5, 7x7)', () => {
	const A3 = [
		[1, -2, 3],
		[0.5, 4, -1],
		[2, 0, 5],
	];
	const B3 = [
		[2, 1, 0],
		[-3, 0.5, 4],
		[1, -1, 2],
	];
	assert.deepEqual(matMulFloatRecursive(A3, B3), [
		[11, -3, -2],
		[-12, 3.5, 14],
		[9, -3, 10],
	]);

	for (const size of [5, 7]) {
		const A = deterministicMatrix(size, size, size * 17);
		const B = deterministicMatrix(size, size, size * 31);
		assertMatrixClose(matMulFloatRecursive(A, B), tripleLoopMatMul(A, B), 1e-12);
	}
});

test('rectangular matrices covering all split dimensions (m, k, n)', () => {
	// m largest: 5x2 * 2x3 -> 5x3
	const tallA = [
		[1, 2],
		[3, 4],
		[5, 6],
		[7, 8],
		[9, 10],
	];
	const shortB = [
		[1, 0, -1],
		[2, 3, 4],
	];
	assert.deepEqual(matMulFloatRecursive(tallA, shortB), [
		[5, 6, 7],
		[11, 12, 13],
		[17, 18, 19],
		[23, 24, 25],
		[29, 30, 31],
	]);

	// k largest: inner product (1x5 * 5x1) and (2x7 * 7x3)
	assert.deepEqual(matMulFloatRecursive([[1, 2, 3, 4, 5]], [[2], [3], [4], [5], [6]]), [[70]]);
	const kA = deterministicMatrix(2, 7, 101);
	const kB = deterministicMatrix(7, 3, 202);
	assertMatrixClose(matMulFloatRecursive(kA, kB), tripleLoopMatMul(kA, kB), 1e-12);

	// n largest: 2x3 * 3x6 -> 2x6
	const nA = deterministicMatrix(2, 3, 303);
	const nB = deterministicMatrix(3, 6, 404);
	assertMatrixClose(matMulFloatRecursive(nA, nB), tripleLoopMatMul(nA, nB), 1e-12);

	// outer product: 4x1 * 1x5 -> 4x5
	const col = [[2], [-1], [0.5], [3]];
	const row = [[1, 2, 3, 4, 5]];
	assert.deepEqual(matMulFloatRecursive(col, row), [
		[2, 4, 6, 8, 10],
		[-1, -2, -3, -4, -5],
		[0.5, 1, 1.5, 2, 2.5],
		[3, 6, 9, 12, 15],
	]);
});

test('does not mutate input matrices', () => {
	const A = [
		[1.5, -2.5],
		[3.5, 4.5],
	];
	const B = [
		[0.5, 1.5],
		[-0.5, 2.5],
	];
	const copyA = A.map((r) => [...r]);
	const copyB = B.map((r) => [...r]);

	matMulFloatRecursive(A, B);

	assert.deepEqual(A, copyA);
	assert.deepEqual(B, copyB);
});

test('edge cases: identity matrix and zero matrix', () => {
	const A = deterministicMatrix(4, 6, 777);
	assertMatrixClose(matMulFloatRecursive(identity(4), A), A, 0);
	assertMatrixClose(matMulFloatRecursive(A, identity(6)), A, 0);

	assert.deepEqual(matMulFloatRecursive(A, zeros(6, 3)), zeros(4, 3));
	assert.deepEqual(matMulFloatRecursive(zeros(5, 4), A), zeros(5, 6));
});

test('edge cases: IEEE-754 special float values', () => {
	const resInf = matMulFloatRecursive([[Infinity, 1]], [[2], [3]]);
	assert.equal(resInf[0][0], Infinity);

	const resNaN = matMulFloatRecursive([[NaN, 1]], [[2], [3]]);
	assert.ok(Number.isNaN(resNaN[0][0]));
});

test('validation errors for invalid, empty, ragged, and incompatible matrices', () => {
	// Non-array inputs
	assert.throws(() => matMulFloatRecursive(null, [[1]]), TypeError);
	assert.throws(() => matMulFloatRecursive([[1]], undefined), TypeError);
	assert.throws(() => matMulFloatRecursive(42, [[1]]), TypeError);
	assert.throws(() => matMulFloatRecursive('[[1]]', [[1]]), TypeError);

	// 1D arrays / non-array rows
	assert.throws(() => matMulFloatRecursive([1, 2], [[1], [2]]), TypeError);
	assert.throws(() => matMulFloatRecursive([[1, 2]], [1, 2]), TypeError);

	// Empty matrices and empty rows
	assert.throws(() => matMulFloatRecursive([], [[1]]), RangeError);
	assert.throws(() => matMulFloatRecursive([[1]], []), RangeError);
	assert.throws(() => matMulFloatRecursive([[]], [[1]]), RangeError);
	assert.throws(() => matMulFloatRecursive([[1]], [[]]), RangeError);

	// Ragged matrices
	assert.throws(
		() =>
			matMulFloatRecursive(
				[
					[1, 2],
					[3],
				],
				[
					[1],
					[2],
				],
			),
		RangeError,
	);
	assert.throws(
		() =>
			matMulFloatRecursive(
				[[1, 2]],
				[
					[1, 2],
					[3],
				],
			),
		RangeError,
	);

	// Non-numeric elements and sparse holes
	assert.throws(() => matMulFloatRecursive([['1']], [[1]]), TypeError);
	assert.throws(() => matMulFloatRecursive([[1]], [[null]]), TypeError);
	assert.throws(() => matMulFloatRecursive([[1n]], [[1]]), TypeError);
	const sparseRow = new Array(2);
	sparseRow[0] = 1;
	assert.throws(() => matMulFloatRecursive([sparseRow], [[1], [2]]), TypeError);

	// Incompatible inner dimensions
	assert.throws(
		() =>
			matMulFloatRecursive(
				[
					[1, 2, 3],
					[4, 5, 6],
				],
				[
					[1, 2],
					[3, 4],
				],
			),
		RangeError,
	);
});

test('cross-check against triple-loop on larger non-power-of-2 and power-of-2 shapes', () => {
	const shapes = [
		[13, 17, 11],
		[19, 23, 19],
		[32, 32, 32],
		[33, 15, 29],
	];

	for (const [m, k, n] of shapes) {
		const A = deterministicMatrix(m, k, m * 100 + k);
		const B = deterministicMatrix(k, n, k * 100 + n);
		const actual = matMulFloatRecursive(A, B);
		const expected = tripleLoopMatMul(A, B);
		assertMatrixClose(actual, expected, 1e-11);
	}
});

test('algebraic cross-checks: associativity, distributivity, and transpose identity', () => {
	const A = deterministicMatrix(5, 7, 11);
	const B = deterministicMatrix(7, 4, 22);
	const C = deterministicMatrix(4, 6, 33);

	// Associativity: (AB)C == A(BC)
	const leftAssoc = matMulFloatRecursive(matMulFloatRecursive(A, B), C);
	const rightAssoc = matMulFloatRecursive(A, matMulFloatRecursive(B, C));
	assertMatrixClose(leftAssoc, rightAssoc, 1e-9);

	// Distributivity: A(B + B2) == AB + AB2
	const B2 = deterministicMatrix(7, 4, 44);
	const leftDist = matMulFloatRecursive(A, addMatrices(B, B2));
	const rightDist = addMatrices(matMulFloatRecursive(A, B), matMulFloatRecursive(A, B2));
	assertMatrixClose(leftDist, rightDist, 1e-10);

	// Transpose identity: (AB)^T == B^T A^T
	const leftTrans = transpose(matMulFloatRecursive(A, B));
	const rightTrans = matMulFloatRecursive(transpose(B), transpose(A));
	assertMatrixClose(leftTrans, rightTrans, 1e-10);
});
