import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { setDifferenceIntervalIterative } from './setDifferenceIntervalIterative.js'

/**
 * Check whether point `x` belongs to any interval in `intervals`.
 * @param {Array<[number, number]>} intervals
 * @param {number} x
 * @returns {boolean}
 */
function containsPoint(intervals, x) {
	for (const [lo, hi] of intervals) {
		if (x >= lo && x <= hi) {
			return true
		}
	}
	return false
}

/**
 * Deterministic PRNG (Mulberry32) for reproducible cross-check tests.
 * @param {number} seed
 * @returns {() => number}
 */
function mulberry32(seed) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = Math.imul(state ^ (state >>> 15), 1 | state)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

/**
 * Verify that an interval array is strictly normalized and merged.
 * @param {Array<[number, number]>} intervals
 */
function assertNormalized(intervals) {
	for (let i = 0; i < intervals.length; i++) {
		const [lo, hi] = intervals[i]
		assert.equal(typeof lo, 'number')
		assert.equal(typeof hi, 'number')
		assert.ok(Number.isFinite(lo) && Number.isFinite(hi))
		assert.ok(lo <= hi, `interval [${lo}, ${hi}] must have lo <= hi`)
		if (i > 0) {
			assert.ok(
				intervals[i - 1][1] < lo,
				`intervals must be strictly sorted and non-touching: [${intervals[i - 1]}] vs [${lo}, ${hi}]`,
			)
		}
	}
}

describe('setDifferenceIntervalIterative', () => {
	describe('normal cases', () => {
		it('trims left, right, and splits middle when subtracting overlapping intervals', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[0, 10]], [[3, 7]]),
				[
					[0, 3],
					[7, 10],
				],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[0, 10]], [[-2, 4]]),
				[[4, 10]],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[0, 10]], [[6, 15]]),
				[[0, 6]],
			)
		})

		it('handles multiple punches out of one interval and one subtrahend spanning multiple intervals', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[[0, 20]],
					[
						[2, 4],
						[6, 10],
						[15, 18],
					],
				),
				[
					[0, 2],
					[4, 6],
					[10, 15],
					[18, 20],
				],
			)

			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[0, 4],
						[6, 10],
						[12, 16],
					],
					[[2, 14]],
				),
				[
					[0, 2],
					[14, 16],
				],
			)
		})

		it('normalizes unsorted, overlapping, and touching inputs before differencing', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[10, 15],
						[0, 5],
						[3, 10],
					],
					[
						[8, 12],
						[2, 4],
						[4, 6],
					],
				),
				[
					[0, 2],
					[6, 8],
					[12, 15],
				],
			)
		})

		it('returns normalized A when A and B are completely disjoint', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[10, 12],
						[0, 2],
						[1, 3],
					],
					[
						[-5, -1],
						[5, 8],
						[20, 25],
					],
				),
				[
					[0, 3],
					[10, 12],
				],
			)
		})

		it('returns empty array when B completely covers A', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[1, 3],
						[5, 8],
					],
					[[0, 10]],
				),
				[],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[1, 3],
						[5, 8],
					],
					[
						[1, 3],
						[5, 8],
					],
				),
				[],
			)
		})

		it('handles negative numbers and fractional floating-point endpoints', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[-10.5, -2.5],
						[-1.25, 3.75],
					],
					[
						[-8.25, -4.5],
						[-3.0, 0.5],
					],
				),
				[
					[-10.5, -8.25],
					[-4.5, -3.0],
					[0.5, 3.75],
				],
			)
		})

		it('does not mutate input arrays or their nested interval tuples', () => {
			const a = [
				[5, 10],
				[0, 6],
			]
			const b = [
				[7, 9],
				[1, 3],
			]
			const aSnapshot = structuredClone(a)
			const bSnapshot = structuredClone(b)

			const diff = setDifferenceIntervalIterative(a, b)
			assert.deepStrictEqual(a, aSnapshot)
			assert.deepStrictEqual(b, bSnapshot)
			assert.deepStrictEqual(diff, [
				[0, 1],
				[3, 7],
				[9, 10],
			])
		})
	})

	describe('edge cases', () => {
		it('handles empty inputs', () => {
			assert.deepStrictEqual(setDifferenceIntervalIterative([], []), [])
			assert.deepStrictEqual(setDifferenceIntervalIterative([], [[0, 5]]), [])
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[4, 6],
						[0, 2],
						[2, 5],
					],
					[],
				),
				[[0, 6]],
			)
		})

		it('handles touching boundary intervals between A and B', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[0, 5]], [[5, 10]]),
				[[0, 5]],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[5, 10]], [[0, 5]]),
				[[5, 10]],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[0, 10],
						[12, 20],
					],
					[[10, 15]],
				),
				[
					[0, 10],
					[15, 20],
				],
			)
		})

		it('handles degenerate point intervals [x, x] consistently', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[2, 2]], []),
				[[2, 2]],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[2, 2]], [[2, 2]]),
				[],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[2, 2]], [[0, 5]]),
				[],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[2, 2]], [[0, 2]]),
				[],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[2, 2]], [[2, 5]]),
				[],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative([[2, 2]], [[3, 5]]),
				[[2, 2]],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[[0, 10]],
					[
						[0, 0],
						[5, 5],
						[10, 10],
					],
				),
				[[0, 10]],
			)
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[
						[0, 5],
						[5, 5],
						[10, 10],
					],
					[
						[5, 5],
						[10, 10],
					],
				),
				[[0, 5]],
			)
		})

		it('normalizes negative zero to positive zero', () => {
			const res = setDifferenceIntervalIterative([[-0, 5]], [[2, 5]])
			assert.deepStrictEqual(res, [[0, 2]])
			assert.ok(Object.is(res[0][0], 0))
		})

		it('handles extreme finite numbers and large interval counts iteratively', () => {
			assert.deepStrictEqual(
				setDifferenceIntervalIterative(
					[[-Number.MAX_VALUE, Number.MAX_VALUE]],
					[[0, Number.MAX_VALUE]],
				),
				[[-Number.MAX_VALUE, 0]],
			)

			const count = 2000
			const a = []
			const b = []
			const expected = []
			for (let k = 0; k < count; k++) {
				const base = k * 10
				a.push([base, base + 8])
				b.push([base + 3, base + 5])
				expected.push([base, base + 3], [base + 5, base + 8])
			}
			const actual = setDifferenceIntervalIterative(a, b)
			assert.deepStrictEqual(actual, expected)
			assertNormalized(actual)
		})
	})

	describe('invalid input errors', () => {
		it('throws TypeError when a or b is not an array', () => {
			for (const bad of [null, undefined, 42, '[]', {}, new Set()]) {
				assert.throws(() => setDifferenceIntervalIterative(bad, []), TypeError)
				assert.throws(() => setDifferenceIntervalIterative([], bad), TypeError)
			}
		})

		it('throws TypeError when an interval element is not an array or is sparse', () => {
			assert.throws(() => setDifferenceIntervalIterative([null], []), TypeError)
			assert.throws(() => setDifferenceIntervalIterative([{ lo: 0, hi: 1 }], []), TypeError)
			assert.throws(() => setDifferenceIntervalIterative([], [123]), TypeError)

			const sparse = new Array(2)
			sparse[1] = [0, 1]
			assert.throws(() => setDifferenceIntervalIterative(sparse, []), TypeError)
		})

		it('throws RangeError when an interval does not have length 2', () => {
			assert.throws(() => setDifferenceIntervalIterative([[]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([[1]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([[1, 2, 3]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([], [[1, 2, 3]]), RangeError)
		})

		it('throws TypeError when interval endpoints are not numbers', () => {
			assert.throws(() => setDifferenceIntervalIterative([['0', 1]], []), TypeError)
			assert.throws(() => setDifferenceIntervalIterative([[0, null]], []), TypeError)
			assert.throws(() => setDifferenceIntervalIterative([[undefined, 1]], []), TypeError)
			assert.throws(() => setDifferenceIntervalIterative([], [[0, 1n]]), TypeError)
		})

		it('throws RangeError when endpoints are non-finite or lo > hi', () => {
			assert.throws(() => setDifferenceIntervalIterative([[NaN, 1]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([[0, NaN]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([[-Infinity, 1]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([[0, Infinity]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([[5, 2]], []), RangeError)
			assert.throws(() => setDifferenceIntervalIterative([], [[10, -1]]), RangeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches point-sampling membership across a half-integer grid on randomized sets', () => {
			const rand = mulberry32(0x5e7d1ff)
			const minCoord = -20
			const maxCoord = 20

			const randomIntervals = () => {
				const n = Math.floor(rand() * 12)
				const out = []
				for (let i = 0; i < n; i++) {
					const x = minCoord + Math.floor(rand() * (maxCoord - minCoord + 1))
					const y = minCoord + Math.floor(rand() * (maxCoord - minCoord + 1))
					out.push(x <= y ? [x, y] : [y, x])
				}
				return out
			}

			for (let trial = 0; trial < 80; trial++) {
				const a = randomIntervals()
				const b = randomIntervals()
				const diff = setDifferenceIntervalIterative(a, b)

				assertNormalized(diff)

				// Sample every half-integer x = k + 0.5 (never an integer endpoint).
				for (let k = minCoord - 1; k <= maxCoord; k++) {
					const x = k + 0.5
					const expected = containsPoint(a, x) && !containsPoint(b, x)
					const actual = containsPoint(diff, x)
					assert.equal(
						actual,
						expected,
						`trial ${trial}, x=${x}: expected ${expected}, got ${actual}`,
					)
				}
			}
		})

		it('matches an independent unit-cell rasterization oracle on non-degenerate integer intervals', () => {
			const rand = mulberry32(0x1a2b3c4d)
			const minCoord = -15
			const maxCoord = 15
			const span = maxCoord - minCoord

			const rasterize = (intervals) => {
				const cells = new Uint8Array(span)
				for (const [lo, hi] of intervals) {
					for (let c = lo; c < hi; c++) {
						cells[c - minCoord] = 1
					}
				}
				return cells
			}

			const decode = (cells) => {
				const out = []
				let i = 0
				while (i < cells.length) {
					if (cells[i] === 1) {
						const start = i
						while (i < cells.length && cells[i] === 1) {
							i++
						}
						out.push([start + minCoord, i + minCoord])
					} else {
						i++
					}
				}
				return out
			}

			const randomNonDegenerate = () => {
				const n = Math.floor(rand() * 10)
				const out = []
				for (let i = 0; i < n; i++) {
					const lo = minCoord + Math.floor(rand() * span)
					const hi = lo + 1 + Math.floor(rand() * (maxCoord - lo))
					out.push([lo, hi])
				}
				return out
			}

			for (let trial = 0; trial < 60; trial++) {
				const a = randomNonDegenerate()
				const b = randomNonDegenerate()

				const cellsA = rasterize(a)
				const cellsB = rasterize(b)
				const cellsDiff = new Uint8Array(span)
				for (let i = 0; i < span; i++) {
					cellsDiff[i] = cellsA[i] && !cellsB[i] ? 1 : 0
				}

				const expected = decode(cellsDiff)
				const actual = setDifferenceIntervalIterative(a, b)
				assert.deepStrictEqual(actual, expected, `mismatch on trial ${trial}`)

				// Idempotence check: (A \ B) \ B === A \ B
				assert.deepStrictEqual(
					setDifferenceIntervalIterative(actual, b),
					actual,
					`idempotence failed on trial ${trial}`,
				)
			}
		})
	})
})
