import test from 'node:test';
import assert from 'node:assert/strict';
import { traceComplexMemo } from './traceComplexMemo.js';

/**
 * Helper to construct a complex number `{ re, im }`.
 */
const c = (re, im = 0) => ({ re, im });

/**
 * Helper to compare two complex numbers within floating-point tolerance.
 */
function assertComplexClose(actual, expected, eps = 1e-12) {
	assert.equal(typeof actual, 'object');
	assert.notEqual(actual, null);
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`expected re ${actual.re} to be within ${eps} of ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`expected im ${actual.im} to be within ${eps} of ${expected.im}`
	);
}

/**
 * Complex matrix addition: A + B.
 */
function addMatrices(A, B) {
	return A.map((row, i) =>
		row.map((val, j) => ({
			re: val.re + B[i][j].re,
			im: val.im + B[i][j].im,
		}))
	);
}

/**
 * Complex matrix multiplication: A * B.
 */
function mulMatrices(A, B) {
	const n = A.length;
	const out = Array.from({ length: n }, () =>
		Array.from({ length: n }, () => ({ re: 0, im: 0 }))
	);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let re = 0;
			let im = 0;
			for (let k = 0; k < n; k++) {
				re += A[i][k].re * B[k][j].re - A[i][k].im * B[k][j].im;
				im += A[i][k].re * B[k][j].im + A[i][k].im * B[k][j].re;
			}
			out[i][j] = { re, im };
		}
	}
	return out;
}

/**
 * Complex matrix transpose: A^T.
 */
function transposeMatrix(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ re: A[j][i].re, im: A[j][i].im }))
	);
}

/**
 * Complex matrix conjugate transpose (Hermitian adjoint): A^H.
 */
function conjugateTranspose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => ({ re: A[j][i].re, im: -A[j][i].im }))
	);
}

/**
 * Scalar multiplication of a complex matrix: s * A.
 */
function scaleMatrix(s, A) {
	return A.map((row) =>
		row.map((val) => ({
			re: s.re * val.re - s.im * val.im,
			im: s.re * val.im + s.im * val.re,
		}))
	);
}

test('normal cases: 1x1, 2x2, 3x3, and 4x4 complex matrices', () => {
	// 1x1
	assert.deepStrictEqual(traceComplexMemo([[c(3.5, -2.25)]]), {
		re: 3.5,
		im: -2.25,
	});

	// 2x2
	const m2 = [
		[c(1, 2), c(9, -4)],
		[c(-7, 3), c(4, -5)],
	];
	assert.deepStrictEqual(traceComplexMemo(m2), { re: 5, im: -3 });

	// 3x3
	const m3 = [
		[c(2, 1), c(5, 0), c(-1, 3)],
		[c(0, -2), c(-3, 4), c(7, 7)],
		[c(4, -1), c(2, 2), c(6, -8)],
	];
	assert.deepStrictEqual(traceComplexMemo(m3), { re: 5, im: -3 });

	// 4x4
	const m4 = [
		[c(1.5, 0.5), c(0, 1), c(2, 3), c(-1, 0)],
		[c(4, 2), c(-2.5, 1.5), c(0, 0), c(3, -1)],
		[c(1, -1), c(2, 0), c(3.25, -4.5), c(0, 2)],
		[c(-3, 3), c(1, 1), c(2, -2), c(0.75, 2.5)],
	];
	assertComplexClose(traceComplexMemo(m4), { re: 3, im: 0 });
});

test('edge cases: zero matrices and negative-zero normalization', () => {
	const zero1 = [[c(0, 0)]];
	assert.deepStrictEqual(traceComplexMemo(zero1), { re: 0, im: 0 });

	const zero3 = Array.from({ length: 3 }, () =>
		Array.from({ length: 3 }, () => c(0, 0))
	);
	assert.deepStrictEqual(traceComplexMemo(zero3), { re: 0, im: 0 });

	const negZero2 = [
		[c(-0, -0), c(1, 2)],
		[c(3, 4), c(-0, -0)],
	];
	const tr = traceComplexMemo(negZero2);
	assert.ok(Object.is(tr.re, 0));
	assert.ok(Object.is(tr.im, 0));
});

test('edge cases: identity matrices return { re: n, im: 0 } including large n > 64', () => {
	for (const n of [1, 2, 5, 64, 70]) {
		const I = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? c(1, 0) : c(0, 0)))
		);
		assert.deepStrictEqual(traceComplexMemo(I), { re: n, im: 0 });
	}
});

test('edge cases: traceless Pauli matrices', () => {
	const sigmaX = [
		[c(0, 0), c(1, 0)],
		[c(1, 0), c(0, 0)],
	];
	const sigmaY = [
		[c(0, 0), c(0, -1)],
		[c(0, 1), c(0, 0)],
	];
	const sigmaZ = [
		[c(1, 0), c(0, 0)],
		[c(0, 0), c(-1, 0)],
	];

	assert.deepStrictEqual(traceComplexMemo(sigmaX), { re: 0, im: 0 });
	assert.deepStrictEqual(traceComplexMemo(sigmaY), { re: 0, im: 0 });
	assert.deepStrictEqual(traceComplexMemo(sigmaZ), { re: 0, im: 0 });
});

test('memoization: cache hits return fresh immutable objects and respect bounded eviction', () => {
	const M = [
		[c(10, -3), c(99, 99)],
		[c(-50, 12), c(-4, 8)],
	];

	const first = traceComplexMemo(M);
	assert.deepStrictEqual(first, { re: 6, im: 5 });

	// Mutate returned object and ensure subsequent cached calls are unaffected
	first.re = 99999;
	first.im = -99999;

	const second = traceComplexMemo(M);
	assert.notStrictEqual(first, second);
	assert.deepStrictEqual(second, { re: 6, im: 5 });

	// Different matrix with identical diagonal also hits cache and returns fresh object
	const sameDiag = [
		[c(10, -3), c(0, 0)],
		[c(0, 0), c(-4, 8)],
	];
	const third = traceComplexMemo(sameDiag);
	assert.notStrictEqual(second, third);
	assert.deepStrictEqual(third, { re: 6, im: 5 });

	// Exercise bounded cache eviction (> 1024 unique keys)
	for (let k = 1; k <= 1200; k++) {
		const res = traceComplexMemo([[c(k, -k)]]);
		assert.deepStrictEqual(res, { re: k, im: -k });
	}
	// Original matrix still computes accurately after eviction
	assert.deepStrictEqual(traceComplexMemo(M), { re: 6, im: 5 });
});

test('validation: rejects non-matrix, empty, non-square, jagged, and invalid complex inputs', () => {
	// Non-matrix inputs
	for (const bad of [null, undefined, 42, 'matrix', {}, true, Symbol('m')]) {
		assert.throws(() => traceComplexMemo(bad), TypeError);
	}

	// Empty matrix
	assert.throws(() => traceComplexMemo([]), RangeError);

	// Non-array rows
	assert.throws(() => traceComplexMemo([null]), TypeError);
	assert.throws(() => traceComplexMemo(['not-a-row']), TypeError);

	// Empty row / non-square / jagged matrices
	assert.throws(() => traceComplexMemo([[]]), RangeError);
	assert.throws(() => traceComplexMemo([[c(1, 0), c(2, 0)]]), RangeError);
	assert.throws(() => traceComplexMemo([[c(1, 0)], [c(2, 0)]]), RangeError);
	assert.throws(
		() =>
			traceComplexMemo([
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			]),
		RangeError
	);

	// Invalid complex entries (on-diagonal)
	const badEntries = [
		null,
		undefined,
		1,
		'1+0i',
		[1, 0],
		{ re: 1 },
		{ im: 1 },
		{ re: NaN, im: 0 },
		{ re: 0, im: NaN },
		{ re: Infinity, im: 0 },
		{ re: 0, im: -Infinity },
		{ re: '1', im: 0 },
		{ re: 1, im: '0' },
	];
	for (const bad of badEntries) {
		assert.throws(() => traceComplexMemo([[bad]]), TypeError);
	}

	// Invalid off-diagonal entry must still throw even when diagonal is already cached
	traceComplexMemo([
		[c(7, 2), c(0, 0)],
		[c(0, 0), c(3, -1)],
	]);
	assert.throws(
		() =>
			traceComplexMemo([
				[c(7, 2), { re: NaN, im: 0 }],
				[c(0, 0), c(3, -1)],
			]),
		TypeError
	);
});

test('algebraic cross-checks: linearity, cyclic product, transpose, and Hermitian adjoint', () => {
	const A = [
		[c(1, 2), c(-3, 4), c(0.5, -1.5)],
		[c(2, -1), c(4, 0), c(1, 3)],
		[c(-2, 5), c(0, -2), c(3, -4)],
	];
	const B = [
		[c(3, -1), c(2, 2), c(-1, 0)],
		[c(0, 4), c(-2, 1), c(5, -3)],
		[c(1.5, 2.5), c(-3, 0), c(2, 6)],
	];

	const trA = traceComplexMemo(A);
	const trB = traceComplexMemo(B);

	// Linearity: tr(A + B) = tr(A) + tr(B)
	const trSum = traceComplexMemo(addMatrices(A, B));
	assertComplexClose(trSum, { re: trA.re + trB.re, im: trA.im + trB.im });

	// Scalar homogeneity: tr(s * A) = s * tr(A)
	const s = c(2.5, -1.25);
	const trScaled = traceComplexMemo(scaleMatrix(s, A));
	assertComplexClose(trScaled, {
		re: s.re * trA.re - s.im * trA.im,
		im: s.re * trA.im + s.im * trA.re,
	});

	// Cyclic property: tr(A * B) = tr(B * A)
	const trAB = traceComplexMemo(mulMatrices(A, B));
	const trBA = traceComplexMemo(mulMatrices(B, A));
	assertComplexClose(trAB, trBA);

	// Transpose invariance: tr(A^T) = tr(A)
	const trAT = traceComplexMemo(transposeMatrix(A));
	assertComplexClose(trAT, trA);

	// Conjugate transpose: tr(A^H) = conj(tr(A))
	const trAH = traceComplexMemo(conjugateTranspose(A));
	assertComplexClose(trAH, { re: trA.re, im: -trA.im });
});
