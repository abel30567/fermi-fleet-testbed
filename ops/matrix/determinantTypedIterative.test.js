import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantTypedIterative } from './determinantTypedIterative.js';

/**
 * Independent reference determinant via recursive Laplace (cofactor) expansion
 * along the first row. Used solely for cross-checking small matrices in tests.
 *
 * @param {Float64Array} mat
 * @param {number} n
 * @returns {number}
 */
function determinantLaplaceReference(mat, n) {
	if (n === 0) return 1;
	if (n === 1) return mat[0];
	if (n === 2) return mat[0] * mat[3] - mat[1] * mat[2];

	let total = 0;
	const minor = new Float64Array((n - 1) * (n - 1));
	for (let col = 0; col < n; col++) {
		let idx = 0;
		for (let r = 1; r < n; r++) {
			for (let c = 0; c < n; c++) {
				if (c !== col) {
					minor[idx++] = mat[r * n + c];
				}
			}
		}
		const sign = col % 2 === 0 ? 1 : -1;
		total += sign * mat[col] * determinantLaplaceReference(minor, n - 1);
	}
	return total;
}

/**
 * Helper to multiply two n x n row-major Float64Array matrices.
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const aik = a[i * n + k];
			for (let j = 0; j < n; j++) {
				out[i * n + j] += aik * b[k * n + j];
			}
		}
	}
	return out;
}

/**
 * Helper to transpose an n x n row-major Float64Array matrix.
 */
function transpose(a, n) {
	const out = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			out[j * n + i] = a[i * n + j];
		}
	}
	return out;
}

/**
 * Deterministic LCG PRNG for reproducible matrix tests.
 */
function makePrng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0;
		return state / 0x100000000;
	};
}

function assertClose(actual, expected, relTol = 1e-10, absTol = 1e-10) {
	const diff = Math.abs(actual - expected);
	const bound = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)));
	assert.ok(
		diff <= bound,
		`Expected ${actual} to be within ${bound} of ${expected} (diff=${diff})`,
	);
}

describe('determinantTypedIterative', () => {
	describe('normal cases', () => {
		it('computes 1x1 matrix determinant', () => {
			assert.equal(determinantTypedIterative(new Float64Array([7])), 7);
			assert.equal(determinantTypedIterative(new Float64Array([-3.5])), -3.5);
		});

		it('computes 2x2 matrix determinant', () => {
			const m = new Float64Array([3, 8, 4, 6]);
			assert.equal(determinantTypedIterative(m), -14);
		});

		it('computes 3x3 matrix determinant', () => {
			const m = new Float64Array([
				6, 1, 1,
				4, -2, 5,
				2, 8, 7,
			]);
			assertClose(determinantTypedIterative(m), -306);
		});

		it('computes 4x4 matrix determinant', () => {
			const m = new Float64Array([
				1, 0, 2, -1,
				3, 0, 0, 5,
				2, 1, 4, -3,
				1, 0, 5, 0,
			]);
			assertClose(determinantTypedIterative(m), 30);
		});

		it('computes identity and triangular matrices accurately', () => {
			// 5x5 identity
			const id = new Float64Array(25);
			for (let i = 0; i < 5; i++) id[i * 5 + i] = 1;
			assert.equal(determinantTypedIterative(id), 1);

			// 4x4 upper triangular: product of diagonal = 2 * -3 * 4 * 0.5 = -12
			const upper = new Float64Array([
				2, 9, -4, 7,
				0, -3, 5, 1,
				0, 0, 4, -8,
				0, 0, 0, 0.5,
			]);
			assertClose(determinantTypedIterative(upper), -12);
		});

		it('accepts optional explicit dimension n', () => {
			const m = new Float64Array([2, 3, 1, 4]);
			assert.equal(determinantTypedIterative(m, 2), 5);
		});
	});

	describe('edge cases', () => {
		it('returns 1 for an empty 0x0 matrix', () => {
			assert.equal(determinantTypedIterative(new Float64Array(0)), 1);
			assert.equal(determinantTypedIterative(new Float64Array(0), 0), 1);
		});

		it('returns 0 for singular matrices', () => {
			// Zero row
			const zeroRow = new Float64Array([
				1, 2, 3,
				0, 0, 0,
				7, 8, 9,
			]);
			assert.equal(determinantTypedIterative(zeroRow), 0);

			// Zero column
			const zeroCol = new Float64Array([
				1, 0, 3,
				4, 0, 6,
				7, 0, 9,
			]);
			assert.equal(determinantTypedIterative(zeroCol), 0);

			// Linearly dependent rows (row 2 = row 0 + row 1)
			const dep = new Float64Array([
				1, 2, 3,
				4, 5, 6,
				5, 7, 9,
			]);
			assertClose(determinantTypedIterative(dep), 0, 1e-12, 1e-12);
		});

		it('handles pivoting when diagonal entries are zero', () => {
			// 3x3 permutation matrix with zero main diagonal: det = +1 (cyclic shift)
			const cyclic = new Float64Array([
				0, 1, 0,
				0, 0, 1,
				1, 0, 0,
			]);
			assert.equal(determinantTypedIterative(cyclic), 1);

			// 4x4 anti-diagonal matrix: 2 swaps -> det = +1
			const anti4 = new Float64Array([
				0, 0, 0, 1,
				0, 0, 1, 0,
				0, 1, 0, 0,
				1, 0, 0, 0,
			]);
			assert.equal(determinantTypedIterative(anti4), 1);

			// 3x3 anti-diagonal matrix: 1 swap -> det = -1
			const anti3 = new Float64Array([
				0, 0, 1,
				0, 1, 0,
				1, 0, 0,
			]);
			assert.equal(determinantTypedIterative(anti3), -1);
		});

		it('handles tiny scaled matrices without false singularity', () => {
			const tiny = new Float64Array([
				1e-15, 0, 0,
				0, 1e-15, 0,
				0, 0, 1e-15,
			]);
			assertClose(determinantTypedIterative(tiny), 1e-45, 1e-12, 0);
		});

		it('normalizes -0 to +0', () => {
			const m1 = new Float64Array([-0]);
			assert.ok(Object.is(determinantTypedIterative(m1), 0));

			const m2 = new Float64Array([0, 1, 0, 1]);
			assert.ok(Object.is(determinantTypedIterative(m2), 0));

			const m3 = new Float64Array([
				0, 1, 0,
				1, 0, 0,
				0, 0, 0,
			]);
			assert.ok(Object.is(determinantTypedIterative(m3), 0));
		});

		it('propagates NaN even when another column is all zeros', () => {
			const m = new Float64Array([
				0, 1, 2,
				0, Number.NaN, 3,
				0, 4, 5,
			]);
			assert.ok(Number.isNaN(determinantTypedIterative(m)));
		});

		it('does not mutate the input Float64Array', () => {
			const m = new Float64Array([
				2, 5, -1, 3,
				4, 1, 2, -2,
				-3, 6, 4, 1,
				1, -2, 3, 5,
			]);
			const snapshot = new Float64Array(m);
			determinantTypedIterative(m);
			assert.deepEqual(m, snapshot);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			assert.throws(() => determinantTypedIterative([1, 2, 3, 4]), TypeError);
			assert.throws(() => determinantTypedIterative(new Float32Array([1, 2, 3, 4])), TypeError);
			assert.throws(() => determinantTypedIterative(new Int32Array([1, 2, 3, 4])), TypeError);
			assert.throws(() => determinantTypedIterative(null), TypeError);
			assert.throws(() => determinantTypedIterative(undefined), TypeError);
			assert.throws(() => determinantTypedIterative(42), TypeError);
		});

		it('throws RangeError for non-square Float64Array lengths', () => {
			assert.throws(() => determinantTypedIterative(new Float64Array(2)), RangeError);
			assert.throws(() => determinantTypedIterative(new Float64Array(3)), RangeError);
			assert.throws(() => determinantTypedIterative(new Float64Array(5)), RangeError);
			assert.throws(() => determinantTypedIterative(new Float64Array(10)), RangeError);
		});

		it('validates explicit dimension n', () => {
			const m = new Float64Array([1, 2, 3, 4]);
			assert.throws(() => determinantTypedIterative(m, 2.5), TypeError);
			assert.throws(() => determinantTypedIterative(m, '2'), TypeError);
			assert.throws(() => determinantTypedIterative(m, Number.NaN), TypeError);
			assert.throws(() => determinantTypedIterative(m, -2), RangeError);
			assert.throws(() => determinantTypedIterative(m, 3), RangeError);
		});
	});

	describe('independent cross-checks', () => {
		it('matches recursive Laplace cofactor expansion on pseudo-random matrices (1x1 to 6x6)', () => {
			const rand = makePrng(20261123);
			for (let n = 1; n <= 6; n++) {
				for (let trial = 0; trial < 5; trial++) {
					const m = new Float64Array(n * n);
					for (let i = 0; i < m.length; i++) {
						m[i] = (rand() - 0.5) * 10;
					}
					const actual = determinantTypedIterative(m);
					const expected = determinantLaplaceReference(m, n);
					assertClose(actual, expected, 1e-10, 1e-10);
				}
			}
		});

		it('matches exact closed-form Vandermonde determinant formula', () => {
			const nodes = [1, 2, 3.5, 5, 7.5, 9];
			const n = nodes.length;
			const vandermonde = new Float64Array(n * n);
			for (let i = 0; i < n; i++) {
				let pow = 1;
				for (let j = 0; j < n; j++) {
					vandermonde[i * n + j] = pow;
					pow *= nodes[i];
				}
			}

			let expected = 1;
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					expected *= nodes[j] - nodes[i];
				}
			}

			assertClose(determinantTypedIterative(vandermonde), expected, 1e-10, 1e-10);
		});

		it('satisfies algebraic determinant identities (multiplicativity, transpose, scaling)', () => {
			const rand = makePrng(987654321);
			const n = 5;
			const a = new Float64Array(n * n);
			const b = new Float64Array(n * n);
			for (let i = 0; i < n * n; i++) {
				a[i] = (rand() - 0.5) * 6;
				b[i] = (rand() - 0.5) * 6;
			}

			const detA = determinantTypedIterative(a);
			const detB = determinantTypedIterative(b);

			// det(A * B) === det(A) * det(B)
			const detAB = determinantTypedIterative(matMul(a, b, n));
			assertClose(detAB, detA * detB, 1e-9, 1e-9);

			// det(A^T) === det(A)
			const detAT = determinantTypedIterative(transpose(a, n));
			assertClose(detAT, detA, 1e-10, 1e-10);

			// det(c * A) === c^n * det(A)
			const c = -2.5;
			const scaled = new Float64Array(n * n);
			for (let i = 0; i < n * n; i++) scaled[i] = c * a[i];
			assertClose(determinantTypedIterative(scaled), c ** n * detA, 1e-9, 1e-9);
		});
	});
});
