import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { determinantBigIntStable } from './determinantBigIntStable.js';

/**
 * Independent reference determinant via recursive Laplace (cofactor) expansion.
 * Used as an independent mathematical cross-check on small matrices.
 *
 * @param {bigint[][]} m
 * @returns {bigint}
 */
function cofactorDeterminant(m) {
	const n = m.length;
	if (n === 0) return 1n;
	if (n === 1) return m[0][0];
	if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0];

	let total = 0n;
	for (let c = 0; c < n; c++) {
		const a = m[0][c];
		if (a === 0n) continue;
		const minor = [];
		for (let r = 1; r < n; r++) {
			const row = [];
			for (let j = 0; j < n; j++) {
				if (j !== c) row.push(m[r][j]);
			}
			minor.push(row);
		}
		const term = a * cofactorDeterminant(minor);
		total = c % 2 === 0 ? total + term : total - term;
	}
	return total;
}

/**
 * Multiply two square BigInt matrices.
 *
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function matMul(a, b) {
	const n = a.length;
	const out = Array.from({ length: n }, () => new Array(n).fill(0n));
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const aik = a[i][k];
			if (aik === 0n) continue;
			for (let j = 0; j < n; j++) {
				out[i][j] += aik * b[k][j];
			}
		}
	}
	return out;
}

/**
 * Transpose a square BigInt matrix.
 *
 * @param {bigint[][]} a
 * @returns {bigint[][]}
 */
function transpose(a) {
	const n = a.length;
	return Array.from({ length: n }, (_, i) =>
		Array.from({ length: n }, (_, j) => a[j][i])
	);
}

/**
 * Deterministic LCG PRNG for reproducible BigInt test matrices.
 *
 * @param {bigint} seed
 */
function makeRng(seed) {
	let state = seed;
	const mod = 1n << 64n;
	return () => {
		state = (state * 6364136223846793005n + 1442695040888963407n) % mod;
		return state;
	};
}

function gcdBigInt(a, b) {
	let x = a < 0n ? -a : a;
	let y = b < 0n ? -b : b;
	while (y !== 0n) {
		const t = x % y;
		x = y;
		y = t;
	}
	return x;
}

function lcmBigInt(a, b) {
	return (a / gcdBigInt(a, b)) * b;
}

function factorialBigInt(n) {
	let r = 1n;
	for (let i = 2n; i <= BigInt(n); i++) r *= i;
	return r;
}

describe('determinantBigIntStable', () => {
	describe('basic and normal cases', () => {
		it('computes 0x0 and 1x1 matrices', () => {
			assert.equal(determinantBigIntStable([]), 1n);
			assert.equal(determinantBigIntStable([[0n]]), 0n);
			assert.equal(determinantBigIntStable([[42n]]), 42n);
			assert.equal(determinantBigIntStable([[-123456789012345678901234567890n]]), -123456789012345678901234567890n);
		});

		it('computes 2x2 and 3x3 matrices accurately', () => {
			assert.equal(
				determinantBigIntStable([
					[3n, 8n],
					[4n, 6n],
				]),
				-14n
			);
			assert.equal(
				determinantBigIntStable([
					[6n, 1n, 1n],
					[4n, -2n, 5n],
					[2n, 8n, 7n],
				]),
				-306n
			);
			assert.equal(
				determinantBigIntStable([
					[2n, 3n, 1n],
					[4n, 6n, 5n],
					[1n, 2n, 3n],
				]),
				-3n
			);
		});

		it('computes identity, diagonal, and triangular matrices', () => {
			const id4 = [
				[1n, 0n, 0n, 0n],
				[0n, 1n, 0n, 0n],
				[0n, 0n, 1n, 0n],
				[0n, 0n, 0n, 1n],
			];
			assert.equal(determinantBigIntStable(id4), 1n);

			const upper = [
				[2n, 9n, -3n, 7n],
				[0n, -5n, 4n, 1n],
				[0n, 0n, 3n, -8n],
				[0n, 0n, 0n, 11n],
			];
			assert.equal(determinantBigIntStable(upper), 2n * -5n * 3n * 11n);

			const lower = transpose(upper);
			assert.equal(determinantBigIntStable(lower), -330n);
		});
	});

	describe('edge cases and pivoting behavior', () => {
		it('handles zero pivots and requires multiple row swaps', () => {
			// Anti-diagonal 4x4 matrix: 2 swaps -> even permutation (+1)
			const anti4 = [
				[0n, 0n, 0n, 2n],
				[0n, 0n, 3n, 0n],
				[0n, 5n, 0n, 0n],
				[7n, 0n, 0n, 0n],
			];
			assert.equal(determinantBigIntStable(anti4), 210n);

			// Anti-diagonal 3x3 matrix: 1 swap -> odd permutation (-1)
			const anti3 = [
				[0n, 0n, 2n],
				[0n, 3n, 0n],
				[5n, 0n, 0n],
			];
			assert.equal(determinantBigIntStable(anti3), -30n);

			// Matrix that triggers a zero pivot after first elimination step with prevPivot > 1
			const midZeroPivot = [
				[2n, 1n, 0n, 3n],
				[4n, 2n, 5n, 1n],
				[6n, 5n, 2n, 4n],
				[2n, 3n, 1n, 7n],
			];
			assert.equal(determinantBigIntStable(midZeroPivot), -160n);
			assert.equal(
				determinantBigIntStable(midZeroPivot),
				cofactorDeterminant(midZeroPivot)
			);
		});

		it('returns 0n for singular matrices', () => {
			// Zero row
			assert.equal(
				determinantBigIntStable([
					[1n, 2n, 3n],
					[0n, 0n, 0n],
					[4n, 5n, 6n],
				]),
				0n
			);
			// Zero column
			assert.equal(
				determinantBigIntStable([
					[1n, 0n, 3n],
					[4n, 0n, 6n],
					[7n, 0n, 9n],
				]),
				0n
			);
			// Linearly dependent rows (row3 = 2*row1 + 3*row2)
			assert.equal(
				determinantBigIntStable([
					[1n, 2n, 3n, 4n],
					[5n, -1n, 2n, 7n],
					[17n, 1n, 12n, 29n],
					[9n, 8n, -3n, 1n],
				]),
				0n
			);
			// All-zero matrix
			assert.equal(
				determinantBigIntStable([
					[0n, 0n],
					[0n, 0n],
				]),
				0n
			);
		});

		it('avoids catastrophic cancellation for huge BigInt entries', () => {
			// In IEEE-754 double, (10^30)*(10^30+2) - (10^30+1)^2 evaluates to 0.
			// Exact integer determinant is -1n.
			const base = 10n ** 30n;
			const illCond = [
				[base, base + 1n],
				[base + 1n, base + 2n],
			];
			assert.equal(determinantBigIntStable(illCond), -1n);

			// 3x3 catastrophic cancellation with 128-bit entries
			const big = 1n << 120n;
			const m3 = [
				[big, big + 1n, big + 2n],
				[big + 1n, big + 3n, big + 5n],
				[big + 2n, big + 5n, big + 9n],
			];
			assert.equal(determinantBigIntStable(m3), cofactorDeterminant(m3));
			assert.equal(determinantBigIntStable(m3), big - 1n);
		});

		it('does not mutate the input matrix or its rows', () => {
			const original = [
				[0n, 2n, 3n],
				[4n, 5n, 6n],
				[7n, 8n, 10n],
			];
			const snapshot = original.map((row) => [...row]);
			const det = determinantBigIntStable(original);
			assert.equal(det, -5n);
			assert.deepEqual(original, snapshot);
		});
	});

	describe('independent cross-checks and algebraic identities', () => {
		it('matches independent cofactor expansion on random matrices of sizes 1..6', () => {
			const next = makeRng(0x123456789abcdef0n);
			for (let n = 1; n <= 6; n++) {
				for (let trial = 0; trial < 5; trial++) {
					const m = Array.from({ length: n }, () =>
						Array.from({ length: n }, () => {
							const r = next() % 21n;
							// Include plenty of zeros and negative numbers to exercise pivoting
							return r === 0n ? 0n : r - 10n;
						})
					);
					const actual = determinantBigIntStable(m);
					const expected = cofactorDeterminant(m);
					assert.equal(actual, expected, `mismatch for n=${n}, trial=${trial}`);
				}
			}
		});

		it('matches closed-form Cauchy determinant for integer-scaled Hilbert matrices (n = 1..9)', () => {
			// H_n[i][j] = 1 / (i + j + 1)
			// det(H_n) = (c_n)^4 / c_{2n}, where c_m = prod_{k=1}^{m-1} k!
			// Scaling H_n by L = lcm(1..2n-1) yields integer matrix M = L * H_n
			// with exact determinant L^n * det(H_n).
			for (let n = 1; n <= 9; n++) {
				let L = 1n;
				for (let d = 2; d <= 2 * n - 1; d++) {
					L = lcmBigInt(L, BigInt(d));
				}

				const M = Array.from({ length: n }, (_, i) =>
					Array.from({ length: n }, (_, j) => L / BigInt(i + j + 1))
				);

				let cn = 1n;
				for (let k = 1; k < n; k++) cn *= factorialBigInt(k);
				let c2n = 1n;
				for (let k = 1; k < 2 * n; k++) c2n *= factorialBigInt(k);

				const expected = (L ** BigInt(n) * cn ** 4n) / c2n;
				assert.equal(
					determinantBigIntStable(M),
					expected,
					`Hilbert cross-check failed for n=${n}`
				);
			}
		});

		it('matches closed-form Vandermonde determinant with large BigInt nodes', () => {
			const nodes = [
				-(10n ** 18n),
				-7n,
				0n,
				13n,
				10n ** 18n + 5n,
				10n ** 18n + 9n,
			];
			const n = nodes.length;
			const V = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => nodes[i] ** BigInt(j))
			);

			let expected = 1n;
			for (let i = 0; i < n; i++) {
				for (let j = i + 1; j < n; j++) {
					expected *= nodes[j] - nodes[i];
				}
			}

			assert.equal(determinantBigIntStable(V), expected);
		});

		it('satisfies det(A*B) = det(A)*det(B), det(A^T) = det(A), and det(cA) = c^n det(A)', () => {
			const next = makeRng(0xfeedfacecafebeefn);
			const n = 8;
			const randMat = () =>
				Array.from({ length: n }, () =>
					Array.from({ length: n }, () => (next() % 101n) - 50n)
				);

			const A = randMat();
			const B = randMat();
			const detA = determinantBigIntStable(A);
			const detB = determinantBigIntStable(B);
			const detAB = determinantBigIntStable(matMul(A, B));

			assert.equal(detAB, detA * detB);
			assert.equal(determinantBigIntStable(transpose(A)), detA);

			const c = -17n;
			const cA = A.map((row) => row.map((v) => c * v));
			assert.equal(determinantBigIntStable(cA), c ** BigInt(n) * detA);

			// Swapping two distinct rows negates the determinant
			const swapped = A.map((row) => [...row]);
			[swapped[1], swapped[6]] = [swapped[6], swapped[1]];
			assert.equal(determinantBigIntStable(swapped), -detA);
		});

		it('computes exact determinant of a 12x12 constructed LU product with known determinant', () => {
			const next = makeRng(0xabcdef1234567890n);
			const n = 12;
			const diag = [
				2n, -3n, 5n, -7n, 11n, -13n, 17n, -19n, 23n, -29n, 31n, -37n,
			];
			const L = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					if (j > i) return 0n;
					if (j === i) return 1n;
					return (next() % 7n) - 3n;
				})
			);
			const U = Array.from({ length: n }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					if (j < i) return 0n;
					if (j === i) return diag[i];
					return (next() % 7n) - 3n;
				})
			);

			const expected = diag.reduce((acc, v) => acc * v, 1n);
			const product = matMul(L, U);
			assert.equal(determinantBigIntStable(product), expected);
		});
	});

	describe('input validation', () => {
		it('throws TypeError for non-array matrix inputs', () => {
			for (const bad of [null, undefined, 0, 1n, '[[1]]', {}, () => []]) {
				assert.throws(() => determinantBigIntStable(bad), TypeError);
			}
		});

		it('throws TypeError when any row is not an array', () => {
			assert.throws(() => determinantBigIntStable([1n]), TypeError);
			assert.throws(() => determinantBigIntStable([[1n, 2n], null]), TypeError);
			assert.throws(() => determinantBigIntStable([[1n, 2n], 'bad']), TypeError);

			// Sparse matrix with empty slot
			const sparse = new Array(2);
			sparse[0] = [1n, 2n];
			assert.throws(() => determinantBigIntStable(sparse), TypeError);
		});

		it('throws RangeError for non-square matrices', () => {
			assert.throws(() => determinantBigIntStable([[]]), RangeError);
			assert.throws(() => determinantBigIntStable([[1n, 2n]]), RangeError);
			assert.throws(() => determinantBigIntStable([[1n], [2n]]), RangeError);
			assert.throws(
				() =>
					determinantBigIntStable([
						[1n, 2n],
						[3n],
					]),
				RangeError
			);
		});

		it('throws TypeError for non-BigInt entries even in singular matrices', () => {
			assert.throws(() => determinantBigIntStable([[1]]), TypeError);
			assert.throws(() => determinantBigIntStable([[1n, 2], [3n, 4n]]), TypeError);
			assert.throws(() => determinantBigIntStable([[1n, '2'], [3n, 4n]]), TypeError);
			assert.throws(() => determinantBigIntStable([[1n, null], [3n, 4n]]), TypeError);
			assert.throws(() => determinantBigIntStable([[1n, undefined], [3n, 4n]]), TypeError);
			assert.throws(() => determinantBigIntStable([[1n, true], [3n, 4n]]), TypeError);

			// Singular first column must still validate entries in later columns/rows
			assert.throws(
				() =>
					determinantBigIntStable([
						[0n, 0n],
						[0n, Number.NaN],
					]),
				TypeError
			);

			// Sparse row with hole
			const sparseRow = new Array(2);
			sparseRow[0] = 1n;
			assert.throws(
				() => determinantBigIntStable([sparseRow, [2n, 3n]]),
				TypeError
			);
		});
	});
});
