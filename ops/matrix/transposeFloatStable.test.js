import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeFloatStable } from './transposeFloatStable.js';

/**
 * Returns the exact 64-bit IEEE-754 bit pattern of a number as a BigInt.
 *
 * @param {number} value
 * @returns {bigint}
 */
function float64Bits(value) {
	const buf = new ArrayBuffer(8);
	const f64 = new Float64Array(buf);
	const view = new DataView(buf);
	f64[0] = value;
	return view.getBigUint64(0, false);
}

/**
 * Computes an overflow/underflow-safe Frobenius norm using scaling and Neumaier compensated summation.
 *
 * @param {readonly (readonly number[])[]} matrix
 * @returns {number}
 */
function scaledFrobeniusNorm(matrix) {
	let maxAbs = 0;
	for (const row of matrix) {
		for (const val of row) {
			const a = Math.abs(val);
			if (a > maxAbs) maxAbs = a;
		}
	}
	if (maxAbs === 0) return 0;

	// Scale entries by maxAbs and sum squares in sorted magnitude order with Neumaier compensation
	// so the reference computation is order-independent up to rounding.
	const scaledSquares = [];
	for (const row of matrix) {
		for (const val of row) {
			const s = val / maxAbs;
			scaledSquares.push(s * s);
		}
	}
	scaledSquares.sort((a, b) => a - b);

	let sum = 0;
	let comp = 0;
	for (const sq of scaledSquares) {
		const t = sum + sq;
		if (Math.abs(sum) >= Math.abs(sq)) {
			comp += (sum - t) + sq;
		} else {
			comp += (sq - t) + sum;
		}
		sum = t;
	}

	return maxAbs * Math.sqrt(sum + comp);
}

/**
 * Deterministic PRNG (xorshift32) for reproducible test matrices.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0;
	return () => {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;
		return (state >>> 0) / 0x100000000;
	};
}

describe('transposeFloatStable', () => {
	it('transposes square matrices', () => {
		assert.deepEqual(
			transposeFloatStable([
				[1, 2],
				[3, 4],
			]),
			[
				[1, 3],
				[2, 4],
			],
		);

		assert.deepEqual(
			transposeFloatStable([
				[1, 2, 3],
				[4, 5, 6],
				[7, 8, 9],
			]),
			[
				[1, 4, 7],
				[2, 5, 8],
				[3, 6, 9],
			],
		);
	});

	it('transposes rectangular matrices (2x3 -> 3x2 and 3x2 -> 2x3)', () => {
		const m2x3 = [
			[1.5, -2.25, 3.75],
			[4.125, 5.5, -6.875],
		];
		const m3x2 = transposeFloatStable(m2x3);
		assert.deepEqual(m3x2, [
			[1.5, 4.125],
			[-2.25, 5.5],
			[3.75, -6.875],
		]);
		assert.deepEqual(transposeFloatStable(m3x2), m2x3);
	});

	it('transposes 1xN, Nx1, and 1x1 matrices', () => {
		assert.deepEqual(transposeFloatStable([[42.5]]), [[42.5]]);

		assert.deepEqual(transposeFloatStable([[1, 2, 3, 4, 5]]), [
			[1],
			[2],
			[3],
			[4],
			[5],
		]);

		assert.deepEqual(
			transposeFloatStable([[10], [20], [30], [40]]),
			[[10, 20, 30, 40]],
		);
	});

	it('preserves exact IEEE-754 float64 bit patterns (-0, subnormals, MIN_VALUE, MAX_VALUE)', () => {
		const largestSubnormal = 2.225073858507201e-308;
		const smallestNormal = 2.2250738585072014e-308;
		const special = [
			[-0, +0, Number.MIN_VALUE, -Number.MIN_VALUE],
			[largestSubnormal, -largestSubnormal, smallestNormal, Number.EPSILON],
			[Number.MAX_VALUE, -Number.MAX_VALUE, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER],
		];

		const transposed = transposeFloatStable(special);
		assert.equal(transposed.length, 4);
		assert.equal(transposed[0].length, 3);

		// Explicitly check -0 vs +0 with Object.is
		assert.equal(Object.is(transposed[0][0], -0), true);
		assert.equal(Object.is(transposed[0][0], +0), false);
		assert.equal(Object.is(transposed[1][0], +0), true);
		assert.equal(Object.is(transposed[1][0], -0), false);

		// Verify every single element's 64-bit IEEE-754 representation matches exactly
		for (let r = 0; r < special.length; r++) {
			for (let c = 0; c < special[0].length; c++) {
				assert.equal(
					Object.is(transposed[c][r], special[r][c]),
					true,
					`Object.is mismatch at (${r}, ${c})`,
				);
				assert.equal(
					float64Bits(transposed[c][r]),
					float64Bits(special[r][c]),
					`IEEE-754 bit pattern mismatch at (${r}, ${c})`,
				);
			}
		}
	});

	it('handles large matrices spanning multiple cache blocks (70x90 and boundary sizes)', () => {
		const shapes = [
			[70, 90],
			[32, 32],
			[64, 64],
			[65, 33],
			[31, 67],
		];

		for (const [rows, cols] of shapes) {
			const input = Array.from({ length: rows }, (_, r) =>
				Array.from({ length: cols }, (_, c) => {
					if ((r + c) % 19 === 0) return -0;
					if ((r * cols + c) % 23 === 0) return Number.MIN_VALUE * ((r % 7) + 1);
					return (r + 1) * 1e-6 - (c + 1) * Math.PI;
				}),
			);

			const out = transposeFloatStable(input);
			assert.equal(out.length, cols);
			for (let c = 0; c < cols; c++) {
				assert.equal(out[c].length, rows);
				for (let r = 0; r < rows; r++) {
					assert.equal(Object.is(out[c][r], input[r][c]), true);
				}
			}
		}
	});

	it('does not alias input rows and preserves immutability', () => {
		const input = [
			[1, 2, 3],
			[4, 5, 6],
		];
		const out = transposeFloatStable(input);

		for (const outRow of out) {
			for (const inRow of input) {
				assert.notEqual(outRow, inRow);
			}
		}

		// Mutate input after transposition
		input[0][0] = 999;
		input[1][2] = -888;
		input[0].push(777);
		input.push([10, 11, 12, 13]);

		assert.deepEqual(out, [
			[1, 4],
			[2, 5],
			[3, 6],
		]);

		// Mutate output and verify a fresh transposition of a clean copy is unaffected
		const clean = [
			[7, 8],
			[9, 10],
		];
		const out2 = transposeFloatStable(clean);
		out2[0][1] = -12345;
		assert.deepEqual(clean, [
			[7, 8],
			[9, 10],
		]);
	});

	it('rejects invalid, empty, ragged, sparse, non-number, and non-finite inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			42,
			'matrix',
			{},
			new Float64Array([1, 2, 3]),
			[],
			[[]],
			[[], []],
			[1, 2, 3],
			[[1, 2], null],
			[[1, 2], '12'],
			[[1, 2], [3]],
			[[1], [2, 3]],
			[[1, 2], [3, 4], [5]],
			new Array(2),
			[new Array(2)],
			[[1, , 3]], // eslint-disable-line no-sparse-arrays
			[['1', 2]],
			[[true, false]],
			[[null]],
			[[undefined]],
			[[1n]],
			[[{}]],
			[[NaN]],
			[[1, NaN]],
			[[Infinity]],
			[[-Infinity]],
			[
				[1, 2],
				[3, Infinity],
			],
			[
				[1, 2],
				[-Infinity, 4],
			],
		];

		for (const bad of invalidInputs) {
			assert.throws(() => transposeFloatStable(bad));
		}
	});

	it('cross-checks bit-exact involution (A^T)^T === A via Float64Array/DataView and Frobenius norm invariance', () => {
		const rng = makeRng(0x5eed1234);
		const rows = 73;
		const cols = 89;

		const matrix = Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => {
				const k = (r * cols + c) % 11;
				if (k === 0) return -0;
				if (k === 1) return +0;
				if (k === 2) return Number.MIN_VALUE;
				if (k === 3) return -Number.MIN_VALUE * 3;
				if (k === 4) return 1e200 * (rng() - 0.5);
				if (k === 5) return 1e-200 * (rng() - 0.5);
				return (rng() - 0.5) * 1e6;
			}),
		);

		const transposed = transposeFloatStable(matrix);
		const doubleTransposed = transposeFloatStable(transposed);

		// 1. Bit-for-bit involution via Float64Array / DataView
		assert.equal(doubleTransposed.length, rows);
		const bufA = new ArrayBuffer(8 * rows * cols);
		const bufB = new ArrayBuffer(8 * rows * cols);
		const f64A = new Float64Array(bufA);
		const f64B = new Float64Array(bufB);
		const viewA = new DataView(bufA);
		const viewB = new DataView(bufB);

		let idx = 0;
		for (let r = 0; r < rows; r++) {
			assert.equal(doubleTransposed[r].length, cols);
			for (let c = 0; c < cols; c++) {
				f64A[idx] = matrix[r][c];
				f64B[idx] = doubleTransposed[r][c];
				idx++;
			}
		}

		for (let i = 0; i < rows * cols; i++) {
			assert.equal(
				viewB.getBigUint64(i * 8, false),
				viewA.getBigUint64(i * 8, false),
				`Involution bit mismatch at flat index ${i}`,
			);
		}

		// 2. Frobenius norm invariance: ||A^T||_F === ||A||_F
		const normOriginal = scaledFrobeniusNorm(matrix);
		const normTransposed = scaledFrobeniusNorm(transposed);
		assert.equal(Number.isFinite(normOriginal), true);
		assert.equal(normOriginal > 0, true);
		assert.equal(float64Bits(normTransposed), float64Bits(normOriginal));
	});
});
