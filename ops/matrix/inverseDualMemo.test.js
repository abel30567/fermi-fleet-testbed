import test from 'node:test';
import assert from 'node:assert/strict';
import { inverseDualMemo } from './inverseDualMemo.js';

/**
 * Helper to construct a dual number `{ v, d }`.
 */
function dual(v, d = 0) {
	return { v, d };
}

/**
 * Independent dual-number multiplication: (a + εb)(c + εe) = ac + ε(ae + bc).
 */
function dualMul(x, y) {
	return { v: x.v * y.v, d: x.v * y.d + x.d * y.v };
}

/**
 * Independent dual-number addition.
 */
function dualAdd(x, y) {
	return { v: x.v + y.v, d: x.d + y.d };
}

/**
 * Independent dual matrix multiplication `A * B`.
 */
function matMulDual(A, B) {
	const n = A.length;
	const out = Array.from({ length: n }, () => new Array(n));
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = { v: 0, d: 0 };
			for (let k = 0; k < n; k++) {
				acc = dualAdd(acc, dualMul(A[i][k], B[k][j]));
			}
			out[i][j] = acc;
		}
	}
	return out;
}

/**
 * Assert that two dual matrices are elementwise close within `tol`.
 */
function assertDualMatrixClose(actual, expected, tol = 1e-10) {
	assert.equal(actual.length, expected.length, 'Row count mismatch');
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `Col count mismatch at row ${i}`);
		for (let j = 0; j < expected[i].length; j++) {
			assert.ok(
				Math.abs(actual[i][j].v - expected[i][j].v) <= tol,
				`Primal mismatch at (${i},${j}): got ${actual[i][j].v}, expected ${expected[i][j].v}`,
			);
			assert.ok(
				Math.abs(actual[i][j].d - expected[i][j].d) <= tol,
				`Dual mismatch at (${i},${j}): got ${actual[i][j].d}, expected ${expected[i][j].d}`,
			);
		}
	}
}

/**
 * Construct an `n×n` dual identity matrix.
 */
function dualIdentity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => dual(i === j ? 1 : 0, 0)),
	);
}

/**
 * Independent central finite-difference check of `d/dt (V + t*D)^-1 |_{t=0}`.
 */
function assertFiniteDifferenceDerivative(M, invM, h = 1e-6, tol = 1e-6) {
	const n = M.length;
	const plus = M.map((row) => row.map((c) => dual(c.v + h * c.d, 0)));
	const minus = M.map((row) => row.map((c) => dual(c.v - h * c.d, 0)));
	const invPlus = inverseDualMemo(plus);
	const invMinus = inverseDualMemo(minus);

	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			const fd = (invPlus[i][j].v - invMinus[i][j].v) / (2 * h);
			assert.ok(
				Math.abs(invM[i][j].d - fd) <= tol,
				`Finite-difference derivative mismatch at (${i},${j}): got ${invM[i][j].d}, fd=${fd}`,
			);
		}
	}
}

test('1x1 dual matrix inverse matches analytical formula (1/v, -d/v^2)', () => {
	const M = [[dual(4, 3)]];
	const inv = inverseDualMemo(M);
	assertDualMatrixClose(inv, [[dual(0.25, -3 / 16)]], 1e-12);
	assertDualMatrixClose(matMulDual(M, inv), dualIdentity(1), 1e-12);
	assertFiniteDifferenceDerivative(M, inv);

	const Mneg = [[dual(-2, 5)]];
	const invNeg = inverseDualMemo(Mneg);
	assertDualMatrixClose(invNeg, [[dual(-0.5, -1.25)]], 1e-12);
});

test('2x2 dual matrix inverse matches analytical values, A*A^-1 = I, and finite differences', () => {
	const M = [
		[dual(4, 1), dual(7, -2)],
		[dual(2, 0.5), dual(6, 3)],
	];
	const inv = inverseDualMemo(M);
	// Primal inverse of [[4,7],[2,6]] (det = 10) is [[0.6,-0.7],[-0.2,0.4]]
	assert.ok(Math.abs(inv[0][0].v - 0.6) < 1e-12);
	assert.ok(Math.abs(inv[0][1].v - -0.7) < 1e-12);
	assert.ok(Math.abs(inv[1][0].v - -0.2) < 1e-12);
	assert.ok(Math.abs(inv[1][1].v - 0.4) < 1e-12);

	assertDualMatrixClose(matMulDual(M, inv), dualIdentity(2), 1e-12);
	assertDualMatrixClose(matMulDual(inv, M), dualIdentity(2), 1e-12);
	assertFiniteDifferenceDerivative(M, inv);
});

test('3x3 dual matrix inverse matches exact adjugate, A*A^-1 = I, and finite differences', () => {
	const M = [
		[dual(1, 0.2), dual(2, -0.3), dual(3, 0.5)],
		[dual(0, 0.4), dual(1, 0.1), dual(4, -0.2)],
		[dual(5, -0.1), dual(6, 0.7), dual(0, 0.3)],
	];
	const inv = inverseDualMemo(M);
	// Primal det = 1, exact primal inverse = [[-24,18,5],[20,-15,-4],[-5,4,1]]
	const expectedPrimal = [
		[-24, 18, 5],
		[20, -15, -4],
		[-5, 4, 1],
	];
	for (let i = 0; i < 3; i++) {
		for (let j = 0; j < 3; j++) {
			assert.ok(Math.abs(inv[i][j].v - expectedPrimal[i][j]) < 1e-10);
		}
	}

	assertDualMatrixClose(matMulDual(M, inv), dualIdentity(3), 1e-10);
	assertDualMatrixClose(matMulDual(inv, M), dualIdentity(3), 1e-10);
	assertFiniteDifferenceDerivative(M, inv, 1e-6, 1e-3);
});

test('4x4 dual matrix inverse (Gauss-Jordan with partial pivoting) satisfies A*A^-1 = I and finite differences', () => {
	// Leading zero in (0,0) forces partial pivoting.
	const M = [
		[dual(0, 0.2), dual(2, -0.1), dual(1, 0.3), dual(-1, 0.0)],
		[dual(3, 0.1), dual(-1, 0.4), dual(2, -0.2), dual(1, 0.5)],
		[dual(1, -0.3), dual(1, 0.2), dual(0, 0.6), dual(2, -0.4)],
		[dual(2, 0.5), dual(3, -0.2), dual(-1, 0.1), dual(1, 0.2)],
	];
	const inv = inverseDualMemo(M);

	assertDualMatrixClose(matMulDual(M, inv), dualIdentity(4), 1e-11);
	assertDualMatrixClose(matMulDual(inv, M), dualIdentity(4), 1e-11);
	assertFiniteDifferenceDerivative(M, inv, 1e-6, 1e-5);
});

test('5x5 general matrix inverse satisfies A*A^-1 = I and finite differences', () => {
	const M = [
		[dual(5, 0.1), dual(1, -0.2), dual(0, 0.3), dual(2, 0.0), dual(-1, 0.4)],
		[dual(1, 0.2), dual(4, 0.5), dual(-1, -0.1), dual(0, 0.2), dual(1, -0.3)],
		[dual(0, -0.4), dual(-1, 0.1), dual(6, 0.2), dual(1, -0.5), dual(2, 0.1)],
		[dual(2, 0.3), dual(0, -0.2), dual(1, 0.4), dual(5, -0.1), dual(0, 0.2)],
		[dual(-1, 0.0), dual(1, 0.3), dual(2, -0.2), dual(0, 0.1), dual(7, 0.6)],
	];
	const inv = inverseDualMemo(M);

	assertDualMatrixClose(matMulDual(M, inv), dualIdentity(5), 1e-11);
	assertDualMatrixClose(matMulDual(inv, M), dualIdentity(5), 1e-11);
	assertFiniteDifferenceDerivative(M, inv, 1e-6, 1e-5);
});

test('identity and diagonal dual matrices invert accurately across sizes', () => {
	for (const n of [1, 2, 3, 4]) {
		const I = dualIdentity(n);
		const invI = inverseDualMemo(I);
		assert.deepStrictEqual(invI, I);
	}

	// Diagonal matrix: inv(diag(v_i + ε d_i)) = diag(1/v_i - ε d_i / v_i^2)
	const diagEntries = [
		dual(2, 1),
		dual(-5, 3),
		dual(0.5, -0.25),
		dual(4, 2),
	];
	const Dmat = Array.from({ length: 4 }, (_, i) =>
		Array.from({ length: 4 }, (_, j) => (i === j ? diagEntries[i] : dual(0, 0))),
	);
	const expected = Array.from({ length: 4 }, (_, i) =>
		Array.from({ length: 4 }, (_, j) =>
			i === j
				? dual(1 / diagEntries[i].v, -diagEntries[i].d / (diagEntries[i].v ** 2))
				: dual(0, 0),
		),
	);
	const invD = inverseDualMemo(Dmat);
	assertDualMatrixClose(invD, expected, 1e-12);
	assertDualMatrixClose(matMulDual(Dmat, invD), dualIdentity(4), 1e-12);
});

test('singular and near-singular matrices throw RangeError across all dimensions', () => {
	// 1x1 singular (even with non-zero dual component)
	assert.throws(() => inverseDualMemo([[dual(0, 1)]]), RangeError);

	// 2x2 singular (linearly dependent rows)
	assert.throws(
		() =>
			inverseDualMemo([
				[dual(1, 1), dual(2, 0)],
				[dual(2, 0), dual(4, 1)],
			]),
		RangeError,
	);

	// 3x3 singular (row 2 = row 0 + row 1)
	assert.throws(
		() =>
			inverseDualMemo([
				[dual(1, 0), dual(2, 1), dual(3, 0)],
				[dual(4, 0), dual(5, 0), dual(6, 1)],
				[dual(5, 1), dual(7, 0), dual(9, 0)],
			]),
		RangeError,
	);

	// 4x4 singular (zero column / dependent rows)
	assert.throws(
		() =>
			inverseDualMemo([
				[dual(1, 0), dual(2, 0), dual(3, 0), dual(4, 0)],
				[dual(2, 1), dual(4, 0), dual(6, 0), dual(8, 0)],
				[dual(0, 0), dual(1, 0), dual(0, 1), dual(1, 0)],
				[dual(1, 0), dual(0, 0), dual(1, 0), dual(0, 0)],
			]),
		RangeError,
	);

	// All-zero matrix
	assert.throws(
		() =>
			inverseDualMemo([
				[dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0)],
			]),
		RangeError,
	);
});

test('invalid inputs throw descriptive TypeError or RangeError', () => {
	assert.throws(() => inverseDualMemo(null), TypeError);
	assert.throws(() => inverseDualMemo(undefined), TypeError);
	assert.throws(() => inverseDualMemo(42), TypeError);
	assert.throws(() => inverseDualMemo('matrix'), TypeError);
	assert.throws(() => inverseDualMemo([]), RangeError);

	// Non-array row
	assert.throws(() => inverseDualMemo(['bad-row']), TypeError);

	// Non-square matrices
	assert.throws(
		() =>
			inverseDualMemo([
				[dual(1, 0), dual(2, 0)],
			]),
		RangeError,
	);
	assert.throws(
		() =>
			inverseDualMemo([
				[dual(1, 0), dual(2, 0)],
				[dual(3, 0)],
			]),
		RangeError,
	);

	// Invalid dual entries
	assert.throws(() => inverseDualMemo([[null]]), TypeError);
	assert.throws(() => inverseDualMemo([[1]]), TypeError);
	assert.throws(() => inverseDualMemo([[[1, 0]]]), TypeError);
	assert.throws(() => inverseDualMemo([[{ v: '1', d: 0 }]]), TypeError);
	assert.throws(() => inverseDualMemo([[{ v: 1 }]]), TypeError);

	// Non-finite numbers
	assert.throws(() => inverseDualMemo([[dual(NaN, 0)]]), RangeError);
	assert.throws(() => inverseDualMemo([[dual(1, NaN)]]), RangeError);
	assert.throws(() => inverseDualMemo([[dual(Infinity, 0)]]), RangeError);
	assert.throws(() => inverseDualMemo([[dual(1, -Infinity)]]), RangeError);
});

test('memoization returns isolated deep copies and handles cache eviction cleanly', () => {
	const M = [
		[dual(3, 1), dual(1, -1)],
		[dual(2, 0.5), dual(4, 2)],
	];

	const first = inverseDualMemo(M);
	const second = inverseDualMemo(M);

	// Equal values, distinct references.
	assert.deepStrictEqual(first, second);
	assert.notEqual(first, second);
	assert.notEqual(first[0], second[0]);
	assert.notEqual(first[0][0], second[0][0]);

	// Mutating returned matrix must not corrupt cache.
	first[0][0].v = 999999;
	first[0][0].d = -999999;
	first[1] = [dual(0, 0), dual(0, 0)];
	first.push([dual(1, 1)]);

	const third = inverseDualMemo(M);
	assert.deepStrictEqual(third, second);
	assertDualMatrixClose(matMulDual(M, third), dualIdentity(2), 1e-12);

	// Mutating input matrix after call must not corrupt cached result for original values.
	const Mclone = [
		[dual(3, 1), dual(1, -1)],
		[dual(2, 0.5), dual(4, 2)],
	];
	M[0][0].v = 100;
	const fourth = inverseDualMemo(Mclone);
	assert.deepStrictEqual(fourth, second);

	// Exercise bounded cache beyond MAX_CACHE_SIZE (256) to verify LRU eviction works cleanly.
	for (let k = 1; k <= 300; k++) {
		const res = inverseDualMemo([[dual(k, 1)]]);
		assert.ok(Math.abs(res[0][0].v - 1 / k) < 1e-14);
		assert.ok(Math.abs(res[0][0].d - -1 / (k * k)) < 1e-14);
	}
	// Earlier evicted entry still recomputes accurately.
	const recomputed = inverseDualMemo(Mclone);
	assert.deepStrictEqual(recomputed, second);
});

test('extreme scaling (very small and very large matrices) stays accurate', () => {
	const tiny = [
		[dual(1e-160, 1e-162), dual(0, 0)],
		[dual(0, 0), dual(2e-160, -1e-162)],
	];
	const invTiny = inverseDualMemo(tiny);
	assert.ok(Math.abs(invTiny[0][0].v - 1e160) / 1e160 < 1e-12);
	assert.ok(Math.abs(invTiny[1][1].v - 5e159) / 5e159 < 1e-12);

	// 3x3 scaled diagonal avoiding cubic overflow
	const huge = [
		[dual(1e120, 1e118), dual(0, 0), dual(0, 0)],
		[dual(0, 0), dual(2e120, 0), dual(0, 0)],
		[dual(0, 0), dual(0, 0), dual(4e120, -1e118)],
	];
	const invHuge = inverseDualMemo(huge);
	assert.ok(Math.abs(invHuge[0][0].v - 1e-120) / 1e-120 < 1e-12);
	assert.ok(Math.abs(invHuge[1][1].v - 5e-121) / 5e-121 < 1e-12);
	assert.ok(Math.abs(invHuge[2][2].v - 2.5e-121) / 2.5e-121 < 1e-12);
	assertDualMatrixClose(matMulDual(huge, invHuge), dualIdentity(3), 1e-12);
});
