import test from 'node:test';
import assert from 'node:assert/strict';
import { transposeComplexIterative } from './transposeComplexIterative.js';

const c = (re, im) => ({ re, im });

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function matMulComplex(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const out = Array.from({ length: m }, () => Array.from({ length: n }, () => c(0, 0)));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = c(0, 0);
			for (let p = 0; p < k; p++) {
				sum = cAdd(sum, cMul(A[i][p], B[p][j]));
			}
			out[i][j] = sum;
		}
	}
	return out;
}

function matLinearCombo(alpha, A, beta, B) {
	return A.map((row, i) =>
		row.map((val, j) => cAdd(cMul(alpha, val), cMul(beta, B[i][j]))),
	);
}

function assertComplexMatricesClose(actual, expected, eps = 1e-12) {
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

test('transposes a square 2x2 complex matrix without conjugating imaginary parts', () => {
	const input = [
		[c(1, 2), c(3, -4)],
		[c(-5, 6), c(0, 7)],
	];
	const expected = [
		[c(1, 2), c(-5, 6)],
		[c(3, -4), c(0, 7)],
	];
	assert.deepStrictEqual(transposeComplexIterative(input), expected);
});

test('transposes rectangular 2x3 and 3x2 complex matrices', () => {
	const m2x3 = [
		[c(1, -1), c(2.5, 0.5), c(-3, 4)],
		[c(0, 0), c(7, -8), c(9.25, -0.75)],
	];
	const m3x2 = [
		[c(1, -1), c(0, 0)],
		[c(2.5, 0.5), c(7, -8)],
		[c(-3, 4), c(9.25, -0.75)],
	];
	assert.deepStrictEqual(transposeComplexIterative(m2x3), m3x2);
	assert.deepStrictEqual(transposeComplexIterative(m3x2), m2x3);
});

test('transposes 1x1, row vector (1xN), and column vector (Nx1)', () => {
	assert.deepStrictEqual(transposeComplexIterative([[c(-2, 3)]]), [[c(-2, 3)]]);

	const rowVec = [[c(1, 1), c(2, -2), c(3, 0)]];
	const colVec = [[c(1, 1)], [c(2, -2)], [c(3, 0)]];
	assert.deepStrictEqual(transposeComplexIterative(rowVec), colVec);
	assert.deepStrictEqual(transposeComplexIterative(colVec), rowVec);
});

test('handles empty matrices and zero-column matrices', () => {
	assert.deepStrictEqual(transposeComplexIterative([]), []);
	assert.deepStrictEqual(transposeComplexIterative([[]]), []);
	assert.deepStrictEqual(transposeComplexIterative([[], [], []]), []);
});

test('returns fresh objects and does not mutate or alias the input matrix', () => {
	const entry00 = c(1, 2);
	const entry01 = c(3, 4);
	const input = [[entry00, entry01]];
	const output = transposeComplexIterative(input);

	assert.notStrictEqual(output[0][0], entry00);
	assert.notStrictEqual(output[1][0], entry01);

	output[0][0].re = 999;
	assert.deepStrictEqual(input, [[c(1, 2), c(3, 4)]]);

	entry01.im = -999;
	assert.deepStrictEqual(output[1][0], c(3, 4));
});

test('throws TypeError on non-array matrix, non-array row, or invalid complex entry', () => {
	for (const bad of [null, undefined, 42, 'matrix', { re: 1, im: 2 }]) {
		assert.throws(() => transposeComplexIterative(bad), TypeError);
	}

	assert.throws(() => transposeComplexIterative([123]), TypeError);
	assert.throws(() => transposeComplexIterative([[c(1, 2)], null]), TypeError);

	const badEntries = [
		null,
		undefined,
		5,
		'1+2i',
		[1, 2],
		{},
		{ re: 1 },
		{ im: 2 },
		{ re: '1', im: 2 },
		{ re: 1, im: null },
	];
	for (const entry of badEntries) {
		assert.throws(() => transposeComplexIterative([[entry]]), TypeError);
	}
});

test('throws RangeError on ragged matrices and non-finite components', () => {
	assert.throws(
		() =>
			transposeComplexIterative([
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			]),
		RangeError,
	);
	assert.throws(
		() => transposeComplexIterative([[], [c(1, 2)]]),
		RangeError,
	);

	for (const badVal of [NaN, Infinity, -Infinity]) {
		assert.throws(() => transposeComplexIterative([[c(badVal, 0)]]), RangeError);
		assert.throws(() => transposeComplexIterative([[c(0, badVal)]]), RangeError);
	}
});

test('cross-check: involution (A^T)^T = A, linearity, product reversal (AB)^T = B^T A^T, and trace invariance', () => {
	// Deterministic LCG for reproducible complex matrices
	let seed = 123456789;
	const nextVal = () => {
		seed = (1664525 * seed + 1013904223) >>> 0;
		return ((seed % 2001) - 1000) / 100;
	};
	const genMatrix = (rows, cols) =>
		Array.from({ length: rows }, () =>
			Array.from({ length: cols }, () => c(nextVal(), nextVal())),
		);

	// 1. Involution (A^T)^T === A and independent flat-index reference check
	for (const [rows, cols] of [
		[1, 5],
		[4, 4],
		[5, 3],
		[12, 7],
	]) {
		const A = genMatrix(rows, cols);
		const AT = transposeComplexIterative(A);

		// Independent flat-buffer transpose reference
		const flat = A.flat();
		const ref = Array.from({ length: cols }, (_, j) =>
			Array.from({ length: rows }, (_, i) => ({
				re: flat[i * cols + j].re,
				im: flat[i * cols + j].im,
			})),
		);
		assert.deepStrictEqual(AT, ref);
		assert.deepStrictEqual(transposeComplexIterative(AT), A);
	}

	// 2. Linearity over C: (alpha * A + beta * B)^T = alpha * A^T + beta * B^T
	const A = genMatrix(4, 3);
	const B = genMatrix(4, 3);
	const alpha = c(2.5, -1.5);
	const beta = c(-0.75, 3.25);

	const lhsLin = transposeComplexIterative(matLinearCombo(alpha, A, beta, B));
	const rhsLin = matLinearCombo(
		alpha,
		transposeComplexIterative(A),
		beta,
		transposeComplexIterative(B),
	);
	assertComplexMatricesClose(lhsLin, rhsLin);

	// 3. Product reversal over C: (P * Q)^T = Q^T * P^T
	const P = genMatrix(3, 5);
	const Q = genMatrix(5, 4);
	const lhsProd = transposeComplexIterative(matMulComplex(P, Q));
	const rhsProd = matMulComplex(
		transposeComplexIterative(Q),
		transposeComplexIterative(P),
	);
	assertComplexMatricesClose(lhsProd, rhsProd);

	// 4. Trace invariance for square complex matrix: tr(S^T) = tr(S)
	const S = genMatrix(6, 6);
	const ST = transposeComplexIterative(S);
	const trace = (M) =>
		M.reduce((acc, row, i) => cAdd(acc, row[i]), c(0, 0));
	assertComplexMatricesClose([[trace(ST)]], [[trace(S)]]);
});
