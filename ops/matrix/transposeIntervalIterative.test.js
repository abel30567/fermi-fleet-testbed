import { describe, test } from 'node:test'
import assert from 'node:assert'
import { transposeIntervalIterative } from './transposeIntervalIterative.js'

/**
 * Independent scalar matrix transpose for cross-checking enclosure.
 * @param {number[][]} m
 * @returns {number[][]}
 */
function scalarTranspose(m) {
	const rows = m.length
	const cols = m[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let i = 0; i < rows; i += 1) {
		for (let j = 0; j < cols; j += 1) {
			out[j][i] = m[i][j]
		}
	}
	return out
}

/**
 * Deterministic linear congruential PRNG returning numbers in [0, 1].
 * @param {number} seed
 * @returns {() => number}
 */
function createPrng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0xffffffff
	}
}

describe('transposeIntervalIterative', () => {
	test('transposes a square 2x2 interval matrix', () => {
		const input = [
			[
				[-1, 2],
				[3.5, 4.5],
			],
			[
				[0, 0],
				[-10, -5],
			],
		]
		const expected = [
			[
				[-1, 2],
				[0, 0],
			],
			[
				[3.5, 4.5],
				[-10, -5],
			],
		]
		assert.deepStrictEqual(transposeIntervalIterative(input), expected)
	})

	test('transposes rectangular 2x3 and 3x2 interval matrices', () => {
		const rect2x3 = [
			[
				[1, 2],
				[3, 4],
				[5, 6],
			],
			[
				[-6, -5],
				[-4, -3],
				[-2, -1],
			],
		]
		const expected3x2 = [
			[
				[1, 2],
				[-6, -5],
			],
			[
				[3, 4],
				[-4, -3],
			],
			[
				[5, 6],
				[-2, -1],
			],
		]
		const transposed = transposeIntervalIterative(rect2x3)
		assert.strictEqual(transposed.length, 3)
		assert.strictEqual(transposed[0].length, 2)
		assert.deepStrictEqual(transposed, expected3x2)

		const backTo2x3 = transposeIntervalIterative(transposed)
		assert.strictEqual(backTo2x3.length, 2)
		assert.strictEqual(backTo2x3[0].length, 3)
		assert.deepStrictEqual(backTo2x3, rect2x3)
	})

	test('handles 1x1 matrix, row vector (1xN), column vector (Nx1), and empty matrix', () => {
		const single = [[[-0.25, 0.75]]]
		assert.deepStrictEqual(transposeIntervalIterative(single), [[[-0.25, 0.75]]])

		const rowVec = [
			[
				[1, 1],
				[2, 3],
				[4, 5],
				[6, 7],
			],
		]
		const colVec = [[[1, 1]], [[2, 3]], [[4, 5]], [[6, 7]]]
		assert.deepStrictEqual(transposeIntervalIterative(rowVec), colVec)
		assert.deepStrictEqual(transposeIntervalIterative(colVec), rowVec)

		assert.deepStrictEqual(transposeIntervalIterative([]), [])
	})

	test('preserves subnormal, extreme finite, and extended-real infinite interval bounds', () => {
		const input = [
			[
				[Number.MIN_VALUE, Number.MIN_VALUE * 2],
				[-Infinity, 0],
			],
			[
				[0, Infinity],
				[-Infinity, Infinity],
			],
		]
		const expected = [
			[
				[Number.MIN_VALUE, Number.MIN_VALUE * 2],
				[0, Infinity],
			],
			[
				[-Infinity, 0],
				[-Infinity, Infinity],
			],
		]
		assert.deepStrictEqual(transposeIntervalIterative(input), expected)
	})

	test('rejects invalid matrix shapes and non-array inputs', () => {
		assert.throws(() => transposeIntervalIterative(null), TypeError)
		assert.throws(() => transposeIntervalIterative(undefined), TypeError)
		assert.throws(() => transposeIntervalIterative(42), TypeError)
		assert.throws(() => transposeIntervalIterative({}), TypeError)
		assert.throws(() => transposeIntervalIterative(['not-a-row']), TypeError)
		assert.throws(() => transposeIntervalIterative([[[1, 2]], 'not-a-row']), TypeError)
		assert.throws(() => transposeIntervalIterative([[]]), RangeError)
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
		)
	})

	test('rejects malformed and invalid intervals', () => {
		// Inverted bounds lo > hi
		assert.throws(() => transposeIntervalIterative([[[2, 1]]]), RangeError)
		assert.throws(() => transposeIntervalIterative([[[Infinity, -Infinity]]]), RangeError)
		// NaN endpoints
		assert.throws(() => transposeIntervalIterative([[[NaN, 1]]]), RangeError)
		assert.throws(() => transposeIntervalIterative([[[0, NaN]]]), RangeError)
		// Degenerate infinite intervals
		assert.throws(() => transposeIntervalIterative([[[Infinity, Infinity]]]), RangeError)
		assert.throws(() => transposeIntervalIterative([[[-Infinity, -Infinity]]]), RangeError)
		// Wrong tuple length
		assert.throws(() => transposeIntervalIterative([[[]]]), RangeError)
		assert.throws(() => transposeIntervalIterative([[[1]]]), RangeError)
		assert.throws(() => transposeIntervalIterative([[[1, 2, 3]]]), RangeError)
		// Non-array or non-numeric endpoints
		assert.throws(() => transposeIntervalIterative([[5]]), TypeError)
		assert.throws(() => transposeIntervalIterative([[null]]), TypeError)
		assert.throws(() => transposeIntervalIterative([[{ lo: 1, hi: 2 }]]), TypeError)
		assert.throws(() => transposeIntervalIterative([[['1', 2]]]), TypeError)
		assert.throws(() => transposeIntervalIterative([[[1, undefined]]]), TypeError)
	})

	test('does not mutate input and isolates output references (immutability)', () => {
		const original = [
			[
				[1, 2],
				[3, 4],
			],
			[
				[5, 6],
				[7, 8],
			],
		]
		const snapshot = structuredClone(original)
		const transposed = transposeIntervalIterative(original)

		// Input is untouched
		assert.deepStrictEqual(original, snapshot)

		// No shared tuple references between input and output
		for (let i = 0; i < original.length; i += 1) {
			for (let j = 0; j < original[0].length; j += 1) {
				assert.notStrictEqual(transposed[j][i], original[i][j])
			}
		}

		// Mutating output does not affect input
		transposed[0][1][0] = -999
		transposed[1][0][1] = 999
		assert.deepStrictEqual(original, snapshot)

		// Mutating input after call does not affect output
		const transposedBeforeInputMutation = structuredClone(transposed)
		original[0][0][0] = 12345
		original[1][1][1] = -12345
		assert.deepStrictEqual(transposed, transposedBeforeInputMutation)
	})

	test('cross-check: involution property transpose(transpose(A)) == A across shapes', () => {
		const shapes = [
			[1, 1],
			[1, 5],
			[5, 1],
			[2, 4],
			[4, 2],
			[3, 3],
		]
		const rand = createPrng(20261123)

		for (const [rows, cols] of shapes) {
			const mat = Array.from({ length: rows }, () =>
				Array.from({ length: cols }, () => {
					const a = (rand() - 0.5) * 100
					const width = rand() * 10
					return [a, a + width]
				}),
			)
			const doubleTransposed = transposeIntervalIterative(
				transposeIntervalIterative(mat),
			)
			assert.deepStrictEqual(doubleTransposed, mat)
		}
	})

	test('cross-check: sampled scalar matrix transpose enclosure and endpoint tightness', () => {
		const intervalMat = [
			[
				[-3.25, -1.5],
				[0.1, 0.9],
				[10, 10],
			],
			[
				[-0.5, 0.5],
				[4.2, 7.8],
				[-100.5, -99.25],
			],
		]
		const transposedInterval = transposeIntervalIterative(intervalMat)
		const rand = createPrng(42)

		// Check corner matrices (all lower bounds, all upper bounds, midpoints) + 50 random samples
		const sampleStrategies = [
			(lo, _hi) => lo,
			(_lo, hi) => hi,
			(lo, hi) => lo + (hi - lo) / 2,
		]
		for (let s = 0; s < 50; s += 1) {
			sampleStrategies.push((lo, hi) => lo + rand() * (hi - lo))
		}

		let observedLo = Array.from({ length: 3 }, () => new Array(2).fill(Infinity))
		let observedHi = Array.from({ length: 3 }, () => new Array(2).fill(-Infinity))

		for (const pick of sampleStrategies) {
			const scalarMat = intervalMat.map((row) =>
				row.map(([lo, hi]) => pick(lo, hi)),
			)
			const scalarT = scalarTranspose(scalarMat)

			for (let j = 0; j < transposedInterval.length; j += 1) {
				for (let i = 0; i < transposedInterval[0].length; i += 1) {
					const [lo, hi] = transposedInterval[j][i]
					const val = scalarT[j][i]
					assert.ok(
						val >= lo && val <= hi,
						`Scalar transpose value ${val} at (${j},${i}) not enclosed in [${lo}, ${hi}]`,
					)
					if (val < observedLo[j][i]) observedLo[j][i] = val
					if (val > observedHi[j][i]) observedHi[j][i] = val
				}
			}
		}

		// Tightness check: lower and upper bounds are exactly achieved by the corner matrices
		for (let j = 0; j < transposedInterval.length; j += 1) {
			for (let i = 0; i < transposedInterval[0].length; i += 1) {
				assert.strictEqual(observedLo[j][i], transposedInterval[j][i][0])
				assert.strictEqual(observedHi[j][i], transposedInterval[j][i][1])
			}
		}
	})
})
