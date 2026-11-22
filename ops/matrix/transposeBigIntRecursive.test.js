import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeBigIntRecursive, SCALE } from './transposeBigIntRecursive.js';

/**
 * Independent naive iterative reference transpose for cross-checking.
 * @param {bigint[][]} m
 * @returns {bigint[][]}
 */
function naiveTranspose(m) {
	if (m.length === 0) return [];
	const rows = m.length;
	const cols = m[0].length;
	const out = [];
	for (let c = 0; c < cols; c++) {
		const row = [];
		for (let r = 0; r < rows; r++) {
			row.push(m[r][c]);
		}
		out.push(row);
	}
	return out;
}

/**
 * Independent BigInt matrix multiplication for algebraic identity checks.
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function naiveMatMul(a, b) {
	const rows = a.length;
	const inner = b.length;
	const cols = b[0].length;
	const out = Array.from({ length: rows }, () => new Array(cols).fill(0n));
	for (let i = 0; i < rows; i++) {
		for (let k = 0; k < inner; k++) {
			for (let j = 0; j < cols; j++) {
				out[i][j] += a[i][k] * b[k][j];
			}
		}
	}
	return out;
}

/**
 * Independent BigInt matrix addition.
 * @param {bigint[][]} a
 * @param {bigint[][]} b
 * @returns {bigint[][]}
 */
function naiveMatAdd(a, b) {
	return a.map((row, i) => row.map((v, j) => v + b[i][j]));
}

describe('transposeBigIntRecursive', () => {
	it('exports SCALE equal to 10^18', () => {
		assert.equal(SCALE, 10n ** 18n);
	});

	it('transposes square and rectangular matrices with positive, negative, and zero values', () => {
		const sq = [
			[1n, -2n, 0n],
			[4n, 5n, -6n],
			[-7n, 8n, 9n],
		];
		assert.deepEqual(transposeBigIntRecursive(sq), [
			[1n, 4n, -7n],
			[-2n, 5n, 8n],
			[0n, -6n, 9n],
		]);

		const rect2x3 = [
			[1n, 2n, 3n],
			[4n, 5n, 6n],
		];
		assert.deepEqual(transposeBigIntRecursive(rect2x3), [
			[1n, 4n],
			[2n, 5n],
			[3n, 6n],
		]);

		const rect3x2 = [
			[-10n, 20n],
			[30n, -40n],
			[0n, 50n],
		];
		assert.deepEqual(transposeBigIntRecursive(rect3x2), [
			[-10n, 30n, 0n],
			[20n, -40n, 50n],
		]);
	});

	it('preserves arbitrary-precision and 10^18 fixed-point BigInt values exactly', () => {
		const hugePos = (1n << 256n) + 12345678901234567890123456789n;
		const hugeNeg = -(1n << 200n) - 9876543210987654321n;
		const piScaled = 3141592653589793238n; // ~pi * 10^18
		const halfScaled = SCALE / 2n;

		const m = [
			[hugePos, piScaled],
			[hugeNeg, halfScaled],
			[0n, -SCALE],
		];
		assert.deepEqual(transposeBigIntRecursive(m), [
			[hugePos, hugeNeg, 0n],
			[piScaled, halfScaled, -SCALE],
		]);
	});

	it('does not mutate the input matrix and returns an independent copy', () => {
		const original = [
			[1n, 2n],
			[3n, 4n],
		];
		const snapshot = original.map((r) => [...r]);
		const transposed = transposeBigIntRecursive(original);

		assert.deepEqual(original, snapshot);
		transposed[0][1] = 999n;
		assert.equal(original[1][0], 3n);
	});

	it('handles edge cases: empty matrix, 1x1, row vector, and column vector', () => {
		assert.deepEqual(transposeBigIntRecursive([]), []);
		assert.deepEqual(transposeBigIntRecursive([[42n]]), [[42n]]);
		assert.deepEqual(transposeBigIntRecursive([[0n]]), [[0n]]);

		const rowVec = [[1n, 2n, 3n, 4n, 5n]];
		assert.deepEqual(transposeBigIntRecursive(rowVec), [[1n], [2n], [3n], [4n], [5n]]);

		const colVec = [[10n], [20n], [30n], [40n]];
		assert.deepEqual(transposeBigIntRecursive(colVec), [[10n, 20n, 30n, 40n]]);
	});

	it('handles large vectors and matrices without stack overflow', () => {
		const len = 20000;
		const longRow = [Array.from({ length: len }, (_, i) => BigInt(i) - 10000n)];
		const colResult = transposeBigIntRecursive(longRow);
		assert.equal(colResult.length, len);
		assert.equal(colResult[0].length, 1);
		assert.equal(colResult[0][0], -10000n);
		assert.equal(colResult[10000][0], 0n);
		assert.equal(colResult[len - 1][0], 9999n);

		const backToRow = transposeBigIntRecursive(colResult);
		assert.deepEqual(backToRow, longRow);
	});

	it('cross-checks against naive iterative reference across varied and prime dimensions', () => {
		const shapes = [
			[1, 1],
			[1, 7],
			[7, 1],
			[2, 2],
			[3, 5],
			[5, 3],
			[8, 8],
			[13, 17],
			[19, 11],
			[64, 37],
			[97, 103],
		];

		let seed = 0x123456789abcdef1n;
		const nextBig = () => {
			seed = (seed * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n);
			return seed - (1n << 63n);
		};

		for (const [rows, cols] of shapes) {
			const m = Array.from({ length: rows }, () =>
				Array.from({ length: cols }, () => nextBig()),
			);
			const actual = transposeBigIntRecursive(m);
			const expected = naiveTranspose(m);
			assert.deepEqual(actual, expected, `mismatch for shape ${rows}x${cols}`);
		}
	});

	it('satisfies algebraic transpose identities: involution, linearity, product reversal, trace, symmetry', () => {
		const A = [
			[1n, -2n, 3n, 4n],
			[5n, 0n, -6n, 7n],
			[-8n, 9n, 10n, -11n],
		];
		const B = [
			[2n, 4n, -1n, 0n],
			[-3n, 5n, 2n, -8n],
			[7n, -6n, 3n, 1n],
		];
		const C = [
			[3n, -1n],
			[2n, 4n],
			[-5n, 6n],
			[1n, -2n],
		];

		// Involution: (A^T)^T === A
		assert.deepEqual(transposeBigIntRecursive(transposeBigIntRecursive(A)), A);

		// Linearity: (A + B)^T === A^T + B^T
		const lhsAdd = transposeBigIntRecursive(naiveMatAdd(A, B));
		const rhsAdd = naiveMatAdd(transposeBigIntRecursive(A), transposeBigIntRecursive(B));
		assert.deepEqual(lhsAdd, rhsAdd);

		// Scalar multiplication: (k * A)^T === k * A^T
		const k = -7n * SCALE;
		const scaledA = A.map((r) => r.map((v) => k * v));
		const lhsScale = transposeBigIntRecursive(scaledA);
		const rhsScale = transposeBigIntRecursive(A).map((r) => r.map((v) => k * v));
		assert.deepEqual(lhsScale, rhsScale);

		// Product reversal: (A * C)^T === C^T * A^T
		const lhsMul = transposeBigIntRecursive(naiveMatMul(A, C));
		const rhsMul = naiveMatMul(transposeBigIntRecursive(C), transposeBigIntRecursive(A));
		assert.deepEqual(lhsMul, rhsMul);

		// Trace invariance & symmetric matrix fixed point
		const S = [
			[10n, -20n, 30n],
			[-20n, 40n, -50n],
			[30n, -50n, 60n],
		];
		const ST = transposeBigIntRecursive(S);
		assert.deepEqual(ST, S);
		const traceS = S.reduce((acc, row, i) => acc + row[i], 0n);
		const traceST = ST.reduce((acc, row, i) => acc + row[i], 0n);
		assert.equal(traceST, traceS);
	});

	it('throws TypeError for invalid input types, non-array rows, sparse holes, or non-BigInt entries', () => {
		for (const bad of [null, undefined, 42, 42n, 'matrix', {}, true]) {
			assert.throws(() => transposeBigIntRecursive(bad), TypeError);
		}

		assert.throws(() => transposeBigIntRecursive([1n, 2n]), TypeError);
		assert.throws(() => transposeBigIntRecursive([[1n], 'not-a-row']), TypeError);
		assert.throws(() => transposeBigIntRecursive([[1n], null]), TypeError);

		// Non-BigInt elements
		assert.throws(() => transposeBigIntRecursive([[1, 2n]]), TypeError);
		assert.throws(() => transposeBigIntRecursive([[1n, '2']]), TypeError);
		assert.throws(() => transposeBigIntRecursive([[1n, null]]), TypeError);
		assert.throws(() => transposeBigIntRecursive([[1n, undefined]]), TypeError);
		assert.throws(() => transposeBigIntRecursive([[NaN]]), TypeError);
		assert.throws(() => transposeBigIntRecursive([[true]]), TypeError);

		// Sparse arrays
		const sparseOuter = new Array(2);
		sparseOuter[0] = [1n];
		assert.throws(() => transposeBigIntRecursive(sparseOuter), TypeError);

		const sparseInner = new Array(2);
		sparseInner[0] = 1n;
		assert.throws(() => transposeBigIntRecursive([sparseInner]), TypeError);
	});

	it('throws RangeError for empty rows or ragged matrices', () => {
		assert.throws(() => transposeBigIntRecursive([[]]), RangeError);
		assert.throws(() => transposeBigIntRecursive([[], []]), RangeError);
		assert.throws(() => transposeBigIntRecursive([[1n, 2n], [3n]]), RangeError);
		assert.throws(() => transposeBigIntRecursive([[1n], [2n, 3n]]), RangeError);
		assert.throws(
			() => transposeBigIntRecursive([[1n, 2n], [3n, 4n], [5n, 6n, 7n]]),
			RangeError,
		);
	});
});
