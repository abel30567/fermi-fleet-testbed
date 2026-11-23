import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeBigIntStable } from './transposeBigIntStable.js';

const SCALE = 10n ** 18n;

/**
 * Independent naive reference transpose (column-first construction).
 *
 * @param {readonly (readonly bigint[])[]} matrix
 * @returns {bigint[][]}
 */
function naiveTranspose(matrix) {
	if (matrix.length === 0 || matrix[0].length === 0) {
		return [];
	}
	const rows = matrix.length;
	const cols = matrix[0].length;
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => matrix[i][j]),
	);
}

/**
 * Independent exact BigInt matrix multiplication for algebraic cross-checks.
 *
 * @param {readonly (readonly bigint[])[]} a
 * @param {readonly (readonly bigint[])[]} b
 * @returns {bigint[][]}
 */
function exactMatMul(a, b) {
	const m = a.length;
	const k = a[0].length;
	const n = b[0].length;
	const out = Array.from({ length: m }, () => new Array(n).fill(0n));
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0n;
			for (let p = 0; p < k; p++) {
				sum += a[i][p] * b[p][j];
			}
			out[i][j] = sum;
		}
	}
	return out;
}

/**
 * Deterministic LCG generator producing large signed BigInts.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {bigint} seed
 * @returns {bigint[][]}
 */
function makeDeterministicMatrix(rows, cols, seed) {
	let state = seed;
	const mod = 1n << 128n;
	const mul = 6364136223846793005n;
	const inc = 1442695040888963407n;
	const half = 1n << 127n;
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => {
			state = (state * mul + inc) % mod;
			return state - half;
		}),
	);
}

describe('transposeBigIntStable', () => {
	describe('normal cases', () => {
		it('transposes a 2x3 rectangular matrix into a 3x2 matrix', () => {
			const input = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
			];
			const expected = [
				[1n, 4n],
				[2n, 5n],
				[3n, 6n],
			];
			assert.deepStrictEqual(transposeBigIntStable(input), expected);
		});

		it('transposes a 3x2 rectangular matrix into a 2x3 matrix', () => {
			const input = [
				[-10n, 20n],
				[0n, -5n],
				[99n, 1n],
			];
			const expected = [
				[-10n, 0n, 99n],
				[20n, -5n, 1n],
			];
			assert.deepStrictEqual(transposeBigIntStable(input), expected);
		});

		it('transposes a 3x3 square matrix', () => {
			const input = [
				[1n, 2n, 3n],
				[4n, 5n, 6n],
				[7n, 8n, 9n],
			];
			const expected = [
				[1n, 4n, 7n],
				[2n, 5n, 8n],
				[3n, 6n, 9n],
			];
			assert.deepStrictEqual(transposeBigIntStable(input), expected);
		});

		it('preserves 10^18 fixed-point scaled BigInts and huge arbitrary-precision values exactly', () => {
			const hugePos = 10n ** 100n + 1234567890123456789n;
			const hugeNeg = -(2n ** 256n) + 1n;
			const piScaled = 3n * SCALE + 141_592_653_589_793_238n;
			const negHalfScaled = -(SCALE / 2n);
			const input = [
				[piScaled, hugePos],
				[negHalfScaled, hugeNeg],
				[0n, SCALE],
			];
			const result = transposeBigIntStable(input);
			assert.deepStrictEqual(result, [
				[piScaled, negHalfScaled, 0n],
				[hugePos, hugeNeg, SCALE],
			]);
			assert.strictEqual(result[0][0], piScaled);
			assert.strictEqual(result[1][0], hugePos);
			assert.strictEqual(result[1][1], hugeNeg);
		});
	});

	describe('edge cases', () => {
		it('handles an empty 0x0 matrix', () => {
			assert.deepStrictEqual(transposeBigIntStable([]), []);
		});

		it('handles an m x 0 matrix of empty rows', () => {
			assert.deepStrictEqual(transposeBigIntStable([[], [], []]), []);
		});

		it('handles a 1x1 matrix without sharing references', () => {
			const input = [[42n]];
			const result = transposeBigIntStable(input);
			assert.deepStrictEqual(result, [[42n]]);
			assert.notStrictEqual(result, input);
			assert.notStrictEqual(result[0], input[0]);
		});

		it('transposes row vector (1xn) and column vector (mx1)', () => {
			const rowVec = [[1n, -2n, 3n, -4n]];
			const colVec = [[1n], [-2n], [3n], [-4n]];
			assert.deepStrictEqual(transposeBigIntStable(rowVec), colVec);
			assert.deepStrictEqual(transposeBigIntStable(colVec), rowVec);
		});

		it('does not mutate input and isolates output from later mutations', () => {
			const input = [
				[1n, 2n],
				[3n, 4n],
			];
			const snapshot = input.map((r) => [...r]);
			const out = transposeBigIntStable(input);
			assert.deepStrictEqual(input, snapshot);
			out[0][1] = 999n;
			assert.deepStrictEqual(input, snapshot);
		});

		it('handles large matrices spanning multiple cache tiles (non-multiples of tile size)', () => {
			const input = makeDeterministicMatrix(73, 59, 12345n);
			const result = transposeBigIntStable(input);
			assert.strictEqual(result.length, 59);
			assert.strictEqual(result[0].length, 73);
			assert.deepStrictEqual(result, naiveTranspose(input));
		});
	});

	describe('input validation', () => {
		it('throws TypeError when matrix is not an Array', () => {
			for (const bad of [null, undefined, 0, 1n, 'matrix', {}, new BigInt64Array([1n])]) {
				assert.throws(() => transposeBigIntStable(bad), TypeError);
			}
		});

		it('throws TypeError when outer matrix has sparse holes', () => {
			const sparse = new Array(2);
			sparse[0] = [1n];
			assert.throws(() => transposeBigIntStable(sparse), TypeError);
		});

		it('throws TypeError when any row is not an Array', () => {
			assert.throws(() => transposeBigIntStable([1n, 2n]), TypeError);
			assert.throws(() => transposeBigIntStable([[1n], null]), TypeError);
			assert.throws(() => transposeBigIntStable([[1n], '1']), TypeError);
			assert.throws(() => transposeBigIntStable([[1n], { 0: 2n, length: 1 }]), TypeError);
		});

		it('throws RangeError on ragged matrices', () => {
			assert.throws(
				() =>
					transposeBigIntStable([
						[1n, 2n],
						[3n],
					]),
				RangeError,
			);
			assert.throws(() => transposeBigIntStable([[], [1n]]), RangeError);
			assert.throws(() => transposeBigIntStable([[1n], []]), RangeError);
		});

		it('throws TypeError when a row has sparse holes', () => {
			const row = new Array(2);
			row[0] = 1n;
			assert.throws(() => transposeBigIntStable([row]), TypeError);
		});

		it('throws TypeError when any element is not a bigint', () => {
			const badValues = [1, 0, NaN, Infinity, '1', true, null, undefined, {}, Symbol('x')];
			for (const bad of badValues) {
				assert.throws(
					() =>
						transposeBigIntStable([
							[1n, 2n],
							[3n, bad],
						]),
					TypeError,
				);
			}
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies involution (A^T)^T === A across varied shapes', () => {
			const shapes = [
				[1, 1],
				[1, 35],
				[35, 1],
				[32, 32],
				[33, 31],
				[65, 40],
			];
			for (const [r, c] of shapes) {
				const a = makeDeterministicMatrix(r, c, BigInt(r * 1000 + c));
				const at = transposeBigIntStable(a);
				const att = transposeBigIntStable(at);
				assert.deepStrictEqual(att, a);
			}
		});

		it('satisfies linearity (A + B)^T === A^T + B^T and (cA)^T === cA^T', () => {
			const a = makeDeterministicMatrix(19, 37, 7n);
			const b = makeDeterministicMatrix(19, 37, 13n);
			const scalar = -3n * SCALE + 17n;

			const sum = a.map((row, i) => row.map((v, j) => v + b[i][j]));
			const at = transposeBigIntStable(a);
			const bt = transposeBigIntStable(b);
			const atPlusBt = at.map((row, i) => row.map((v, j) => v + bt[i][j]));
			assert.deepStrictEqual(transposeBigIntStable(sum), atPlusBt);

			const scaled = a.map((row) => row.map((v) => v * scalar));
			const scaledAt = at.map((row) => row.map((v) => v * scalar));
			assert.deepStrictEqual(transposeBigIntStable(scaled), scaledAt);
		});

		it('satisfies reversal law (A * B)^T === B^T * A^T with exact BigInt matmul', () => {
			const a = makeDeterministicMatrix(11, 17, 101n);
			const b = makeDeterministicMatrix(17, 13, 202n);

			const abT = transposeBigIntStable(exactMatMul(a, b));
			const btAt = exactMatMul(transposeBigIntStable(b), transposeBigIntStable(a));
			assert.deepStrictEqual(abT, btAt);
		});

		it('preserves exact element sum and Frobenius norm squared and matches naive reference', () => {
			const a = makeDeterministicMatrix(41, 37, 999n);
			const at = transposeBigIntStable(a);

			assert.deepStrictEqual(at, naiveTranspose(a));

			let sumA = 0n;
			let frobA = 0n;
			for (const row of a) {
				for (const v of row) {
					sumA += v;
					frobA += v * v;
				}
			}

			let sumAt = 0n;
			let frobAt = 0n;
			for (const row of at) {
				for (const v of row) {
					sumAt += v;
					frobAt += v * v;
				}
			}

			assert.strictEqual(sumAt, sumA);
			assert.strictEqual(frobAt, frobA);
		});
	});
});
