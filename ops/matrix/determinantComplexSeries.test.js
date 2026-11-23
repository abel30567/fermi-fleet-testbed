import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantComplexSeries } from './determinantComplexSeries.js';

const c = (re, im = 0) => ({ re, im });

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im };
}

function cMul(a, b) {
	return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

function cConj(a) {
	return { re: a.re, im: -a.im };
}

function assertComplexClose(actual, expected, tol = 1e-9, label = '') {
	assert.equal(typeof actual, 'object', `${label}: expected object`);
	assert.notEqual(actual, null, `${label}: expected non-null`);
	assert.ok(
		Math.abs(actual.re - expected.re) <= tol,
		`${label}: real part mismatch: got ${actual.re}, expected ${expected.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= tol,
		`${label}: imag part mismatch: got ${actual.im}, expected ${expected.im}`
	);
}

/**
 * Independent reference: Leibniz permutation expansion det(A) = sum_{sigma} sgn(sigma) prod_i A[i][sigma(i)].
 */
function determinantLeibniz(matrix) {
	const n = matrix.length;
	if (n === 0) return c(1, 0);
	const used = new Array(n).fill(false);
	const perm = new Array(n);
	let total = c(0, 0);

	function parity(p) {
		let inv = 0;
		for (let i = 0; i < p.length; i++) {
			for (let j = i + 1; j < p.length; j++) {
				if (p[i] > p[j]) inv++;
			}
		}
		return inv % 2 === 0 ? 1 : -1;
	}

	function dfs(row) {
		if (row === n) {
			let prod = c(parity(perm), 0);
			for (let i = 0; i < n; i++) {
				prod = cMul(prod, matrix[i][perm[i]]);
			}
			total = cAdd(total, prod);
			return;
		}
		for (let col = 0; col < n; col++) {
			if (!used[col]) {
				used[col] = true;
				perm[row] = col;
				dfs(row + 1);
				used[col] = false;
			}
		}
	}

	dfs(0);
	return total;
}

/**
 * Independent reference: Faddeev-LeVerrier characteristic polynomial algorithm.
 * Returns det(A) = (-1)^n * c_0 using only matrix multiplication and traces.
 */
function determinantFaddeevLeVerrier(matrix) {
	const n = matrix.length;
	if (n === 0) return c(1, 0);

	const matMul = (A, B) =>
		Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => {
				let sum = c(0, 0);
				for (let k = 0; k < n; k++) {
					sum = cAdd(sum, cMul(A[i][k], B[k][j]));
				}
				return sum;
			})
		);

	const trace = (M) => {
		let tr = c(0, 0);
		for (let i = 0; i < n; i++) tr = cAdd(tr, M[i][i]);
		return tr;
	};

	let M = Array.from({ length: n }, () => Array.from({ length: n }, () => c(0, 0)));
	let coeff = c(1, 0);

	for (let k = 1; k <= n; k++) {
		const AM = matMul(matrix, M);
		M = Array.from({ length: n }, (_, i) =>
			Array.from({ length: n }, (_, j) => (i === j ? cAdd(AM[i][j], coeff) : AM[i][j]))
		);
		const tr = trace(matMul(matrix, M));
		coeff = { re: -tr.re / k, im: -tr.im / k };
	}

	return n % 2 === 0 ? coeff : { re: -coeff.re, im: -coeff.im };
}

function matMulComplex(A, B) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = c(0, 0);
			for (let k = 0; k < n; k++) {
				sum = cAdd(sum, cMul(A[i][k], B[k][j]));
			}
			return sum;
		})
	);
}

describe('determinantComplexSeries', () => {
	describe('normal cases', () => {
		it('computes 1x1 complex determinant', () => {
			const res = determinantComplexSeries([[c(3, -4)]]);
			assert.deepEqual(res, { re: 3, im: -4 });
		});

		it('computes 2x2 complex determinant', () => {
			// (1+2i)(4-i) - (3i)(2+i) = (6+7i) - (-3+6i) = 9+i
			const A = [
				[c(1, 2), c(0, 3)],
				[c(2, 1), c(4, -1)],
			];
			assertComplexClose(determinantComplexSeries(A), c(9, 1), 1e-12, '2x2');
		});

		it('computes 3x3 complex determinant', () => {
			const A = [
				[c(1, 1), c(2, -1), c(0, 3)],
				[c(-1, 2), c(3, 0), c(1, -2)],
				[c(2, 1), c(0, -2), c(4, 1)],
			];
			const expected = determinantLeibniz(A);
			assertComplexClose(determinantComplexSeries(A), expected, 1e-12, '3x3');
		});

		it('computes 4x4 complex determinant requiring row swaps (partial pivoting)', () => {
			const A = [
				[c(0, 0), c(1, 2), c(3, -1), c(2, 0)],
				[c(2, -1), c(0, 1), c(1, 1), c(-1, 3)],
				[c(1, 0), c(4, -2), c(0, 0), c(2, 1)],
				[c(0, 3), c(1, 1), c(2, -2), c(1, -1)],
			];
			const expected = determinantLeibniz(A);
			assertComplexClose(determinantComplexSeries(A), expected, 1e-10, '4x4 pivoted');
		});

		it('computes 5x5 complex determinant', () => {
			const A = [
				[c(2, 1), c(-1, 3), c(0, 2), c(1, -1), c(3, 0)],
				[c(1, -2), c(4, 0), c(2, 1), c(-3, 2), c(0, 1)],
				[c(0, 1), c(2, -1), c(3, 3), c(1, 0), c(-2, 1)],
				[c(-1, 0), c(0, 2), c(1, -3), c(5, -1), c(2, 2)],
				[c(3, -1), c(1, 1), c(-2, 0), c(0, 4), c(1, -2)],
			];
			const expected = determinantLeibniz(A);
			assertComplexClose(determinantComplexSeries(A), expected, 1e-9, '5x5');
		});

		it('computes determinant of identity, diagonal, and upper triangular complex matrices', () => {
			const I4 = Array.from({ length: 4 }, (_, i) =>
				Array.from({ length: 4 }, (_, j) => (i === j ? c(1, 0) : c(0, 0)))
			);
			assert.deepEqual(determinantComplexSeries(I4), c(1, 0));

			// Upper triangular with diagonal (1+i), (2-i), (0+3i), (-1+2i)
			// Product: (1+i)(2-i) = 3+i; (3+i)(3i) = -3+9i; (-3+9i)(-1+2i) = -15-15i
			const U = [
				[c(1, 1), c(5, -3), c(2, 4), c(-1, 7)],
				[c(0, 0), c(2, -1), c(8, 2), c(0, -5)],
				[c(0, 0), c(0, 0), c(0, 3), c(4, 1)],
				[c(0, 0), c(0, 0), c(0, 0), c(-1, 2)],
			];
			assertComplexClose(determinantComplexSeries(U), c(-15, -15), 1e-12, 'upper triangular');
		});

		it('computes determinant of unitary DFT matrix (magnitude 1)', () => {
			// Normalized 4x4 DFT matrix: F[j][k] = (1/2) * exp(-2*pi*i*j*k / 4)
			const n = 4;
			const F = Array.from({ length: n }, (_, j) =>
				Array.from({ length: n }, (_, k) => {
					const angle = (-2 * Math.PI * j * k) / n;
					return c(Math.cos(angle) / 2, Math.sin(angle) / 2);
				})
			);
			// Known exact value for 4x4 normalized DFT matrix: det(F_4) = i
			const det = determinantComplexSeries(F);
			assertComplexClose(det, c(0, 1), 1e-12, '4x4 DFT');
			assert.ok(Math.abs(Math.hypot(det.re, det.im) - 1) < 1e-12);
		});
	});

	describe('edge cases', () => {
		it('returns { re: 1, im: 0 } for empty 0x0 matrix', () => {
			assert.deepEqual(determinantComplexSeries([]), { re: 1, im: 0 });
		});

		it('returns { re: 0, im: 0 } for zero and singular matrices', () => {
			const Z4 = Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => c(0, 0)));
			assert.deepEqual(determinantComplexSeries(Z4), { re: 0, im: 0 });

			// Linearly dependent rows: row 3 = (1+i)*row 0 + (2-i)*row 1
			const r0 = [c(1, 2), c(3, -1), c(0, 4), c(-2, 1)];
			const r1 = [c(2, 0), c(-1, 3), c(1, -2), c(4, 2)];
			const r2 = [c(0, -1), c(2, 2), c(3, 1), c(1, -3)];
			const r3 = r0.map((v, j) => cAdd(cMul(c(1, 1), v), cMul(c(2, -1), r1[j])));
			const det = determinantComplexSeries([r0, r1, r2, r3]);
			assertComplexClose(det, c(0, 0), 1e-11, 'singular 4x4');
		});

		it('normalizes -0 to +0 and does not mutate input matrix', () => {
			const A = [
				[c(-0, -0), c(1, 2)],
				[c(3, 4), c(5, 6)],
			];
			const snapshot = structuredClone(A);
			const res = determinantComplexSeries([[c(-0, -0)]]);
			assert.ok(Object.is(res.re, 0));
			assert.ok(Object.is(res.im, 0));

			determinantComplexSeries(A);
			assert.deepEqual(A, snapshot);

			const A4 = [
				[c(0, 1), c(2, -1), c(1, 0), c(3, 2)],
				[c(1, 1), c(0, 2), c(-1, 1), c(2, -1)],
				[c(2, 0), c(1, 3), c(2, -2), c(0, 1)],
				[c(-1, 2), c(3, 0), c(1, 1), c(4, -1)],
			];
			const snapshot4 = structuredClone(A4);
			determinantComplexSeries(A4);
			assert.deepEqual(A4, snapshot4);
		});

		it('handles purely imaginary and large-scale entries accurately without overflow in division', () => {
			const s = 1e150;
			const A = [
				[c(0, s), c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 1), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 1), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(0, 1 / s)],
			];
			// i^4 * (s * 1 * 1 * (1/s)) = 1
			assertComplexClose(determinantComplexSeries(A), c(1, 0), 1e-12, 'scaled imaginary');
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		const A = [
			[c(1, -2), c(3, 1), c(-1, 4), c(2, -1)],
			[c(0, 3), c(2, 2), c(1, -1), c(-3, 0)],
			[c(4, 1), c(-2, 0), c(3, 2), c(1, 3)],
			[c(-1, 1), c(1, -3), c(0, 2), c(2, 1)],
		];
		const B = [
			[c(2, 1), c(0, -2), c(1, 3), c(-1, 0)],
			[c(1, 2), c(3, -1), c(-2, 1), c(0, 4)],
			[c(-1, 0), c(2, 2), c(4, -1), c(1, -2)],
			[c(3, -1), c(-1, 1), c(0, 2), c(2, 3)],
		];

		it('matches Faddeev-LeVerrier trace identity algorithm on 4x4 matrices', () => {
			assertComplexClose(
				determinantComplexSeries(A),
				determinantFaddeevLeVerrier(A),
				1e-9,
				'Faddeev-LeVerrier A'
			);
			assertComplexClose(
				determinantComplexSeries(B),
				determinantFaddeevLeVerrier(B),
				1e-9,
				'Faddeev-LeVerrier B'
			);
		});

		it('satisfies multiplicativity det(A * B) = det(A) * det(B)', () => {
			const detAB = determinantComplexSeries(matMulComplex(A, B));
			const detAdetB = cMul(determinantComplexSeries(A), determinantComplexSeries(B));
			assertComplexClose(detAB, detAdetB, 1e-7, 'multiplicativity');
		});

		it('satisfies transpose, conjugate-transpose, and scalar-scaling identities', () => {
			const detA = determinantComplexSeries(A);
			const AT = A[0].map((_, j) => A.map((row) => row[j]));
			const AH = AT.map((row) => row.map(cConj));

			assertComplexClose(determinantComplexSeries(AT), detA, 1e-9, 'det(A^T) = det(A)');
			assertComplexClose(determinantComplexSeries(AH), cConj(detA), 1e-9, 'det(A^H) = conj(det(A))');

			const z = c(2, -1);
			const zA = A.map((row) => row.map((v) => cMul(z, v)));
			const z4 = cMul(cMul(z, z), cMul(z, z));
			assertComplexClose(determinantComplexSeries(zA), cMul(z4, detA), 1e-7, 'det(zA) = z^n det(A)');
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array matrix or non-array row', () => {
			assert.throws(() => determinantComplexSeries(null), TypeError);
			assert.throws(() => determinantComplexSeries(42), TypeError);
			assert.throws(() => determinantComplexSeries([123]), TypeError);
		});

		it('throws RangeError for non-square matrix', () => {
			assert.throws(
				() => determinantComplexSeries([[c(1, 0), c(2, 0)]]),
				RangeError
			);
			assert.throws(
				() =>
					determinantComplexSeries([
						[c(1, 0), c(2, 0)],
						[c(3, 0)],
					]),
				RangeError
			);
		});

		it('throws TypeError for invalid complex entries', () => {
			assert.throws(() => determinantComplexSeries([[1]]), TypeError);
			assert.throws(() => determinantComplexSeries([[null]]), TypeError);
			assert.throws(() => determinantComplexSeries([[{ re: '1', im: 0 }]]), TypeError);
			assert.throws(() => determinantComplexSeries([[{ re: 1 }]]), TypeError);
		});

		it('throws RangeError for non-finite complex components', () => {
			assert.throws(() => determinantComplexSeries([[c(NaN, 0)]]), RangeError);
			assert.throws(() => determinantComplexSeries([[c(0, Infinity)]]), RangeError);
			assert.throws(() => determinantComplexSeries([[c(-Infinity, 1)]]), RangeError);
		});
	});
});
