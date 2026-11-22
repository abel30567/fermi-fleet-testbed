import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { matMulTypedIterative } from './matMulTypedIterative.js'

/**
 * Helper to assert two Float64Arrays are equal element-wise within a tolerance.
 */
function assertMatrixClose(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'Expected Float64Array result')
	assert.equal(actual.length, expected.length, 'Matrix lengths must match')
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}`,
		)
	}
}

/**
 * Independent transpose helper for row-major Float64Array matrices.
 */
function transpose(m, rows, cols) {
	const out = new Float64Array(rows * cols)
	for (let i = 0; i < rows; i++) {
		for (let j = 0; j < cols; j++) {
			out[j * rows + i] = m[i * cols + j]
		}
	}
	return out
}

/**
 * Independent identity matrix constructor.
 */
function identity(n) {
	const out = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		out[i * n + i] = 1
	}
	return out
}

describe('matMulTypedIterative', () => {
	describe('normal cases', () => {
		it('multiplies two 2x2 matrices', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([5, 6, 7, 8])
			const c = matMulTypedIterative(a, b, 2, 2, 2)

			assert.ok(c instanceof Float64Array)
			assert.deepEqual(c, new Float64Array([19, 22, 43, 50]))
		})

		it('multiplies rectangular matrices (2x3 * 3x4 -> 2x4)', () => {
			const a = new Float64Array([
				1, 2, 3,
				4, 5, 6,
			])
			const b = new Float64Array([
				7, 8, 9, 10,
				11, 12, 13, 14,
				15, 16, 17, 18,
			])
			const c = matMulTypedIterative(a, b, 2, 3, 4)

			assert.deepEqual(
				c,
				new Float64Array([
					74, 80, 86, 92,
					173, 188, 203, 218,
				]),
			)
		})

		it('computes dot product (1xN * Nx1 -> 1x1)', () => {
			const a = new Float64Array([2, -3, 4.5, 1])
			const b = new Float64Array([5, 2, -2, 7])
			const c = matMulTypedIterative(a, b, 1, 4, 1)

			assert.deepEqual(c, new Float64Array([2]))
		})

		it('computes outer product (Nx1 * 1xM -> NxM)', () => {
			const a = new Float64Array([2, -3, 4])
			const b = new Float64Array([5, -1, 0.5, 3])
			const c = matMulTypedIterative(a, b, 3, 1, 4)

			assert.deepEqual(
				c,
				new Float64Array([
					10, -2, 1, 6,
					-15, 3, -1.5, -9,
					20, -4, 2, 12,
				]),
			)
		})

		it('handles negative and fractional entries accurately', () => {
			const a = new Float64Array([-1.5, 2.25, 0.5, -4])
			const b = new Float64Array([3, -0.5, 2, 1.25])
			const c = matMulTypedIterative(a, b, 2, 2, 2)

			assertMatrixClose(c, new Float64Array([0, 3.5625, -6.5, -5.25]), 1e-15)
		})

		it('does not mutate inputs and supports aliased operands (A * A)', () => {
			const a = new Float64Array([1, -2, 3, 4])
			const aCopy = new Float64Array(a)
			const c = matMulTypedIterative(a, a, 2, 2, 2)

			assert.deepEqual(a, aCopy)
			assert.notEqual(c, a)
			assert.deepEqual(c, new Float64Array([-5, -10, 15, 10]))
		})

		it('supports Float64Array subarray views', () => {
			const backing = new Float64Array([99, 1, 2, 3, 4, 88, 2, 0, 1, 2, 77])
			const a = backing.subarray(1, 5)
			const b = backing.subarray(6, 10)
			const c = matMulTypedIterative(a, b, 2, 2, 2)

			assert.deepEqual(c, new Float64Array([4, 4, 10, 8]))
		})
	})

	describe('edge cases', () => {
		it('multiplies 1x1 matrices', () => {
			const c = matMulTypedIterative(new Float64Array([-7.5]), new Float64Array([4]), 1, 1, 1)
			assert.deepEqual(c, new Float64Array([-30]))
		})

		it('multiplies with zero matrices', () => {
			const a = new Float64Array([1, 2, 3, 4, 5, 6])
			const zeros = new Float64Array(6)
			assert.deepEqual(matMulTypedIterative(a, zeros, 2, 3, 2), new Float64Array(4))
			assert.deepEqual(matMulTypedIterative(zeros, a, 3, 2, 3), new Float64Array(9))
		})

		it('normalizes signed zero product 0 * (-1) to +0', () => {
			const c = matMulTypedIterative(new Float64Array([0]), new Float64Array([-1]), 1, 1, 1)
			assert.ok(Object.is(c[0], 0))
		})

		it('handles empty dimensions (0xK * KxN, MxK * Kx0, Mx0 * 0xN, 0x0 * 0x0)', () => {
			const b3x2 = new Float64Array([1, 2, 3, 4, 5, 6])
			const empty = new Float64Array(0)

			assert.deepEqual(matMulTypedIterative(empty, b3x2, 0, 3, 2), new Float64Array(0))
			assert.deepEqual(matMulTypedIterative(b3x2, empty, 3, 2, 0), new Float64Array(0))
			assert.deepEqual(matMulTypedIterative(empty, empty, 2, 0, 3), new Float64Array(6))
			assert.deepEqual(matMulTypedIterative(empty, empty, 0, 0, 0), new Float64Array(0))
		})
	})

	describe('input validation', () => {
		it('throws TypeError if a or b is not a Float64Array', () => {
			const valid = new Float64Array([1])
			for (const bad of [[1], new Float32Array([1]), new Int32Array([1]), null, undefined, '1', {}]) {
				assert.throws(() => matMulTypedIterative(bad, valid, 1, 1, 1), TypeError)
				assert.throws(() => matMulTypedIterative(valid, bad, 1, 1, 1), TypeError)
			}
		})

		it('throws TypeError if any dimension is not a number', () => {
			const valid = new Float64Array([1])
			for (const bad of ['1', null, undefined, 1n, {}, []]) {
				assert.throws(() => matMulTypedIterative(valid, valid, bad, 1, 1), TypeError)
				assert.throws(() => matMulTypedIterative(valid, valid, 1, bad, 1), TypeError)
				assert.throws(() => matMulTypedIterative(valid, valid, 1, 1, bad), TypeError)
			}
		})

		it('throws RangeError for negative, fractional, non-finite, or unsafe dimensions', () => {
			const empty = new Float64Array(0)
			const badDims = [-1, 1.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]
			for (const bad of badDims) {
				assert.throws(() => matMulTypedIterative(empty, empty, bad, 0, 0), RangeError)
				assert.throws(() => matMulTypedIterative(empty, empty, 0, bad, 0), RangeError)
				assert.throws(() => matMulTypedIterative(empty, empty, 0, 0, bad), RangeError)
			}
		})

		it('throws RangeError when dimension products overflow Number.MAX_SAFE_INTEGER', () => {
			const empty = new Float64Array(0)
			const big = 1e9
			assert.throws(() => matMulTypedIterative(empty, empty, big, 0, big), RangeError)
			assert.throws(() => matMulTypedIterative(empty, empty, big, big, 0), RangeError)
			assert.throws(() => matMulTypedIterative(empty, empty, 0, big, big), RangeError)
		})

		it('throws RangeError on buffer length mismatch', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([1, 2, 3, 4])
			assert.throws(() => matMulTypedIterative(a, b, 2, 2, 2), RangeError)
			assert.throws(() => matMulTypedIterative(b, a, 2, 2, 2), RangeError)
		})

		it('throws RangeError when matrices contain NaN or Infinity', () => {
			const valid = new Float64Array([1, 2, 3, 4])
			for (const badVal of [NaN, Infinity, -Infinity]) {
				const badMat = new Float64Array([1, badVal, 3, 4])
				assert.throws(() => matMulTypedIterative(badMat, valid, 2, 2, 2), RangeError)
				assert.throws(() => matMulTypedIterative(valid, badMat, 2, 2, 2), RangeError)
				// Still validates non-empty operand even if result is empty
				assert.throws(() => matMulTypedIterative(new Float64Array(0), badMat, 0, 2, 2), RangeError)
			}
		})
	})

	describe('mathematical identities and independent cross-checks', () => {
		it('satisfies identity matrix laws: I_m * A = A and A * I_n = A', () => {
			const a = new Float64Array([
				3.5, -1.25, 0, 7,
				-4, 2.5, 9.1, -0.3,
				1.2, 6.4, -8.8, 5,
			])
			const left = matMulTypedIterative(identity(3), a, 3, 3, 4)
			const right = matMulTypedIterative(a, identity(4), 3, 4, 4)

			assert.deepEqual(left, a)
			assert.deepEqual(right, a)
		})

		it('satisfies associativity: (A * B) * C == A * (B * C)', () => {
			const a = new Float64Array([
				1.2, -0.5, 3.1, 2.0,
				-2.4, 4.5, 0.7, -1.3,
				0.9, 1.8, -3.2, 2.6,
			]) // 3x4
			const b = new Float64Array([
				0.5, -1.2, 2.3, 0.4, -0.8,
				3.1, 0.2, -1.5, 2.2, 1.1,
				-0.7, 2.8, 0.6, -1.9, 0.3,
				1.4, -0.6, 1.7, 0.9, -2.5,
			]) // 4x5
			const c = new Float64Array([
				2.1, -1.4,
				-0.9, 3.2,
				1.5, 0.8,
				-2.7, 1.1,
				0.4, -2.3,
			]) // 5x2

			const ab = matMulTypedIterative(a, b, 3, 4, 5)
			const ab_c = matMulTypedIterative(ab, c, 3, 5, 2)

			const bc = matMulTypedIterative(b, c, 4, 5, 2)
			const a_bc = matMulTypedIterative(a, bc, 3, 4, 2)

			assertMatrixClose(ab_c, a_bc, 1e-12)
		})

		it('satisfies transpose identity: (A * B)^T == B^T * A^T', () => {
			const a = new Float64Array([
				2, -1.5, 3, 0.25,
				-4, 5.5, -2, 1.75,
				0.5, 3, -1, -6,
			]) // 3x4
			const b = new Float64Array([
				1.5, -2,
				0.5, 4,
				-3, 1,
				2.5, -0.5,
			]) // 4x2

			const ab = matMulTypedIterative(a, b, 3, 4, 2)
			const abT = transpose(ab, 3, 2)

			const bT = transpose(b, 4, 2) // 2x4
			const aT = transpose(a, 3, 4) // 4x3
			const bTaT = matMulTypedIterative(bT, aT, 2, 4, 3)

			assertMatrixClose(abT, bTaT, 1e-12)
		})

		it('satisfies 2D rotation group law: R(theta1) * R(theta2) == R(theta1 + theta2)', () => {
			const rot = (theta) =>
				new Float64Array([
					Math.cos(theta), -Math.sin(theta),
					Math.sin(theta), Math.cos(theta),
				])

			const t1 = 0.73
			const t2 = 1.19
			const prod = matMulTypedIterative(rot(t1), rot(t2), 2, 2, 2)
			const expected = rot(t1 + t2)

			assertMatrixClose(prod, expected, 1e-14)
		})

		it('matches an independent 2D-array reference implementation on larger rectangular matrices', () => {
			const rowsA = 12
			const colsA = 9
			const colsB = 11

			// Deterministic pseudo-random entries via simple LCG
			let state = 123456789
			const nextVal = () => {
				state = (Math.imul(state, 1664525) + 1013904223) >>> 0
				return (state / 0xffffffff) * 10 - 5
			}

			const a2d = Array.from({ length: rowsA }, () =>
				Array.from({ length: colsA }, () => nextVal()),
			)
			const b2d = Array.from({ length: colsA }, () =>
				Array.from({ length: colsB }, () => nextVal()),
			)

			const aFlat = Float64Array.from(a2d.flat())
			const bFlat = Float64Array.from(b2d.flat())

			// Independent 2D-array reference (i-j-k order)
			const expected = new Float64Array(rowsA * colsB)
			for (let i = 0; i < rowsA; i++) {
				for (let j = 0; j < colsB; j++) {
					let sum = 0
					for (let k = 0; k < colsA; k++) {
						sum += a2d[i][k] * b2d[k][j]
					}
					expected[i * colsB + j] = sum
				}
			}

			const actual = matMulTypedIterative(aFlat, bFlat, rowsA, colsA, colsB)
			assertMatrixClose(actual, expected, 1e-12)
		})
	})
})
