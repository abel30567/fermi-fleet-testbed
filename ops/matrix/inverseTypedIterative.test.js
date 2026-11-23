import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { inverseTypedIterative } from './inverseTypedIterative.js'

/**
 * Multiplies two n x n row-major Float64Array matrices.
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		for (let k = 0; k < n; k++) {
			const aik = a[i * n + k]
			for (let j = 0; j < n; j++) {
				out[i * n + j] += aik * b[k * n + j]
			}
		}
	}
	return out
}

/**
 * Asserts two Float64Array matrices are element-wise close within eps.
 */
function assertMatrixClose(actual, expected, eps = 1e-10) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, 'matrix lengths must match')
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`element ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])} > ${eps})`,
		)
	}
}

/**
 * Builds an n x n identity Float64Array.
 */
function identity(n) {
	const id = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		id[i * n + i] = 1
	}
	return id
}

/**
 * Independent 3x3 inverse via closed-form cofactor/adjugate expansion.
 */
function inverse3x3Adjugate(m) {
	const [a, b, c, d, e, f, g, h, i] = m
	const c00 = e * i - f * h
	const c01 = -(d * i - f * g)
	const c02 = d * h - e * g
	const c10 = -(b * i - c * h)
	const c11 = a * i - c * g
	const c12 = -(a * h - b * g)
	const c20 = b * f - c * e
	const c21 = -(a * f - c * d)
	const c22 = a * e - b * d
	const det = a * c00 + b * c01 + c * c02
	// Adjugate is transpose of cofactor matrix.
	return new Float64Array([
		c00 / det,
		c10 / det,
		c20 / det,
		c01 / det,
		c11 / det,
		c21 / det,
		c02 / det,
		c12 / det,
		c22 / det,
	])
}

describe('inverseTypedIterative', () => {
	test('inverts 1x1 matrices', () => {
		assertMatrixClose(inverseTypedIterative(new Float64Array([4])), new Float64Array([0.25]))
		assertMatrixClose(inverseTypedIterative(new Float64Array([-0.5])), new Float64Array([-2]))
	})

	test('inverts a 2x2 matrix with known exact inverse', () => {
		const m = new Float64Array([4, 7, 2, 6])
		const inv = inverseTypedIterative(m)
		assertMatrixClose(inv, new Float64Array([0.6, -0.7, -0.2, 0.4]), 1e-12)
	})

	test('inverts a 3x3 unimodular matrix with exact integer inverse', () => {
		const m = new Float64Array([1, 2, 3, 0, 1, 4, 5, 6, 0])
		const expected = new Float64Array([-24, 18, 5, 20, -15, -4, -5, 4, 1])
		const inv = inverseTypedIterative(m)
		assertMatrixClose(inv, expected, 1e-11)
	})

	test('handles partial pivoting when diagonal entries are zero', () => {
		const m = new Float64Array([0, 1, 0, 0, 0, 1, 1, 0, 0])
		const expected = new Float64Array([0, 0, 1, 1, 0, 0, 0, 1, 0])
		const inv = inverseTypedIterative(m)
		assertMatrixClose(inv, expected, 1e-12)
		assertMatrixClose(matMul(m, inv, 3), identity(3), 1e-12)
	})

	test('inverts identity and diagonal matrices', () => {
		const id4 = identity(4)
		assertMatrixClose(inverseTypedIterative(id4), id4, 1e-15)

		const diag = new Float64Array([2, 0, 0, 0, -4, 0, 0, 0, 0.25])
		const expected = new Float64Array([0.5, 0, 0, 0, -0.25, 0, 0, 0, 4])
		assertMatrixClose(inverseTypedIterative(diag), expected, 1e-15)
	})

	test('accepts explicit dimension n and does not mutate input', () => {
		const m = new Float64Array([2, 1, 5, 3])
		const snapshot = new Float64Array(m)
		const inv = inverseTypedIterative(m, 2)
		assert.deepEqual(m, snapshot)
		assertMatrixClose(inv, new Float64Array([3, -1, -5, 2]), 1e-12)
	})

	test('handles empty 0x0 matrix', () => {
		const empty = new Float64Array(0)
		const res1 = inverseTypedIterative(empty)
		const res2 = inverseTypedIterative(empty, 0)
		assert.ok(res1 instanceof Float64Array)
		assert.equal(res1.length, 0)
		assert.equal(res2.length, 0)
	})

	test('handles well-conditioned very small and very large uniform scales', () => {
		const small = new Float64Array([1e-10, 0, 0, 1e-10])
		assertMatrixClose(inverseTypedIterative(small), new Float64Array([1e10, 0, 0, 1e10]), 1e-2)

		const large = new Float64Array([1e10, 0, 0, 1e10])
		assertMatrixClose(inverseTypedIterative(large), new Float64Array([1e-10, 0, 0, 1e-10]), 1e-22)
	})

	test('throws on singular matrices', () => {
		assert.throws(() => inverseTypedIterative(new Float64Array([0])), /singular/i)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, 2, 2, 4])), /singular/i)
		assert.throws(
			() => inverseTypedIterative(new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9])),
			/singular/i,
		)
		assert.throws(() => inverseTypedIterative(new Float64Array(9)), /singular/i)
	})

	test('validates input types, dimensions, finiteness, and tolerance', () => {
		assert.throws(() => inverseTypedIterative([1, 0, 0, 1]), TypeError)
		assert.throws(() => inverseTypedIterative(new Int32Array([1, 0, 0, 1])), TypeError)
		assert.throws(() => inverseTypedIterative(null), TypeError)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, 2, 3])), RangeError)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, 0, 0, 1]), '2'), TypeError)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, 0, 0, 1]), -2), RangeError)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, 0, 0, 1]), 1.5), RangeError)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, 0, 0, 1]), 3), RangeError)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, NaN, 0, 1])), RangeError)
		assert.throws(() => inverseTypedIterative(new Float64Array([1, Infinity, 0, 1])), RangeError)
		assert.throws(
			() => inverseTypedIterative(new Float64Array([1, 0, 0, 1]), 2, -1e-6),
			RangeError,
		)
		assert.throws(
			() => inverseTypedIterative(new Float64Array([1, 0, 0, 1]), 2, '1e-6'),
			TypeError,
		)
	})

	test('cross-check: matches independent 3x3 adjugate formula', () => {
		const m = new Float64Array([2, -1, 3, 4, 0, -2, -3, 5, 1])
		const actual = inverseTypedIterative(m)
		const expected = inverse3x3Adjugate(m)
		assertMatrixClose(actual, expected, 1e-12)
	})

	test('cross-check: A * A^-1 = I, A^-1 * A = I, and inv(inv(A)) = A on 5x5 matrix', () => {
		const n = 5
		// Deterministic well-conditioned 5x5 matrix
		const a = new Float64Array([
			7, -2, 1, 0.5, -1,
			-1, 8, -3, 2, 0.25,
			2, 1, 9, -2, 1.5,
			-0.5, 3, -1, 10, -2,
			1, -1.5, 2, 1, 6,
		])
		const invA = inverseTypedIterative(a, n)
		const id = identity(n)
		assertMatrixClose(matMul(a, invA, n), id, 1e-12)
		assertMatrixClose(matMul(invA, a, n), id, 1e-12)
		assertMatrixClose(inverseTypedIterative(invA, n), a, 1e-11)
	})

	test('cross-check: orthogonal rotation matrix inverse equals transpose and (AB)^-1 = B^-1 A^-1', () => {
		const theta = 1.234567
		const c = Math.cos(theta)
		const s = Math.sin(theta)
		const r = new Float64Array([c, -s, 0, s, c, 0, 0, 0, 1])
		const rT = new Float64Array([c, s, 0, -s, c, 0, 0, 0, 1])
		assertMatrixClose(inverseTypedIterative(r), rT, 1e-12)

		const b = new Float64Array([3, 1, -2, 0, 4, 1, 2, -1, 5])
		const rb = matMul(r, b, 3)
		const invRB = inverseTypedIterative(rb, 3)
		const invBinvR = matMul(inverseTypedIterative(b, 3), inverseTypedIterative(r, 3), 3)
		assertMatrixClose(invRB, invBinvR, 1e-11)
	})
})
