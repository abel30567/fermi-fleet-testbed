import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceDualRecursive } from './traceDualRecursive.js';

const dual = (v, d = 0) => ({ v, d });

const dualAdd = (a, b) => ({ v: a.v + b.v, d: a.d + b.d });
const dualMul = (a, b) => ({ v: a.v * b.v, d: a.v * b.d + a.d * b.v });

function matMulDual(A, B) {
	const n = A.length;
	const C = Array.from({ length: n }, () => new Array(n));
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let acc = dual(0, 0);
			for (let k = 0; k < n; k++) {
				acc = dualAdd(acc, dualMul(A[i][k], B[k][j]));
			}
			C[i][j] = acc;
		}
	}
	return C;
}

describe('traceDualRecursive', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 dual matrix without aliasing input', () => {
			const entry = dual(3.5, -2.25);
			const result = traceDualRecursive([[entry]]);
			assert.deepEqual(result, { v: 3.5, d: -2.25 });
			assert.notEqual(result, entry);
		});

		it('computes trace of a 2x2 dual matrix ignoring off-diagonal entries', () => {
			const M = [
				[dual(1, 2), dual(100, -50)],
				[dual(-999, 42), dual(3, 4)],
			];
			assert.deepEqual(traceDualRecursive(M), { v: 4, d: 6 });
		});

		it('computes trace of a 3x3 (odd-sized) dual matrix', () => {
			const M = [
				[dual(2, 0.5), dual(1, 1), dual(0, 3)],
				[dual(-4, 2), dual(-5, 1.5), dual(6, -1)],
				[dual(7, 0), dual(8, -2), dual(10, -4)],
			];
			assert.deepEqual(traceDualRecursive(M), { v: 7, d: -2 });
		});

		it('computes trace of a 4x4 (power-of-two) dual matrix', () => {
			const M = [
				[dual(1, 10), dual(2, 0), dual(3, 0), dual(4, 0)],
				[dual(5, 0), dual(-2, 20), dual(6, 0), dual(7, 0)],
				[dual(8, 0), dual(9, 0), dual(3, -5), dual(10, 0)],
				[dual(11, 0), dual(12, 0), dual(13, 0), dual(4, -15)],
			];
			assert.deepEqual(traceDualRecursive(M), { v: 6, d: 10 });
		});

		it('matches direct iterative summation on a large 64x64 dual matrix', () => {
			const n = 64;
			const M = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) =>
					dual((i + 1) * 0.25 - j * 0.1, (i - j) * 0.5 + 1)
				)
			);
			let expectedV = 0;
			let expectedD = 0;
			for (let i = 0; i < n; i++) {
				expectedV += M[i][i].v;
				expectedD += M[i][i].d;
			}
			const result = traceDualRecursive(M);
			assert.ok(Math.abs(result.v - expectedV) < 1e-12);
			assert.ok(Math.abs(result.d - expectedD) < 1e-12);
		});
	});

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for an empty 0x0 matrix', () => {
			assert.deepEqual(traceDualRecursive([]), { v: 0, d: 0 });
		});

		it('returns { v: 0, d: 0 } for a zero matrix', () => {
			const Z = [
				[dual(0, 0), dual(0, 0)],
				[dual(0, 0), dual(0, 0)],
			];
			assert.deepEqual(traceDualRecursive(Z), { v: 0, d: 0 });
		});

		it('returns { v: 0, d: 0 } for a strictly off-diagonal matrix', () => {
			const M = [
				[dual(0, 0), dual(5, 3), dual(-2, 7)],
				[dual(8, -1), dual(0, 0), dual(4, 2)],
				[dual(-3, 9), dual(6, -4), dual(0, 0)],
			];
			assert.deepEqual(traceDualRecursive(M), { v: 0, d: 0 });
		});

		it('does not mutate the input matrix', () => {
			const M = [
				[dual(1, 2), dual(3, 4)],
				[dual(5, 6), dual(7, 8)],
			];
			const snapshot = structuredClone(M);
			traceDualRecursive(M);
			assert.deepEqual(M, snapshot);
		});
	});

	describe('independent cross-checks', () => {
		it('agrees with central finite-difference derivative of tr(A(t))', () => {
			const n = 5;
			const entryVal = (i, j, t) =>
				Math.sin((i + 1) * t) + (j + 1) * t * t + Math.exp(((i - j) * t) / 5);
			const entryDeriv = (i, j, t) =>
				(i + 1) * Math.cos((i + 1) * t) +
				2 * (j + 1) * t +
				((i - j) / 5) * Math.exp(((i - j) * t) / 5);

			const t0 = 0.73;
			const dualMatrix = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) =>
					dual(entryVal(i, j, t0), entryDeriv(i, j, t0))
				)
			);

			const { v, d } = traceDualRecursive(dualMatrix);

			const scalarTraceAt = (t) => {
				let sum = 0;
				for (let i = 0; i < n; i++) {
					sum += entryVal(i, i, t);
				}
				return sum;
			};

			const h = 1e-6;
			const fdDeriv = (scalarTraceAt(t0 + h) - scalarTraceAt(t0 - h)) / (2 * h);

			assert.ok(Math.abs(v - scalarTraceAt(t0)) < 1e-12);
			assert.ok(
				Math.abs(d - fdDeriv) < 1e-8,
				`Expected dual derivative ${d} to match finite difference ${fdDeriv}`
			);
		});

		it('satisfies linearity over dual scalars: tr(αA + βB) = α tr(A) + β tr(B)', () => {
			const A = [
				[dual(1, 0.5), dual(-2, 1), dual(3, -1)],
				[dual(4, 2), dual(5, -0.5), dual(6, 0)],
				[dual(-1, 3), dual(2, -2), dual(0.5, 4)],
			];
			const B = [
				[dual(-3, 1.5), dual(0, 2), dual(1, 1)],
				[dual(2, -1), dual(4, 3), dual(-5, 0.5)],
				[dual(7, 0), dual(-1, 1), dual(2.5, -2)],
			];
			const alpha = dual(2, -1);
			const beta = dual(-1.5, 0.5);

			const combined = A.map((row, i) =>
				row.map((a, j) => dualAdd(dualMul(alpha, a), dualMul(beta, B[i][j])))
			);

			const lhs = traceDualRecursive(combined);
			const rhs = dualAdd(
				dualMul(alpha, traceDualRecursive(A)),
				dualMul(beta, traceDualRecursive(B))
			);

			assert.ok(Math.abs(lhs.v - rhs.v) < 1e-12);
			assert.ok(Math.abs(lhs.d - rhs.d) < 1e-12);
		});

		it('satisfies transpose invariance and cyclic property tr(AB) = tr(BA)', () => {
			const A = [
				[dual(1, 2), dual(-3, 0.5), dual(2, -1)],
				[dual(0.5, -2), dual(4, 1), dual(-1, 3)],
				[dual(3, 0), dual(2, -1.5), dual(-2, 2)],
			];
			const B = [
				[dual(-1, 1), dual(2, -0.5), dual(0, 2)],
				[dual(3, -1), dual(1, 2), dual(-2, 0.5)],
				[dual(0.5, 3), dual(-4, 1), dual(1.5, -2)],
			];

			const AT = A[0].map((_, col) => A.map((row) => row[col]));
			const trA = traceDualRecursive(A);
			const trAT = traceDualRecursive(AT);
			assert.deepEqual(trA, trAT);

			const trAB = traceDualRecursive(matMulDual(A, B));
			const trBA = traceDualRecursive(matMulDual(B, A));
			assert.ok(Math.abs(trAB.v - trBA.v) < 1e-12);
			assert.ok(Math.abs(trAB.d - trBA.d) < 1e-12);
		});
	});

	describe('input validation', () => {
		it('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', { v: 1, d: 0 }]) {
				assert.throws(() => traceDualRecursive(bad), TypeError);
			}
		});

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => traceDualRecursive([1]), TypeError);
			assert.throws(
				() => traceDualRecursive([[dual(1, 0), dual(0, 0)], null]),
				TypeError
			);
		});

		it('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(() => traceDualRecursive([[]]), RangeError);
			assert.throws(
				() => traceDualRecursive([[dual(1, 0), dual(2, 0)]]),
				RangeError
			);
			assert.throws(
				() => traceDualRecursive([[dual(1, 0)], [dual(2, 0)]]),
				RangeError
			);
			assert.throws(
				() =>
					traceDualRecursive([
						[dual(1, 0), dual(2, 0)],
						[dual(3, 0)],
					]),
				RangeError
			);
		});

		it('throws TypeError for malformed dual entries', () => {
			assert.throws(() => traceDualRecursive([[null]]), TypeError);
			assert.throws(() => traceDualRecursive([[5]]), TypeError);
			assert.throws(() => traceDualRecursive([[[1, 2]]]), TypeError);
			assert.throws(() => traceDualRecursive([[{ v: 1 }]]), TypeError);
			assert.throws(() => traceDualRecursive([[{ d: 1 }]]), TypeError);
			assert.throws(
				() => traceDualRecursive([[{ v: '1', d: 0 }]]),
				TypeError
			);
			assert.throws(
				() => traceDualRecursive([[{ v: 1, d: '0' }]]),
				TypeError
			);
		});

		it('throws RangeError for non-finite dual components on diagonal or off-diagonal', () => {
			assert.throws(
				() => traceDualRecursive([[{ v: Number.NaN, d: 0 }]]),
				RangeError
			);
			assert.throws(
				() => traceDualRecursive([[{ v: 0, d: Number.POSITIVE_INFINITY }]]),
				RangeError
			);
			assert.throws(
				() => traceDualRecursive([[{ v: Number.NEGATIVE_INFINITY, d: 1 }]]),
				RangeError
			);
			// Off-diagonal invalid value should also be rejected
			assert.throws(
				() =>
					traceDualRecursive([
						[dual(1, 0), { v: Number.NaN, d: 0 }],
						[dual(0, 0), dual(2, 0)],
					]),
				RangeError
			);
		});
	});
});
