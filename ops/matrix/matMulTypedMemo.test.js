import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulTypedMemo } from './matMulTypedMemo.js'

/**
 * Independent naive triple-loop reference implementation for cross-checking.
 */
function naiveMatMul(a, b, m, k, n) {
	const out = new Float64Array(m * n)
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let p = 0; p < k; p++) {
				sum += a[i * k + p] * b[p * n + j]
			}
			out[i * n + j] = sum
		}
	}
	return out
}

function identity(n) {
	const out = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		out[i * n + i] = 1
	}
	return out
}

function assertFloat64Close(actual, expected, eps = 1e-10) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`
		)
	}
}

describe('matMulTypedMemo', () => {
	it('multiplies 2x2 square matrices with explicit dimensions', () => {
		const a = new Float64Array([1, 2, 3, 4])
		const b = new Float64Array([5, 6, 7, 8])
		const out = matMulTypedMemo(a, b, 2, 2, 2)
		assert.ok(out instanceof Float64Array)
		assert.deepStrictEqual(out, new Float64Array([19, 22, 43, 50]))
	})

	it('auto-detects square dimensions when m, k, n are omitted', () => {
		const a = new Float64Array([2, -1, 0, 3, 1, 4, -2, 5, 1])
		const b = new Float64Array([1, 0, 2, -1, 3, 1, 4, 2, -3])
		const out = matMulTypedMemo(a, b)
		const expected = naiveMatMul(a, b, 3, 3, 3)
		assert.deepStrictEqual(out, expected)
	})

	it('multiplies rectangular matrices (2x3 * 3x4 -> 2x4)', () => {
		const a = new Float64Array([1, 2, 3, 4, 5, 6])
		const b = new Float64Array([
			7, 8, 9, 10,
			11, 12, 13, 14,
			15, 16, 17, 18
		])
		const out = matMulTypedMemo(a, b, 2, 3, 4)
		assert.deepStrictEqual(
			out,
			new Float64Array([74, 80, 86, 92, 173, 188, 203, 218])
		)
	})

	it('handles 1x1 edge case with explicit and auto-detected dimensions', () => {
		const a = new Float64Array([6.5])
		const b = new Float64Array([-4])
		assert.deepStrictEqual(matMulTypedMemo(a, b), new Float64Array([-26]))
		assert.deepStrictEqual(
			matMulTypedMemo(a, b, 1, 1, 1),
			new Float64Array([-26])
		)
	})

	it('handles vector outer product (3x1 * 1x3) and dot product (1x4 * 4x1)', () => {
		const col = new Float64Array([2, 3, 5])
		const row = new Float64Array([7, 11, 13])
		assert.deepStrictEqual(
			matMulTypedMemo(col, row, 3, 1, 3),
			new Float64Array([14, 22, 26, 21, 33, 39, 35, 55, 65])
		)

		const u = new Float64Array([1, -2, 3, -4])
		const v = new Float64Array([5, 6, 7, 8])
		assert.deepStrictEqual(
			matMulTypedMemo(u, v, 1, 4, 1),
			new Float64Array([-18])
		)
	})

	it('satisfies identity property A * I = A and I * A = A', () => {
		const a = new Float64Array([
			1.5, -2.25, 3, 0.5,
			4, 5.125, -6, 7,
			-8, 9, 10.5, -11
		])
		const i3 = identity(3)
		const i4 = identity(4)
		assert.deepStrictEqual(matMulTypedMemo(a, i4, 3, 4, 4), a)
		assert.deepStrictEqual(matMulTypedMemo(i3, a, 3, 3, 4), a)
	})

	it('cross-checks associativity (A * B) * C === A * (B * C)', () => {
		const a = new Float64Array([1.25, -0.5, 2, 3.5, 0.25, -1.75]) // 2x3
		const b = new Float64Array([
			0.5, 2, -1, 1.5,
			-2, 0.75, 3, -0.5,
			1.25, -1.5, 0.25, 2.5
		]) // 3x4
		const c = new Float64Array([
			2, -1,
			0.5, 3,
			-1.5, 0.25,
			4, -2.5
		]) // 4x2

		const ab = matMulTypedMemo(a, b, 2, 3, 4)
		const left = matMulTypedMemo(ab, c, 2, 4, 2)

		const bc = matMulTypedMemo(b, c, 3, 4, 2)
		const right = matMulTypedMemo(a, bc, 2, 3, 2)

		assertFloat64Close(left, right, 1e-12)
	})

	it('matches naive triple-loop reference on larger matrices (row-offset table path)', () => {
		const m = 20
		const k = 25
		const n = 18
		const a = new Float64Array(m * k)
		const b = new Float64Array(k * n)
		for (let i = 0; i < a.length; i++) a[i] = ((i * 7 + 3) % 19) - 9
		for (let i = 0; i < b.length; i++) b[i] = ((i * 11 + 5) % 23) - 11

		const actual = matMulTypedMemo(a, b, m, k, n)
		const expected = naiveMatMul(a, b, m, k, n)
		assertFloat64Close(actual, expected, 1e-9)
	})

	it('respects subarray byteOffset views cleanly', () => {
		const backing = new Float64Array([99, 1, 2, 3, 4, 5, 6, 7, 8, -99])
		const a = backing.subarray(1, 5)
		const b = backing.subarray(5, 9)
		const out = matMulTypedMemo(a, b)
		assert.deepStrictEqual(out, new Float64Array([19, 22, 43, 50]))
	})

	it('enforces memoization cache isolation on output and input mutation', () => {
		const a = new Float64Array([1, 2, 3, 4])
		const b = new Float64Array([2, 0, 1, 2])

		const first = matMulTypedMemo(a, b)
		const second = matMulTypedMemo(a, b)
		assert.deepStrictEqual(first, second)
		assert.notStrictEqual(first, second, 'memoized calls must return a new Float64Array')

		// Mutating returned buffer must not corrupt cache
		first[0] = 999999
		const third = matMulTypedMemo(a, b)
		assert.deepStrictEqual(third, new Float64Array([4, 4, 10, 8]))

		// Mutating input must invalidate cache lookup and compute new result
		a[0] = 10
		const fourth = matMulTypedMemo(a, b)
		assert.deepStrictEqual(fourth, new Float64Array([22, 4, 10, 8]))

		// Restoring input hits the original memoized result
		a[0] = 1
		const fifth = matMulTypedMemo(a, b)
		assert.deepStrictEqual(fifth, new Float64Array([4, 4, 10, 8]))
	})

	it('handles bounded cache eviction gracefully across >300 distinct calls', () => {
		const b = new Float64Array([1, 2, 3, 4])
		for (let i = 1; i <= 320; i++) {
			const a = new Float64Array([i, 0, 0, i])
			const out = matMulTypedMemo(a, b)
			assert.deepStrictEqual(out, new Float64Array([i, 2 * i, 3 * i, 4 * i]))
		}
	})

	it('throws TypeError for non-Float64Array inputs or partial/non-numeric dimensions', () => {
		const valid = new Float64Array([1, 2, 3, 4])
		assert.throws(() => matMulTypedMemo([1, 2, 3, 4], valid), TypeError)
		assert.throws(() => matMulTypedMemo(valid, new Float32Array([1, 2, 3, 4])), TypeError)
		assert.throws(() => matMulTypedMemo(null, valid), TypeError)
		assert.throws(() => matMulTypedMemo(valid, valid, 2), TypeError)
		assert.throws(() => matMulTypedMemo(valid, valid, 2, 2), TypeError)
		assert.throws(() => matMulTypedMemo(valid, valid, '2', 2, 2), TypeError)
	})

	it('throws RangeError for invalid dimensions, empty arrays, or length mismatches', () => {
		assert.throws(
			() => matMulTypedMemo(new Float64Array(0), new Float64Array(0)),
			RangeError
		)
		assert.throws(
			() => matMulTypedMemo(new Float64Array([1, 2, 3]), new Float64Array([1, 2, 3])),
			RangeError
		)
		assert.throws(
			() => matMulTypedMemo(new Float64Array([1, 2, 3, 4]), new Float64Array([1])),
			RangeError
		)
		assert.throws(
			() => matMulTypedMemo(new Float64Array([1, 2, 3, 4]), new Float64Array([1, 2, 3, 4]), 0, 2, 2),
			RangeError
		)
		assert.throws(
			() => matMulTypedMemo(new Float64Array([1, 2, 3, 4]), new Float64Array([1, 2, 3, 4]), -2, 2, 2),
			RangeError
		)
		assert.throws(
			() => matMulTypedMemo(new Float64Array([1, 2, 3, 4]), new Float64Array([1, 2, 3, 4]), 1.5, 2, 2),
			RangeError
		)
		assert.throws(
			() => matMulTypedMemo(new Float64Array([1, 2, 3, 4]), new Float64Array([1, 2, 3, 4]), 2, 3, 2),
			RangeError
		)
		assert.throws(
			() => matMulTypedMemo(new Float64Array([1, 2, 3, 4, 5, 6]), new Float64Array([1, 2, 3, 4]), 2, 3, 2),
			RangeError
		)
	})
})
