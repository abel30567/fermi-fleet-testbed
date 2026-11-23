import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { transposeIntervalStable } from './transposeIntervalStable.js';

// --- Independent IEEE-754 outward-rounding helpers for cross-check tests ---

const f64Buf = new ArrayBuffer(8);
const f64View = new Float64Array(f64Buf);
const u64View = new BigUint64Array(f64Buf);

function nextUp(x) {
	if (x === 0) return Number.MIN_VALUE;
	f64View[0] = x;
	const bits = u64View[0];
	u64View[0] = x > 0 ? bits + 1n : bits - 1n;
	return f64View[0];
}

function nextDown(x) {
	if (x === 0) return -Number.MIN_VALUE;
	f64View[0] = x;
	const bits = u64View[0];
	u64View[0] = x > 0 ? bits - 1n : bits + 1n;
	return f64View[0];
}

function twoSum(a, b) {
	const s = a + b;
	const bb = s - a;
	const e = (a - (s - bb)) + (b - bb);
	return [s, e];
}

function intervalAddOutward([aLo, aHi], [bLo, bHi]) {
	const [sLo, eLo] = twoSum(aLo, bLo);
	const [sHi, eHi] = twoSum(aHi, bHi);
	const lo = eLo < 0 ? nextDown(sLo) : sLo;
	const hi = eHi > 0 ? nextUp(sHi) : sHi;
	return [lo === 0 ? 0 : lo, hi === 0 ? 0 : hi];
}

function intervalScaleOutward([lo, hi], scalar) {
	if (scalar === 0) return [0, 0];
	const p1 = lo * scalar;
	const p2 = hi * scalar;
	const rawLo = Math.min(p1, p2);
	const rawHi = Math.max(p1, p2);
	// Conservative 1-ULP outward padding guarantees enclosure for arbitrary binary64 products.
	return [nextDown(rawLo), nextUp(rawHi)];
}

function intervalTrace(matrix) {
	let acc = [0, 0];
	for (let i = 0; i < matrix.length; i++) {
		acc = intervalAddOutward(acc, matrix[i][i]);
	}
	return acc;
}

function intervalBilinearForm(x, A, y) {
	let acc = [0, 0];
	for (let i = 0; i < A.length; i++) {
		for (let j = 0; j < A[0].length; j++) {
			const scaled = intervalScaleOutward(intervalScaleOutward(A[i][j], x[i]), y[j]);
			acc = intervalAddOutward(acc, scaled);
		}
	}
	return acc;
}

function pointBilinearForm(x, M, y) {
	let sum = 0;
	for (let i = 0; i < M.length; i++) {
		for (let j = 0; j < M[0].length; j++) {
			sum += x[i] * M[i][j] * y[j];
		}
	}
	return sum;
}

describe('transposeIntervalStable', () => {
	describe('normal cases', () => {
		it('transposes a square 2x2 interval matrix', () => {
			const A = [
				[[-1.5, -1.0], [2.0, 2.5]],
				[[0.25, 0.75], [3.0, 3.0]],
			];
			const expected = [
				[[-1.5, -1.0], [0.25, 0.75]],
				[[2.0, 2.5], [3.0, 3.0]],
			];
			assert.deepStrictEqual(transposeIntervalStable(A), expected);
		});

		it('transposes a square 3x3 interval matrix', () => {
			const A = [
				[[1, 2], [3, 4], [5, 6]],
				[[7, 8], [9, 10], [11, 12]],
				[[13, 14], [15, 16], [17, 18]],
			];
			const expected = [
				[[1, 2], [7, 8], [13, 14]],
				[[3, 4], [9, 10], [15, 16]],
				[[5, 6], [11, 12], [17, 18]],
			];
			assert.deepStrictEqual(transposeIntervalStable(A), expected);
		});

		it('transposes rectangular 2x3 and 3x2 interval matrices', () => {
			const A = [
				[[-10, -5], [0, 1], [2.5, 3.5]],
				[[4, 4], [-0.1, 0.1], [100, 200]],
			];
			const AT = transposeIntervalStable(A);
			assert.strictEqual(AT.length, 3);
			assert.strictEqual(AT[0].length, 2);
			assert.deepStrictEqual(AT, [
				[[-10, -5], [4, 4]],
				[[0, 1], [-0.1, 0.1]],
				[[2.5, 3.5], [100, 200]],
			]);
		});

		it('transposes 1xN row matrix to Nx1 column matrix', () => {
			const row = [[[-3, -2], [0, 0], [1.25, 1.75], [9, 10]]];
			const col = transposeIntervalStable(row);
			assert.deepStrictEqual(col, [
				[[-3, -2]],
				[[0, 0]],
				[[1.25, 1.75]],
				[[9, 10]],
			]);
		});

		it('transposes Nx1 column matrix to 1xN row matrix', () => {
			const col = [
				[[-3, -2]],
				[[0, 0]],
				[[1.25, 1.75]],
			];
			const row = transposeIntervalStable(col);
			assert.deepStrictEqual(row, [[[-3, -2], [0, 0], [1.25, 1.75]]]);
		});

		it('transposes a 1x1 singleton matrix', () => {
			const single = [[[-42.5, 42.5]]];
			assert.deepStrictEqual(transposeIntervalStable(single), [[[-42.5, 42.5]]]);
		});
	});

	describe('edge cases', () => {
		it('deep-copies output rows and intervals without aliasing input', () => {
			const A = [
				[[1, 2], [3, 4]],
				[[5, 6], [7, 8]],
			];
			const AT = transposeIntervalStable(A);

			assert.notStrictEqual(AT, A);
			assert.notStrictEqual(AT[0], A[0]);
			assert.notStrictEqual(AT[0][0], A[0][0]);
			assert.notStrictEqual(AT[1][0], A[0][1]);

			// Mutating input must not affect output
			A[0][0][0] = -999;
			A[0][1] = [100, 200];
			assert.deepStrictEqual(AT[0][0], [1, 2]);
			assert.deepStrictEqual(AT[1][0], [3, 4]);

			// Mutating output must not affect input
			AT[0][1][1] = 888;
			assert.deepStrictEqual(A[1][0], [5, 6]);
		});

		it('preserves extreme finite values, subnormals, and tight ULP intervals exactly', () => {
			const subnormalBoundary = 2.225073858507201e-308;
			const minNormal = 2.2250738585072014e-308;
			const A = [
				[
					[-Number.MAX_VALUE, Number.MAX_VALUE],
					[-Number.MIN_VALUE, Number.MIN_VALUE],
				],
				[
					[subnormalBoundary, minNormal],
					[1 - Number.EPSILON / 2, 1 + Number.EPSILON],
				],
			];

			const AT = transposeIntervalStable(A);
			assert.deepStrictEqual(AT, [
				[
					[-Number.MAX_VALUE, Number.MAX_VALUE],
					[subnormalBoundary, minNormal],
				],
				[
					[-Number.MIN_VALUE, Number.MIN_VALUE],
					[1 - Number.EPSILON / 2, 1 + Number.EPSILON],
				],
			]);
		});

		it('canonicalizes -0 endpoints to +0 while maintaining enclosure', () => {
			const A = [
				[[-0, -0], [-0, 0]],
				[[-0, 1], [-1, -0]],
			];
			const AT = transposeIntervalStable(A);

			assert.ok(Object.is(AT[0][0][0], 0));
			assert.ok(Object.is(AT[0][0][1], 0));
			assert.ok(Object.is(AT[1][0][0], 0));
			assert.ok(Object.is(AT[1][0][1], 0));
			assert.ok(Object.is(AT[0][1][0], 0));
			assert.strictEqual(AT[0][1][1], 1);
			assert.strictEqual(AT[1][1][0], -1);
			assert.ok(Object.is(AT[1][1][1], 0));
		});

		it('rejects non-array, empty, ragged, sparse, and malformed inputs', () => {
			// Non-array matrix
			for (const bad of [null, undefined, 123, 'matrix', {}]) {
				assert.throws(() => transposeIntervalStable(bad), TypeError);
			}

			// Empty matrix and empty rows
			assert.throws(() => transposeIntervalStable([]), RangeError);
			assert.throws(() => transposeIntervalStable([[]]), RangeError);
			assert.throws(() => transposeIntervalStable([[], []]), RangeError);

			// Non-array rows
			assert.throws(() => transposeIntervalStable([null]), TypeError);
			assert.throws(() => transposeIntervalStable([[[1, 2]], 'not-a-row']), TypeError);

			// Ragged matrix
			assert.throws(
				() =>
					transposeIntervalStable([
						[[1, 2], [3, 4]],
						[[5, 6]],
					]),
				RangeError
			);

			// Sparse arrays
			assert.throws(() => transposeIntervalStable(new Array(2)), TypeError);
			assert.throws(() => transposeIntervalStable([new Array(2)]), TypeError);

			// Malformed interval entries
			assert.throws(() => transposeIntervalStable([[null]]), TypeError);
			assert.throws(() => transposeIntervalStable([[{ lo: 0, hi: 1 }]]), TypeError);
			assert.throws(() => transposeIntervalStable([[[1]]]), RangeError);
			assert.throws(() => transposeIntervalStable([[[1, 2, 3]]]), RangeError);

			// Non-number endpoints
			assert.throws(() => transposeIntervalStable([[['0', 1]]]), TypeError);
			assert.throws(() => transposeIntervalStable([[[0, null]]]), TypeError);
			assert.throws(() => transposeIntervalStable([[[undefined, 1]]]), TypeError);

			// Non-finite endpoints
			assert.throws(() => transposeIntervalStable([[[NaN, 1]]]), RangeError);
			assert.throws(() => transposeIntervalStable([[[0, NaN]]]), RangeError);
			assert.throws(() => transposeIntervalStable([[[-Infinity, 0]]]), RangeError);
			assert.throws(() => transposeIntervalStable([[[0, Infinity]]]), RangeError);

			// Inverted intervals (lo > hi)
			assert.throws(() => transposeIntervalStable([[[2, 1]]]), RangeError);
			assert.throws(() => transposeIntervalStable([[[Number.MIN_VALUE, 0]]]), RangeError);
			assert.throws(
				() => transposeIntervalStable([[[1 + Number.EPSILON, 1]]]),
				RangeError
			);
		});
	});

	describe('independent cross-checks', () => {
		it('satisfies the involution identity (A^T)^T == A across multiple shapes', () => {
			const matrices = [
				[[[-5.25, -4.75], [0.1, 0.2], [1e100, 1e100 + 1e85]]],
				[
					[[-1, 1]],
					[[2, 3]],
					[[-Number.MIN_VALUE, Number.MIN_VALUE]],
				],
				[
					[[1.1, 1.2], [-3.4, -3.3], [0, 0]],
					[[4.5, 4.6], [7.8, 7.9], [-1e-300, 1e-300]],
				],
			];

			for (const A of matrices) {
				const ATT = transposeIntervalStable(transposeIntervalStable(A));
				assert.deepStrictEqual(ATT, A);
			}
		});

		it('preserves interval trace: tr(A^T) == tr(A)', () => {
			const A = [
				[[-1.3, -1.1], [5.0, 6.0], [0.1, 0.2]],
				[[-4.0, -3.5], [2.7, 2.9], [8.1, 8.2]],
				[[9.0, 9.5], [-0.5, 0.5], [0.001, 0.002]],
			];
			const AT = transposeIntervalStable(A);

			const trA = intervalTrace(A);
			const trAT = intervalTrace(AT);
			assert.deepStrictEqual(trAT, trA);

			// Verify diagonal point realizations lie strictly inside tr(A^T)
			const minDiag = A[0][0][0] + A[1][1][0] + A[2][2][0];
			const maxDiag = A[0][0][1] + A[1][1][1] + A[2][2][1];
			assert.ok(trAT[0] <= minDiag && maxDiag <= trAT[1]);
		});

		it('satisfies bilinear form identity and enclosure: x^T A y == y^T A^T x', () => {
			const A = [
				[[-2.5, -2.0], [0.5, 1.25], [3.0, 3.5]],
				[[1.0, 1.5], [-0.75, 0.25], [-4.0, -3.25]],
			];
			const AT = transposeIntervalStable(A);
			const x = [1.5, -2.25];
			const y = [-0.5, 3.0, 0.75];

			const formA = intervalBilinearForm(x, A, y);
			const formAT = intervalBilinearForm(y, AT, x);

			// Sample corners and midpoints M in A and confirm exact point enclosure in both forms
			const weights = [0, 0.25, 0.5, 0.75, 1];
			for (const w of weights) {
				const M = A.map((row) => row.map(([lo, hi]) => lo + w * (hi - lo)));
				const MT = AT.map((_, j) => A.map((__, i) => M[i][j]));

				const valM = pointBilinearForm(x, M, y);
				const valMT = pointBilinearForm(y, MT, x);

				assert.ok(
					Math.abs(valM - valMT) <= 1e-12,
					`Point bilinear forms should match: ${valM} vs ${valMT}`
				);
				assert.ok(
					formA[0] <= valM && valM <= formA[1],
					`Point value ${valM} must be enclosed in x^T A y = [${formA[0]}, ${formA[1]}]`
				);
				assert.ok(
					formAT[0] <= valMT && valMT <= formAT[1],
					`Point value ${valMT} must be enclosed in y^T A^T x = [${formAT[0]}, ${formAT[1]}]`
				);
			}

			// Verify the two interval enclosures overlap tightly and agree to within rounding tolerance
			assert.ok(Math.abs(formA[0] - formAT[0]) <= 1e-12);
			assert.ok(Math.abs(formA[1] - formAT[1]) <= 1e-12);
		});
	});
});
