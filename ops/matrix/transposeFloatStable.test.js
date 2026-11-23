import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { transposeFloatStable } from './transposeFloatStable.js'

/**
 * Extracts the exact IEEE-754 64-bit bit pattern of a number as a BigInt.
 * @param {number} x
 * @returns {bigint}
 */
function float64Bits(x) {
	const buf = new ArrayBuffer(8)
	new Float64Array(buf)[0] = x
	return new BigUint64Array(buf)[0]
}

/**
 * Independent reference transpose implementation.
 * @param {number[][]} m
 * @returns {number[][]}
 */
function naiveTranspose(m) {
	if (m.length === 0 || m[0].length === 0) return []
	return Array.from({ length: m[0].length }, (_, c) =>
		Array.from({ length: m.length }, (_, r) => m[r][c])
	)
}

/**
 * Independent scaled + Kahan-Babuška-Neumaier Frobenius norm for overflow/underflow-safe
 * norm invariance checks.
 * @param {number[][]} m
 * @returns {number}
 */
function scaledFrobeniusNorm(m) {
	let maxAbs = 0
	for (const row of m) {
		for (const v of row) {
			const a = Math.abs(v)
			if (a > maxAbs) maxAbs = a
		}
	}
	if (maxAbs === 0) return 0
	let sum = 0
	let comp = 0
	for (const row of m) {
		for (const v of row) {
			const s = v / maxAbs
			const term = s * s
			const t = sum + term
			if (Math.abs(sum) >= Math.abs(term)) {
				comp += sum - t + term
			} else {
				comp += term - t + sum
			}
			sum = t
		}
	}
	return maxAbs * Math.sqrt(sum + comp)
}

/**
 * Independent dense matrix multiplication A * B.
 * @param {number[][]} a
 * @param {number[][]} b
 * @returns {number[][]}
 */
function matmul(a, b) {
	const rows = a.length
	const inner = b.length
	const cols = b[0].length
	const out = Array.from({ length: rows }, () => new Array(cols).fill(0))
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			let sum = 0
			let comp = 0
			for (let k = 0; k < inner; k++) {
				const prod = a[r][k] * b[k][c]
				const t = sum + prod
				if (Math.abs(sum) >= Math.abs(prod)) {
					comp += sum - t + prod
				} else {
					comp += prod - t + sum
				}
				sum = t
			}
			out[r][c] = sum + comp
		}
	}
	return out
}

describe('transposeFloatStable', () => {
	test('transposes square and rectangular matrices', () => {
		assert.deepEqual(
			transposeFloatStable([
				[1, 2, 3],
				[4, 5, 6]
			]),
			[
				[1, 4],
				[2, 5],
				[3, 6]
			]
		)

		assert.deepEqual(
			transposeFloatStable([
				[1.5, -2.25],
				[3.75, 4.125],
				[-5.5, 6.875]
			]),
			[
				[1.5, 3.75, -5.5],
				[-2.25, 4.125, 6.875]
			]
		)

		assert.deepEqual(
			transposeFloatStable([
				[1, 2],
				[3, 4]
			]),
			[
				[1, 3],
				[2, 4]
			]
		)
	})

	test('handles edge shapes: empty, 0-column, 1x1, row vector, column vector', () => {
		assert.deepEqual(transposeFloatStable([]), [])
		assert.deepEqual(transposeFloatStable([[]]), [])
		assert.deepEqual(transposeFloatStable([[], [], []]), [])
		assert.deepEqual(transposeFloatStable([[42.5]]), [[42.5]])
		assert.deepEqual(transposeFloatStable([[1, 2, 3, 4]]), [[1], [2], [3], [4]])
		assert.deepEqual(transposeFloatStable([[1], [2], [3], [4]]), [[1, 2, 3, 4]])
	})

	test('preserves exact IEEE-754 float64 bit patterns (-0, +0, subnormals, extremes)', () => {
		const matrix = [
			[-0, +0, Number.MIN_VALUE, -Number.MIN_VALUE],
			[Number.MAX_VALUE, -Number.MAX_VALUE, Number.EPSILON, -Number.EPSILON],
			[1e-308, -1e-308, 1e307, -1e307]
		]
		const transposed = transposeFloatStable(matrix)
		assert.equal(transposed.length, 4)
		assert.equal(transposed[0].length, 3)

		for (let r = 0; r < matrix.length; r++) {
			for (let c = 0; c < matrix[0].length; c++) {
				assert.equal(Object.is(transposed[c][r], matrix[r][c]), true)
				assert.equal(float64Bits(transposed[c][r]), float64Bits(matrix[r][c]))
			}
		}
	})

	test('does not mutate input matrix and returns independent arrays', () => {
		const original = [
			[1, 2],
			[3, 4]
		]
		const snapshot = original.map((row) => row.slice())
		const transposed = transposeFloatStable(original)

		transposed[0][1] = 999
		assert.deepEqual(original, snapshot)

		original[0][0] = -123
		assert.equal(transposed[0][0], 1)
	})

	test('cross-check: matches naive reference and satisfies involution across block boundaries', () => {
		const rows = 71
		const cols = 67
		const matrix = Array.from({ length: rows }, (_, r) =>
			Array.from({ length: cols }, (_, c) => {
				if ((r + c) % 17 === 0) return -0
				if ((r * 3 + c) % 19 === 0) return Number.MIN_VALUE * ((r % 5) + 1)
				return Math.sin(r * 0.73 + c * 1.19) * 1e5
			})
		)

		const actual = transposeFloatStable(matrix)
		const expected = naiveTranspose(matrix)

		assert.equal(actual.length, cols)
		assert.equal(actual[0].length, rows)
		for (let c = 0; c < cols; c++) {
			for (let r = 0; r < rows; r++) {
				assert.equal(Object.is(actual[c][r], expected[c][r]), true)
			}
		}

		// Involution: (A^T)^T === A bit-for-bit
		const roundTrip = transposeFloatStable(actual)
		for (let r = 0; r < rows; r++) {
			for (let c = 0; c < cols; c++) {
				assert.equal(Object.is(roundTrip[r][c], matrix[r][c]), true)
			}
		}
	})

	test('cross-check: algebraic identities (A*B)^T = B^T * A^T and scaled Frobenius norm invariance', () => {
		const a = [
			[1.25, -2.5, 3.75, 0.5],
			[-4.0, 5.125, -6.25, 7.5],
			[0.125, 8.75, -1.5, 2.25]
		]
		const b = [
			[2.0, -1.5],
			[0.75, 3.25],
			[-2.5, 4.0],
			[1.125, -0.875]
		]

		const lhs = transposeFloatStable(matmul(a, b))
		const rhs = matmul(transposeFloatStable(b), transposeFloatStable(a))

		assert.equal(lhs.length, rhs.length)
		assert.equal(lhs[0].length, rhs[0].length)
		for (let r = 0; r < lhs.length; r++) {
			for (let c = 0; c < lhs[0].length; c++) {
				assert.ok(
					Math.abs(lhs[r][c] - rhs[r][c]) <= 1e-12,
					`Mismatch at (${r}, ${c}): ${lhs[r][c]} vs ${rhs[r][c]}`
				)
			}
		}

		// Scaled Frobenius norm invariance under extreme scales where naive sum-of-squares overflows/underflows
		const huge = [
			[1e300, -2e300, 3e300],
			[4e300, -5e300, 6e300]
		]
		const tiny = [
			[1e-300, -2e-300, 3e-300],
			[4e-300, -5e-300, 6e-300]
		]

		const hugeNorm = scaledFrobeniusNorm(huge)
		const hugeTNorm = scaledFrobeniusNorm(transposeFloatStable(huge))
		assert.ok(Number.isFinite(hugeNorm) && hugeNorm > 0)
		assert.ok(Math.abs(hugeNorm - hugeTNorm) / hugeNorm <= 1e-15)

		const tinyNorm = scaledFrobeniusNorm(tiny)
		const tinyTNorm = scaledFrobeniusNorm(transposeFloatStable(tiny))
		assert.ok(Number.isFinite(tinyNorm) && tinyNorm > 0)
		assert.ok(Math.abs(tinyNorm - tinyTNorm) / tinyNorm <= 1e-15)
	})

	test('validates inputs and rejects malformed or non-finite matrices', () => {
		assert.throws(() => transposeFloatStable(null), TypeError)
		assert.throws(() => transposeFloatStable(undefined), TypeError)
		assert.throws(() => transposeFloatStable(123), TypeError)
		assert.throws(() => transposeFloatStable('matrix'), TypeError)
		assert.throws(() => transposeFloatStable({}), TypeError)

		assert.throws(() => transposeFloatStable([1, 2, 3]), TypeError)
		assert.throws(() => transposeFloatStable([[1, 2], null]), TypeError)
		assert.throws(() => transposeFloatStable([[], null]), TypeError)

		assert.throws(() => transposeFloatStable([[1, 2], [3]]), RangeError)
		assert.throws(() => transposeFloatStable([[], [1]]), RangeError)

		assert.throws(() => transposeFloatStable([['1']]), TypeError)
		assert.throws(() => transposeFloatStable([[null]]), TypeError)
		assert.throws(() => transposeFloatStable([[undefined]]), TypeError)
		assert.throws(() => transposeFloatStable([[1n]]), TypeError)
		assert.throws(() => transposeFloatStable([new Array(2)]), TypeError)

		assert.throws(() => transposeFloatStable([[NaN]]), RangeError)
		assert.throws(() => transposeFloatStable([[1, Infinity]]), RangeError)
		assert.throws(() => transposeFloatStable([[-Infinity, 2]]), RangeError)
	})
})
