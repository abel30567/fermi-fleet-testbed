import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeDualRecursive } from './transposeDualRecursive.js'

/**
 * Independent iterative reference transpose for cross-checking.
 *
 * @param {{ v: number, d: number }[][]} m
 * @returns {{ v: number, d: number }[][]}
 */
function iterativeTranspose(m) {
	const rows = m.length
	const cols = m[0].length
	const out = []
	for (let c = 0; c < cols; c++) {
		const row = []
		for (let r = 0; r < rows; r++) {
			row.push({ v: m[r][c].v, d: m[r][c].d })
		}
		out.push(row)
	}
	return out
}

/**
 * Deterministic generator for m×n dual matrices.
 *
 * @param {number} rows
 * @param {number} cols
 * @returns {{ v: number, d: number }[][]}
 */
function makeDualMatrix(rows, cols) {
	const m = []
	for (let r = 0; r < rows; r++) {
		const row = []
		for (let c = 0; c < cols; c++) {
			const v = ((r * 31 + c * 17) % 23) - 11 + (r + c) * 0.25
			const d = ((r * 13 - c * 7) % 19) * 0.5
			row.push({ v, d })
		}
		m.push(row)
	}
	return m
}

describe('transposeDualRecursive', () => {
	describe('normal cases', () => {
		test('transposes a 2x2 square dual matrix', () => {
			const input = [
				[{ v: 1, d: 0.5 }, { v: 2, d: -1 }],
				[{ v: 3, d: 4 }, { v: -4, d: 0 }],
			]
			const expected = [
				[{ v: 1, d: 0.5 }, { v: 3, d: 4 }],
				[{ v: 2, d: -1 }, { v: -4, d: 0 }],
			]
			assert.deepStrictEqual(transposeDualRecursive(input), expected)
		})

		test('transposes a 4x4 square dual matrix', () => {
			const input = makeDualMatrix(4, 4)
			assert.deepStrictEqual(
				transposeDualRecursive(input),
				iterativeTranspose(input)
			)
		})

		test('transposes a 2x3 rectangular dual matrix to 3x2', () => {
			const input = [
				[{ v: 1, d: 10 }, { v: 2, d: 20 }, { v: 3, d: 30 }],
				[{ v: 4, d: 40 }, { v: 5, d: 50 }, { v: 6, d: 60 }],
			]
			const expected = [
				[{ v: 1, d: 10 }, { v: 4, d: 40 }],
				[{ v: 2, d: 20 }, { v: 5, d: 50 }],
				[{ v: 3, d: 30 }, { v: 6, d: 60 }],
			]
			const out = transposeDualRecursive(input)
			assert.equal(out.length, 3)
			assert.equal(out[0].length, 2)
			assert.deepStrictEqual(out, expected)
		})

		test('transposes a 3x2 rectangular dual matrix to 2x3', () => {
			const input = [
				[{ v: 1, d: 10 }, { v: 4, d: 40 }],
				[{ v: 2, d: 20 }, { v: 5, d: 50 }],
				[{ v: 3, d: 30 }, { v: 6, d: 60 }],
			]
			const expected = [
				[{ v: 1, d: 10 }, { v: 2, d: 20 }, { v: 3, d: 30 }],
				[{ v: 4, d: 40 }, { v: 5, d: 50 }, { v: 6, d: 60 }],
			]
			assert.deepStrictEqual(transposeDualRecursive(input), expected)
		})
	})

	describe('edge cases', () => {
		test('handles 1x1 matrix', () => {
			const input = [[{ v: -7.5, d: 3.25 }]]
			const out = transposeDualRecursive(input)
			assert.deepStrictEqual(out, [[{ v: -7.5, d: 3.25 }]])
			assert.notStrictEqual(out, input)
			assert.notStrictEqual(out[0], input[0])
			assert.notStrictEqual(out[0][0], input[0][0])
		})

		test('handles row vector (1xn -> nx1)', () => {
			const input = [
				[
					{ v: 1, d: 0.1 },
					{ v: 2, d: 0.2 },
					{ v: 3, d: 0.3 },
					{ v: 4, d: 0.4 },
					{ v: 5, d: 0.5 },
				],
			]
			const expected = [
				[{ v: 1, d: 0.1 }],
				[{ v: 2, d: 0.2 }],
				[{ v: 3, d: 0.3 }],
				[{ v: 4, d: 0.4 }],
				[{ v: 5, d: 0.5 }],
			]
			assert.deepStrictEqual(transposeDualRecursive(input), expected)
		})

		test('handles column vector (nx1 -> 1xn)', () => {
			const input = [
				[{ v: 1, d: -1 }],
				[{ v: 2, d: -2 }],
				[{ v: 3, d: -3 }],
				[{ v: 4, d: -4 }],
				[{ v: 5, d: -5 }],
			]
			const expected = [
				[
					{ v: 1, d: -1 },
					{ v: 2, d: -2 },
					{ v: 3, d: -3 },
					{ v: 4, d: -4 },
					{ v: 5, d: -5 },
				],
			]
			assert.deepStrictEqual(transposeDualRecursive(input), expected)
		})

		test('handles odd dimensions (3x3, 3x5, 5x3, 7x9)', () => {
			for (const [r, c] of [
				[3, 3],
				[3, 5],
				[5, 3],
				[7, 9],
			]) {
				const input = makeDualMatrix(r, c)
				const out = transposeDualRecursive(input)
				assert.equal(out.length, c)
				assert.equal(out[0].length, r)
				assert.deepStrictEqual(out, iterativeTranspose(input))
			}
		})

		test('returns freshly cloned dual objects without aliasing input', () => {
			const input = makeDualMatrix(3, 4)
			const snapshot = structuredClone(input)
			const out = transposeDualRecursive(input)

			for (let r = 0; r < input.length; r++) {
				for (let c = 0; c < input[0].length; c++) {
					assert.notStrictEqual(out[c][r], input[r][c])
				}
			}

			// Mutate output and verify input is untouched
			out[0][0].v = 9999
			out[0][0].d = -9999
			out[1][2].v = 12345
			assert.deepStrictEqual(input, snapshot)

			// Mutate input and verify a fresh output is unaffected by subsequent input mutation
			const out2 = transposeDualRecursive(input)
			const out2Snapshot = structuredClone(out2)
			input[0][1].v = -7777
			input[0][1].d = 8888
			assert.deepStrictEqual(out2, out2Snapshot)
		})
	})

	describe('input validation', () => {
		test('rejects non-array matrix inputs', () => {
			for (const bad of [null, undefined, 42, 'matrix', { v: 1, d: 2 }]) {
				assert.throws(() => transposeDualRecursive(bad), TypeError)
			}
		})

		test('rejects empty matrix and empty rows', () => {
			assert.throws(() => transposeDualRecursive([]), RangeError)
			assert.throws(() => transposeDualRecursive([[]]), RangeError)
			assert.throws(() => transposeDualRecursive([[], []]), RangeError)
		})

		test('rejects non-array rows', () => {
			assert.throws(
				() => transposeDualRecursive([{ v: 1, d: 0 }]),
				TypeError
			)
			assert.throws(
				() => transposeDualRecursive([[{ v: 1, d: 0 }], null]),
				TypeError
			)
		})

		test('rejects ragged matrices', () => {
			const raggedShort = [
				[{ v: 1, d: 0 }, { v: 2, d: 0 }],
				[{ v: 3, d: 0 }],
			]
			const raggedLong = [
				[{ v: 1, d: 0 }],
				[{ v: 2, d: 0 }, { v: 3, d: 0 }],
			]
			assert.throws(() => transposeDualRecursive(raggedShort), RangeError)
			assert.throws(() => transposeDualRecursive(raggedLong), RangeError)
		})

		test('rejects invalid dual entries and sparse arrays', () => {
			const sparseRow = new Array(2)
			sparseRow[0] = { v: 1, d: 0 }
			assert.throws(() => transposeDualRecursive([sparseRow]), TypeError)

			assert.throws(() => transposeDualRecursive([[null]]), TypeError)
			assert.throws(() => transposeDualRecursive([[42]]), TypeError)
			assert.throws(() => transposeDualRecursive([[[1, 2]]]), TypeError)
			assert.throws(() => transposeDualRecursive([[{ v: 1 }]]), TypeError)
			assert.throws(() => transposeDualRecursive([[{ d: 1 }]]), TypeError)
			assert.throws(
				() => transposeDualRecursive([[{ v: '1', d: 0 }]]),
				TypeError
			)
			assert.throws(
				() => transposeDualRecursive([[{ v: 1, d: null }]]),
				TypeError
			)
		})

		test('rejects non-finite dual values and derivatives', () => {
			for (const bad of [NaN, Infinity, -Infinity]) {
				assert.throws(
					() => transposeDualRecursive([[{ v: bad, d: 0 }]]),
					RangeError
				)
				assert.throws(
					() => transposeDualRecursive([[{ v: 0, d: bad }]]),
					RangeError
				)
			}
		})
	})

	describe('cross-checks', () => {
		test('satisfies involution T(T(M)) == M across diverse shapes', () => {
			const shapes = [
				[1, 1],
				[1, 7],
				[7, 1],
				[2, 2],
				[3, 4],
				[5, 3],
				[8, 8],
				[11, 13],
				[17, 6],
			]
			for (const [r, c] of shapes) {
				const m = makeDualMatrix(r, c)
				const t = transposeDualRecursive(m)
				const tt = transposeDualRecursive(t)
				assert.deepStrictEqual(tt, m)
			}
		})

		test('matches independent iterative transpose across large non-power-of-two shapes', () => {
			for (const [r, c] of [
				[13, 19],
				[19, 13],
				[16, 16],
				[1, 29],
				[29, 1],
			]) {
				const m = makeDualMatrix(r, c)
				assert.deepStrictEqual(
					transposeDualRecursive(m),
					iterativeTranspose(m)
				)
			}
		})

		test('preserves forward-mode derivative of M(t) = A + t*B under transpose', () => {
			// Verify d/dt (A + t*B)^T = B^T using dual number evaluation at t = 2.5
			const A = [
				[1, -2, 3.5],
				[4, 0, -1.25],
			]
			const B = [
				[0.5, 2, -1],
				[-3, 1.5, 4],
			]
			const t = 2.5
			const dualM = A.map((row, r) =>
				row.map((a, c) => ({ v: a + t * B[r][c], d: B[r][c] }))
			)

			const transposed = transposeDualRecursive(dualM)
			assert.equal(transposed.length, 3)
			assert.equal(transposed[0].length, 2)

			for (let c = 0; c < 3; c++) {
				for (let r = 0; r < 2; r++) {
					assert.equal(transposed[c][r].v, A[r][c] + t * B[r][c])
					assert.equal(transposed[c][r].d, B[r][c])
				}
			}
		})
	})
})
