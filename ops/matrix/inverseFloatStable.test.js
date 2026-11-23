import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inverseFloatStable } from './inverseFloatStable.js';

/**
 * Multiplies two n x n matrices in float64.
 */
function matMul(A, B) {
	const n = A.length;
	const C = Array.from({ length: n }, () => new Array(n).fill(0));
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0;
			for (let k = 0; k < n; k++) {
				sum += A[i][k] * B[k][j];
			}
			C[i][j] = sum;
		}
	}
	return C;
}

/**
 * Returns max_{i,j} |A[i][j] - B[i][j]|.
 */
function maxAbsDiff(A, B) {
	let max = 0;
	for (let i = 0; i < A.length; i++) {
		for (let j = 0; j < A[i].length; j++) {
			const d = Math.abs(A[i][j] - B[i][j]);
			if (d > max) max = d;
		}
	}
	return max;
}

/**
 * Returns max relative entrywise error against reference matrix B.
 */
function maxRelDiff(A, B) {
	let max = 0;
	for (let i = 0; i < A.length; i++) {
		for (let j = 0; j < A[i].length; j++) {
			const scale = Math.max(Math.abs(B[i][j]), 1);
			const d = Math.abs(A[i][j] - B[i][j]) / scale;
			if (d > max) max = d;
		}
	}
	return max;
}

/**
 * Returns n x n identity matrix.
 */
function eye(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
	);
}

/**
 * Returns transpose of n x n matrix.
 */
function transpose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	);
}

/**
 * Builds an n x n Hilbert matrix H[i][j] = 1 / (i + j + 1).
 */
function hilbert(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => 1 / (i + j + 1))
	);
}

/**
 * Exact BigInt binomial coefficient C(n, k).
 */
function binomBig(n, k) {
	if (k < 0 || k > n) return 0n;
	let r = 1n;
	const m = Math.min(k, n - k);
	for (let i = 1; i <= m; i++) {
		r = (r * BigInt(n - m + i)) / BigInt(i);
	}
	return r;
}

/**
 * Closed-form exact inverse of the n x n Hilbert matrix (integer entries).
 */
function exactHilbertInverse(n) {
	return Array.from({ length: n }, (_, i0) => {
		const i = i0 + 1;
		return Array.from({ length: n }, (_, j0) => {
			const j = j0 + 1;
			const sign = (i + j) % 2 === 0 ? 1n : -1n;
			const c1 = binomBig(n + i - 1, n - j);
			const c2 = binomBig(n + j - 1, n - i);
			const c3 = binomBig(i + j - 2, i - 1);
			return Number(sign * BigInt(i + j - 1) * c1 * c2 * c3 * c3);
		});
	});
}

// --- Independent exact BigInt rational Gauss-Jordan inverter for cross-checking ---

function gcdBig(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function rat(num, den = 1n) {
	if (den === 0n) throw new Error('Zero denominator');
	if (num === 0n) return [0n, 1n];
	if (den < 0n) {
		num = -num;
		den = -den;
	}
	const g = gcdBig(num, den);
	return [num / g, den / g];
}

function ratSub([a, b], [c, d]) {
	return rat(a * d - c * b, b * d);
}

function ratMul([a, b], [c, d]) {
	return rat(a * c, b * d);
}

function ratDiv([a, b], [c, d]) {
	return rat(a * d, b * c);
}

function ratToNumber([num, den]) {
	// Convert exact BigInt fraction to float64 with high accuracy
	const sign = num < 0n ? -1 : 1;
	const a = num < 0n ? -num : num;
	if (a === 0n) return 0;
	const scaleBits = 64n;
	const scaled = (a << scaleBits) / den;
	return sign * (Number(scaled) / Number(1n << scaleBits));
}

/**
 * Independent Gauss-Jordan inversion over exact BigInt rationals.
 * Takes an n x n matrix of [BigInt, BigInt] rational pairs.
 */
function exactRationalInverse(ratMatrix) {
	const n = ratMatrix.length;
	const aug = ratMatrix.map((row, i) => [
		...row.map(([num, den]) => rat(num, den)),
		...Array.from({ length: n }, (_, j) => (i === j ? [1n, 1n] : [0n, 1n]))
	]);

	for (let col = 0; col < n; col++) {
		let piv = -1;
		for (let r = col; r < n; r++) {
			if (aug[r][col][0] !== 0n) {
				piv = r;
				break;
			}
		}
		if (piv === -1) throw new Error('Singular rational matrix');
		if (piv !== col) {
			[aug[col], aug[piv]] = [aug[piv], aug[col]];
		}
		const pivotVal = aug[col][col];
		for (let j = col; j < 2 * n; j++) {
			aug[col][j] = ratDiv(aug[col][j], pivotVal);
		}
		for (let r = 0; r < n; r++) {
			if (r === col || aug[r][col][0] === 0n) continue;
			const factor = aug[r][col];
			for (let j = col; j < 2 * n; j++) {
				aug[r][j] = ratSub(aug[r][j], ratMul(factor, aug[col][j]));
			}
		}
	}

	return aug.map((row) => row.slice(n).map(ratToNumber));
}

describe('inverseFloatStable', () => {
	describe('normal cases', () => {
		it('inverts 1x1 matrices', () => {
			assert.deepEqual(inverseFloatStable([[4]]), [[0.25]]);
			assert.deepEqual(inverseFloatStable([[-2]]), [[-0.5]]);
			assert.ok(Math.abs(inverseFloatStable([[3]])[0][0] - 1 / 3) <= Number.EPSILON);
		});

		it('inverts 2x2 matrices accurately', () => {
			const A = [
				[4, 7],
				[2, 6]
			];
			const inv = inverseFloatStable(A);
			const expected = [
				[0.6, -0.7],
				[-0.2, 0.4]
			];
			assert.ok(maxAbsDiff(inv, expected) <= 1e-15);
			assert.ok(maxAbsDiff(matMul(A, inv), eye(2)) <= 1e-15);
		});

		it('inverts orthogonal rotation matrices (A^-1 = A^T)', () => {
			const theta = 1.23456789;
			const c = Math.cos(theta);
			const s = Math.sin(theta);
			const R = [
				[c, -s],
				[s, c]
			];
			const inv = inverseFloatStable(R);
			assert.ok(maxAbsDiff(inv, transpose(R)) <= 1e-15);
		});

		it('inverts 3x3 unimodular integer matrix with exact integer inverse', () => {
			const A = [
				[1, 2, 3],
				[0, 1, 4],
				[5, 6, 0]
			];
			const expected = [
				[-24, 18, 5],
				[20, -15, -4],
				[-5, 4, 1]
			];
			const inv = inverseFloatStable(A);
			assert.ok(maxAbsDiff(inv, expected) <= 1e-13);
			assert.ok(maxAbsDiff(matMul(A, inv), eye(3)) <= 1e-14);
			assert.ok(maxAbsDiff(matMul(inv, A), eye(3)) <= 1e-14);
		});

		it('inverts diagonal, triangular, and permutation matrices', () => {
			const D = [
				[2, 0, 0],
				[0, -4, 0],
				[0, 0, 0.5]
			];
			assert.deepEqual(inverseFloatStable(D), [
				[0.5, 0, 0],
				[0, -0.25, 0],
				[0, 0, 2]
			]);

			const U = [
				[2, 3, -1],
				[0, 4, 5],
				[0, 0, -2]
			];
			const invU = inverseFloatStable(U);
			assert.ok(maxAbsDiff(matMul(U, invU), eye(3)) <= 1e-15);

			const P = [
				[0, 0, 1, 0],
				[1, 0, 0, 0],
				[0, 0, 0, 1],
				[0, 1, 0, 0]
			];
			assert.deepEqual(inverseFloatStable(P), transpose(P));
		});

		it('inverts larger dense deterministic matrices (16x16)', () => {
			const n = 16;
			let seed = 42;
			const next = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				return (seed / 0xffffffff) * 2 - 1;
			};
			const A = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => next() + (i === j ? 4 : 0))
			);
			const inv = inverseFloatStable(A);
			const I = eye(n);
			assert.ok(maxAbsDiff(matMul(A, inv), I) <= 1e-14);
			assert.ok(maxAbsDiff(matMul(inv, A), I) <= 1e-14);
		});
	});

	describe('numerical stability and hard cases', () => {
		it('handles zero diagonal entries requiring pivoting', () => {
			const A = [
				[0, 1, 2],
				[1, 0, 3],
				[4, 5, 0]
			];
			const inv = inverseFloatStable(A);
			assert.ok(maxAbsDiff(matMul(A, inv), eye(3)) <= 1e-15);
			assert.ok(maxAbsDiff(matMul(inv, A), eye(3)) <= 1e-15);
		});

		it('avoids catastrophic cancellation on tiny-pivot 2x2 matrix', () => {
			const eps = 1e-12;
			const A = [
				[eps, 1],
				[1, 1]
			];
			const inv = inverseFloatStable(A);
			const denom = eps - 1;
			const expected = [
				[1 / denom, -1 / denom],
				[-1 / denom, eps / denom]
			];
			assert.ok(maxAbsDiff(inv, expected) <= 1e-15);
			assert.ok(maxAbsDiff(matMul(A, inv), eye(2)) <= 1e-15);
		});

		it('handles Wilkinson matrix (n=20) where partial pivoting has 2^(n-1) growth', () => {
			const n = 20;
			const W = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					if (j === n - 1) return 1;
					if (i === j) return 1;
					if (i > j) return -1;
					return 0;
				})
			);
			const inv = inverseFloatStable(W);
			const I = eye(n);
			assert.ok(maxAbsDiff(matMul(W, inv), I) <= 1e-14);
			assert.ok(maxAbsDiff(matMul(inv, W), I) <= 1e-14);
		});

		it('handles extreme row/column scaling via power-of-2 equilibration', () => {
			const diag = [
				[1e200, 0],
				[0, 1e-200]
			];
			const invDiag = inverseFloatStable(diag);
			assert.ok(Math.abs(invDiag[0][0] - 1e-200) <= 1e-215);
			assert.ok(Math.abs(invDiag[1][1] - 1e200) <= 1e185);
			assert.equal(invDiag[0][1], 0);
			assert.equal(invDiag[1][0], 0);

			// 600 orders of magnitude spread across entries
			const tri = [
				[1e300, 1e-300],
				[0, 1e-300]
			];
			const invTri = inverseFloatStable(tri);
			assert.ok(Math.abs(invTri[0][0] - 1e-300) <= 1e-314);
			assert.ok(Math.abs(invTri[0][1] + 1e-300) <= 1e-314);
			assert.equal(invTri[1][0], 0);
			assert.ok(Math.abs(invTri[1][1] - 1e300) <= 1e286);

			// Dense matrix with simultaneous row and column scaling: A = D1 * M * D2
			const M = [
				[2, -1, 3],
				[1, 4, -2],
				[-3, 2, 5]
			];
			const d1 = [1e120, 1, 1e-120];
			const d2 = [1e-100, 1e50, 1e100];
			const A = M.map((row, i) => row.map((v, j) => d1[i] * v * d2[j]));
			const invA = inverseFloatStable(A);
			const invM = inverseFloatStable(M);
			const expected = invM.map((row, i) => row.map((v, j) => (v / d2[i]) / d1[j]));
			assert.ok(maxRelDiff(invA, expected) <= 1e-14);
		});

		it('accurately inverts ill-conditioned Hilbert matrices H_4, H_6, and H_8', () => {
			for (const [n, relTol] of [
				[4, 1e-12],
				[6, 1e-8],
				[8, 1e-5]
			]) {
				const H = hilbert(n);
				const invH = inverseFloatStable(H);
				const exact = exactHilbertInverse(n);
				assert.ok(
					maxRelDiff(invH, exact) <= relTol,
					`Hilbert H_${n} relative error exceeded ${relTol}: got ${maxRelDiff(invH, exact)}`
				);
			}
		});
	});

	describe('edge cases and immutability', () => {
		it('does not mutate the input matrix', () => {
			const A = [
				[1, 2, 3],
				[0, 1, 4],
				[5, 6, 0]
			];
			const snapshot = structuredClone(A);
			inverseFloatStable(A);
			assert.deepEqual(A, snapshot);
		});

		it('normalizes negative zero entries to +0', () => {
			const inv = inverseFloatStable([
				[-1, 0],
				[0, 1]
			]);
			assert.ok(Object.is(inv[0][1], 0));
			assert.ok(Object.is(inv[1][0], 0));
		});

		it('supports custom options (tolerance and refinementSteps)', () => {
			const A = [
				[3, 1],
				[2, 4]
			];
			const inv0 = inverseFloatStable(A, { refinementSteps: 0 });
			const inv5 = inverseFloatStable(A, { refinementSteps: 5, tolerance: 1e-15 });
			assert.ok(maxAbsDiff(inv0, inv5) <= 1e-15);
		});

		it('throws RangeError on singular and numerically singular matrices', () => {
			assert.throws(() => inverseFloatStable([[0]]), RangeError);
			assert.throws(
				() =>
					inverseFloatStable([
						[0, 0],
						[0, 0]
					]),
				RangeError
			);
			assert.throws(
				() =>
					inverseFloatStable([
						[1, 2],
						[2, 4]
					]),
				RangeError
			);
			assert.throws(
				() =>
					inverseFloatStable([
						[1, 2, 3],
						[4, 5, 6],
						[7, 8, 9]
					]),
				RangeError
			);
			// Floating-point noisy rank-deficient matrix
			assert.throws(
				() =>
					inverseFloatStable([
						[0.1, 0.2, 0.3],
						[0.4, 0.5, 0.6],
						[0.7, 0.8, 0.9]
					]),
				RangeError
			);
		});

		it('throws RangeError when inverse overflows float64 range', () => {
			assert.throws(() => inverseFloatStable([[1e-315]]), RangeError);
		});
	});

	describe('input validation', () => {
		it('rejects non-array matrix inputs with TypeError', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, new Float64Array([1])]) {
				assert.throws(() => inverseFloatStable(bad), TypeError);
			}
		});

		it('rejects empty matrix with RangeError', () => {
			assert.throws(() => inverseFloatStable([]), RangeError);
		});

		it('rejects non-array rows with TypeError', () => {
			assert.throws(() => inverseFloatStable([1, 2]), TypeError);
			assert.throws(() => inverseFloatStable([[1, 2], 'not-a-row']), TypeError);
		});

		it('rejects non-square and ragged matrices with RangeError', () => {
			assert.throws(
				() =>
					inverseFloatStable([
						[1, 2, 3],
						[4, 5, 6]
					]),
				RangeError
			);
			assert.throws(() => inverseFloatStable([[1, 2], [3]]), RangeError);
			assert.throws(() => inverseFloatStable([[]]), RangeError);
		});

		it('rejects non-number and non-finite entries', () => {
			assert.throws(() => inverseFloatStable([['1']]), TypeError);
			assert.throws(() => inverseFloatStable([[null]]), TypeError);
			assert.throws(() => inverseFloatStable([[undefined]]), TypeError);
			assert.throws(() => inverseFloatStable([[1n]]), TypeError);
			assert.throws(() => inverseFloatStable([[NaN]]), RangeError);
			assert.throws(() => inverseFloatStable([[Infinity]]), RangeError);
			assert.throws(() => inverseFloatStable([[-Infinity]]), RangeError);
		});

		it('validates options argument', () => {
			const I2 = eye(2);
			assert.throws(() => inverseFloatStable(I2, null), TypeError);
			assert.throws(() => inverseFloatStable(I2, []), TypeError);
			assert.throws(() => inverseFloatStable(I2, { tolerance: '1e-12' }), TypeError);
			assert.throws(() => inverseFloatStable(I2, { tolerance: -1 }), RangeError);
			assert.throws(() => inverseFloatStable(I2, { tolerance: NaN }), RangeError);
			assert.throws(() => inverseFloatStable(I2, { refinementSteps: '2' }), TypeError);
			assert.throws(() => inverseFloatStable(I2, { refinementSteps: -1 }), RangeError);
			assert.throws(() => inverseFloatStable(I2, { refinementSteps: 1.5 }), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches exact BigInt rational Gauss-Jordan inverse on rational/Vandermonde/Pascal matrices', () => {
			// 5x5 Vandermonde-like matrix with integer entries
			const vandermonde = [1, 2, 3, 4, 5].map((x) =>
				[0, 1, 2, 3, 4].map((p) => x ** p)
			);
			const vandRat = vandermonde.map((row) => row.map((v) => [BigInt(v), 1n]));
			const refVand = exactRationalInverse(vandRat);
			const gotVand = inverseFloatStable(vandermonde);
			assert.ok(maxRelDiff(gotVand, refVand) <= 1e-11);

			// 5x5 rational Hilbert matrix computed via exact BigInt fractions
			const h5Rat = Array.from({ length: 5 }, (_, i) =>
				Array.from({ length: 5 }, (_, j) => [1n, BigInt(i + j + 1)])
			);
			const refH5 = exactRationalInverse(h5Rat);
			const gotH5 = inverseFloatStable(hilbert(5));
			assert.ok(maxRelDiff(gotH5, refH5) <= 1e-10);

			// 6x6 symmetric Pascal matrix P[i][j] = C(i+j, i)
			const pascal6 = Array.from({ length: 6 }, (_, i) =>
				Array.from({ length: 6 }, (_, j) => Number(binomBig(i + j, i)))
			);
			const pascalRat = pascal6.map((row) => row.map((v) => [BigInt(v), 1n]));
			const refPascal = exactRationalInverse(pascalRat);
			const gotPascal = inverseFloatStable(pascal6);
			assert.ok(maxRelDiff(gotPascal, refPascal) <= 1e-11);
		});

		it('satisfies algebraic inverse identities: (A^-1)^-1 = A, (AB)^-1 = B^-1 A^-1, (A^T)^-1 = (A^-1)^T', () => {
			const A = [
				[2, -1, 0, 3],
				[1, 4, -2, 1],
				[0, 3, 5, -1],
				[-2, 1, 2, 6]
			];
			const B = [
				[5, 1, -2, 0],
				[-1, 3, 1, 2],
				[2, 0, 4, -1],
				[1, -2, 1, 3]
			];

			const invA = inverseFloatStable(A);
			const invB = inverseFloatStable(B);

			// (A^-1)^-1 == A
			assert.ok(maxAbsDiff(inverseFloatStable(invA), A) <= 1e-14);

			// (A * B)^-1 == B^-1 * A^-1
			const invAB = inverseFloatStable(matMul(A, B));
			const invB_invA = matMul(invB, invA);
			assert.ok(maxAbsDiff(invAB, invB_invA) <= 1e-14);

			// (A^T)^-1 == (A^-1)^T
			const invAT = inverseFloatStable(transpose(A));
			assert.ok(maxAbsDiff(invAT, transpose(invA)) <= 1e-14);
		});
	});
});
