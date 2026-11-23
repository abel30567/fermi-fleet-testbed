import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeIntervalSeries } from './transposeIntervalSeries.js'

/**
 * Deterministic LCG PRNG for reproducible cross-check sampling.
 * @param {number} seed
 * @returns {() => number}
 */
function makeRng(seed) {
	let state = seed >>> 0
	return () => {
		state = (Math.imul(1664525, state) + 1013904223) >>> 0
		return state / 0x100000000
	}
}

/**
 * Independent scalar matrix transpose for cross-checking point matrices.
 * @param {number[][]} M
 * @returns {number[][]}
 */
function scalarTranspose(M) {
	const rows = M.length
	const cols = M[0].length
	const out = Array.from({ length: cols }, () => new Array(rows))
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j][i] = M[i][j]
		}
	}
	return out
}

/**
 * Independent canonical-basis expansion of interval matrix transpose:
 * A^T = sum_{i=0}^{m-1} sum_{j=0}^{n-1} E_{j,i} * A[i][j].
 * @param {Array<Array<[number, number]>>} A
 * @returns {Array<Array<[number, number]>>}
 */
function basisSumTranspose(A) {
	const m = A.length
	const n = A[0].length
	const acc = Array.from({ length: n }, () =>
		Array.from({ length: m }, () => [0, 0]),
	)
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			const [lo, hi] = A[i][j]
			// Add E_{j,i} * [lo, hi] to accumulator
			acc[j][i] = [acc[j][i][0] + lo, acc[j][i][1] + hi]
		}
	}
	return acc
}

describe('transposeIntervalSeries — normal cases', () => {
	test('transposes a 2x3 rectangular interval matrix into a 3x2 matrix', () => {
		const A = [
			[[-1, 2], [3.5, 4.5], [0, 0]],
			[[10, 12], [-5, -4], [0.25, 0.75]],
		]
		const expected = [
			[[-1, 2], [10, 12]],
			[[3.5, 4.5], [-5, -4]],
			[[0, 0], [0.25, 0.75]],
		]
		assert.deepStrictEqual(transposeIntervalSeries(A), expected)
	})

	test('transposes a 3x2 rectangular interval matrix into a 2x3 matrix', () => {
		const A = [
			[[1, 2], [3, 4]],
			[[5, 6], [7, 8]],
			[[9, 10], [11, 12]],
		]
		const expected = [
			[[1, 2], [5, 6], [9, 10]],
			[[3, 4], [7, 8], [11, 12]],
		]
		assert.deepStrictEqual(transposeIntervalSeries(A), expected)
	})

	test('transposes a 3x3 square interval matrix', () => {
		const A = [
			[[1, 1], [2, 3], [-4, -1]],
			[[0, 5], [6, 6], [7, 9]],
			[[-2, 2], [8, 10], [11, 11]],
		]
		const expected = [
			[[1, 1], [0, 5], [-2, 2]],
			[[2, 3], [6, 6], [8, 10]],
			[[-4, -1], [7, 9], [11, 11]],
		]
		assert.deepStrictEqual(transposeIntervalSeries(A), expected)
	})

	test('transposes row vector (1xn) to column vector (nx1) and back', () => {
		const rowVec = [[[-3, -1], [0, 0.5], [1, 2], [4, 4]]]
		const colVec = transposeIntervalSeries(rowVec)
		assert.deepStrictEqual(colVec, [
			[[-3, -1]],
			[[0, 0.5]],
			[[1, 2]],
			[[4, 4]],
		])
		assert.deepStrictEqual(transposeIntervalSeries(colVec), rowVec)
	})
})

describe('transposeIntervalSeries — edge cases', () => {
	test('handles 1x1 matrix with thin/point interval', () => {
		const A = [[[42.25, 42.25]]]
		assert.deepStrictEqual(transposeIntervalSeries(A), [[[42.25, 42.25]]])
	})

	test('handles extreme finite binary64 values, subnormals, and signed zeros', () => {
		const A = [
			[
				[-Number.MAX_VALUE, Number.MAX_VALUE],
				[-Number.MIN_VALUE, Number.MIN_VALUE],
			],
			[
				[-0, 0],
				[Number.EPSILON, 1 + Number.EPSILON],
			],
		]
		const AT = transposeIntervalSeries(A)
		assert.deepStrictEqual(AT, [
			[
				[-Number.MAX_VALUE, Number.MAX_VALUE],
				[-0, 0],
			],
			[
				[-Number.MIN_VALUE, Number.MIN_VALUE],
				[Number.EPSILON, 1 + Number.EPSILON],
			],
		])
		assert.deepStrictEqual(transposeIntervalSeries(AT), A)
	})

	test('returns fresh interval tuples with no aliasing to input', () => {
		const A = [
			[[1, 2], [3, 4]],
			[[5, 6], [7, 8]],
		]
		const AT = transposeIntervalSeries(A)
		A[0][1][0] = -999
		AT[0][1][1] = 999
		assert.deepStrictEqual(AT[1][0], [3, 4])
		assert.deepStrictEqual(A[1][0], [5, 6])
	})

	test('supports explicit outward ULP rounding padding with guaranteed enclosure', () => {
		const A = [
			[[0, 0], [1, 1]],
			[[-1, -1], [Number.MIN_VALUE, Number.MIN_VALUE]],
		]
		const AT = transposeIntervalSeries(A, { ulpPadding: 1 })
		assert.deepStrictEqual(AT[0][0], [-Number.MIN_VALUE, Number.MIN_VALUE])
		assert.deepStrictEqual(AT[1][0], [1 - Number.EPSILON / 2, 1 + Number.EPSILON])
		assert.deepStrictEqual(AT[0][1], [-1 - Number.EPSILON, -1 + Number.EPSILON / 2])
		assert.deepStrictEqual(AT[1][1], [0, 2 * Number.MIN_VALUE])

		// Enclosure check: original transposed endpoints strictly inside padded intervals
		for (let i = 0; i < A.length; i++) {
			for (let j = 0; j < A[0].length; j++) {
				assert.ok(AT[j][i][0] < A[i][j][0])
				assert.ok(AT[j][i][1] > A[i][j][1])
			}
		}

		// Outward padding at ±MAX_VALUE safely encloses using ±Infinity
		const extreme = [[[-Number.MAX_VALUE, Number.MAX_VALUE]]]
		const paddedExtreme = transposeIntervalSeries(extreme, { ulpPadding: 1 })
		assert.deepStrictEqual(paddedExtreme, [[[-Infinity, Infinity]]])
	})

	test('handles larger rectangular matrices (20x35 -> 35x20)', () => {
		const rows = 20
		const cols = 35
		const A = Array.from({ length: rows }, (_, i) =>
			Array.from({ length: cols }, (_, j) => [i * 100 - j, i * 100 - j + 0.5]),
		)
		const AT = transposeIntervalSeries(A)
		assert.equal(AT.length, cols)
		assert.equal(AT[0].length, rows)
		for (let i = 0; i < rows; i++) {
			for (let j = 0; j < cols; j++) {
				assert.deepStrictEqual(AT[j][i], A[i][j])
			}
		}
	})
})

describe('transposeIntervalSeries — input validation errors', () => {
	test('throws TypeError for non-array matrix', () => {
		for (const bad of [null, undefined, 123, 'matrix', {}, true]) {
			assert.throws(() => transposeIntervalSeries(bad), TypeError)
		}
	})

	test('throws RangeError for empty matrix or empty rows', () => {
		assert.throws(() => transposeIntervalSeries([]), RangeError)
		assert.throws(() => transposeIntervalSeries([[]]), RangeError)
		assert.throws(() => transposeIntervalSeries([[], []]), RangeError)
	})

	test('throws TypeError for non-array row', () => {
		assert.throws(() => transposeIntervalSeries([123]), TypeError)
		assert.throws(() => transposeIntervalSeries([[[0, 1]], null]), TypeError)
	})

	test('throws RangeError for jagged matrices', () => {
		assert.throws(
			() =>
				transposeIntervalSeries([
					[[0, 1], [2, 3]],
					[[4, 5]],
				]),
			RangeError,
		)
	})

	test('throws TypeError or RangeError for malformed interval entries', () => {
		assert.throws(() => transposeIntervalSeries([[42]]), TypeError)
		assert.throws(() => transposeIntervalSeries([[{ lo: 0, hi: 1 }]]), TypeError)
		assert.throws(() => transposeIntervalSeries([[[]]]), RangeError)
		assert.throws(() => transposeIntervalSeries([[[1]]]), RangeError)
		assert.throws(() => transposeIntervalSeries([[[1, 2, 3]]]), RangeError)
	})

	test('throws TypeError for non-number interval endpoints', () => {
		assert.throws(() => transposeIntervalSeries([[['0', 1]]]), TypeError)
		assert.throws(() => transposeIntervalSeries([[[0, null]]]), TypeError)
		assert.throws(() => transposeIntervalSeries([[[undefined, 1]]]), TypeError)
	})

	test('throws RangeError for NaN or infinite endpoints', () => {
		assert.throws(() => transposeIntervalSeries([[[NaN, 1]]]), RangeError)
		assert.throws(() => transposeIntervalSeries([[[0, NaN]]]), RangeError)
		assert.throws(() => transposeIntervalSeries([[[-Infinity, 0]]]), RangeError)
		assert.throws(() => transposeIntervalSeries([[[0, Infinity]]]), RangeError)
	})

	test('throws RangeError for inverted intervals (lo > hi)', () => {
		assert.throws(() => transposeIntervalSeries([[[2, 1]]]), RangeError)
		assert.throws(() => transposeIntervalSeries([[[1e-15, -1e-15]]]), RangeError)
	})

	test('validates options argument', () => {
		const valid = [[[0, 1]]]
		assert.throws(() => transposeIntervalSeries(valid, null), TypeError)
		assert.throws(() => transposeIntervalSeries(valid, []), TypeError)
		assert.throws(() => transposeIntervalSeries(valid, 'bad'), TypeError)
		assert.throws(() => transposeIntervalSeries(valid, { ulpPadding: '1' }), TypeError)
		assert.throws(() => transposeIntervalSeries(valid, { ulpPadding: -1 }), RangeError)
		assert.throws(() => transposeIntervalSeries(valid, { ulpPadding: 1.5 }), RangeError)
		assert.throws(() => transposeIntervalSeries(valid, { ulpPadding: Infinity }), RangeError)
	})
})

describe('transposeIntervalSeries — independent cross-checks', () => {
	test('involution identity (A^T)^T = A across varied random shapes', () => {
		const rng = makeRng(0x5eed1234)
		const shapes = [
			[1, 1],
			[1, 5],
			[5, 1],
			[2, 4],
			[4, 2],
			[4, 4],
			[6, 3],
		]

		for (const [m, n] of shapes) {
			const A = Array.from({ length: m }, () =>
				Array.from({ length: n }, () => {
					const a = (rng() - 0.5) * 200
					const width = rng() * 10
					return [a, a + width]
				}),
			)
			const AT = transposeIntervalSeries(A)
			const ATT = transposeIntervalSeries(AT)
			assert.deepStrictEqual(ATT, A)
		}
	})

	test('point-matrix sampling enclosure and corner-extremum tightness', () => {
		const rng = makeRng(0xcafe4321)
		const m = 3
		const n = 4
		const A = Array.from({ length: m }, () =>
			Array.from({ length: n }, () => {
				const lo = (rng() - 0.5) * 50
				const hi = lo + rng() * 5
				return [lo, hi]
			}),
		)

		const AT = transposeIntervalSeries(A)
		const ATWide = transposeIntervalSeries(A, { ulpPadding: 2 })

		// Track empirical min/max over sampled point matrices (including all-lo and all-hi corners)
		const minSeen = Array.from({ length: n }, () => new Array(m).fill(Infinity))
		const maxSeen = Array.from({ length: n }, () => new Array(m).fill(-Infinity))

		const samples = 200
		for (let s = 0; s < samples; s++) {
			const P = Array.from({ length: m }, (_, i) =>
				Array.from({ length: n }, (_, j) => {
					const [lo, hi] = A[i][j]
					if (s === 0) return lo
					if (s === 1) return hi
					const t = rng()
					const x = lo + t * (hi - lo)
					return Math.min(hi, Math.max(lo, x))
				}),
			)
			const PT = scalarTranspose(P)

			for (let j = 0; j < n; j++) {
				for (let i = 0; i < m; i++) {
					const v = PT[j][i]
					assert.ok(
						AT[j][i][0] <= v && v <= AT[j][i][1],
						`PT[${j}][${i}]=${v} not enclosed in [${AT[j][i][0]}, ${AT[j][i][1]}]`,
					)
					assert.ok(
						ATWide[j][i][0] <= v && v <= ATWide[j][i][1],
						`PT[${j}][${i}]=${v} not enclosed in padded interval`,
					)
					if (v < minSeen[j][i]) minSeen[j][i] = v
					if (v > maxSeen[j][i]) maxSeen[j][i] = v
				}
			}
		}

		// Tightness: corner samples hit exact lo and hi bounds
		for (let j = 0; j < n; j++) {
			for (let i = 0; i < m; i++) {
				assert.equal(minSeen[j][i], AT[j][i][0])
				assert.equal(maxSeen[j][i], AT[j][i][1])
			}
		}
	})

	test('matches independent canonical-basis sum transpose and preserves midpoint/width', () => {
		const A = [
			[[-3.25, -1.75], [0.5, 2.5], [10, 10]],
			[[4.125, 6.875], [-0.5, 0.5], [-8, -2]],
		]
		const AT = transposeIntervalSeries(A)
		const basisAT = basisSumTranspose(A)

		assert.deepStrictEqual(AT, basisAT)

		for (let i = 0; i < A.length; i++) {
			for (let j = 0; j < A[0].length; j++) {
				const midA = (A[i][j][0] + A[i][j][1]) / 2
				const midAT = (AT[j][i][0] + AT[j][i][1]) / 2
				const widA = A[i][j][1] - A[i][j][0]
				const widAT = AT[j][i][1] - AT[j][i][0]
				assert.equal(midAT, midA)
				assert.equal(widAT, widA)
			}
		}
	})
})
