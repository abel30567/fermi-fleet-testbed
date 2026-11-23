import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantComplexRecursive } from './determinantComplexRecursive.js';

const c = (re, im = 0) => ({ re, im });

function cMul(a, b) {
	return {
		re: a.re * b.re - a.im * b.im,
		im: a.re * b.im + a.im * b.re,
	};
}

function cAdd(a, b) {
	return { re: a.re + b.re, im: a.im + b.im };
}

function cSub(a, b) {
	return { re: a.re - b.re, im: a.im - b.im };
}

function cConj(a) {
	return { re: a.re, im: -a.im };
}

function assertComplexClose(actual, expected, eps = 1e-9, msg = '') {
	assert.equal(typeof actual.re, 'number', `${msg} re should be a number`);
	assert.equal(typeof actual.im, 'number', `${msg} im should be a number`);
	assert.ok(
		Math.abs(actual.re - expected.re) <= eps,
		`${msg} expected re ${expected.re}, got ${actual.re}`
	);
	assert.ok(
		Math.abs(actual.im - expected.im) <= eps,
		`${msg} expected im ${expected.im}, got ${actual.im}`
	);
}

function matMul(A, B) {
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

function transpose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => A[j][i])
	);
}

function conjugateTranspose(A) {
	const n = A.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => cConj(A[j][i]))
	);
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? c(1, 0) : c(0, 0)))
	);
}

function vandermonde(nodes) {
	const n = nodes.length;
	return nodes.map((z) => {
		const row = [c(1, 0)];
		for (let k = 1; k < n; k++) {
			row.push(cMul(row[k - 1], z));
		}
		return row;
	});
}

function vandermondeExactDet(nodes) {
	let prod = c(1, 0);
	for (let i = 0; i < nodes.length; i++) {
		for (let j = i + 1; j < nodes.length; j++) {
			prod = cMul(prod, cSub(nodes[j], nodes[i]));
		}
	}
	return prod;
}

describe('determinantComplexRecursive', () => {
	describe('normal cases', () => {
		it('computes 1x1 complex determinant', () => {
			const result = determinantComplexRecursive([[c(3, -4)]]);
			assert.deepStrictEqual(result, c(3, -4));
		});

		it('computes 2x2 complex determinant', () => {
			// (1+2i)(5-i) - (3+i)(2+4i) = (7+9i) - (2+14i) = 5 - 5i
			const A = [
				[c(1, 2), c(3, 1)],
				[c(2, 4), c(5, -1)],
			];
			assertComplexClose(determinantComplexRecursive(A), c(5, -5));
		});

		it('computes 3x3 complex determinant', () => {
			// Verified analytically:
			// row 0: [1+i, 2, -i]
			// row 1: [0, 3-i, 1+2i]
			// row 2: [2i, -1, 4]
			// det = (1+i)*((3-i)*4 - (1+2i)*(-1)) - 2*(0*4 - (1+2i)*(2i)) + (-i)*(0*(-1) - (3-i)*(2i))
			//     = (1+i)*(13-2i) - 2*(4-2i) + (-i)*(-2-6i)
			//     = (15+11i) - (8-4i) + (-6+2i) = 1 + 17i
			const A = [
				[c(1, 1), c(2, 0), c(0, -1)],
				[c(0, 0), c(3, -1), c(1, 2)],
				[c(0, 2), c(-1, 0), c(4, 0)],
			];
			assertComplexClose(determinantComplexRecursive(A), c(1, 17));
		});

		it('computes 4x4 complex determinant', () => {
			// Complex Vandermonde matrix for [1, i, -1, -i]:
			// Exact product of (z_j - z_i) for i < j is 16i
			const nodes = [c(1, 0), c(0, 1), c(-1, 0), c(0, -1)];
			const V = vandermonde(nodes);
			const expected = vandermondeExactDet(nodes);
			assertComplexClose(determinantComplexRecursive(V), expected);
		});

		it('computes 5x5 and 6x6 complex determinants via recursive Schur complement', () => {
			const nodes5 = [c(1, 0), c(0, 1), c(-1, 1), c(2, -1), c(-2, -1)];
			const V5 = vandermonde(nodes5);
			assertComplexClose(
				determinantComplexRecursive(V5),
				vandermondeExactDet(nodes5),
				1e-6
			);

			const nodes6 = [c(1, 0), c(0, 1), c(-1, 0), c(0, -1), c(1, 1), c(-1, -1)];
			const V6 = vandermonde(nodes6);
			assertComplexClose(
				determinantComplexRecursive(V6),
				vandermondeExactDet(nodes6),
				1e-5
			);
		});
	});

	describe('edge cases', () => {
		it('returns 1 + 0i for identity matrices of various sizes', () => {
			for (const n of [1, 2, 3, 4, 5, 7]) {
				assertComplexClose(determinantComplexRecursive(identity(n)), c(1, 0));
			}
		});

		it('returns 0 + 0i for singular matrices (zero column, zero row, dependent rows)', () => {
			const zeroRow = [
				[c(1, 2), c(3, 4), c(5, 6)],
				[c(0, 0), c(0, 0), c(0, 0)],
				[c(-1, 1), c(2, -2), c(3, 0)],
			];
			assertComplexClose(determinantComplexRecursive(zeroRow), c(0, 0));

			// 5x5 singular matrix with zero first column (tests Schur-complement zero-pivot guard)
			const zeroFirstCol5 = Array.from({ length: 5 }, (_, i) =>
				Array.from({ length: 5 }, (_, j) => (j === 0 ? c(0, 0) : c(i + 1, j)))
			);
			assertComplexClose(determinantComplexRecursive(zeroFirstCol5), c(0, 0));

			// Linearly dependent 5x5 matrix: row 4 = (1+i)*row 0 + (2-i)*row 2
			const dep5 = [
				[c(1, 1), c(2, -1), c(0, 3), c(-1, 0), c(4, 1)],
				[c(0, 2), c(1, 0), c(-2, 1), c(3, -1), c(1, 2)],
				[c(-1, 3), c(0, -2), c(1, 1), c(2, 2), c(-3, 0)],
				[c(2, 0), c(-1, 1), c(3, -2), c(0, 1), c(2, -1)],
				[],
			];
			dep5[4] = dep5[0].map((v, j) =>
				cAdd(cMul(c(1, 1), v), cMul(c(2, -1), dep5[2][j]))
			);
			assertComplexClose(determinantComplexRecursive(dep5), c(0, 0), 1e-8);
		});

		it('equals product of diagonal entries for upper triangular complex matrices', () => {
			const diag = [c(1, 1), c(2, -1), c(0, 3), c(-1, 2), c(2, 1)];
			const n = diag.length;
			const U = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					if (i > j) return c(0, 0);
					if (i === j) return diag[i];
					return c(i + j, i - j);
				})
			);
			const expected = diag.reduce((acc, z) => cMul(acc, z), c(1, 0));
			assertComplexClose(determinantComplexRecursive(U), expected, 1e-8);
		});

		it('handles pivoting when top-left entry is zero in large matrices', () => {
			// 5x5 permutation/cyclic shift matrix has det = +1 (even permutation of length 5)
			const P = [
				[c(0, 0), c(1, 0), c(0, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(1, 0), c(0, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(1, 0), c(0, 0)],
				[c(0, 0), c(0, 0), c(0, 0), c(0, 0), c(1, 0)],
				[c(1, 0), c(0, 0), c(0, 0), c(0, 0), c(0, 0)],
			];
			assertComplexClose(determinantComplexRecursive(P), c(1, 0));
		});

		it('does not mutate the input matrix and normalizes -0 to 0', () => {
			const A = [
				[c(-0, -0), c(1, 0)],
				[c(0, 0), c(1, 0)],
			];
			const snapshot = JSON.stringify(A);
			const det = determinantComplexRecursive(A);
			assert.equal(JSON.stringify(A), snapshot);
			assert.ok(!Object.is(det.re, -0));
			assert.ok(!Object.is(det.im, -0));
			assert.deepStrictEqual(det, c(0, 0));
		});
	});

	describe('invalid inputs', () => {
		it('rejects non-array inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => determinantComplexRecursive(bad), TypeError);
			}
		});

		it('rejects empty matrix', () => {
			assert.throws(() => determinantComplexRecursive([]), RangeError);
		});

		it('rejects non-array rows', () => {
			assert.throws(() => determinantComplexRecursive([c(1, 0)]), TypeError);
			assert.throws(
				() => determinantComplexRecursive([[c(1, 0), c(2, 0)], null]),
				TypeError
			);
		});

		it('rejects non-square and ragged matrices', () => {
			const rect2x3 = [
				[c(1, 0), c(2, 0), c(3, 0)],
				[c(4, 0), c(5, 0), c(6, 0)],
			];
			const rect3x2 = [
				[c(1, 0), c(2, 0)],
				[c(3, 0), c(4, 0)],
				[c(5, 0), c(6, 0)],
			];
			const ragged = [
				[c(1, 0), c(2, 0)],
				[c(3, 0)],
			];
			assert.throws(() => determinantComplexRecursive(rect2x3), RangeError);
			assert.throws(() => determinantComplexRecursive(rect3x2), RangeError);
			assert.throws(() => determinantComplexRecursive(ragged), RangeError);
		});

		it('rejects invalid complex entries', () => {
			const badTypeEntries = [
				null,
				undefined,
				5,
				'1+i',
				{ re: 1 },
				{ im: 1 },
				{ re: '1', im: 0 },
				{ re: 0, im: '1' },
			];
			for (const entry of badTypeEntries) {
				assert.throws(() => determinantComplexRecursive([[entry]]), TypeError);
			}

			const nonFiniteEntries = [
				{ re: Number.NaN, im: 0 },
				{ re: 0, im: Number.NaN },
				{ re: Number.POSITIVE_INFINITY, im: 0 },
				{ re: 0, im: Number.NEGATIVE_INFINITY },
			];
			for (const entry of nonFiniteEntries) {
				assert.throws(() => determinantComplexRecursive([[entry]]), RangeError);
			}
		});
	});

	describe('algebraic cross-checks', () => {
		const A4 = [
			[c(1, 2), c(-1, 0), c(3, -1), c(0, 2)],
			[c(2, -1), c(4, 1), c(0, 1), c(-2, 3)],
			[c(-1, 1), c(2, 2), c(1, -3), c(1, 0)],
			[c(0, -2), c(1, -1), c(2, 1), c(3, 2)],
		];
		const B4 = [
			[c(2, 1), c(0, -1), c(1, 2), c(-1, 1)],
			[c(1, 0), c(-2, 3), c(2, -1), c(0, 2)],
			[c(3, -2), c(1, 1), c(-1, 0), c(2, -1)],
			[c(-1, 2), c(2, 0), c(0, -3), c(1, 1)],
		];

		const A5 = [
			[c(1, 1), c(2, 0), c(-1, 2), c(0, -1), c(3, 1)],
			[c(0, 2), c(-1, 1), c(2, -1), c(1, 2), c(-2, 0)],
			[c(2, -1), c(1, 2), c(0, 3), c(-1, 0), c(1, -2)],
			[c(-1, 0), c(3, -1), c(1, 1), c(2, -2), c(0, 1)],
			[c(1, -2), c(0, 1), c(-2, 0), c(1, 1), c(2, 2)],
		];
		const B5 = [
			[c(2, -1), c(1, 1), c(0, 2), c(-1, 0), c(1, -1)],
			[c(-1, 2), c(0, -1), c(1, 1), c(2, 1), c(0, 2)],
			[c(1, 0), c(2, -2), c(-1, 1), c(0, -2), c(3, 0)],
			[c(0, 1), c(-1, 0), c(2, 1), c(1, -1), c(-1, 2)],
			[c(2, 1), c(1, -1), c(0, -1), c(2, 0), c(1, 1)],
		];

		it('satisfies multiplicativity det(A * B) == det(A) * det(B) for 4x4 and 5x5', () => {
			const detAB4 = determinantComplexRecursive(matMul(A4, B4));
			const prod4 = cMul(
				determinantComplexRecursive(A4),
				determinantComplexRecursive(B4)
			);
			assertComplexClose(detAB4, prod4, 1e-6, '4x4 multiplicativity');

			const detAB5 = determinantComplexRecursive(matMul(A5, B5));
			const prod5 = cMul(
				determinantComplexRecursive(A5),
				determinantComplexRecursive(B5)
			);
			assertComplexClose(detAB5, prod5, 1e-5, '5x5 multiplicativity');
		});

		it('satisfies transpose invariance det(A^T) == det(A) for 4x4 and 5x5', () => {
			assertComplexClose(
				determinantComplexRecursive(transpose(A4)),
				determinantComplexRecursive(A4),
				1e-7,
				'4x4 transpose'
			);
			assertComplexClose(
				determinantComplexRecursive(transpose(A5)),
				determinantComplexRecursive(A5),
				1e-7,
				'5x5 transpose'
			);
		});

		it('satisfies conjugate-transpose identity det(A^H) == conj(det(A))', () => {
			assertComplexClose(
				determinantComplexRecursive(conjugateTranspose(A4)),
				cConj(determinantComplexRecursive(A4)),
				1e-7,
				'4x4 conjugate-transpose'
			);
			assertComplexClose(
				determinantComplexRecursive(conjugateTranspose(A5)),
				cConj(determinantComplexRecursive(A5)),
				1e-7,
				'5x5 conjugate-transpose'
			);
		});

		it('satisfies multilinearity / scaling det(z * A) == z^n * det(A)', () => {
			const z = c(1, -2);
			const scaled = A5.map((row) => row.map((cell) => cMul(z, cell)));
			let zPow5 = c(1, 0);
			for (let k = 0; k < 5; k++) zPow5 = cMul(zPow5, z);
			const expected = cMul(zPow5, determinantComplexRecursive(A5));
			assertComplexClose(determinantComplexRecursive(scaled), expected, 1e-4);
		});
	});
});
