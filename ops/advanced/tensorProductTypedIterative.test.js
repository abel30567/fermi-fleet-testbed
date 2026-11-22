import { describe, test } from 'node:test'
import assert from 'node:assert'
import { tensorProductTypedIterative } from './tensorProductTypedIterative.js'

function l2Norm(arr) {
	let sumSq = 0
	for (let i = 0; i < arr.length; i++) {
		sumSq += arr[i] * arr[i]
	}
	return Math.sqrt(sumSq)
}

function sumElements(arr) {
	let total = 0
	for (let i = 0; i < arr.length; i++) {
		total += arr[i]
	}
	return total
}

function matMul(a, [m, k], b, [k2, n]) {
	assert.strictEqual(k, k2)
	const out = new Float64Array(m * n)
	for (let i = 0; i < m; i++) {
		for (let j = 0; j < n; j++) {
			let acc = 0
			for (let r = 0; r < k; r++) {
				acc += a[i * k + r] * b[r * n + j]
			}
			out[i * n + j] = acc
		}
	}
	return out
}

function assertFloat64ArrayClose(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.strictEqual(actual.length, expected.length, 'length mismatch')
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])})`
		)
	}
}

describe('tensorProductTypedIterative', () => {
	describe('1D outer product (normal cases)', () => {
		test('computes flattened row-major outer product of two vectors', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([4, 5])
			const out = tensorProductTypedIterative(a, b)

			assert.ok(out instanceof Float64Array)
			assert.deepStrictEqual(out, new Float64Array([4, 5, 8, 10, 12, 15]))
		})

		test('does not mutate inputs and returns a new Float64Array', () => {
			const a = new Float64Array([2.5, -1.5])
			const b = new Float64Array([4, 2])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			const out = tensorProductTypedIterative(a, b)
			assert.notStrictEqual(out, a)
			assert.notStrictEqual(out, b)
			assert.deepStrictEqual(a, aCopy)
			assert.deepStrictEqual(b, bCopy)
			assert.deepStrictEqual(out, new Float64Array([10, 5, -6, -3]))
		})

		test('handles floating-point values accurately', () => {
			const a = new Float64Array([0.5, 1.25, -2.5])
			const b = new Float64Array([0.2, -0.4])
			const out = tensorProductTypedIterative(a, b)
			assertFloat64ArrayClose(out, new Float64Array([0.1, -0.2, 0.25, -0.5, -0.5, 1.0]))
		})

		test('accepts empty options object as 1D outer product', () => {
			const a = new Float64Array([2, 3])
			const b = new Float64Array([5, 7])
			const out = tensorProductTypedIterative(a, b, {})
			assert.deepStrictEqual(out, new Float64Array([10, 14, 15, 21]))
		})
	})

	describe('2D matrix Kronecker product', () => {
		test('computes Kronecker product of two 2x2 matrices', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([0, 5, 6, 7])
			const out = tensorProductTypedIterative(a, b, {
				shapeA: [2, 2],
				shapeB: [2, 2],
			})

			assert.deepStrictEqual(
				out,
				new Float64Array([
					0, 5, 0, 10,
					6, 7, 12, 14,
					0, 15, 0, 20,
					18, 21, 24, 28,
				])
			)
		})

		test('computes Kronecker product of rectangular matrices', () => {
			// A (2x3) ⊗ B (2x1) -> (4x3)
			const a = new Float64Array([1, -2, 3, 4, 0, -1])
			const b = new Float64Array([2, 5])
			const out = tensorProductTypedIterative(a, b, {
				shapeA: [2, 3],
				shapeB: [2, 1],
			})

			assert.deepStrictEqual(
				out,
				new Float64Array([
					2, -4, 6,
					5, -10, 15,
					8, 0, -2,
					20, 0, -5,
				])
			)
		})

		test('handles zero-dimension matrix shapes', () => {
			const empty = new Float64Array(0)
			const b = new Float64Array([1, 2, 3, 4])
			const out = tensorProductTypedIterative(empty, b, {
				shapeA: [0, 3],
				shapeB: [2, 2],
			})
			assert.ok(out instanceof Float64Array)
			assert.strictEqual(out.length, 0)
		})
	})

	describe('edge cases', () => {
		test('empty Float64Array inputs produce empty Float64Array', () => {
			const empty = new Float64Array(0)
			const nonEmpty = new Float64Array([1, 2, 3])

			assert.deepStrictEqual(tensorProductTypedIterative(empty, nonEmpty), new Float64Array(0))
			assert.deepStrictEqual(tensorProductTypedIterative(nonEmpty, empty), new Float64Array(0))
			assert.deepStrictEqual(tensorProductTypedIterative(empty, empty), new Float64Array(0))
		})

		test('length-1 Float64Array inputs', () => {
			const a = new Float64Array([7])
			const b = new Float64Array([-3])
			assert.deepStrictEqual(tensorProductTypedIterative(a, b), new Float64Array([-21]))

			const c = new Float64Array([1, 2, 3])
			assert.deepStrictEqual(tensorProductTypedIterative(a, c), new Float64Array([7, 14, 21]))
			assert.deepStrictEqual(tensorProductTypedIterative(c, a), new Float64Array([7, 14, 21]))
		})

		test('zeros and negative values', () => {
			const a = new Float64Array([0, -2, 3])
			const b = new Float64Array([-4, 0, 5])
			const out = tensorProductTypedIterative(a, b)

			assert.strictEqual(out.length, 9)
			assertFloat64ArrayClose(out, new Float64Array([0, 0, 0, 8, 0, -10, -12, 0, 15]), 0)
		})

		test('subarray views with non-zero byteOffset work correctly', () => {
			const backing = new Float64Array([99, 2, 3, 88, 10, 20, 77])
			const a = backing.subarray(1, 3) // [2, 3]
			const b = backing.subarray(4, 6) // [10, 20]

			assert.deepStrictEqual(tensorProductTypedIterative(a, b), new Float64Array([20, 40, 30, 60]))
		})
	})

	describe('input validation', () => {
		test('rejects non-Float64Array operands', () => {
			const valid = new Float64Array([1, 2])
			const invalidOperands = [
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				null,
				undefined,
				42,
				'1,2',
				{ length: 2, 0: 1, 1: 2 },
			]

			for (const bad of invalidOperands) {
				assert.throws(() => tensorProductTypedIterative(bad, valid), TypeError)
				assert.throws(() => tensorProductTypedIterative(valid, bad), TypeError)
			}
		})

		test('rejects non-finite elements (NaN, Infinity, -Infinity)', () => {
			const valid = new Float64Array([1, 2])
			const empty = new Float64Array(0)
			const badArrays = [
				new Float64Array([1, Number.NaN]),
				new Float64Array([Number.POSITIVE_INFINITY, 2]),
				new Float64Array([3, Number.NEGATIVE_INFINITY]),
			]

			for (const bad of badArrays) {
				assert.throws(() => tensorProductTypedIterative(bad, valid), RangeError)
				assert.throws(() => tensorProductTypedIterative(valid, bad), RangeError)
				// Must validate even when the other operand is empty
				assert.throws(() => tensorProductTypedIterative(bad, empty), RangeError)
				assert.throws(() => tensorProductTypedIterative(empty, bad), RangeError)
			}
		})

		test('rejects invalid options and mismatched shapes', () => {
			const a = new Float64Array([1, 2, 3, 4])
			const b = new Float64Array([5, 6])

			assert.throws(() => tensorProductTypedIterative(a, b, null), TypeError)
			assert.throws(() => tensorProductTypedIterative(a, b, [2, 2]), TypeError)
			assert.throws(() => tensorProductTypedIterative(a, b, '2x2'), TypeError)

			// Only one shape supplied
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeA: [2, 2] }), TypeError)
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeB: [1, 2] }), TypeError)

			// Bad shape structure
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeA: [2], shapeB: [1, 2] }), TypeError)
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeA: [2, 2], shapeB: [1, 2, 1] }), TypeError)

			// Negative or non-integer dimensions
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeA: [-2, -2], shapeB: [1, 2] }), RangeError)
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeA: [2, 2], shapeB: [1.5, 2] }), RangeError)

			// Product of dimensions does not match array length
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeA: [2, 3], shapeB: [1, 2] }), RangeError)
			assert.throws(() => tensorProductTypedIterative(a, b, { shapeA: [2, 2], shapeB: [2, 2] }), RangeError)
		})
	})

	describe('mathematical cross-check identities', () => {
		test('Frobenius / L2 norm identity: ||a ⊗ b||_2 == ||a||_2 * ||b||_2', () => {
			const a = new Float64Array([1.5, -2.25, 3.75, -0.5, 4.1])
			const b = new Float64Array([-3.2, 0.8, 2.4, -1.7])

			const out = tensorProductTypedIterative(a, b)
			const lhs = l2Norm(out)
			const rhs = l2Norm(a) * l2Norm(b)

			assert.ok(Math.abs(lhs - rhs) <= 1e-12, `expected ${rhs}, got ${lhs}`)

			// Also holds for 2D Kronecker product
			const matA = new Float64Array([1, -2, 3, 4, -5, 6])
			const matB = new Float64Array([0.5, 1.5, -2.5, 3.5])
			const kron = tensorProductTypedIterative(matA, matB, {
				shapeA: [2, 3],
				shapeB: [2, 2],
			})
			assert.ok(Math.abs(l2Norm(kron) - l2Norm(matA) * l2Norm(matB)) <= 1e-12)
		})

		test('sum identity: sum(a ⊗ b) == sum(a) * sum(b)', () => {
			const a = new Float64Array([3.1, -1.4, 2.7, -5.2, 0.9])
			const b = new Float64Array([-2.3, 4.6, 1.1, -0.8, 3.5, -1.9])

			const out = tensorProductTypedIterative(a, b)
			const lhs = sumElements(out)
			const rhs = sumElements(a) * sumElements(b)

			assert.ok(Math.abs(lhs - rhs) <= 1e-12, `expected ${rhs}, got ${lhs}`)
		})

		test('bilinearity: (a1 + a2) ⊗ b == (a1 ⊗ b) + (a2 ⊗ b) and (c*a) ⊗ b == c*(a ⊗ b)', () => {
			const a1 = new Float64Array([1.2, -3.4, 5.6])
			const a2 = new Float64Array([-0.7, 2.1, -1.8])
			const aSum = new Float64Array(a1.length)
			for (let i = 0; i < a1.length; i++) aSum[i] = a1[i] + a2[i]

			const b = new Float64Array([2.5, -1.5, 0.5, 4.0])

			const lhs = tensorProductTypedIterative(aSum, b)
			const p1 = tensorProductTypedIterative(a1, b)
			const p2 = tensorProductTypedIterative(a2, b)
			const rhs = new Float64Array(p1.length)
			for (let i = 0; i < p1.length; i++) rhs[i] = p1[i] + p2[i]

			assertFloat64ArrayClose(lhs, rhs)

			// Scalar homogeneity
			const c = -3.75
			const ca = new Float64Array(a1.map((x) => c * x))
			const scaledLhs = tensorProductTypedIterative(ca, b)
			const scaledRhs = new Float64Array(p1.map((x) => c * x))
			assertFloat64ArrayClose(scaledLhs, scaledRhs)
		})

		test('mixed-product property for Kronecker product: (A ⊗ B)(C ⊗ D) == (AC) ⊗ (BD)', () => {
			// A: 2x3, C: 3x2 => AC: 2x2
			// B: 2x2, D: 2x3 => BD: 2x3
			// A ⊗ B: 4x6, C ⊗ D: 6x6 => (A ⊗ B)(C ⊗ D): 4x6
			const A = new Float64Array([1, -2, 3, 0, 4, -1])
			const C = new Float64Array([2, 1, -1, 3, 0.5, -2])
			const B = new Float64Array([3, -1, 2, 5])
			const D = new Float64Array([1, 0, -2, 4, -3, 1.5])

			const A_kron_B = tensorProductTypedIterative(A, B, { shapeA: [2, 3], shapeB: [2, 2] })
			const C_kron_D = tensorProductTypedIterative(C, D, { shapeA: [3, 2], shapeB: [2, 3] })
			const lhs = matMul(A_kron_B, [4, 6], C_kron_D, [6, 6])

			const AC = matMul(A, [2, 3], C, [3, 2])
			const BD = matMul(B, [2, 2], D, [2, 3])
			const rhs = tensorProductTypedIterative(AC, BD, { shapeA: [2, 2], shapeB: [2, 3] })

			assertFloat64ArrayClose(lhs, rhs)
		})
	})
})
