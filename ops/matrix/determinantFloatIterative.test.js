import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantFloatIterative } from './determinantFloatIterative.js';

/**
 * Assert two float64 values are within combined absolute and relative tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [tol=1e-9]
 */
function assertClose(actual, expected, tol = 1e-9) {
	const scale = Math.max(1, Math.abs(actual), Math.abs(expected));
	const diff = Math.abs(actual - expected);
	assert.ok(
		diff <= tol * scale,
		`expected ${actual} to be close to ${expected} (diff=${diff}, allowed=${tol * scale})`
	);
}

/**
 * Independent reference determinant using Laplace cofactor expansion (for small n).
 * @param {number[][]} m
 * @returns {number}
 */
function referenceDeterminantCofactor(m) {
	const n = m.length;
	if (n === 0) return 1;
	if (n === 1) return m[0][0];
	if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];
	let sum = 0;
	for (let col = 0; col < n; col++) {
		const minor = [];
		for (let r = 1; r < n; r++) {
			const row = [];
			for (let c = 0; c < n; c++) {
				if (c !== col) row.push(m[r][c]);
			}
			minor.push(row);
		}
		const sign = col % 2 === 0 ? 1 : -1;
		sum += sign * m[0][col] * referenceDeterminantCofactor(minor);
	}
	return sum;
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible matrix cross-checks.
 * @param {number} seed
 */
function makeRng(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = Math.imul(s ^ (s >>> 15), 1 | s);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Multiply two n x n matrices.
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function matMul(a, b) {
	const n = a.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => {
			let sum = 0;
			for (let k = 0; k < n; k++) sum += a[i][k] * b[k][j];
			return sum;
		})
	);
}

/**
 * Transpose an n x n matrix.
 * @param {number[][]} a
 * @returns {number[][]}
 */
function transpose(a) {
	const n = a.length;
	return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => a[j][i]));
}

describe('determinantFloatIterative', () => {
	describe('normal cases', () => {
		it('computes determinant of 1x1 matrices', () => {
			assert.strictEqual(determinantFloatIterative([[42]]), 42);
			assert.strictEqual(determinantFloatIterative([[-3.5]]), -3.5);
			assert.strictEqual(determinantFloatIterative([[0]]), 0);
		});

		it('computes determinant of 2x2 matrices', () => {
			assertClose(
				determinantFloatIterative([
					[1, 2],
					[3, 4]
				]),
				-2
			);
			assertClose(
				determinantFloatIterative([
					[1.5, -2.5],
					[4.25, 3.75]
				]),
				1.5 * 3.75 - -2.5 * 4.25
			);
		});

		it('computes determinant of 3x3 matrices', () => {
			assertClose(
				determinantFloatIterative([
					[6, 1, 1],
					[4, -2, 5],
					[2, 8, 7]
				]),
				-306
			);
			assertClose(
				determinantFloatIterative([
					[2, -3, 1],
					[2, 0, -1],
					[1, 4, 5]
				]),
				49
			);
		});

		it('computes determinant of 4x4 matrices', () => {
			const m = [
				[1, 0, 2, -1],
				[3, 0, 0, 5],
				[2, 1, 4, -3],
				[1, 0, 5, 0]
			];
			assertClose(determinantFloatIterative(m), 30);
		});

		it('handles identity, diagonal, and triangular matrices', () => {
			assertClose(
				determinantFloatIterative([
					[1, 0, 0],
					[0, 1, 0],
					[0, 0, 1]
				]),
				1
			);
			assertClose(
				determinantFloatIterative([
					[2, 0, 0, 0],
					[0, -3, 0, 0],
					[0, 0, 4.5, 0],
					[0, 0, 0, 0.5]
				]),
				-13.5
			);
			assertClose(
				determinantFloatIterative([
					[2, 9, -4],
					[0, -5, 7],
					[0, 0, 3]
				]),
				-30
			);
			assertClose(
				determinantFloatIterative([
					[2, 0, 0],
					[8, -5, 0],
					[-1, 6, 3]
				]),
				-30
			);
		});

		it('handles permutation matrices requiring row swaps', () => {
			assert.strictEqual(
				determinantFloatIterative([
					[0, 1],
					[1, 0]
				]),
				-1
			);
			// Cyclic permutation of 3 elements is even (+1)
			assert.strictEqual(
				determinantFloatIterative([
					[0, 1, 0],
					[0, 0, 1],
					[1, 0, 0]
				]),
				1
			);
			// Anti-diagonal 4x4 requires 2 swaps -> +1
			assert.strictEqual(
				determinantFloatIterative([
					[0, 0, 0, 1],
					[0, 0, 1, 0],
					[0, 1, 0, 0],
					[1, 0, 0, 0]
				]),
				1
			);
		});
	});

	describe('edge cases', () => {
		it('returns 1 for empty 0x0 matrix', () => {
			assert.strictEqual(determinantFloatIterative([]), 1);
		});

		it('returns 0 for singular matrices', () => {
			// Zero row
			assert.strictEqual(
				determinantFloatIterative([
					[1, 2, 3],
					[0, 0, 0],
					[4, 5, 6]
				]),
				0
			);
			// Zero column
			assert.strictEqual(
				determinantFloatIterative([
					[0, 2, 3],
					[0, 5, 6],
					[0, 8, 9]
				]),
				0
			);
			// Linearly dependent rows
			assertClose(
				determinantFloatIterative([
					[1, 2, 3],
					[4, 5, 6],
					[7, 8, 9]
				]),
				0,
				1e-12
			);
		});

		it('normalizes -0 to +0', () => {
			assert.ok(Object.is(determinantFloatIterative([[-0]]), 0));
			assert.ok(
				Object.is(
					determinantFloatIterative([
						[0, 0],
						[1, 0]
					]),
					0
				)
			);
		});

		it('does not mutate the caller input matrix', () => {
			const original = [
				[0, 2, 1],
				[3, -1, 2],
				[1, 4, -2]
			];
			const snapshot = original.map((r) => r.slice());
			determinantFloatIterative(original);
			assert.deepStrictEqual(original, snapshot);
		});

		it('preserves numerical accuracy with partial pivoting on tiny leading diagonal', () => {
			const eps = 1e-16;
			const m = [
				[eps, 1],
				[1, 1]
			];
			// Exact determinant is eps - 1 = -1 (to float64 precision)
			assertClose(determinantFloatIterative(m), eps - 1, 1e-15);
		});

		it('satisfies algebraic properties: transpose, scaling, and multiplicativity', () => {
			const a = [
				[2.5, -1.2, 0.7, 3.1],
				[0.4, 4.2, -2.3, 1.5],
				[-3.3, 0.8, 1.9, -0.6],
				[1.1, -2.4, 3.5, 2.0]
			];
			const b = [
				[-1.5, 2.1, 0.3, -0.9],
				[3.2, -0.5, 1.4, 2.2],
				[0.6, 1.7, -2.8, 1.1],
				[-2.0, 0.4, 0.9, 3.3]
			];

			const detA = determinantFloatIterative(a);
			const detB = determinantFloatIterative(b);

			// Transpose invariance: det(A^T) == det(A)
			assertClose(determinantFloatIterative(transpose(a)), detA, 1e-11);

			// Scaling: det(c * A) == c^n * det(A)
			const c = -2.5;
			const scaled = a.map((row) => row.map((v) => v * c));
			assertClose(determinantFloatIterative(scaled), c ** a.length * detA, 1e-11);

			// Multiplicativity: det(A * B) == det(A) * det(B)
			assertClose(determinantFloatIterative(matMul(a, b)), detA * detB, 1e-10);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array matrix', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, new Float64Array(4)]) {
				assert.throws(() => determinantFloatIterative(bad), TypeError);
			}
		});

		it('throws TypeError for non-array rows', () => {
			assert.throws(() => determinantFloatIterative([1, 2]), TypeError);
			assert.throws(() => determinantFloatIterative([[1, 2], null]), TypeError);
			assert.throws(() => determinantFloatIterative([[1, 2], '34']), TypeError);
		});

		it('throws RangeError for non-square or ragged matrices', () => {
			assert.throws(() => determinantFloatIterative([[]]), RangeError);
			assert.throws(
				() =>
					determinantFloatIterative([
						[1, 2, 3],
						[4, 5, 6]
					]),
				RangeError
			);
			assert.throws(
				() =>
					determinantFloatIterative([
						[1, 2],
						[3]
					]),
				RangeError
			);
		});

		it('throws TypeError for non-number elements', () => {
			assert.throws(() => determinantFloatIterative([['1']]), TypeError);
			assert.throws(
				() =>
					determinantFloatIterative([
						[1, null],
						[3, 4]
					]),
				TypeError
			);
			assert.throws(
				() =>
					determinantFloatIterative([
						[1, undefined],
						[3, 4]
					]),
				TypeError
			);
			assert.throws(() => determinantFloatIterative([[1n]]), TypeError);
		});

		it('throws RangeError for non-finite numbers', () => {
			assert.throws(() => determinantFloatIterative([[Number.NaN]]), RangeError);
			assert.throws(
				() =>
					determinantFloatIterative([
						[1, Number.POSITIVE_INFINITY],
						[0, 1]
					]),
				RangeError
			);
			assert.throws(
				() =>
					determinantFloatIterative([
						[1, 0],
						[Number.NEGATIVE_INFINITY, 1]
					]),
				RangeError
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches Laplace cofactor expansion across pseudo-random 2x2..5x5 float64 matrices', () => {
			const rand = makeRng(0xdecafbad);
			for (let n = 2; n <= 5; n++) {
				for (let trial = 0; trial < 8; trial++) {
					const m = Array.from({ length: n }, () =>
						Array.from({ length: n }, () => (rand() - 0.5) * 10)
					);
					const actual = determinantFloatIterative(m);
					const expected = referenceDeterminantCofactor(m);
					assertClose(actual, expected, 1e-9);
				}
			}
		});

		it('matches exact Vandermonde determinant closed-form product for 6x6 matrix', () => {
			const xs = [-2.5, -1.0, 0.25, 1.5, 2.75, 4.0];
			const n = xs.length;
			const vandermonde = xs.map((x) => Array.from({ length: n }, (_, p) => x ** p));

			let expected = 1;
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					expected *= xs[j] - xs[i];
				}
			}

			assertClose(determinantFloatIterative(vandermonde), expected, 1e-10);
		});
	});
});
