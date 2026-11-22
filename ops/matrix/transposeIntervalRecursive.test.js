import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { transposeIntervalRecursive } from './transposeIntervalRecursive.js'

/**
 * Independent iterative reference implementation of interval matrix transpose.
 *
 * @param {[number, number][][]} matrix
 * @returns {[number, number][][]}
 */
function iterativeTranspose(matrix) {
	const rows = matrix.length
	const cols = matrix[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const [lo, hi] = matrix[r][c]
			out[c][r] = [lo, hi]
		}
	}
	return out
}

/**
 * Independent iterative transpose for scalar point matrices.
 *
 * @param {number[][]} matrix
 * @returns {number[][]}
 */
function transposePointMatrix(matrix) {
	const rows = matrix.length
	const cols = matrix[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			out[c][r] = matrix[r][c]
		}
	}
	return out
}

/**
 * Deterministic PRNG (Mulberry32) so property tests are reproducible.
 *
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Generates a deterministic random interval matrix of shape `rows x cols`.
 *
 * @param {number} rows
 * @param {number} cols
 * @param {() => number} rng
 * @returns {[number, number][][]}
 */
function randomIntervalMatrix(rows, cols, rng) {
	return Array.from({ length: rows }, () =>
		Array.from({ length: cols }, () => {
			const a = (rng() - 0.5) * 200
			const b = (rng() - 0.5) * 200
			return a <= b ? [a, b] : [b, a]
		}),
	)
}

describe('transposeIntervalRecursive', () => {
	describe('normal cases', () => {
		it('transposes a 2x2 square interval matrix', () => {
			const input = [
				[
					[1, 2],
					[3, 4],
				],
				[
					[-5, -1],
					[0, 0],
				],
			]
			const expected = [
				[
					[1, 2],
					[-5, -1],
				],
				[
					[3, 4],
					[0, 0],
				],
			]
			assert.deepEqual(transposeIntervalRecursive(input), expected)
		})

		it('transposes a 4x4 square interval matrix with mixed point and wide intervals', () => {
			const rng = createRng(101)
			const input = randomIntervalMatrix(4, 4, rng)
			input[0][0] = [42, 42]
			input[3][1] = [-Number.MIN_VALUE, Number.MIN_VALUE]
			assert.deepEqual(
				transposeIntervalRecursive(input),
				iterativeTranspose(input),
			)
		})

		it('transposes rectangular matrices (2x3 and 3x2)', () => {
			const rect2x3 = [
				[
					[0, 1],
					[2, 3],
					[4, 5],
				],
				[
					[-3, -2],
					[-1, 0],
					[10, 20],
				],
			]
			const expected3x2 = [
				[
					[0, 1],
					[-3, -2],
				],
				[
					[2, 3],
					[-1, 0],
				],
				[
					[4, 5],
					[10, 20],
				],
			]
			assert.deepEqual(transposeIntervalRecursive(rect2x3), expected3x2)
			assert.deepEqual(transposeIntervalRecursive(expected3x2), rect2x3)
		})
	})

	describe('edge cases', () => {
		it('handles a 1x1 interval matrix', () => {
			const input = [[[-1.5, 2.5]]]
			const output = transposeIntervalRecursive(input)
			assert.deepEqual(output, [[[-1.5, 2.5]]])
			assert.notEqual(output, input)
			assert.notEqual(output[0], input[0])
			assert.notEqual(output[0][0], input[0][0])
		})

		it('handles a row vector (1xN)', () => {
			const input = [
				[
					[1, 1],
					[2, 3],
					[-4, 5],
					[6.25, 6.75],
					[0, 100],
				],
			]
			const expected = [
				[[1, 1]],
				[[2, 3]],
				[[-4, 5]],
				[[6.25, 6.75]],
				[[0, 100]],
			]
			assert.deepEqual(transposeIntervalRecursive(input), expected)
		})

		it('handles a column vector (Nx1)', () => {
			const input = [
				[[-10, -5]],
				[[0, 0]],
				[[1.1, 2.2]],
				[[3.3, 4.4]],
				[[5.5, 6.6]],
			]
			const expected = [
				[
					[-10, -5],
					[0, 0],
					[1.1, 2.2],
					[3.3, 4.4],
					[5.5, 6.6],
				],
			]
			assert.deepEqual(transposeIntervalRecursive(input), expected)
		})

		it('handles odd dimensions (3x3, 3x5, 5x3, 7x11, 13x9)', () => {
			const rng = createRng(2026)
			const shapes = [
				[3, 3],
				[3, 5],
				[5, 3],
				[7, 11],
				[13, 9],
			]
			for (const [rows, cols] of shapes) {
				const matrix = randomIntervalMatrix(rows, cols, rng)
				const result = transposeIntervalRecursive(matrix)
				assert.equal(result.length, cols)
				assert.equal(result[0].length, rows)
				assert.deepEqual(result, iterativeTranspose(matrix))
			}
		})

		it('does not mutate input and returns deeply cloned intervals', () => {
			const input = [
				[
					[1, 2],
					[3, 4],
				],
				[
					[5, 6],
					[7, 8],
				],
			]
			const snapshot = structuredClone(input)
			const output = transposeIntervalRecursive(input)

			assert.deepEqual(input, snapshot)

			// Mutating input after transpose must not affect output
			input[0][1][0] = -999
			input[1][0][1] = 999
			assert.deepEqual(output[1][0], [3, 4])
			assert.deepEqual(output[0][1], [5, 6])

			// Mutating output must not affect input
			output[0][0][0] = -12345
			assert.equal(input[0][0][0], 1)
		})

		it('supports optional outward rounding with guaranteed strict widening', () => {
			const input = [
				[
					[0, 0],
					[1, 1],
				],
				[
					[-1, 2.5],
					[-Number.MIN_VALUE, Number.MIN_VALUE],
				],
			]

			const rounded1 = transposeIntervalRecursive(input, { outwardRound: true })
			const rounded2 = transposeIntervalRecursive(input, { outwardUlps: 2 })

			// [0, 0] -> [-MIN_VALUE, MIN_VALUE] for 1 ULP
			assert.deepEqual(rounded1[0][0], [-Number.MIN_VALUE, Number.MIN_VALUE])

			for (let r = 0; r < input.length; r++) {
				for (let c = 0; c < input[0].length; c++) {
					const [lo, hi] = input[r][c]
					const [lo1, hi1] = rounded1[c][r]
					const [lo2, hi2] = rounded2[c][r]

					assert.ok(lo1 < lo, `expected ${lo1} < ${lo}`)
					assert.ok(hi1 > hi, `expected ${hi1} > ${hi}`)
					assert.ok(lo2 < lo1, `expected ${lo2} < ${lo1}`)
					assert.ok(hi2 > hi1, `expected ${hi2} > ${hi1}`)
				}
			}
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError for non-array matrix or non-array rows', () => {
			for (const bad of [null, undefined, 42, 'matrix', {}, true]) {
				assert.throws(() => transposeIntervalRecursive(bad), TypeError)
			}
			assert.throws(() => transposeIntervalRecursive([123]), TypeError)
			assert.throws(
				() => transposeIntervalRecursive([[[0, 1]], null]),
				TypeError,
			)
		})

		it('throws RangeError for empty or ragged matrices', () => {
			assert.throws(() => transposeIntervalRecursive([]), RangeError)
			assert.throws(() => transposeIntervalRecursive([[]]), RangeError)
			assert.throws(
				() =>
					transposeIntervalRecursive([
						[
							[0, 1],
							[2, 3],
						],
						[[4, 5]],
					]),
				RangeError,
			)
		})

		it('throws on malformed, non-finite, or inverted intervals', () => {
			// Wrong shape or type
			assert.throws(() => transposeIntervalRecursive([[1]]), TypeError)
			assert.throws(() => transposeIntervalRecursive([[[1]]]), TypeError)
			assert.throws(() => transposeIntervalRecursive([[[1, 2, 3]]]), TypeError)
			assert.throws(
				() => transposeIntervalRecursive([[['0', 1]]]),
				TypeError,
			)
			assert.throws(
				() => transposeIntervalRecursive([[[0, undefined]]]),
				TypeError,
			)

			// Sparse array hole
			const sparseRow = new Array(2)
			sparseRow[0] = [0, 1]
			assert.throws(() => transposeIntervalRecursive([sparseRow]), TypeError)

			// Non-finite values
			assert.throws(() => transposeIntervalRecursive([[[NaN, 1]]]), RangeError)
			assert.throws(() => transposeIntervalRecursive([[[0, NaN]]]), RangeError)
			assert.throws(
				() => transposeIntervalRecursive([[[-Infinity, 1]]]),
				RangeError,
			)
			assert.throws(
				() => transposeIntervalRecursive([[[0, Infinity]]]),
				RangeError,
			)

			// Inverted interval (lo > hi)
			assert.throws(() => transposeIntervalRecursive([[[2, 1]]]), RangeError)
			assert.throws(
				() => transposeIntervalRecursive([[[-0.5, -1.5]]]),
				RangeError,
			)
		})

		it('throws on invalid options or outward rounding overflow', () => {
			const valid = [[[0, 1]]]
			assert.throws(() => transposeIntervalRecursive(valid, null), TypeError)
			assert.throws(() => transposeIntervalRecursive(valid, []), TypeError)
			assert.throws(
				() => transposeIntervalRecursive(valid, { outwardRound: 'yes' }),
				TypeError,
			)
			assert.throws(
				() => transposeIntervalRecursive(valid, { outwardUlps: '1' }),
				TypeError,
			)
			assert.throws(
				() => transposeIntervalRecursive(valid, { outwardUlps: Infinity }),
				TypeError,
			)
			assert.throws(
				() => transposeIntervalRecursive(valid, { outwardUlps: -1 }),
				RangeError,
			)
			assert.throws(
				() => transposeIntervalRecursive(valid, { outwardUlps: 1.5 }),
				RangeError,
			)
			assert.throws(
				() =>
					transposeIntervalRecursive([[[-Number.MAX_VALUE, 0]]], {
						outwardRound: true,
					}),
				RangeError,
			)
			assert.throws(
				() =>
					transposeIntervalRecursive([[[0, Number.MAX_VALUE]]], {
						outwardUlps: 1,
					}),
				RangeError,
			)
		})
	})

	describe('mathematical properties and cross-checks', () => {
		it('matches independent iterative transpose across diverse shapes including large matrices', () => {
			const rng = createRng(777)
			const shapes = [
				[1, 1],
				[1, 17],
				[19, 1],
				[2, 2],
				[6, 10],
				[15, 8],
				[37, 53],
			]
			for (const [rows, cols] of shapes) {
				const matrix = randomIntervalMatrix(rows, cols, rng)
				const recursive = transposeIntervalRecursive(matrix)
				const iterative = iterativeTranspose(matrix)
				assert.deepEqual(recursive, iterative)
			}
		})

		it('satisfies involution property (A^T)^T == A', () => {
			const rng = createRng(9999)
			const shapes = [
				[1, 1],
				[1, 8],
				[9, 1],
				[4, 4],
				[5, 7],
				[11, 6],
				[16, 16],
			]
			for (const [rows, cols] of shapes) {
				const A = randomIntervalMatrix(rows, cols, rng)
				const AT = transposeIntervalRecursive(A)
				const ATT = transposeIntervalRecursive(AT)
				assert.deepEqual(ATT, A)
			}
		})

		it('guarantees enclosure of sampled point matrices for both exact and outward-rounded modes', () => {
			const rng = createRng(314159)
			const shapes = [
				[1, 1],
				[2, 5],
				[5, 3],
				[8, 8],
			]

			for (const [rows, cols] of shapes) {
				const A = randomIntervalMatrix(rows, cols, rng)
				const ATExact = transposeIntervalRecursive(A)
				const ATOutward = transposeIntervalRecursive(A, { outwardRound: true })

				// Sample 25 point matrices P in A: lo endpoints, hi endpoints, midpoints, and random interior points
				for (let sample = 0; sample < 25; sample++) {
					const P = Array.from({ length: rows }, (_, r) =>
						Array.from({ length: cols }, (_, c) => {
							const [lo, hi] = A[r][c]
							if (sample === 0) return lo
							if (sample === 1) return hi
							if (sample === 2) return lo + (hi - lo) * 0.5
							return lo + (hi - lo) * rng()
						}),
					)

					const PT = transposePointMatrix(P)

					for (let j = 0; j < cols; j++) {
						for (let i = 0; i < rows; i++) {
							const val = PT[j][i]
							const [eLo, eHi] = ATExact[j][i]
							const [oLo, oHi] = ATOutward[j][i]

							assert.ok(
								eLo <= val && val <= eHi,
								`exact enclosure violated at (${j},${i}): ${val} not in [${eLo}, ${eHi}]`,
							)
							assert.ok(
								oLo <= val && val <= oHi,
								`outward enclosure violated at (${j},${i}): ${val} not in [${oLo}, ${oHi}]`,
							)
							assert.ok(
								oLo <= eLo && eHi <= oHi,
								`outward interval [${oLo}, ${oHi}] does not enclose exact interval [${eLo}, ${eHi}]`,
							)
						}
					}
				}
			}
		})
	})
})
