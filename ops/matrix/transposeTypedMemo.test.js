import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeTypedMemo } from './transposeTypedMemo.js'

describe('transposeTypedMemo', () => {
	test('transposes square matrices with explicit and auto-detected dimensions', () => {
		const m2 = new Float64Array([1, 2, 3, 4])
		const expected2 = new Float64Array([1, 3, 2, 4])
		assert.deepStrictEqual(transposeTypedMemo(m2, 2, 2), expected2)
		assert.deepStrictEqual(transposeTypedMemo(m2), expected2)

		const m3 = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9])
		const expected3 = new Float64Array([1, 4, 7, 2, 5, 8, 3, 6, 9])
		assert.deepStrictEqual(transposeTypedMemo(m3, 3, 3), expected3)
		assert.deepStrictEqual(transposeTypedMemo(m3), expected3)
	})

	test('transposes rectangular matrices (precomputed and dynamically cached shapes)', () => {
		// 2x3 -> 3x2 (within precomputed 8x8 table range)
		const m2x3 = new Float64Array([1, 2, 3, 4, 5, 6])
		const expected3x2 = new Float64Array([1, 4, 2, 5, 3, 6])
		const t2x3 = transposeTypedMemo(m2x3, 2, 3)
		assert.ok(t2x3 instanceof Float64Array)
		assert.deepStrictEqual(t2x3, expected3x2)

		// 3x2 -> 2x3
		const t3x2 = transposeTypedMemo(expected3x2, 3, 2)
		assert.deepStrictEqual(t3x2, m2x3)

		// 10x12 -> 12x10 (outside 8x8 precomputed range, exercises dynamic table cache)
		const rows = 10
		const cols = 12
		const rect = new Float64Array(rows * cols)
		for (let i = 0; i < rect.length; i++) rect[i] = i * 1.5 - 20
		const transposed = transposeTypedMemo(rect, rows, cols)
		assert.equal(transposed.length, rect.length)
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				assert.equal(transposed[c * rows + r], rect[r * cols + c])
			}
		}
	})

	test('handles edge cases: 1x1, row vectors, column vectors, and empty matrices', () => {
		// 1x1
		const one = new Float64Array([42.5])
		const oneT = transposeTypedMemo(one)
		assert.deepStrictEqual(oneT, new Float64Array([42.5]))
		assert.notEqual(oneT, one)
		assert.deepStrictEqual(transposeTypedMemo(one, 1, 1), new Float64Array([42.5]))

		// Row vector 1x5 -> 5x1
		const rowVec = new Float64Array([10, 20, 30, 40, 50])
		assert.deepStrictEqual(transposeTypedMemo(rowVec, 1, 5), rowVec)
		assert.notEqual(transposeTypedMemo(rowVec, 1, 5), rowVec)

		// Column vector 5x1 -> 1x5
		const colVec = new Float64Array([-1, -2, -3, -4, -5])
		assert.deepStrictEqual(transposeTypedMemo(colVec, 5, 1), colVec)

		// Empty matrices (0x0, 0xN, Nx0)
		const empty = new Float64Array(0)
		const emptyAuto = transposeTypedMemo(empty)
		assert.ok(emptyAuto instanceof Float64Array)
		assert.equal(emptyAuto.length, 0)
		assert.notEqual(emptyAuto, empty)
		assert.equal(transposeTypedMemo(empty, 0, 0).length, 0)
		assert.equal(transposeTypedMemo(empty, 0, 4).length, 0)
		assert.equal(transposeTypedMemo(empty, 4, 0).length, 0)
	})

	test('preserves special IEEE-754 values (-0, +0, NaN, Infinity) and subarray offsets', () => {
		const special = new Float64Array([-0, 0, Number.NaN, Infinity, -Infinity, Number.MIN_VALUE])
		const t = transposeTypedMemo(special, 2, 3)
		assert.ok(Object.is(t[0], -0))
		assert.ok(Object.is(t[1], Infinity))
		assert.ok(Object.is(t[2], 0))
		assert.ok(Object.is(t[3], -Infinity))
		assert.ok(Number.isNaN(t[4]))
		assert.equal(t[5], Number.MIN_VALUE)

		// Ensure -0 and +0 do not collide in the memoization cache
		const posZero = new Float64Array([0, 1, 2, 3])
		const negZero = new Float64Array([-0, 1, 2, 3])
		const tPos = transposeTypedMemo(posZero, 2, 2)
		const tNeg = transposeTypedMemo(negZero, 2, 2)
		assert.ok(Object.is(tPos[0], 0))
		assert.ok(Object.is(tNeg[0], -0))

		// Subarray view with non-zero byteOffset
		const backing = new Float64Array([99, 98, 1, 2, 3, 4, 5, 6, 97])
		const view = backing.subarray(2, 8)
		assert.equal(view.byteOffset, 16)
		assert.deepStrictEqual(
			transposeTypedMemo(view, 2, 3),
			new Float64Array([1, 4, 2, 5, 3, 6])
		)
	})

	test('enforces strict input validation', () => {
		// Non-Float64Array inputs
		assert.throws(() => transposeTypedMemo([1, 2, 3, 4]), TypeError)
		assert.throws(() => transposeTypedMemo(new Float32Array([1, 2, 3, 4])), TypeError)
		assert.throws(() => transposeTypedMemo(null), TypeError)
		assert.throws(() => transposeTypedMemo(undefined), TypeError)

		// Only one dimension supplied
		const m4 = new Float64Array([1, 2, 3, 4])
		assert.throws(() => transposeTypedMemo(m4, 2), TypeError)
		assert.throws(() => transposeTypedMemo(m4, undefined, 2), TypeError)

		// Non-number dimensions
		assert.throws(() => transposeTypedMemo(m4, '2', 2), TypeError)
		assert.throws(() => transposeTypedMemo(m4, 2, null), TypeError)

		// Invalid numeric dimensions
		assert.throws(() => transposeTypedMemo(m4, -2, -2), RangeError)
		assert.throws(() => transposeTypedMemo(m4, 1.5, 2), RangeError)
		assert.throws(() => transposeTypedMemo(m4, Number.NaN, 2), RangeError)
		assert.throws(() => transposeTypedMemo(m4, Infinity, 2), RangeError)

		// Non-square matrix with omitted dimensions
		assert.throws(() => transposeTypedMemo(new Float64Array([1, 2, 3, 4, 5, 6])), RangeError)

		// Dimension product mismatch
		assert.throws(() => transposeTypedMemo(m4, 2, 3), RangeError)
		assert.throws(() => transposeTypedMemo(new Float64Array(0), 2, 2), RangeError)
	})

	test('memoization returns immutable fresh copies and reflects input mutations', () => {
		const input = new Float64Array([1, 2, 3, 4, 5, 6])

		// First call populates cache; second call hits cache
		const first = transposeTypedMemo(input, 2, 3)
		const second = transposeTypedMemo(input, 2, 3)
		assert.deepStrictEqual(first, second)
		assert.notEqual(first, second)

		// Mutating returned output must NOT corrupt the internal cache
		first[0] = 9999
		first[5] = -8888
		const third = transposeTypedMemo(input, 2, 3)
		assert.deepStrictEqual(third, new Float64Array([1, 4, 2, 5, 3, 6]))

		// Same flat bytes with different dimensions must NOT collide in cache
		const as3x2 = transposeTypedMemo(input, 3, 2)
		assert.deepStrictEqual(as3x2, new Float64Array([1, 3, 5, 2, 4, 6]))

		// Mutating original input in place must NOT return stale cached output
		input[1] = 200
		const afterMutation = transposeTypedMemo(input, 2, 3)
		assert.deepStrictEqual(afterMutation, new Float64Array([1, 4, 200, 5, 3, 6]))
	})

	test('handles cache eviction and large matrices beyond memoization threshold', () => {
		// Exceed MAX_RESULT_CACHE_SIZE (256) with distinct matrices
		for (let i = 0; i < 300; i++) {
			const m = new Float64Array([i, i + 1, i + 2, i + 3])
			const t = transposeTypedMemo(m, 2, 2)
			assert.deepStrictEqual(t, new Float64Array([i, i + 2, i + 1, i + 3]))
		}

		// Large matrix (> MAX_MEMO_ELEMENTS = 1024): 40x35 = 1400 elements
		const rows = 40
		const cols = 35
		const large = new Float64Array(rows * cols)
		for (let i = 0; i < large.length; i++) large[i] = Math.sin(i)
		const largeT = transposeTypedMemo(large, rows, cols)
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				assert.equal(largeT[c * rows + r], large[r * cols + c])
			}
		}
	})

	test('independent cross-checks: involution, element-by-element index mapping, and linearity', () => {
		const shapes = [
			[1, 1],
			[1, 7],
			[7, 1],
			[2, 5],
			[5, 2],
			[4, 4],
			[9, 11],
			[16, 16]
		]

		for (const [rows, cols] of shapes) {
			const a = new Float64Array(rows * cols)
			const b = new Float64Array(rows * cols)
			const sum = new Float64Array(rows * cols)

			for (let i = 0; i < a.length; i++) {
				a[i] = (i * 7 - 13) / 4
				b[i] = (i * 3 + 5) / 4
				sum[i] = a[i] + b[i]
			}

			const aT = transposeTypedMemo(a, rows, cols)
			const bT = transposeTypedMemo(b, rows, cols)
			const sumT = transposeTypedMemo(sum, rows, cols)

			// 1. Involution: (A^T)^T === A
			const aTT = transposeTypedMemo(aT, cols, rows)
			assert.deepStrictEqual(aTT, a)

			// 2. Element-by-element verification & 3. Linearity: (A + B)^T === A^T + B^T
			for (let r = 0; r < rows; r++) {
				for (let c = 0; c < cols; c++) {
					const srcIdx = r * cols + c
					const dstIdx = c * rows + r
					assert.equal(aT[dstIdx], a[srcIdx])
					assert.equal(sumT[dstIdx], aT[dstIdx] + bT[dstIdx])
				}
			}

			// 4. Trace invariance for square matrices
			if (rows === cols) {
				let traceA = 0
				let traceAT = 0
				for (let d = 0; d < rows; d++) {
					traceA += a[d * cols + d]
					traceAT += aT[d * rows + d]
				}
				assert.equal(traceAT, traceA)
			}
		}
	})
})
