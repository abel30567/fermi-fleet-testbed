import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { tensorProductTypedIterative } from './tensorProductTypedIterative.js'

function l2Norm(vec) {
	let sumSq = 0
	for (let i = 0; i < vec.length; i++) {
		sumSq += vec[i] * vec[i]
	}
	return Math.sqrt(sumSq)
}

function dot(u, v) {
	assert.equal(u.length, v.length)
	let sum = 0
	for (let i = 0; i < u.length; i++) {
		sum += u[i] * v[i]
	}
	return sum
}

function linearCombination(alpha, u, beta, v) {
	assert.equal(u.length, v.length)
	const out = new Float64Array(u.length)
	for (let i = 0; i < u.length; i++) {
		out[i] = alpha * u[i] + beta * v[i]
	}
	return out
}

function assertFloat64ArrayClose(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'Expected result to be a Float64Array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, tol=${tol}`
		)
	}
}

describe('tensorProductTypedIterative', () => {
	test('computes outer product for standard Float64Array vectors', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5])
		const result = tensorProductTypedIterative(a, b)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(result, new Float64Array([4, 5, 8, 10, 12, 15]))
	})

	test('handles negative and fractional values accurately', () => {
		const a = new Float64Array([-1.5, 2.5])
		const b = new Float64Array([4, -2, 0.5])
		const result = tensorProductTypedIterative(a, b)

		assert.deepEqual(result, new Float64Array([-6, 3, -0.75, 10, -5, 1.25]))
	})

	test('does not mutate inputs and supports aliased inputs (a ⊗ a)', () => {
		const a = new Float64Array([2, -3, 5])
		const snapshot = new Float64Array(a)
		const result = tensorProductTypedIterative(a, a)

		assert.deepEqual(a, snapshot)
		assert.notEqual(result, a)
		assert.deepEqual(result, new Float64Array([4, -6, 10, -6, 9, -15, 10, -15, 25]))
	})

	test('works correctly with Float64Array subarray views', () => {
		const buf = new Float64Array([99, 2, 3, 88, 10, 20, 77])
		const a = buf.subarray(1, 3)
		const b = buf.subarray(4, 6)
		const result = tensorProductTypedIterative(a, b)

		assert.deepEqual(result, new Float64Array([20, 40, 30, 60]))
	})

	test('handles single-element and scalar-like vectors', () => {
		assert.deepEqual(
			tensorProductTypedIterative(new Float64Array([3]), new Float64Array([7])),
			new Float64Array([21])
		)
		assert.deepEqual(
			tensorProductTypedIterative(new Float64Array([2]), new Float64Array([1, -4, 3.5])),
			new Float64Array([2, -8, 7])
		)
		assert.deepEqual(
			tensorProductTypedIterative(new Float64Array([1, -4, 3.5]), new Float64Array([2])),
			new Float64Array([2, -8, 7])
		)
	})

	test('handles empty Float64Array inputs', () => {
		const empty = new Float64Array(0)
		const nonEmpty = new Float64Array([1, 2, 3])

		const r1 = tensorProductTypedIterative(empty, nonEmpty)
		const r2 = tensorProductTypedIterative(nonEmpty, empty)
		const r3 = tensorProductTypedIterative(empty, empty)

		assert.ok(r1 instanceof Float64Array && r1.length === 0)
		assert.ok(r2 instanceof Float64Array && r2.length === 0)
		assert.ok(r3 instanceof Float64Array && r3.length === 0)
	})

	test('handles zero vectors and canonical basis vectors', () => {
		const zeros = new Float64Array([0, 0, 0])
		const v = new Float64Array([5, -3])
		assert.deepEqual(tensorProductTypedIterative(zeros, v), new Float64Array(6))

		const e1 = new Float64Array([0, 1, 0])
		const e2 = new Float64Array([0, 0, 1, 0])
		const basisProd = tensorProductTypedIterative(e1, e2)
		const expected = new Float64Array(12)
		expected[1 * 4 + 2] = 1
		assert.deepEqual(basisProd, expected)
	})

	test('throws TypeError for non-Float64Array arguments', () => {
		const valid = new Float64Array([1, 2])
		const invalidValues = [
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			null,
			undefined,
			42,
			'12',
			{ length: 2, 0: 1, 1: 2 }
		]

		for (const bad of invalidValues) {
			assert.throws(() => tensorProductTypedIterative(bad, valid), TypeError)
			assert.throws(() => tensorProductTypedIterative(valid, bad), TypeError)
		}
	})

	test('throws RangeError for non-finite elements (NaN, Infinity, -Infinity)', () => {
		const valid = new Float64Array([1, 2])
		const empty = new Float64Array(0)
		const nonFinite = [
			new Float64Array([1, Number.NaN]),
			new Float64Array([Number.POSITIVE_INFINITY, 2]),
			new Float64Array([2, Number.NEGATIVE_INFINITY])
		]

		for (const bad of nonFinite) {
			assert.throws(() => tensorProductTypedIterative(bad, valid), RangeError)
			assert.throws(() => tensorProductTypedIterative(valid, bad), RangeError)
			assert.throws(() => tensorProductTypedIterative(bad, empty), RangeError)
			assert.throws(() => tensorProductTypedIterative(empty, bad), RangeError)
		}
	})

	test('cross-check: Frobenius norm product property ||a ⊗ b||_F = ||a||_2 * ||b||_2', () => {
		const pairs = [
			[new Float64Array([3, 4]), new Float64Array([5, 12])],
			[new Float64Array([-1.2, 3.4, -5.6, 7.8]), new Float64Array([0.5, -2.5, 4.1])],
			[new Float64Array([1e-5, -2e-5, 3e-5]), new Float64Array([4e5, 5e5])]
		]

		for (const [a, b] of pairs) {
			const prod = tensorProductTypedIterative(a, b)
			const lhs = l2Norm(prod)
			const rhs = l2Norm(a) * l2Norm(b)
			assert.ok(Math.abs(lhs - rhs) <= 1e-11 * Math.max(1, rhs), `lhs=${lhs}, rhs=${rhs}`)
		}
	})

	test('cross-check: bilinearity in both arguments', () => {
		const a1 = new Float64Array([1.5, -2.0, 3.25])
		const a2 = new Float64Array([-0.5, 4.0, -1.75])
		const b1 = new Float64Array([2.0, -3.5, 1.0, 0.25])
		const b2 = new Float64Array([-1.25, 0.5, 2.5, -4.0])
		const alpha = 2.7
		const beta = -1.3

		const leftLhs = tensorProductTypedIterative(linearCombination(alpha, a1, beta, a2), b1)
		const leftRhs = linearCombination(
			alpha,
			tensorProductTypedIterative(a1, b1),
			beta,
			tensorProductTypedIterative(a2, b1)
		)
		assertFloat64ArrayClose(leftLhs, leftRhs)

		const rightLhs = tensorProductTypedIterative(a1, linearCombination(alpha, b1, beta, b2))
		const rightRhs = linearCombination(
			alpha,
			tensorProductTypedIterative(a1, b1),
			beta,
			tensorProductTypedIterative(a1, b2)
		)
		assertFloat64ArrayClose(rightLhs, rightRhs)
	})

	test('cross-check: associativity (a ⊗ b) ⊗ c = a ⊗ (b ⊗ c)', () => {
		const a = new Float64Array([1.1, -2.2, 3.3])
		const b = new Float64Array([0.5, -1.5, 2.5, -3.5])
		const c = new Float64Array([4.0, -0.25, 1.75, -2.0, 0.125])

		const lhs = tensorProductTypedIterative(tensorProductTypedIterative(a, b), c)
		const rhs = tensorProductTypedIterative(a, tensorProductTypedIterative(b, c))

		assert.equal(lhs.length, a.length * b.length * c.length)
		assertFloat64ArrayClose(lhs, rhs, 1e-12)
	})

	test('cross-check: mixed inner-product property <a ⊗ b, c ⊗ d> = <a, c> * <b, d> and transpose symmetry', () => {
		const a = new Float64Array([1.5, -2.5, 3.5, -0.5])
		const b = new Float64Array([2.0, 1.25, -4.0])
		const c = new Float64Array([-1.0, 0.75, 2.25, 3.0])
		const d = new Float64Array([0.5, -3.0, 1.5])

		const ab = tensorProductTypedIterative(a, b)
		const cd = tensorProductTypedIterative(c, d)
		const lhs = dot(ab, cd)
		const rhs = dot(a, c) * dot(b, d)
		assert.ok(Math.abs(lhs - rhs) <= 1e-12 * Math.max(1, Math.abs(rhs)))

		const ba = tensorProductTypedIterative(b, a)
		for (let i = 0; i < a.length; i++) {
			for (let j = 0; j < b.length; j++) {
				assert.equal(ab[i * b.length + j], ba[j * a.length + i])
			}
		}
	})
})
