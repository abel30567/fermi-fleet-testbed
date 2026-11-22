import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { traceTypedSeries } from './traceTypedSeries.js';

/**
 * Helper to create a deterministic pseudo-random series of `count` n×n matrices
 * using a Linear Congruential Generator (LCG).
 */
function makeDeterministicSeries(count, n, seed = 123456789) {
	const matSize = n * n;
	const data = new Float64Array(count * matSize);
	let state = seed >>> 0;
	for (let i = 0; i < data.length; i++) {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		data[i] = (state / 0x100000000) * 20 - 10;
	}
	return data;
}

/**
 * Helper to multiply two packed series of n×n row-major matrices element-wise:
 * C[m] = A[m] * B[m].
 */
function matMulSeries(a, b, n) {
	const matSize = n * n;
	const count = a.length / matSize;
	const out = new Float64Array(a.length);
	for (let m = 0; m < count; m++) {
		const base = m * matSize;
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) {
				let acc = 0;
				for (let k = 0; k < n; k++) {
					acc += a[base + i * n + k] * b[base + k * n + j];
				}
				out[base + i * n + j] = acc;
			}
		}
	}
	return out;
}

/**
 * Helper to transpose each n×n row-major matrix in a packed series.
 */
function transposeSeries(a, n) {
	const matSize = n * n;
	const count = a.length / matSize;
	const out = new Float64Array(a.length);
	for (let m = 0; m < count; m++) {
		const base = m * matSize;
		for (let i = 0; i < n; i++) {
			for (let j = 0; j < n; j++) {
				out[base + j * n + i] = a[base + i * n + j];
			}
		}
	}
	return out;
}

/**
 * Helper to create a packed n×n identity matrix.
 */
function identityMatrix(n) {
	const m = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		m[i * (n + 1)] = 1;
	}
	return m;
}

/**
 * Helper to create an n×n matrix with specified diagonal entries and non-zero off-diagonals.
 */
function matrixWithDiagonal(diag, offDiag = 999) {
	const n = diag.length;
	const m = new Float64Array(n * n);
	m.fill(offDiag);
	for (let i = 0; i < n; i++) {
		m[i * (n + 1)] = diag[i];
	}
	return m;
}

describe('traceTypedSeries', () => {
	describe('normal cases', () => {
		test('1×1 matrices (single and batched)', () => {
			const single = new Float64Array([42.5]);
			const resSingle = traceTypedSeries(single, 1);
			assert.ok(resSingle instanceof Float64Array);
			assert.deepEqual(resSingle, new Float64Array([42.5]));

			const batch = new Float64Array([-3.25, 0, 7.5, 1e-12]);
			const resBatch = traceTypedSeries(batch, 1);
			assert.deepEqual(resBatch, new Float64Array([-3.25, 0, 7.5, 1e-12]));
		});

		test('2×2 matrix', () => {
			// [[1, 2], [3, 4]] -> trace = 1 + 4 = 5
			const data = new Float64Array([1, 2, 3, 4]);
			const res = traceTypedSeries(data, 2);
			assert.deepEqual(res, new Float64Array([5]));
		});

		test('3×3 matrix', () => {
			// [[2, -1, 5], [7, 3, 4], [9, 8, -6]] -> trace = 2 + 3 - 6 = -1
			const data = new Float64Array([
				2, -1, 5,
				7, 3, 4,
				9, 8, -6
			]);
			const res = traceTypedSeries(data, 3);
			assert.deepEqual(res, new Float64Array([-1]));
		});

		test('4×4 matrix', () => {
			const data = new Float64Array([
				1.5, 10, 20, 30,
				40, -2.25, 50, 60,
				70, 80, 3.75, 90,
				100, 110, 120, 4.0
			]);
			const res = traceTypedSeries(data, 4);
			assert.deepEqual(res, new Float64Array([7.0]));
		});

		test('batched series of multiple matrices without mutating input', () => {
			const data = new Float64Array([
				// M0 (3×3): diag 1, 5, 9 -> 15
				1, 2, 3,
				4, 5, 6,
				7, 8, 9,
				// M1 (3×3): diag -2, 0, 2 -> 0
				-2, 100, -50,
				30, 0, 40,
				11, 22, 2,
				// M2 (3×3): diag 0.25, 0.5, 1.25 -> 2
				0.25, 9, 8,
				7, 0.5, 6,
				5, 4, 1.25
			]);
			const snapshot = new Float64Array(data);
			const res = traceTypedSeries(data, 3);

			assert.ok(res instanceof Float64Array);
			assert.equal(res.length, 3);
			assert.deepEqual(res, new Float64Array([15, 0, 2]));
			assert.deepEqual(data, snapshot);
		});
	});

	describe('edge cases', () => {
		test('empty Float64Array returns empty Float64Array', () => {
			for (const n of [1, 2, 3, 5]) {
				const res = traceTypedSeries(new Float64Array(0), n);
				assert.ok(res instanceof Float64Array);
				assert.equal(res.length, 0);
			}
		});

		test('zero matrices produce 0', () => {
			const res = traceTypedSeries(new Float64Array(3 * 4 * 4), 4);
			assert.deepEqual(res, new Float64Array([0, 0, 0]));
		});

		test('identity matrices I_n have trace n', () => {
			for (const n of [1, 2, 3, 4, 7, 16]) {
				const res = traceTypedSeries(identityMatrix(n), n);
				assert.deepEqual(res, new Float64Array([n]));
			}
		});

		test('negative and catastrophic cancellation diagonals (Neumaier stability)', () => {
			// [1, 1e16, -1e16] fails both naive and Kahan summation (gives 0),
			// whereas Neumaier compensated summation recovers exact 1.
			const m3 = matrixWithDiagonal([1, 1e16, -1e16], 12345);
			assert.deepEqual(traceTypedSeries(m3, 3), new Float64Array([1]));

			// [1, 1e16, 1, -1e16] -> exact 2
			const m4 = matrixWithDiagonal([1, 1e16, 1, -1e16], -77);
			assert.deepEqual(traceTypedSeries(m4, 4), new Float64Array([2]));

			// [-1e16, 0.5, 1e16, -0.25, 0.75] -> exact 1.0
			const m5 = matrixWithDiagonal([-1e16, 0.5, 1e16, -0.25, 0.75], 0);
			assert.deepEqual(traceTypedSeries(m5, 5), new Float64Array([1.0]));

			// Negative diagonal entries summing to negative exact value
			const mNeg = matrixWithDiagonal([-10, -20, -30, -40], 5);
			assert.deepEqual(traceTypedSeries(mNeg, 4), new Float64Array([-100]));
		});

		test('non-finite diagonal values follow IEEE-754 semantics', () => {
			const mInf = matrixWithDiagonal([1, Infinity, 2], 0);
			assert.equal(traceTypedSeries(mInf, 3)[0], Infinity);

			const mNegInf = matrixWithDiagonal([5, -Infinity, -3], 0);
			assert.equal(traceTypedSeries(mNegInf, 3)[0], -Infinity);

			const mInfCancel = matrixWithDiagonal([Infinity, 1, -Infinity], 0);
			assert.ok(Number.isNaN(traceTypedSeries(mInfCancel, 3)[0]));

			const mNaN = matrixWithDiagonal([1, NaN, 2], 0);
			assert.ok(Number.isNaN(traceTypedSeries(mNaN, 3)[0]));
		});

		test('invalid inputs throw TypeError or RangeError', () => {
			// Invalid data types
			assert.throws(() => traceTypedSeries([1, 2, 3, 4], 2), TypeError);
			assert.throws(() => traceTypedSeries(new Float32Array(4), 2), TypeError);
			assert.throws(() => traceTypedSeries(new Int32Array(4), 2), TypeError);
			assert.throws(() => traceTypedSeries(null, 2), TypeError);
			assert.throws(() => traceTypedSeries(undefined, 2), TypeError);
			assert.throws(() => traceTypedSeries({ length: 4 }, 2), TypeError);

			// Invalid n types
			assert.throws(() => traceTypedSeries(new Float64Array(4), '2'), TypeError);
			assert.throws(() => traceTypedSeries(new Float64Array(4), null), TypeError);
			assert.throws(() => traceTypedSeries(new Float64Array(4), undefined), TypeError);

			// Invalid n values
			assert.throws(() => traceTypedSeries(new Float64Array(4), 0), RangeError);
			assert.throws(() => traceTypedSeries(new Float64Array(4), -2), RangeError);
			assert.throws(() => traceTypedSeries(new Float64Array(4), 1.5), RangeError);
			assert.throws(() => traceTypedSeries(new Float64Array(4), NaN), RangeError);
			assert.throws(() => traceTypedSeries(new Float64Array(4), Infinity), RangeError);
			assert.throws(() => traceTypedSeries(new Float64Array(0), 1e9), RangeError);

			// Misaligned data.length
			assert.throws(() => traceTypedSeries(new Float64Array(3), 2), RangeError);
			assert.throws(() => traceTypedSeries(new Float64Array(5), 2), RangeError);
			assert.throws(() => traceTypedSeries(new Float64Array(10), 3), RangeError);
		});
	});

	describe('mathematical cross-checks', () => {
		test('cyclic invariance: tr(A * B) === tr(B * A)', () => {
			for (const n of [2, 3, 4, 5]) {
				const count = 8;
				const A = makeDeterministicSeries(count, n, 101 * n);
				const B = makeDeterministicSeries(count, n, 202 * n);

				const trAB = traceTypedSeries(matMulSeries(A, B, n), n);
				const trBA = traceTypedSeries(matMulSeries(B, A, n), n);

				assert.equal(trAB.length, count);
				for (let m = 0; m < count; m++) {
					assert.ok(
						Math.abs(trAB[m] - trBA[m]) <= 1e-11,
						`n=${n}, m=${m}: tr(AB)=${trAB[m]} vs tr(BA)=${trBA[m]}`
					);
				}
			}
		});

		test('linearity: tr(alpha * A + beta * B) === alpha * tr(A) + beta * tr(B)', () => {
			const n = 4;
			const count = 10;
			const alpha = 2.75;
			const beta = -1.625;
			const A = makeDeterministicSeries(count, n, 314159);
			const B = makeDeterministicSeries(count, n, 271828);

			const combined = new Float64Array(A.length);
			for (let i = 0; i < A.length; i++) {
				combined[i] = alpha * A[i] + beta * B[i];
			}

			const trCombined = traceTypedSeries(combined, n);
			const trA = traceTypedSeries(A, n);
			const trB = traceTypedSeries(B, n);

			for (let m = 0; m < count; m++) {
				const expected = alpha * trA[m] + beta * trB[m];
				assert.ok(
					Math.abs(trCombined[m] - expected) <= 1e-12,
					`m=${m}: tr(aA+bB)=${trCombined[m]} vs a*tr(A)+b*tr(B)=${expected}`
				);
			}
		});

		test('transpose invariance: tr(A^T) === tr(A)', () => {
			for (const n of [1, 2, 3, 4, 6]) {
				const count = 6;
				const A = makeDeterministicSeries(count, n, 98765 + n);
				const AT = transposeSeries(A, n);

				assert.deepEqual(traceTypedSeries(AT, n), traceTypedSeries(A, n));
			}
		});
	});
});
