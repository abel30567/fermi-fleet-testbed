import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inverseTypedMemo } from './inverseTypedMemo.js';

/**
 * Multiplies two n x n flat row-major Float64Array matrices.
 * @param {Float64Array} a
 * @param {Float64Array} b
 * @param {number} n
 * @returns {Float64Array}
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0;
			for (let k = 0; k < n; k++) {
				sum += a[i * n + k] * b[k * n + j];
			}
			out[i * n + j] = sum;
		}
	}
	return out;
}

/**
 * Builds an n x n identity matrix as a flat Float64Array.
 * @param {number} n
 * @returns {Float64Array}
 */
function identityMatrix(n) {
	const out = new Float64Array(n * n);
	for (let i = 0; i < n; i++) {
		out[i * n + i] = 1;
	}
	return out;
}

/**
 * Asserts two Float64Array matrices are element-wise close within tolerance.
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [tol=1e-9]
 */
function assertMatrixClose(actual, expected, tol = 1e-9) {
	assert.ok(actual instanceof Float64Array, 'Result must be a Float64Array');
	assert.equal(actual.length, expected.length);
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`Mismatch at index ${i}: got ${actual[i]}, expected ${expected[i]} (tol=${tol})`,
		);
	}
}

describe('inverseTypedMemo', () => {
	describe('normal cases (1x1, 2x2, 3x3, 4x4, 5x5)', () => {
		it('inverts a 1x1 matrix', () => {
			const m = new Float64Array([4]);
			const inv = inverseTypedMemo(m);
			assertMatrixClose(inv, new Float64Array([0.25]), 1e-12);
		});

		it('inverts a 2x2 matrix with inferred and explicit n', () => {
			const m = new Float64Array([4, 7, 2, 6]);
			const expected = new Float64Array([0.6, -0.7, -0.2, 0.4]);
			assertMatrixClose(inverseTypedMemo(m), expected, 1e-12);
			assertMatrixClose(inverseTypedMemo(m, 2), expected, 1e-12);
		});

		it('inverts a 3x3 matrix', () => {
			const m = new Float64Array([
				3, 0, 2,
				2, 0, -2,
				0, 1, 1,
			]);
			const expected = new Float64Array([
				0.2, 0.2, 0,
				-0.2, 0.3, 1,
				0.2, -0.3, 0,
			]);
			assertMatrixClose(inverseTypedMemo(m), expected, 1e-12);
		});

		it('inverts a 4x4 matrix requiring partial pivoting (zero on diagonal)', () => {
			const m = new Float64Array([
				0, 2, 1, 3,
				1, 0, 2, 1,
				2, 1, 0, 2,
				3, 2, 1, 0,
			]);
			const inv = inverseTypedMemo(m);
			const eye = identityMatrix(4);
			assertMatrixClose(matMul(m, inv, 4), eye, 1e-11);
			assertMatrixClose(matMul(inv, m, 4), eye, 1e-11);
		});

		it('inverts a 5x5 matrix via Gauss-Jordan elimination', () => {
			const m = new Float64Array([
				2, 1, 0, 0, 1,
				1, 3, 1, 0, 0,
				0, 1, 4, 1, 0,
				0, 0, 1, 5, 1,
				1, 0, 0, 1, 6,
			]);
			const inv = inverseTypedMemo(m, 5);
			const eye = identityMatrix(5);
			assertMatrixClose(matMul(m, inv, 5), eye, 1e-11);
			assertMatrixClose(matMul(inv, m, 5), eye, 1e-11);
		});
	});

	describe('edge cases & validation', () => {
		it('inverts identity matrices of dimensions 1 through 5', () => {
			for (let n = 1; n <= 5; n++) {
				const eye = identityMatrix(n);
				const inv = inverseTypedMemo(eye);
				assert.deepStrictEqual(inv, eye);
			}
		});

		it('handles scaled matrices cleanly without false singularity', () => {
			const m = new Float64Array([
				1e-6, 0, 0,
				0, 1e-6, 0,
				0, 0, 1e-6,
			]);
			const inv = inverseTypedMemo(m);
			assertMatrixClose(
				inv,
				new Float64Array([
					1e6, 0, 0,
					0, 1e6, 0,
					0, 0, 1e6,
				]),
				1e-3,
			);
		});

		it('throws on singular matrices across all dispatch paths (1x1, 2x2, 3x3, 4x4)', () => {
			assert.throws(() => inverseTypedMemo(new Float64Array([0])), /singular/i);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 2, 2, 4])), /singular/i);
			assert.throws(
				() => inverseTypedMemo(new Float64Array([
					1, 2, 3,
					4, 5, 6,
					7, 8, 9,
				])),
				/singular/i,
			);
			assert.throws(
				() => inverseTypedMemo(new Float64Array([
					1, 2, 3, 4,
					2, 4, 6, 8,
					0, 1, 0, 1,
					1, 0, 1, 0,
				])),
				/singular/i,
			);
			assert.throws(() => inverseTypedMemo(new Float64Array(16)), /singular/i);
		});

		it('throws on non-Float64Array inputs', () => {
			assert.throws(() => inverseTypedMemo([1, 0, 0, 1]), TypeError);
			assert.throws(() => inverseTypedMemo(new Float32Array([1, 0, 0, 1])), TypeError);
			assert.throws(() => inverseTypedMemo(null), TypeError);
			assert.throws(() => inverseTypedMemo(undefined), TypeError);
			assert.throws(() => inverseTypedMemo({ length: 4 }), TypeError);
		});

		it('throws on empty, non-square, mismatched n, or non-finite inputs', () => {
			assert.throws(() => inverseTypedMemo(new Float64Array(0)), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 2, 3])), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 2, 3, 4, 5, 6])), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 0, 0, 1]), 3), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 0, 0, 1]), 0), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 0, 0, 1]), -2), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 0, 0, 1]), 1.5), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 0, 0, 1]), '2'), TypeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 0, 0, 1]), NaN), TypeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, NaN, 0, 1])), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([Infinity, 0, 0, 1])), RangeError);
			assert.throws(() => inverseTypedMemo(new Float64Array([1, 0, -Infinity, 1])), RangeError);
		});
	});

	describe('memoization & cache isolation', () => {
		it('returns isolated Float64Array instances on repeated memoized calls', () => {
			const m = new Float64Array([5, 2, 3, 2]);
			const first = inverseTypedMemo(m);
			const second = inverseTypedMemo(m);

			assert.notEqual(first, second, 'Repeated calls must return distinct Float64Array instances');
			assert.deepStrictEqual(first, second);

			// Mutating caller's returned buffer must not poison the cache.
			first[0] = 999999;
			const third = inverseTypedMemo(m);
			assert.deepStrictEqual(third, second);
			assert.notEqual(third[0], 999999);
		});

		it('does not mutate input matrix and remains safe if caller mutates input later', () => {
			const original = new Float64Array([7, 3, 2, 1]);
			const snapshot = new Float64Array(original);
			const inv1 = inverseTypedMemo(original);
			assert.deepStrictEqual(original, snapshot);

			original[0] = 100;
			const inv2 = inverseTypedMemo(snapshot);
			assert.deepStrictEqual(inv1, inv2);
		});

		it('treats -0 and +0 consistently in cache keys and outputs', () => {
			const posZero = new Float64Array([2, 0, 0, 4]);
			const negZero = new Float64Array([2, -0, -0, 4]);
			const invPos = inverseTypedMemo(posZero);
			const invNeg = inverseTypedMemo(negZero);
			assert.deepStrictEqual(invPos, invNeg);
			for (let i = 0; i < invNeg.length; i++) {
				assert.equal(Object.is(invNeg[i], -0), false);
			}
		});

		it('handles LRU eviction gracefully when exceeding cache capacity', () => {
			for (let k = 1; k <= 300; k++) {
				const m = new Float64Array([k, 1, 0, k]);
				const inv = inverseTypedMemo(m);
				assertMatrixClose(inv, new Float64Array([1 / k, -1 / (k * k), 0, 1 / k]), 1e-12);
			}
		});
	});

	describe('independent mathematical cross-checks', () => {
		it('satisfies A * A^-1 ≈ I, A^-1 * A ≈ I, and (A^-1)^-1 ≈ A across dimensions 1..4', () => {
			const testMatrices = [
				{ n: 1, data: new Float64Array([-2.5]) },
				{ n: 2, data: new Float64Array([1.5, -2.25, 3.75, 4.5]) },
				{
					n: 3,
					data: new Float64Array([
						2, -1, 0.5,
						-3, 4, 1.25,
						1, 2, -3.5,
					]),
				},
				{
					n: 4,
					data: new Float64Array([
						1, 0.5, 1 / 3, 0.25,
						0.5, 1 / 3, 0.25, 0.2,
						1 / 3, 0.25, 0.2, 1 / 6,
						0.25, 0.2, 1 / 6, 1 / 7,
					]),
				},
			];

			for (const { n, data } of testMatrices) {
				const inv = inverseTypedMemo(data, n);
				const eye = identityMatrix(n);
				const tol = n === 4 ? 1e-7 : 1e-11;

				assertMatrixClose(matMul(data, inv, n), eye, tol);
				assertMatrixClose(matMul(inv, data, n), eye, tol);

				const invInv = inverseTypedMemo(inv, n);
				assertMatrixClose(invInv, data, tol);
			}
		});
	});
});
