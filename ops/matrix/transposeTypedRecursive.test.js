import { describe, it } from 'node:test'
import assert from 'node:assert'
import { transposeTypedRecursive } from './transposeTypedRecursive.js'

/**
 * Independent nested-loop reference implementation for cross-checking.
 *
 * @param {Float64Array} matrix
 * @param {number} rows
 * @param {number} cols
 * @returns {Float64Array}
 */
function referenceTranspose(matrix, rows, cols) {
	const out = new Float64Array(rows * cols)
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			out[c * rows + r] = matrix[r * cols + c]
		}
	}
	return out
}

describe('transposeTypedRecursive', () => {
	describe('normal cases', () => {
		it('transposes a 1x1 matrix', () => {
			const input = new Float64Array([42.5])
			const result = transposeTypedRecursive(input, 1, 1)
			assert.ok(result instanceof Float64Array)
			assert.notStrictEqual(result, input)
			assert.deepStrictEqual(result, new Float64Array([42.5]))
		})

		it('transposes square matrices (2x2 and 3x3)', () => {
			const m2 = new Float64Array([1, 2, 3, 4])
			assert.deepStrictEqual(
				transposeTypedRecursive(m2, 2, 2),
				new Float64Array([1, 3, 2, 4])
			)

			const m3 = new Float64Array([
				1, 2, 3,
				4, 5, 6,
				7, 8, 9,
			])
			assert.deepStrictEqual(
				transposeTypedRecursive(m3, 3, 3),
				new Float64Array([
					1, 4, 7,
					2, 5, 8,
					3, 6, 9,
				])
			)
		})

		it('transposes rectangular 2x5 and 5x2 matrices', () => {
			const m2x5 = new Float64Array([
				1, 2, 3, 4, 5,
				6, 7, 8, 9, 10,
			])
			const expected5x2 = new Float64Array([
				1, 6,
				2, 7,
				3, 8,
				4, 9,
				5, 10,
			])

			const actual5x2 = transposeTypedRecursive(m2x5, 2, 5)
			assert.deepStrictEqual(actual5x2, expected5x2)

			const actual2x5 = transposeTypedRecursive(expected5x2, 5, 2)
			assert.deepStrictEqual(actual2x5, m2x5)
		})

		it('transposes a larger 17x13 matrix exercising multi-level recursion', () => {
			const rows = 17
			const cols = 13
			const input = new Float64Array(rows * cols)
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					input[r * cols + c] = r * 100 + c + 0.25
				}
			}

			const result = transposeTypedRecursive(input, rows, cols)
			assert.strictEqual(result.length, rows * cols)
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					assert.strictEqual(result[c * rows + r], input[r * cols + c])
				}
			}
		})

		it('preserves special IEEE 754 floating-point values', () => {
			const input = new Float64Array([
				NaN, -0, Infinity,
				-Infinity, 0, Number.MIN_VALUE,
			])
			const result = transposeTypedRecursive(input, 2, 3)

			assert.ok(Number.isNaN(result[0]))
			assert.strictEqual(result[1], -Infinity)
			assert.ok(Object.is(result[2], -0))
			assert.ok(Object.is(result[3], 0))
			assert.strictEqual(result[4], Infinity)
			assert.strictEqual(result[5], Number.MIN_VALUE)
		})
	})

	describe('edge cases', () => {
		it('handles empty matrices (0x0, 0x5, 5x0)', () => {
			const empty = new Float64Array(0)
			for (const [r, c] of [[0, 0], [0, 5], [5, 0]]) {
				const result = transposeTypedRecursive(empty, r, c)
				assert.ok(result instanceof Float64Array)
				assert.notStrictEqual(result, empty)
				assert.strictEqual(result.length, 0)
			}
		})

		it('handles row vectors (1xN) and column vectors (Nx1)', () => {
			const vec = new Float64Array([10, 20, 30, 40, 50, 60, 70])
			const col = transposeTypedRecursive(vec, 1, 7)
			assert.deepStrictEqual(col, vec)
			assert.notStrictEqual(col, vec)

			const row = transposeTypedRecursive(vec, 7, 1)
			assert.deepStrictEqual(row, vec)
			assert.notStrictEqual(row, vec)
		})

		it('handles subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([99, 1, 2, 3, 4, 5, 6, 88])
			const view = backing.subarray(1, 7)
			const result = transposeTypedRecursive(view, 2, 3)
			assert.deepStrictEqual(result, new Float64Array([1, 4, 2, 5, 3, 6]))
		})

		it('does not mutate the input matrix', () => {
			const original = new Float64Array([1.5, -2.5, 3.5, 4.5, 5.5, 6.5])
			const snapshot = new Float64Array(original)
			const result = transposeTypedRecursive(original, 2, 3)

			assert.deepStrictEqual(original, snapshot)
			result[0] = 999
			assert.deepStrictEqual(original, snapshot)
		})

		it('throws TypeError for invalid argument types', () => {
			const valid = new Float64Array([1, 2, 3, 4])

			assert.throws(() => transposeTypedRecursive([1, 2, 3, 4], 2, 2), TypeError)
			assert.throws(() => transposeTypedRecursive(new Float32Array([1, 2, 3, 4]), 2, 2), TypeError)
			assert.throws(() => transposeTypedRecursive(new Int32Array([1, 2, 3, 4]), 2, 2), TypeError)
			assert.throws(() => transposeTypedRecursive(null, 0, 0), TypeError)
			assert.throws(() => transposeTypedRecursive(undefined, 0, 0), TypeError)
			assert.throws(() => transposeTypedRecursive('1234', 2, 2), TypeError)

			assert.throws(() => transposeTypedRecursive(valid, '2', 2), TypeError)
			assert.throws(() => transposeTypedRecursive(valid, null, 2), TypeError)
			assert.throws(() => transposeTypedRecursive(valid, undefined, 2), TypeError)
			assert.throws(() => transposeTypedRecursive(valid, 2n, 2), TypeError)

			assert.throws(() => transposeTypedRecursive(valid, 2, '2'), TypeError)
			assert.throws(() => transposeTypedRecursive(valid, 2, null), TypeError)
			assert.throws(() => transposeTypedRecursive(valid, 2, undefined), TypeError)
			assert.throws(() => transposeTypedRecursive(valid, 2, 2n), TypeError)
		})

		it('throws RangeError for invalid dimensions or mismatched length', () => {
			const valid = new Float64Array([1, 2, 3, 4])
			const empty = new Float64Array(0)

			assert.throws(() => transposeTypedRecursive(empty, -1, 0), RangeError)
			assert.throws(() => transposeTypedRecursive(empty, 0, -1), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, -2, -2), RangeError)

			assert.throws(() => transposeTypedRecursive(valid, 1.5, 2), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, 2, 2.5), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, NaN, 2), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, 2, NaN), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, Infinity, 2), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, 2, -Infinity), RangeError)
			assert.throws(() => transposeTypedRecursive(empty, Number.MAX_SAFE_INTEGER + 1, 0), RangeError)
			assert.throws(() => transposeTypedRecursive(empty, 0, Number.MAX_SAFE_INTEGER + 1), RangeError)

			assert.throws(() => transposeTypedRecursive(valid, 2, 3), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, 1, 3), RangeError)
			assert.throws(() => transposeTypedRecursive(valid, 0, 4), RangeError)
			assert.throws(() => transposeTypedRecursive(empty, 1, 1), RangeError)
		})
	})

	describe('cross-checks', () => {
		const shapes = [
			[0, 0],
			[0, 4],
			[4, 0],
			[1, 1],
			[1, 9],
			[9, 1],
			[2, 5],
			[5, 2],
			[8, 8],
			[17, 13],
			[13, 17],
			[29, 23],
		]

		it('satisfies double-transpose involution transpose(transpose(M)) === M', () => {
			for (const [rows, cols] of shapes) {
				const m = new Float64Array(rows * cols)
				for (let i = 0; i < m.length; i++) {
					m[i] = Math.sin(i * 0.7) * 1000
				}

				const t1 = transposeTypedRecursive(m, rows, cols)
				const t2 = transposeTypedRecursive(t1, cols, rows)
				assert.deepStrictEqual(t2, m, `involution failed for ${rows}x${cols}`)
			}
		})

		it('matches independent nested-loop reference transpose across shapes', () => {
			for (const [rows, cols] of shapes) {
				const m = new Float64Array(rows * cols)
				for (let i = 0; i < m.length; i++) {
					m[i] = (i * 31.125) - (i % 7) * 4.5
				}

				const actual = transposeTypedRecursive(m, rows, cols)
				const expected = referenceTranspose(m, rows, cols)
				assert.deepStrictEqual(actual, expected, `mismatch against reference for ${rows}x${cols}`)
			}
		})
	})
})
