import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inverseBigIntRecursive, SCALE } from './inverseBigIntRecursive.js';

/**
 * Multiplies two BigInt matrices (standard iterative reference helper for tests).
 */
function matMulBigInt(A, B) {
	const r = A.length;
	const p = A[0].length;
	const c = B[0].length;
	const out = Array.from({ length: r }, () => new Array(c).fill(0n));
	for (let i = 0; i < r; i++) {
		for (let j = 0; j < c; j++) {
			let sum = 0n;
			for (let k = 0; k < p; k++) {
				sum += A[i][k] * B[k][j];
			}
			out[i][j] = sum;
		}
	}
	return out;
}

/**
 * Independent iterative Gauss-Jordan matrix inversion over exact BigInt rationals
 * for cross-checking against the recursive Schur complement implementation.
 */
function referenceGaussJordanInverse(matrix) {
	const gcd = (a, b) => {
		let x = a < 0n ? -a : a;
		let y = b < 0n ? -b : b;
		while (y !== 0n) {
			const r = x % y;
			x = y;
			y = r;
		}
		return x;
	};
	const norm = (num, den) => {
		if (num === 0n) return [0n, 1n];
		if (den < 0n) {
			num = -num;
			den = -den;
		}
		const g = gcd(num, den);
		return [num / g, den / g];
	};
	const add = ([n1, d1], [n2, d2]) => norm(n1 * d2 + n2 * d1, d1 * d2);
	const sub = ([n1, d1], [n2, d2]) => norm(n1 * d2 - n2 * d1, d1 * d2);
	const mul = ([n1, d1], [n2, d2]) => norm(n1 * n2, d1 * d2);
	const div = ([n1, d1], [n2, d2]) => norm(n1 * d2, d1 * n2);

	const n = matrix.length;
	// Augmented matrix [A | I]
	const aug = matrix.map((row, i) => [
		...row.map((v) => [v, 1n]),
		...Array.from({ length: n }, (_, j) => [i === j ? 1n : 0n, 1n]),
	]);

	for (let col = 0; col < n; col++) {
		let pivotRow = -1;
		for (let r = col; r < n; r++) {
			if (aug[r][col][0] !== 0n) {
				pivotRow = r;
				break;
			}
		}
		if (pivotRow === -1) {
			throw new RangeError('Singular matrix');
		}
		if (pivotRow !== col) {
			[aug[col], aug[pivotRow]] = [aug[pivotRow], aug[col]];
		}
		const pivot = aug[col][col];
		for (let c = 0; c < 2 * n; c++) {
			aug[col][c] = div(aug[col][c], pivot);
		}
		for (let r = 0; r < n; r++) {
			if (r === col || aug[r][col][0] === 0n) continue;
			const factor = aug[r][col];
			for (let c = 0; c < 2 * n; c++) {
				aug[r][c] = sub(aug[r][c], mul(factor, aug[col][c]));
			}
		}
	}

	return aug.map((row) =>
		row.slice(n).map(([num, den]) => {
			if (num === 0n) return 0n;
			const scaled = num * SCALE;
			const neg = scaled < 0n;
			const absScaled = neg ? -scaled : scaled;
			let q = absScaled / den;
			const rem = absScaled % den;
			if (rem * 2n >= den) q += 1n;
			if (q === 0n) return 0n;
			return neg ? -q : q;
		}),
	);
}

/**
 * Independent floating-point Gauss-Jordan inversion over JS Numbers.
 */
function floatGaussJordanInverse(matrix) {
	const n = matrix.length;
	const aug = matrix.map((row, i) => [
		...row.map((v) => Number(v)),
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
		for (let c = 0; c < 2 * n; c++) {
			aug[col][c] /= pivot;
		}
		for (let r = 0; r < n; r++) {
			if (r === col) continue;
			const factor = aug[r][col];
			for (let c = 0; c < 2 * n; c++) {
				aug[r][c] -= factor * aug[col][c];
			}
		}
	}

	return aug.map((row) => row.slice(n));
}

/**
 * Verifies both A * inv(A) ≈ SCALE * I and inv(A) * A ≈ SCALE * I
 * within the exact theoretical rounding bound sum_k |A[i][k]| / 2 + 1.
 */
function assertInverseIdentity(A, AInv) {
	const n = A.length;
	const prodRight = matMulBigInt(A, AInv);
	const prodLeft = matMulBigInt(AInv, A);

	for (let i = 0; i < n; i++) {
		let rowAbsSum = 0n;
		for (let k = 0; k < n; k++) {
			rowAbsSum += A[i][k] < 0n ? -A[i][k] : A[i][k];
		}
		const maxRowErr = rowAbsSum / 2n + 1n;

		for (let j = 0; j < n; j++) {
			const expected = i === j ? SCALE : 0n;
			const errRight =
				prodRight[i][j] >= expected
					? prodRight[i][j] - expected
					: expected - prodRight[i][j];
			assert.ok(
				errRight <= maxRowErr,
				`(A * A^-1)[${i}][${j}] error ${errRight} exceeded bound ${maxRowErr}`,
			);

			let colAbsSum = 0n;
			for (let k = 0; k < n; k++) {
				colAbsSum += A[k][j] < 0n ? -A[k][j] : A[k][j];
			}
			const maxColErr = colAbsSum / 2n + 1n;
			const errLeft =
				prodLeft[i][j] >= expected
					? prodLeft[i][j] - expected
					: expected - prodLeft[i][j];
			assert.ok(
				errLeft <= maxColErr,
				`(A^-1 * A)[${i}][${j}] error ${errLeft} exceeded bound ${maxColErr}`,
			);
		}
	}
}

describe('inverseBigIntRecursive', () => {
	it('exports SCALE as 10n ** 18n', () => {
		assert.equal(SCALE, 10n ** 18n);
	});

	describe('normal cases', () => {
		it('inverts 1x1 matrices accurately', () => {
			assert.deepEqual(inverseBigIntRecursive([[1n]]), [[SCALE]]);
			assert.deepEqual(inverseBigIntRecursive([[-1n]]), [[-SCALE]]);
			assert.deepEqual(inverseBigIntRecursive([[2n]]), [[500_000_000_000_000_000n]]);
			assert.deepEqual(inverseBigIntRecursive([[3n]]), [[333_333_333_333_333_333n]]);
			assert.deepEqual(inverseBigIntRecursive([[-3n]]), [[-333_333_333_333_333_333n]]);
			assert.deepEqual(inverseBigIntRecursive([[6n]]), [[166_666_666_666_666_667n]]);
		});

		it('inverts 2x2 identity and general matrices', () => {
			const I2 = [
				[1n, 0n],
				[0n, 1n],
			];
			assert.deepEqual(inverseBigIntRecursive(I2), [
				[SCALE, 0n],
				[0n, SCALE],
			]);

			// det = 24 - 14 = 10 -> [[0.6, -0.7], [-0.2, 0.4]]
			const A = [
				[4n, 7n],
				[2n, 6n],
			];
			assert.deepEqual(inverseBigIntRecursive(A), [
				[600_000_000_000_000_000n, -700_000_000_000_000_000n],
				[-200_000_000_000_000_000n, 400_000_000_000_000_000n],
			]);

			// Unimodular matrix with negative entries
			const U = [
				[-3n, 5n],
				[2n, -3n],
			];
			// det = 9 - 10 = -1 -> [[3, 5], [2, 3]]
			assert.deepEqual(inverseBigIntRecursive(U), [
				[3n * SCALE, 5n * SCALE],
				[2n * SCALE, 3n * SCALE],
			]);
		});

		it('inverts 3x3 matrices including repeating-decimal fractions', () => {
			const A = [
				[1n, 2n, 3n],
				[0n, 1n, 4n],
				[5n, 6n, 0n],
			];
			// det = 1, exact integer inverse:
			// [[-24, 18, 5], [20, -15, -4], [-5, 4, 1]]
			assert.deepEqual(inverseBigIntRecursive(A), [
				[-24n * SCALE, 18n * SCALE, 5n * SCALE],
				[20n * SCALE, -15n * SCALE, -4n * SCALE],
				[-5n * SCALE, 4n * SCALE, 1n * SCALE],
			]);

			const B = [
				[2n, -1n, 0n],
				[-1n, 2n, -1n],
				[0n, -1n, 2n],
			];
			// det = 4, exact inverse = (1/4) * [[3, 2, 1], [2, 4, 2], [1, 2, 3]]
			assert.deepEqual(inverseBigIntRecursive(B), [
				[750_000_000_000_000_000n, 500_000_000_000_000_000n, 250_000_000_000_000_000n],
				[500_000_000_000_000_000n, SCALE, 500_000_000_000_000_000n],
				[250_000_000_000_000_000n, 500_000_000_000_000_000n, 750_000_000_000_000_000n],
			]);
		});

		it('handles zero diagonals, permutation matrices, and singular leading principal blocks', () => {
			// 2x2 permutation (leading 1x1 block is [0])
			const P2 = [
				[0n, 1n],
				[1n, 0n],
			];
			assert.deepEqual(inverseBigIntRecursive(P2), [
				[0n, SCALE],
				[SCALE, 0n],
			]);

			// 3x3 zero diagonal
			const Z3 = [
				[0n, 1n, 2n],
				[1n, 0n, 3n],
				[4n, 5n, 0n],
			];
			const Z3Inv = inverseBigIntRecursive(Z3);
			assert.deepEqual(Z3Inv, referenceGaussJordanInverse(Z3));
			assertInverseIdentity(Z3, Z3Inv);

			// 4x4 invertible matrix (det = -2) whose top-left 2x2 block [[1, 1], [1, 1]] is singular
			const SBlock4 = [
				[1n, 1n, 0n, 1n],
				[1n, 1n, 1n, 0n],
				[0n, 1n, 0n, 1n],
				[0n, 0n, 1n, 1n],
			];
			const SBlock4Inv = inverseBigIntRecursive(SBlock4);
			assert.deepEqual(SBlock4Inv, referenceGaussJordanInverse(SBlock4));
			assertInverseIdentity(SBlock4, SBlock4Inv);
		});

		it('handles large BigInt matrices where IEEE 754 floating-point fails completely', () => {
			const big = 10n ** 12n;
			// det = (big + 1)(big - 1) - big^2 = -1
			// exact inverse = [[1 - big, big], [big, -(big + 1)]]
			const A = [
				[big + 1n, big],
				[big, big - 1n],
			];
			assert.deepEqual(inverseBigIntRecursive(A), [
				[(1n - big) * SCALE, big * SCALE],
				[big * SCALE, -(big + 1n) * SCALE],
			]);
			assertInverseIdentity(A, inverseBigIntRecursive(A));
		});

		it('does not mutate the input matrix', () => {
			const A = [
				[3n, -1n, 2n],
				[1n, 4n, -2n],
				[-2n, 1n, 5n],
			];
			const snapshot = A.map((row) => [...row]);
			inverseBigIntRecursive(A);
			assert.deepEqual(A, snapshot);
		});
	});

	describe('edge cases & rounding', () => {
		it('rounds ties away from zero and handles underflow to 0n', () => {
			// 1 / (2 * 10^18) * 10^18 = 0.5 -> rounds to 1n
			assert.deepEqual(inverseBigIntRecursive([[2n * SCALE]]), [[1n]]);
			assert.deepEqual(inverseBigIntRecursive([[-2n * SCALE]]), [[-1n]]);

			// 1 / (4 * 10^18) * 10^18 = 0.25 -> rounds to 0n
			assert.deepEqual(inverseBigIntRecursive([[4n * SCALE]]), [[0n]]);
			assert.deepEqual(inverseBigIntRecursive([[-4n * SCALE]]), [[0n]]);

			// Very large diagonal entries
			assert.deepEqual(
				inverseBigIntRecursive([
					[10n ** 30n, 0n],
					[0n, 10n ** 30n],
				]),
				[
					[0n, 0n],
					[0n, 0n],
				],
			);
		});

		it('throws RangeError on singular matrices', () => {
			assert.throws(() => inverseBigIntRecursive([[0n]]), RangeError);
			assert.throws(
				() =>
					inverseBigIntRecursive([
						[1n, 2n],
						[2n, 4n],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					inverseBigIntRecursive([
						[1n, 2n, 3n],
						[4n, 5n, 6n],
						[7n, 8n, 9n],
					]),
				RangeError,
			);
			// 4x4 with invertible leading 2x2 block, singular overall (row 3 = row 0 + row 1)
			assert.throws(
				() =>
					inverseBigIntRecursive([
						[1n, 0n, 2n, 3n],
						[0n, 1n, 4n, 5n],
						[0n, 0n, 1n, 2n],
						[1n, 1n, 6n, 8n],
					]),
				RangeError,
			);
		});

		it('validates input types and dimensions strictly', () => {
			// Non-array inputs -> TypeError
			for (const bad of [null, undefined, 123, 123n, 'matrix', {}]) {
				assert.throws(() => inverseBigIntRecursive(bad), TypeError);
			}

			// Non-array rows -> TypeError
			assert.throws(() => inverseBigIntRecursive([1n, 2n]), TypeError);
			assert.throws(() => inverseBigIntRecursive([[1n, 2n], 'not-a-row']), TypeError);

			// Non-BigInt entries -> TypeError
			assert.throws(
				() =>
					inverseBigIntRecursive([
						[1, 0],
						[0, 1],
					]),
				TypeError,
			);
			assert.throws(
				() =>
					inverseBigIntRecursive([
						[1n, '0'],
						[0n, 1n],
					]),
				TypeError,
			);
			assert.throws(() => inverseBigIntRecursive([[NaN]]), TypeError);
			assert.throws(() => inverseBigIntRecursive([[null]]), TypeError);

			// Empty / non-square / jagged matrices -> RangeError
			assert.throws(() => inverseBigIntRecursive([]), RangeError);
			assert.throws(() => inverseBigIntRecursive([[]]), RangeError);
			assert.throws(
				() =>
					inverseBigIntRecursive([
						[1n, 2n, 3n],
						[4n, 5n, 6n],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					inverseBigIntRecursive([
						[1n, 2n],
						[3n],
					]),
				RangeError,
			);
		});
	});

	describe('independent cross-checks', () => {
		it('matches exact iterative Gauss-Jordan bit-for-bit across sizes 1x1 through 8x8', () => {
			// Deterministic pseudo-random generator for reproducible matrices
			let seed = 1337n;
			const nextInt = (bound) => {
				seed = (seed * 6364136223846793005n + 1442695040888963407n) % (1n << 62n);
				return (seed % (2n * bound + 1n)) - bound;
			};

			for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
				const A = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => {
						const v = nextInt(9n);
						// Bias diagonal slightly to ensure non-singularity
						return i === j ? v + (v >= 0n ? 10n : -10n) : v;
					}),
				);
				const recursiveInv = inverseBigIntRecursive(A);
				const refInv = referenceGaussJordanInverse(A);
				assert.deepEqual(recursiveInv, refInv, `Mismatch for ${n}x${n} matrix`);
				assertInverseIdentity(A, recursiveInv);
			}
		});

		it('agrees with floating-point Gauss-Jordan within tight tolerance', () => {
			const A = [
				[5n, -2n, 1n, 3n, 0n],
				[2n, 7n, -3n, 1n, 4n],
				[-1n, 3n, 8n, -2n, 1n],
				[4n, 0n, 2n, 9n, -3n],
				[1n, -4n, 1n, 2n, 6n],
			];
			const bigInv = inverseBigIntRecursive(A);
			const floatInv = floatGaussJordanInverse(A);

			for (let i = 0; i < A.length; i++) {
				for (let j = 0; j < A.length; j++) {
					const asFloat = Number(bigInv[i][j]) / Number(SCALE);
					const diff = Math.abs(asFloat - floatInv[i][j]);
					assert.ok(
						diff < 1e-12,
						`Float cross-check failed at [${i}][${j}]: ${asFloat} vs ${floatInv[i][j]}`,
					);
				}
			}
		});

		it('inverts an ill-conditioned scaled 5x5 Hilbert matrix exactly', () => {
			// Scaled Hilbert matrix: H_ij = lcm(1..9) / (i + j + 1) = 2520 / (i + j + 1)
			const L = 2520n;
			const n = 5;
			const H = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => L / BigInt(i + j + 1)),
			);
			const HInv = inverseBigIntRecursive(H);
			assert.deepEqual(HInv, referenceGaussJordanInverse(H));
			assertInverseIdentity(H, HInv);
		});

		it('handles a 12x12 matrix cleanly without stack overflow', () => {
			const n = 12;
			// Tridiagonal SPD matrix: 4 on diagonal, -1 on super/sub-diagonal
			const T = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					if (i === j) return 4n;
					if (Math.abs(i - j) === 1) return -1n;
					return 0n;
				}),
			);
			const TInv = inverseBigIntRecursive(T);
			assert.deepEqual(TInv, referenceGaussJordanInverse(T));
			assertInverseIdentity(T, TInv);
		});
	});
});
