import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { transposeIntervalIterative } from './transposeIntervalIterative.js';

/**
 * Independent scalar matrix transpose for enclosure cross-checks.
 * @param {number[][]} A
 * @returns {number[][]}
 */
function scalarTranspose(A) {
	const rows = A.length;
	const cols = A[0].length;
	return Array.from({ length: cols }, (_, j) =>
		Array.from({ length: rows }, (_, i) => A[i][j]),
	);
}

/**
 * Simple deterministic PRNG (Mulberry32) for reproducible sampling tests.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('transposeIntervalIterative', () => {
	describe('normal cases', () => {
		test('transposes a 2x2 square interval matrix', () => {
			const M = [
				[
					[1, 2],
					[3, 4],
				],
				[
					[-5, -1],
					[0, 0],
				],
			];
			const expected = [
				[
					[1, 2],
					[-5, -1],
				],
				[
					[3, 4],
					[0, 0],
				],
			];
			assert.deepStrictEqual(transposeIntervalIterative(M), expected);
		});

		test('transposes a 2x3 rectangular interval matrix to 3x2', () => {
			const M = [
				[
					[-1.5, 0.25],
					[2, 2],
					[10.1, 10.9],
				],
				[
					[0, 1],
					[-100, 100],
					[3.14, 3.15],
				],
			];
			const expected = [
				[
					[-1.5, 0.25],
					[0, 1],
				],
				[
					[2, 2],
					[-100, 100],
				],
				[
					[10.1, 10.9],
					[3.14, 3.15],
				],
			];
			assert.deepStrictEqual(transposeIntervalIterative(M), expected);
		});

		test('transposes a 3x2 rectangular interval matrix to 2x3', () => {
			const M = [
				[
					[1, 2],
					[3, 4],
				],
				[
					[5, 6],
					[7, 8],
				],
				[
					[9, 10],
					[11, 12],
				],
			];
			const expected = [
				[
					[1, 2],
					[5, 6],
					[9, 10],
				],
				[
					[3, 4],
					[7, 8],
					[11, 12],
				],
			];
			assert.deepStrictEqual(transposeIntervalIterative(M), expected);
		});

		test('preserves extreme finite values and extended infinite interval bounds', () => {
			const M = [
				[
					[-Infinity, 0],
					[0, Infinity],
				],
				[
					[-Infinity, Infinity],
					[-Number.MAX_VALUE, Number.MAX_VALUE],
				],
			];
			const expected = [
				[
					[-Infinity, 0],
					[-Infinity, Infinity],
				],
				[
					[0, Infinity],
					[-Number.MAX_VALUE, Number.MAX_VALUE],
				],
			];
			assert.deepStrictEqual(transposeIntervalIterative(M), expected);
		});
	});

	describe('edge cases', () => {
		test('handles 1x1 interval matrix', () => {
			const M = [[[-42.5, 17.25]]];
			assert.deepStrictEqual(transposeIntervalIterative(M), [[[-42.5, 17.25]]]);
		});

		test('transposes a 1xN row vector into an Nx1 column vector', () => {
			const M = [
				[
					[1, 2],
					[3, 4],
					[5, 6],
					[7, 8],
				],
			];
			const expected = [[[1, 2]], [[3, 4]], [[5, 6]], [[7, 8]]];
			assert.deepStrictEqual(transposeIntervalIterative(M), expected);
		});

		test('transposes an Nx1 column vector into a 1xN row vector', () => {
			const M = [[[1, 2]], [[3, 4]], [[5, 6]], [[7, 8]]];
			const expected = [
				[
					[1, 2],
					[3, 4],
					[5, 6],
					[7, 8],
				],
			];
			assert.deepStrictEqual(transposeIntervalIterative(M), expected);
		});

		test('normalizes -0 bounds to +0 without shrinking intervals', () => {
			const M = [
				[
					[-0, -0],
					[-0, 1],
				],
				[
					[-1, -0],
					[-Number.MIN_VALUE, Number.MIN_VALUE],
				],
			];
			const T = transposeIntervalIterative(M);

			assert.equal(Object.is(T[0][0][0], 0), true);
			assert.equal(Object.is(T[0][0][1], 0), true);
			assert.equal(Object.is(T[1][0][0], 0), true);
			assert.equal(T[1][0][1], 1);
			assert.equal(T[0][1][0], -1);
			assert.equal(Object.is(T[0][1][1], 0), true);
			assert.deepStrictEqual(T[1][1], [-Number.MIN_VALUE, Number.MIN_VALUE]);
		});

		test('returns fresh cloned rows and interval tuples with no shared references', () => {
			const cell00 = [1, 2];
			const cell01 = [3, 4];
			const cell10 = [5, 6];
			const cell11 = [7, 8];
			const M = [
				[cell00, cell01],
				[cell10, cell11],
			];

			const T = transposeIntervalIterative(M);

			assert.notEqual(T, M);
			assert.notEqual(T[0], M[0]);
			assert.notEqual(T[0], M[1]);
			assert.notEqual(T[1], M[0]);
			assert.notEqual(T[1], M[1]);

			assert.notEqual(T[0][0], cell00);
			assert.notEqual(T[1][0], cell01);
			assert.notEqual(T[0][1], cell10);
			assert.notEqual(T[1][1], cell11);

			// Mutating original input must not affect transposed output.
			cell00[0] = 999;
			M[1][1][1] = -999;
			assert.deepStrictEqual(T, [
				[
					[1, 2],
					[5, 6],
				],
				[
					[3, 4],
					[7, 8],
				],
			]);

			// Mutating output must not affect original input.
			T[0][1][0] = 12345;
			assert.deepStrictEqual(cell10, [5, 6]);
		});
	});

	describe('input validation', () => {
		test('rejects non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => transposeIntervalIterative(bad), TypeError);
			}
		});

		test('rejects empty matrix and empty rows', () => {
			assert.throws(() => transposeIntervalIterative([]), RangeError);
			assert.throws(() => transposeIntervalIterative([[]]), RangeError);
			assert.throws(() => transposeIntervalIterative([[], []]), RangeError);
		});

		test('rejects non-array rows and sparse outer array', () => {
			assert.throws(() => transposeIntervalIterative([123]), TypeError);
			assert.throws(
				() => transposeIntervalIterative([[[0, 1]], null]),
				TypeError,
			);
			assert.throws(() => transposeIntervalIterative(new Array(2)), TypeError);
		});

		test('rejects ragged (non-rectangular) matrices', () => {
			assert.throws(
				() =>
					transposeIntervalIterative([
						[
							[1, 2],
							[3, 4],
						],
						[[5, 6]],
					]),
				RangeError,
			);
			assert.throws(
				() =>
					transposeIntervalIterative([
						[[1, 2]],
						[
							[3, 4],
							[5, 6],
						],
					]),
				RangeError,
			);
		});

		test('rejects malformed interval cells', () => {
			assert.throws(() => transposeIntervalIterative([[1]]), TypeError);
			assert.throws(() => transposeIntervalIterative([[null]]), TypeError);
			assert.throws(
				() => transposeIntervalIterative([[{ lo: 0, hi: 1 }]]),
				TypeError,
			);
			assert.throws(() => transposeIntervalIterative([[[]]]), TypeError);
			assert.throws(() => transposeIntervalIterative([[[1]]]), TypeError);
			assert.throws(
				() => transposeIntervalIterative([[[1, 2, 3]]]),
				TypeError,
			);
			assert.throws(
				() => transposeIntervalIterative([new Array(2)]),
				TypeError,
			);
		});

		test('rejects non-number bounds, NaN bounds, and inverted intervals (lo > hi)', () => {
			assert.throws(
				() => transposeIntervalIterative([[['0', 1]]]),
				TypeError,
			);
			assert.throws(
				() => transposeIntervalIterative([[[0, undefined]]]),
				TypeError,
			);
			assert.throws(
				() => transposeIntervalIterative([[[NaN, 1]]]),
				RangeError,
			);
			assert.throws(
				() => transposeIntervalIterative([[[0, NaN]]]),
				RangeError,
			);
			assert.throws(
				() => transposeIntervalIterative([[[NaN, NaN]]]),
				RangeError,
			);
			assert.throws(
				() => transposeIntervalIterative([[[2, 1]]]),
				RangeError,
			);
			assert.throws(
				() => transposeIntervalIterative([[[Infinity, -Infinity]]]),
				RangeError,
			);
		});
	});

	describe('mathematical cross-checks', () => {
		test('double transpose involution: T(T(M)) equals M across shapes', () => {
			const shapes = [
				[1, 1],
				[1, 5],
				[5, 1],
				[2, 3],
				[3, 2],
				[4, 4],
				[3, 5],
			];
			const rng = createRng(0x5eed1234);

			for (const [rows, cols] of shapes) {
				const M = Array.from({ length: rows }, () =>
					Array.from({ length: cols }, () => {
						const a = (rng() - 0.5) * 200;
						const width = rng() * 25;
						return [a, a + width];
					}),
				);

				const T = transposeIntervalIterative(M);
				assert.equal(T.length, cols);
				assert.equal(T[0].length, rows);

				const TT = transposeIntervalIterative(T);
				assert.deepStrictEqual(TT, M);
			}
		});

		test('point-matrix transpose enclosure and tightness check', () => {
			const M = [
				[
					[-3.25, -1.5],
					[0, 0.125],
					[4.5, 4.5],
				],
				[
					[10, 20.5],
					[-0.75, 0.75],
					[-100, -50],
				],
			];
			const MT = transposeIntervalIterative(M);

			const rows = M.length;
			const cols = M[0].length;
			const rng = createRng(0xdeadbeef);

			// Build point matrices: all-lo, all-hi, midpoint, and 50 deterministic samples
			const samples = [
				M.map((row) => row.map(([lo]) => lo)),
				M.map((row) => row.map(([, hi]) => hi)),
				M.map((row) => row.map(([lo, hi]) => (lo + hi) / 2)),
			];

			for (let s = 0; s < 50; s++) {
				samples.push(
					M.map((row) =>
						row.map(([lo, hi]) => {
							const t = rng();
							const val = lo + t * (hi - lo);
							// Guard against floating-point overshoot beyond [lo, hi]
							return Math.min(hi, Math.max(lo, val));
						}),
					),
				);
			}

			const observedMin = Array.from({ length: cols }, () =>
				Array.from({ length: rows }, () => Infinity),
			);
			const observedMax = Array.from({ length: cols }, () =>
				Array.from({ length: rows }, () => -Infinity),
			);

			for (const A of samples) {
				const AT = scalarTranspose(A);
				assert.equal(AT.length, cols);
				assert.equal(AT[0].length, rows);

				for (let j = 0; j < cols; j++) {
					for (let i = 0; i < rows; i++) {
						const [lo, hi] = MT[j][i];
						const pointVal = AT[j][i];
						assert.ok(
							pointVal >= lo && pointVal <= hi,
							`Expected AT[${j}][${i}]=${pointVal} to be enclosed in [${lo}, ${hi}]`,
						);
						if (pointVal < observedMin[j][i]) observedMin[j][i] = pointVal;
						if (pointVal > observedMax[j][i]) observedMax[j][i] = pointVal;
					}
				}
			}

			// Because all-lo and all-hi corner matrices are included, the interval hull must be exact.
			for (let j = 0; j < cols; j++) {
				for (let i = 0; i < rows; i++) {
					assert.deepStrictEqual(MT[j][i], [
						observedMin[j][i],
						observedMax[j][i],
					]);
				}
			}
		});

		test('agrees with independent functional reference implementation', () => {
			const referenceTranspose = (M) =>
				M[0].map((_, j) =>
					M.map((row) => [
						row[j][0] === 0 ? 0 : row[j][0],
						row[j][1] === 0 ? 0 : row[j][1],
					]),
				);

			const M = [
				[
					[-0, 0],
					[1.1, 2.2],
					[-3.3, -1.1],
				],
				[
					[4.4, 5.5],
					[-6.6, 6.6],
					[0, 0],
				],
				[
					[7.7, 7.7],
					[-Infinity, 0],
					[1, Infinity],
				],
			];

			assert.deepStrictEqual(
				transposeIntervalIterative(M),
				referenceTranspose(M),
			);
		});
	});
});
