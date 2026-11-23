import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { traceDualIterative } from './traceDualIterative.js';

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

function transpose(M) {
	const n = M.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => M[j][i]),
	);
}

describe('traceDualIterative', () => {
	describe('normal cases', () => {
		it('computes trace of a 1x1 dual matrix', () => {
			const result = traceDualIterative([[dual(3.5, -2.25)]]);
			assert.deepEqual(result, { v: 3.5, d: -2.25 });
		});

		it('computes trace of a 2x2 dual matrix ignoring off-diagonal elements', () => {
			const A = [
				[dual(1, 2), dual(100, 200)],
				[dual(-50, 75), dual(4, -5)],
			];
			const result = traceDualIterative(A);
			assert.deepEqual(result, { v: 5, d: -3 });
		});

		it('computes trace of a 3x3 dual matrix with fractional values', () => {
			const A = [
				[dual(0.5, 1.25), dual(9, -4), dual(3, 2)],
				[dual(-1, 0), dual(-2.5, 0.75), dual(7, 8)],
				[dual(6, 1), dual(2, -3), dual(4.0, -0.5)],
			];
			const result = traceDualIterative(A);
			assert.deepEqual(result, { v: 2, d: 1.5 });
		});

		it('handles zero derivatives (pure real entries) and zero values (pure dual entries)', () => {
			const realOnly = [
				[dual(10, 0), dual(1, 0)],
				[dual(2, 0), dual(-3, 0)],
			];
			assert.deepEqual(traceDualIterative(realOnly), { v: 7, d: 0 });

			const dualOnly = [
				[dual(0, 4.5), dual(0, 99)],
				[dual(0, -12), dual(0, -1.5)],
			];
			assert.deepEqual(traceDualIterative(dualOnly), { v: 0, d: 3 });
		});

		it('computes trace of a larger 10x10 dual matrix', () => {
			const n = 10;
			const M = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => dual(i + 1 + j * 10, (i + 1) * 2 - j)),
			);
			// Diagonal has j = i: v = 11*i + 1, d = i + 2 for i = 0..9
			// sum(v) = 11 * 45 + 10 = 505; sum(d) = 45 + 20 = 65
			assert.deepEqual(traceDualIterative(M), { v: 505, d: 65 });
		});
	});

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for an empty 0x0 matrix', () => {
			assert.deepEqual(traceDualIterative([]), { v: 0, d: 0 });
		});

		it('returns a fresh object and does not mutate the input matrix', () => {
			const entry = dual(7, 11);
			const M = [[entry]];
			const snapshot = structuredClone(M);

			const result = traceDualIterative(M);
			assert.deepEqual(result, { v: 7, d: 11 });
			assert.notEqual(result, entry);

			result.v = 999;
			result.d = 999;
			assert.deepEqual(M, snapshot);
		});

		it('handles negative zero entries cleanly', () => {
			const result = traceDualIterative([[dual(-0, -0)]]);
			assert.equal(Object.is(result.v, 0), true);
			assert.equal(Object.is(result.d, 0), true);
		});

		it('accepts null-prototype dual objects', () => {
			const entry = Object.assign(Object.create(null), { v: 2, d: 3 });
			assert.deepEqual(traceDualIterative([[entry]]), { v: 2, d: 3 });
		});
	});

	describe('invalid inputs', () => {
		it('throws TypeError when matrix is not an array', () => {
			for (const bad of [null, undefined, 42, 'matrix', { v: 1, d: 0 }]) {
				assert.throws(() => traceDualIterative(bad), TypeError);
			}
		});

		it('throws TypeError when a row is not an array', () => {
			assert.throws(() => traceDualIterative([null]), TypeError);
			assert.throws(() => traceDualIterative([dual(1, 0)]), TypeError);
			assert.throws(() => traceDualIterative([[dual(1, 0), dual(2, 0)], 'bad-row']), TypeError);
		});

		it('throws RangeError for non-square or jagged matrices', () => {
			assert.throws(() => traceDualIterative([[]]), RangeError);
			assert.throws(
				() => traceDualIterative([[dual(1, 0), dual(2, 0)]]),
				RangeError,
			);
			assert.throws(
				() => traceDualIterative([[dual(1, 0)], [dual(2, 0)]]),
				RangeError,
			);
			assert.throws(
				() => traceDualIterative([
					[dual(1, 0), dual(2, 0)],
					[dual(3, 0)],
				]),
				RangeError,
			);
		});

		it('throws TypeError for invalid dual entries on or off the diagonal', () => {
			// On-diagonal invalid entries
			assert.throws(() => traceDualIterative([[null]]), TypeError);
			assert.throws(() => traceDualIterative([[undefined]]), TypeError);
			assert.throws(() => traceDualIterative([[5]]), TypeError);
			assert.throws(() => traceDualIterative([[[1, 2]]]), TypeError);
			assert.throws(() => traceDualIterative([[{ v: 1 }]]), TypeError);
			assert.throws(() => traceDualIterative([[{ d: 1 }]]), TypeError);
			assert.throws(() => traceDualIterative([[{ v: '1', d: 0 }]]), TypeError);

			// Off-diagonal invalid entry must also be rejected
			assert.throws(
				() => traceDualIterative([
					[dual(1, 0), null],
					[dual(0, 0), dual(2, 0)],
				]),
				TypeError,
			);

			// Sparse row
			const sparseRow = new Array(2);
			sparseRow[0] = dual(1, 0);
			assert.throws(
				() => traceDualIterative([sparseRow, [dual(0, 0), dual(2, 0)]]),
				TypeError,
			);
		});

		it('throws RangeError for non-finite dual components on or off the diagonal', () => {
			for (const badVal of [NaN, Infinity, -Infinity]) {
				assert.throws(() => traceDualIterative([[{ v: badVal, d: 0 }]]), RangeError);
				assert.throws(() => traceDualIterative([[{ v: 0, d: badVal }]]), RangeError);
				assert.throws(
					() => traceDualIterative([
						[dual(1, 0), { v: badVal, d: 0 }],
						[dual(0, 0), dual(2, 0)],
					]),
					RangeError,
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('matches central finite-difference derivative of tr(A(t)) for a smooth parametric matrix', () => {
			// Smooth 3x3 matrix A(t) with analytical derivatives A'(t)
			const evalScalarMatrix = (t) => [
				[Math.sin(t) + t ** 2, Math.cos(2 * t), t],
				[Math.exp(0.5 * t), Math.exp(-t) * Math.cos(t), t ** 3],
				[Math.log(t + 2), t - 1, Math.sin(3 * t) - 2 * t],
			];

			const evalDualMatrix = (t) => [
				[
					dual(Math.sin(t) + t ** 2, Math.cos(t) + 2 * t),
					dual(Math.cos(2 * t), -2 * Math.sin(2 * t)),
					dual(t, 1),
				],
				[
					dual(Math.exp(0.5 * t), 0.5 * Math.exp(0.5 * t)),
					dual(Math.exp(-t) * Math.cos(t), -Math.exp(-t) * (Math.cos(t) + Math.sin(t))),
					dual(t ** 3, 3 * t ** 2),
				],
				[
					dual(Math.log(t + 2), 1 / (t + 2)),
					dual(t - 1, 1),
					dual(Math.sin(3 * t) - 2 * t, 3 * Math.cos(3 * t) - 2),
				],
			];

			const scalarTrace = (M) => M.reduce((sum, row, i) => sum + row[i], 0);
			const h = 1e-6;

			for (const t of [-0.7, 0.0, 0.85, 2.3]) {
				const trDual = traceDualIterative(evalDualMatrix(t));
				const trVal = scalarTrace(evalScalarMatrix(t));
				const fdDeriv = (scalarTrace(evalScalarMatrix(t + h)) - scalarTrace(evalScalarMatrix(t - h))) / (2 * h);

				assert.ok(Math.abs(trDual.v - trVal) < 1e-12, `value mismatch at t=${t}`);
				assert.ok(
					Math.abs(trDual.d - fdDeriv) < 1e-8,
					`derivative mismatch at t=${t}: dual=${trDual.d}, fd=${fdDeriv}`,
				);
			}
		});

		it('satisfies linearity, transpose invariance, and cyclic property tr(AB) = tr(BA) over dual numbers', () => {
			const A = [
				[dual(1.5, -0.5), dual(2.0, 1.0), dual(-1.0, 0.25)],
				[dual(0.5, 2.0), dual(-3.0, 0.75), dual(4.0, -1.5)],
				[dual(2.5, -1.25), dual(1.0, 0.5), dual(0.25, 3.0)],
			];
			const B = [
				[dual(-2.0, 1.5), dual(0.5, -0.25), dual(3.0, 0.5)],
				[dual(1.25, 0.75), dual(2.5, -2.0), dual(-0.5, 1.0)],
				[dual(-1.5, 2.25), dual(3.5, -1.0), dual(1.75, 0.25)],
			];

			// Transpose invariance: tr(A^T) = tr(A)
			const trA = traceDualIterative(A);
			const trAT = traceDualIterative(transpose(A));
			assert.deepEqual(trAT, trA);

			// Linearity with dual scalars: tr(alpha * A + beta * B) = alpha * tr(A) + beta * tr(B)
			const alpha = dual(2.5, -1.2);
			const beta = dual(-0.75, 3.4);
			const linComb = A.map((row, i) =>
				row.map((a, j) => dualAdd(dualMul(alpha, a), dualMul(beta, B[i][j]))),
			);
			const lhsLin = traceDualIterative(linComb);
			const rhsLin = dualAdd(dualMul(alpha, trA), dualMul(beta, traceDualIterative(B)));
			assert.ok(Math.abs(lhsLin.v - rhsLin.v) < 1e-12);
			assert.ok(Math.abs(lhsLin.d - rhsLin.d) < 1e-12);

			// Cyclic property: tr(A * B) = tr(B * A)
			const trAB = traceDualIterative(matMulDual(A, B));
			const trBA = traceDualIterative(matMulDual(B, A));
			assert.ok(Math.abs(trAB.v - trBA.v) < 1e-12);
			assert.ok(Math.abs(trAB.d - trBA.d) < 1e-12);
		});
	});
});
