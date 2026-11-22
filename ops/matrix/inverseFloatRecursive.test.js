import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inverseFloatRecursive } from './inverseFloatRecursive.js';

function matMul(A, B) {
	const n = A.length;
	const m = B[0].length;
	const p = B.length;
	const C = Array.from({ length: n }, () => new Array(m).fill(0));
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < p; k++) {
			for (let j = 0; j < m; j++) {
				C[i][j] += A[i][k] * B[k][j];
			}
		}
	}
	return C;
}

function identity(n) {
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	);
}

function assertMatrixClose(actual, expected, tol = 1e-10, label = '') {
	assert.equal(actual.length, expected.length, `${label} row count mismatch`);
	for (let i = 0; i < expected.length; i++) {
		assert.equal(actual[i].length, expected[i].length, `${label} col count mismatch at row ${i}`);
		for (let j = 0; j < expected[i].length; j++) {
			const diff = Math.abs(actual[i][j] - expected[i][j]);
			const scale = Math.max(1, Math.abs(expected[i][j]));
			assert.ok(
				diff <= tol * scale,
				`${label} mismatch at (${i}, ${j}): got ${actual[i][j]}, expected ${expected[i][j]} (diff=${diff})`,
			);
		}
	}
}

/**
 * Independent Gauss-Jordan reference implementation for cross-checking.
 */
function referenceGaussJordanInverse(M) {
	const n = M.length;
	const aug = M.map((row, i) => [
		...row,
		...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
	]);

	for (let col = 0; col < n; col++) {
		let pivotRow = col;
		for (let r = col + 1; r < n; r++) {
			if (Math.abs(aug[r][col]) > Math.abs(aug[pivotRow][col])) {
				pivotRow = r;
			}
		}
		[aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
		const pivot = aug[col][col];
		for (let j = 0; j < 2 * n; j++) {
			aug[col][j] /= pivot;
		}
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = aug[r][col];
			for (let j = 0; j < 2 * n; j++) {
				aug[r][j] -= factor * aug[col][j];
			}
		}
	}

	return aug.map((row) => row.slice(n));
}

describe('inverseFloatRecursive', () => {
	describe('normal cases', () => {
		it('inverts 1x1 matrices', () => {
			assertMatrixClose(inverseFloatRecursive([[4]]), [[0.25]]);
			assertMatrixClose(inverseFloatRecursive([[-2.5]]), [[-0.4]]);
			assertMatrixClose(inverseFloatRecursive([[1e-20]]), [[1e20]]);
			assertMatrixClose(inverseFloatRecursive([[1e20]]), [[1e-20]]);
		});

		it('inverts 2x2 matrices matching closed-form formula', () => {
			const M = [
				[4, 7],
				[2, 6],
			];
			const inv = inverseFloatRecursive(M);
			const expected = [
				[0.6, -0.7],
				[-0.2, 0.4],
			];
			assertMatrixClose(inv, expected, 1e-12, '2x2');
			assertMatrixClose(matMul(M, inv), identity(2), 1e-12, '2x2 M*M^-1');
			assertMatrixClose(matMul(inv, M), identity(2), 1e-12, '2x2 M^-1*M');
		});

		it('inverts 3x3 matrices', () => {
			const M = [
				[3, 0, 2],
				[2, 0, -2],
				[0, 1, 1],
			];
			const expected = [
				[0.2, 0.2, 0],
				[-0.2, 0.3, 1],
				[0.2, -0.3, 0],
			];
			const inv = inverseFloatRecursive(M);
			assertMatrixClose(inv, expected, 1e-12, '3x3');
			assertMatrixClose(matMul(M, inv), identity(3), 1e-12, '3x3 M*M^-1');
			assertMatrixClose(matMul(inv, M), identity(3), 1e-12, '3x3 M^-1*M');
		});

		it('inverts 4x4 matrices', () => {
			const M = [
				[4, 1, -2, 2],
				[1, 2, 0, 1],
				[-2, 0, 3, -2],
				[2, 1, -2, -1],
			];
			const inv = inverseFloatRecursive(M);
			assertMatrixClose(matMul(M, inv), identity(4), 1e-12, '4x4 M*M^-1');
			assertMatrixClose(matMul(inv, M), identity(4), 1e-12, '4x4 M^-1*M');
			assertMatrixClose(inverseFloatRecursive(inv), M, 1e-11, '4x4 (M^-1)^-1');
		});

		it('inverts 5x5 matrices (odd recursive split)', () => {
			const M = [
				[2, -1, 0, 3, 1],
				[1, 4, -2, 0, 2],
				[0, 2, 5, -1, 0],
				[3, 0, -1, 6, -2],
				[-1, 1, 2, 0, 4],
			];
			const inv = inverseFloatRecursive(M);
			assertMatrixClose(matMul(M, inv), identity(5), 1e-12, '5x5 M*M^-1');
			assertMatrixClose(matMul(inv, M), identity(5), 1e-12, '5x5 M^-1*M');
			assertMatrixClose(inverseFloatRecursive(inv), M, 1e-11, '5x5 (M^-1)^-1');
		});

		it('inverts matrices with a zero top-left block', () => {
			const M2 = [
				[0, 2],
				[5, 0],
			];
			assertMatrixClose(inverseFloatRecursive(M2), [
				[0, 0.2],
				[0.5, 0],
			], 1e-12, '2x2 zero top-left');

			// 4x4 with entire 2x2 leading principal submatrix equal to zero
			const M4 = [
				[0, 0, 2, 1],
				[0, 0, 1, 3],
				[4, 1, 0, 0],
				[1, 2, 0, 0],
			];
			const inv4 = inverseFloatRecursive(M4);
			assertMatrixClose(matMul(M4, inv4), identity(4), 1e-12, '4x4 zero-block M*M^-1');
			assertMatrixClose(matMul(inv4, M4), identity(4), 1e-12, '4x4 zero-block M^-1*M');
			assertMatrixClose(inverseFloatRecursive(inv4), M4, 1e-11, '4x4 zero-block (M^-1)^-1');

			// 5x5 cyclic permutation matrix (all zeros on diagonal and top-left 2x2 block)
			const P5 = [
				[0, 0, 1, 0, 0],
				[0, 0, 0, 1, 0],
				[0, 0, 0, 0, 1],
				[1, 0, 0, 0, 0],
				[0, 1, 0, 0, 0],
			];
			const invP5 = inverseFloatRecursive(P5);
			assertMatrixClose(matMul(P5, invP5), identity(5), 1e-12, '5x5 perm M*M^-1');
			assertMatrixClose(matMul(invP5, P5), identity(5), 1e-12, '5x5 perm M^-1*M');
		});
	});

	describe('edge cases', () => {
		it('inverts identity matrices exactly without -0', () => {
			for (const n of [1, 2, 3, 4, 5]) {
				const I = identity(n);
				assert.deepStrictEqual(inverseFloatRecursive(I), I);
			}
		});

		it('inverts diagonal matrices including very small uniform scales', () => {
			const D = [
				[2, 0, 0],
				[0, -4, 0],
				[0, 0, 0.5],
			];
			assert.deepStrictEqual(inverseFloatRecursive(D), [
				[0.5, 0, 0],
				[0, -0.25, 0],
				[0, 0, 2],
			]);

			const tiny = [
				[1e-20, 0],
				[0, -1e-20],
			];
			assertMatrixClose(inverseFloatRecursive(tiny), [
				[1e20, 0],
				[0, -1e20],
			], 1e-12, 'tiny diagonal');
		});

		it('does not mutate the input matrix', () => {
			const M = [
				[0, 2, 1],
				[3, -1, 2],
				[1, 4, -2],
			];
			const snapshot = M.map((row) => [...row]);
			inverseFloatRecursive(M);
			assert.deepStrictEqual(M, snapshot);
		});

		it('throws RangeError on singular matrices', () => {
			assert.throws(() => inverseFloatRecursive([[0]]), RangeError);
			assert.throws(
				() =>
					inverseFloatRecursive([
						[0, 0],
						[0, 0],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					inverseFloatRecursive([
						[1, 2],
						[2, 4],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					inverseFloatRecursive([
						[1, 2, 3],
						[4, 5, 6],
						[7, 8, 9],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					inverseFloatRecursive([
						[1, 0, 2, 3],
						[0, 1, 4, 5],
						[1, 1, 6, 8],
						[2, 1, 8, 11],
					]),
				RangeError,
			);
			// Inverse overflows float64 to Infinity
			assert.throws(() => inverseFloatRecursive([[1e-310]]), RangeError);
		});

		it('validates input shape and element types', () => {
			assert.throws(() => inverseFloatRecursive(null), TypeError);
			assert.throws(() => inverseFloatRecursive(undefined), TypeError);
			assert.throws(() => inverseFloatRecursive(42), TypeError);
			assert.throws(() => inverseFloatRecursive('[[1]]'), TypeError);
			assert.throws(() => inverseFloatRecursive({}), TypeError);
			assert.throws(() => inverseFloatRecursive([1, 2]), TypeError);

			assert.throws(() => inverseFloatRecursive([]), RangeError);
			assert.throws(() => inverseFloatRecursive([[]]), RangeError);
			assert.throws(
				() =>
					inverseFloatRecursive([
						[1, 2, 3],
						[4, 5, 6],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					inverseFloatRecursive([
						[1, 2],
						[3],
					]),
				RangeError,
			);

			assert.throws(() => inverseFloatRecursive([['1']]), TypeError);
			assert.throws(() => inverseFloatRecursive([[null]]), TypeError);
			assert.throws(() => inverseFloatRecursive([[undefined]]), TypeError);
			assert.throws(() => inverseFloatRecursive([[NaN]]), RangeError);
			assert.throws(() => inverseFloatRecursive([[Infinity]]), RangeError);
			assert.throws(() => inverseFloatRecursive([[-Infinity]]), RangeError);
		});
	});

	describe('cross-checks against independent computation', () => {
		it('matches independent Gauss-Jordan inversion and satisfies M*M^-1 = M^-1*M = I and (M^-1)^-1 = M', () => {
			// Deterministic PRNG (LCG) for reproducible test matrices of sizes 2..9
			let seed = 1337;
			const nextFloat = () => {
				seed = (seed * 1664525 + 1013904223) >>> 0;
				return (seed / 0xffffffff) * 10 - 5;
			};

			for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
				const M = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => {
						const v = nextFloat();
						// Add modest diagonal shift so every generated matrix is well-conditioned
						return i === j ? v + (v >= 0 ? n : -n) : v;
					}),
				);

				const inv = inverseFloatRecursive(M);
				const ref = referenceGaussJordanInverse(M);
				const I = identity(n);

				assertMatrixClose(inv, ref, 1e-10, `n=${n} vs Gauss-Jordan`);
				assertMatrixClose(matMul(M, inv), I, 1e-10, `n=${n} M*M^-1`);
				assertMatrixClose(matMul(inv, M), I, 1e-10, `n=${n} M^-1*M`);
				assertMatrixClose(inverseFloatRecursive(inv), M, 1e-9, `n=${n} (M^-1)^-1`);
			}
		});
	});
});
