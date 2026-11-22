import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { traceDualIterative } from './traceDualIterative.js';

/**
 * Helper to construct a dual number.
 */
function dual(v, d = 0) {
	return { v, d };
}

/**
 * Helper to assert two dual numbers are close within a tolerance.
 */
function assertDualClose(actual, expected, tol = 1e-10) {
	assert.ok(
		Math.abs(actual.v - expected.v) <= tol,
		`Expected primal v=${actual.v} to be within ${tol} of ${expected.v}`
	);
	assert.ok(
		Math.abs(actual.d - expected.d) <= tol,
		`Expected derivative d=${actual.d} to be within ${tol} of ${expected.d}`
	);
}

/**
 * Helper: multiply two dual matrices A (m x k) and B (k x n).
 */
function matMulDual(A, B) {
	const m = A.length;
	const k = A[0].length;
	const n = B[0].length;
	const out = Array.from({ length: m }, () => new Array(n));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sumV = 0;
			let sumD = 0;
			for (let p = 0; p < k; p++) {
				const a = A[i][p];
				const b = B[p][j];
				sumV += a.v * b.v;
				sumD += a.v * b.d + a.d * b.v;
			}
			out[i][j] = { v: sumV, d: sumD };
		}
	}
	return out;
}

/**
 * Helper: plain numeric matrix trace for independent finite-difference cross-checks.
 */
function realTrace(M) {
	let sum = 0;
	for (let i = 0; i < M.length; i++) {
		sum += M[i][i];
	}
	return sum;
}

describe('traceDualIterative', () => {
	describe('normal cases', () => {
		test('1x1 dual matrix', () => {
			const m = [[dual(7.5, -2.25)]];
			const res = traceDualIterative(m);
			assert.deepStrictEqual(res, { v: 7.5, d: -2.25 });
		});

		test('2x2 dual matrix', () => {
			const m = [
				[dual(3, 1.5), dual(100, -50)],
				[dual(-200, 99), dual(4.5, -0.5)],
			];
			const res = traceDualIterative(m);
			assert.deepStrictEqual(res, { v: 7.5, d: 1 });
		});

		test('3x3 dual matrix', () => {
			const m = [
				[dual(1, 2), dual(9, 8), dual(7, 6)],
				[dual(5, 4), dual(3, -1), dual(2, 1)],
				[dual(0, 3), dual(-4, 5), dual(6, 0.5)],
			];
			const res = traceDualIterative(m);
			assertDualClose(res, { v: 10, d: 1.5 }, 1e-12);
		});

		test('4x4 dual matrix', () => {
			const m = [
				[dual(1.25, 0.5), dual(2, 3), dual(4, 5), dual(6, 7)],
				[dual(8, 9), dual(-3.5, 1.25), dual(10, 11), dual(12, 13)],
				[dual(14, 15), dual(16, 17), dual(2.75, -0.75), dual(18, 19)],
				[dual(20, 21), dual(22, 23), dual(24, 25), dual(4.5, 2.0)],
			];
			const res = traceDualIterative(m);
			assertDualClose(res, { v: 5.0, d: 3.0 }, 1e-12);
		});

		test('does not mutate input matrix', () => {
			const m = [
				[dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(7, 8)],
			];
			const snapshot = structuredClone(m);
			traceDualIterative(m);
			assert.deepStrictEqual(m, snapshot);
		});
	});

	describe('edge cases', () => {
		test('zero matrix', () => {
			const m = [
				[dual(0, 0), dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0), dual(0, 0)],
			];
			assert.deepStrictEqual(traceDualIterative(m), { v: 0, d: 0 });
		});

		test('identity matrix (constant, zero derivatives)', () => {
			const n = 5;
			const eye = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => dual(i === j ? 1 : 0, 0))
			);
			assert.deepStrictEqual(traceDualIterative(eye), { v: 5, d: 0 });
		});

		test('negative entries and canceling diagonal values', () => {
			const m = [
				[dual(-5, -3), dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(2, 1), dual(7, 8)],
				[dual(9, 10), dual(11, 12), dual(3, 2)],
			];
			assert.deepStrictEqual(traceDualIterative(m), { v: 0, d: 0 });
		});

		test('zero derivatives on arbitrary non-zero matrix', () => {
			const m = [
				[dual(-12.5, 0), dual(4.2, 0)],
				[dual(9.1, 0), dual(7.5, 0)],
			];
			assert.deepStrictEqual(traceDualIterative(m), { v: -5, d: 0 });
		});

		test('zero primal values with non-zero derivatives', () => {
			const m = [
				[dual(0, 1.5), dual(0, 99)],
				[dual(0, -42), dual(0, -4.5)],
			];
			assert.deepStrictEqual(traceDualIterative(m), { v: 0, d: -3 });
		});

		test('handles negative zero cleanly', () => {
			const m = [[dual(-0, -0)]];
			const res = traceDualIterative(m);
			assert.equal(res.v, 0);
			assert.equal(res.d, 0);
		});
	});

	describe('input validation', () => {
		test('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, { v: 1, d: 1 }]) {
				assert.throws(() => traceDualIterative(bad), TypeError);
			}
		});

		test('throws RangeError for empty matrix', () => {
			assert.throws(() => traceDualIterative([]), RangeError);
		});

		test('throws TypeError when any row is not an array', () => {
			assert.throws(() => traceDualIterative([null]), TypeError);
			assert.throws(() => traceDualIterative([[dual(1, 0), dual(2, 0)], 'bad']), TypeError);
		});

		test('throws RangeError for non-square matrices', () => {
			// 1x2
			assert.throws(() => traceDualIterative([[dual(1, 0), dual(2, 0)]]), RangeError);
			// 2x1
			assert.throws(() => traceDualIterative([[dual(1, 0)], [dual(2, 0)]]), RangeError);
			// 2x3
			assert.throws(
				() =>
					traceDualIterative([
						[dual(1, 0), dual(2, 0), dual(3, 0)],
						[dual(4, 0), dual(5, 0), dual(6, 0)],
					]),
				RangeError
			);
			// 3x2
			assert.throws(
				() =>
					traceDualIterative([
						[dual(1, 0), dual(2, 0)],
						[dual(3, 0), dual(4, 0)],
						[dual(5, 0), dual(6, 0)],
					]),
				RangeError
			);
		});

		test('throws RangeError for ragged matrices', () => {
			assert.throws(
				() =>
					traceDualIterative([
						[dual(1, 0), dual(2, 0)],
						[dual(3, 0)],
					]),
				RangeError
			);
			assert.throws(
				() =>
					traceDualIterative([
						[dual(1, 0), dual(2, 0)],
						[dual(3, 0), dual(4, 0), dual(5, 0)],
					]),
				RangeError
			);
		});

		test('throws TypeError for invalid dual entries (on and off diagonal)', () => {
			// Diagonal entry invalid
			assert.throws(() => traceDualIterative([[null]]), TypeError);
			assert.throws(() => traceDualIterative([[1]]), TypeError);
			assert.throws(() => traceDualIterative([[[1, 2]]]), TypeError);
			assert.throws(() => traceDualIterative([[{ v: 1 }]]), TypeError);
			assert.throws(() => traceDualIterative([[{ d: 1 }]]), TypeError);
			assert.throws(() => traceDualIterative([[{ v: '1', d: 0 }]]), TypeError);
			assert.throws(() => traceDualIterative([[{ v: 1, d: '0' }]]), TypeError);

			// Off-diagonal entry invalid must also be caught
			assert.throws(
				() =>
					traceDualIterative([
						[dual(1, 0), { v: 2 }],
						[dual(3, 0), dual(4, 0)],
					]),
				TypeError
			);
		});

		test('throws RangeError for non-finite v or d values (on and off diagonal)', () => {
			for (const badNum of [NaN, Infinity, -Infinity]) {
				assert.throws(() => traceDualIterative([[dual(badNum, 0)]]), RangeError);
				assert.throws(() => traceDualIterative([[dual(0, badNum)]]), RangeError);
				// Off-diagonal non-finite entry
				assert.throws(
					() =>
						traceDualIterative([
							[dual(1, 0), dual(badNum, 0)],
							[dual(0, 1), dual(2, 0)],
						]),
					RangeError
				);
				assert.throws(
					() =>
						traceDualIterative([
							[dual(1, 0), dual(0, 0)],
							[dual(0, badNum), dual(2, 0)],
						]),
					RangeError
				);
			}
		});
	});

	describe('mathematical cross-checks', () => {
		test('cyclic property tr(A * B) == tr(B * A) over square 3x3 dual matrices', () => {
			const A = [
				[dual(1.2, -0.5), dual(-2.3, 1.1), dual(0.7, 0.3)],
				[dual(3.1, 0.4), dual(0.5, -1.2), dual(-1.4, 2.0)],
				[dual(-0.8, 1.5), dual(2.2, -0.7), dual(1.9, 0.6)],
			];
			const B = [
				[dual(0.4, 1.3), dual(1.7, -0.2), dual(-2.1, 0.8)],
				[dual(-1.5, 0.9), dual(2.8, 0.5), dual(0.6, -1.1)],
				[dual(2.5, -0.4), dual(-0.9, 1.6), dual(1.1, -0.3)],
			];

			const trAB = traceDualIterative(matMulDual(A, B));
			const trBA = traceDualIterative(matMulDual(B, A));
			assertDualClose(trAB, trBA, 1e-12);
		});

		test('cyclic property tr(A * B) == tr(B * A) for rectangular dual matrices (2x3 and 3x2)', () => {
			const A = [
				[dual(2, 0.5), dual(-1, 1.2), dual(3.5, -0.3)],
				[dual(0.8, -1.1), dual(4, 0.2), dual(-2.2, 0.9)],
			];
			const B = [
				[dual(1.5, -0.7), dual(-0.4, 2.1)],
				[dual(3.2, 0.4), dual(1.1, -0.8)],
				[dual(-2.0, 1.3), dual(0.7, 0.6)],
			];

			const trAB = traceDualIterative(matMulDual(A, B)); // 2x2
			const trBA = traceDualIterative(matMulDual(B, A)); // 3x3
			assertDualClose(trAB, trBA, 1e-12);
		});

		test('transpose invariance tr(A^T) == tr(A) over dual matrices', () => {
			const A = [
				[dual(1.1, 0.2), dual(2.2, -0.3), dual(3.3, 0.4)],
				[dual(-4.4, 0.5), dual(5.5, -0.6), dual(6.6, 0.7)],
				[dual(7.7, -0.8), dual(-8.8, 0.9), dual(9.9, -1.0)],
			];
			const AT = A[0].map((_, j) => A.map((row) => row[j]));
			assertDualClose(traceDualIterative(A), traceDualIterative(AT), 1e-12);
		});

		test('central finite-difference derivative of tr(A + t * dA)', () => {
			const A = [
				[2.3, -1.7, 4.1],
				[0.9, -3.4, 2.2],
				[5.6, 1.1, 0.8],
			];
			const dA = [
				[-0.6, 2.5, -1.3],
				[1.8, 3.2, -0.4],
				[0.7, -2.1, -1.9],
			];

			const dualMatrix = A.map((row, i) => row.map((v, j) => dual(v, dA[i][j])));
			const dualTrace = traceDualIterative(dualMatrix);

			const h = 1e-6;
			const plus = A.map((row, i) => row.map((v, j) => v + h * dA[i][j]));
			const minus = A.map((row, i) => row.map((v, j) => v - h * dA[i][j]));
			const fdDeriv = (realTrace(plus) - realTrace(minus)) / (2 * h);

			assertDualClose(dualTrace, { v: realTrace(A), d: fdDeriv }, 1e-9);
		});

		test('central finite-difference derivative of nonlinear parameterized matrix A(t)', () => {
			const evalA = (t) => [
				[Math.sin(t), t * t, Math.cos(2 * t)],
				[Math.exp(t), Math.cos(t) + t * t * t, Math.log(t + 2)],
				[t + 1, Math.sin(3 * t), Math.exp(-t) * (t + 1)],
			];
			const evalDualA = (t) => [
				[dual(Math.sin(t), Math.cos(t)), dual(t * t, 2 * t), dual(Math.cos(2 * t), -2 * Math.sin(2 * t))],
				[
					dual(Math.exp(t), Math.exp(t)),
					dual(Math.cos(t) + t * t * t, -Math.sin(t) + 3 * t * t),
					dual(Math.log(t + 2), 1 / (t + 2)),
				],
				[
					dual(t + 1, 1),
					dual(Math.sin(3 * t), 3 * Math.cos(3 * t)),
					dual(Math.exp(-t) * (t + 1), -Math.exp(-t) * t),
				],
			];

			const t0 = 0.7;
			const h = 1e-6;
			const dualRes = traceDualIterative(evalDualA(t0));
			const fdDeriv = (realTrace(evalA(t0 + h)) - realTrace(evalA(t0 - h))) / (2 * h);

			assertDualClose(dualRes, { v: realTrace(evalA(t0)), d: fdDeriv }, 1e-8);
		});
	});
});
