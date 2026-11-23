import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeDualIterative } from './magnitudeDualIterative.js'

function assertClose(actual, expected, tolerance = 1e-12, message) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		message ?? `Expected ${actual} to be within ${tolerance} of ${expected}`,
	)
}

function realMagnitude(values) {
	let sumSq = 0
	for (const x of values) {
		sumSq += x * x
	}
	return Math.sqrt(sumSq)
}

describe('magnitudeDualIterative', () => {
	describe('normal cases', () => {
		it('computes magnitude and derivative for 1D positive and negative dual vectors', () => {
			assert.deepStrictEqual(magnitudeDualIterative([{ v: 5, d: 2 }]), { v: 5, d: 2 })
			assert.deepStrictEqual(magnitudeDualIterative([{ v: -5, d: 2 }]), { v: 5, d: -2 })
		})

		it('computes magnitude and derivative for a 2D Pythagorean triple', () => {
			// v = [3, 4], ||v|| = 5, d = [1, 2], (3*1 + 4*2)/5 = 11/5 = 2.2
			const result = magnitudeDualIterative([
				{ v: 3, d: 1 },
				{ v: 4, d: 2 },
			])
			assertClose(result.v, 5)
			assertClose(result.d, 2.2)
		})

		it('computes magnitude and derivative for a 3D Pythagorean quadruple with mixed signs', () => {
			// v = [2, -3, 6], ||v|| = 7, d = [-1, 4, 0.5]
			// dot = 2*(-1) + (-3)*4 + 6*0.5 = -2 - 12 + 3 = -11 -> d = -11/7
			const result = magnitudeDualIterative([
				{ v: 2, d: -1 },
				{ v: -3, d: 4 },
				{ v: 6, d: 0.5 },
			])
			assertClose(result.v, 7)
			assertClose(result.d, -11 / 7)
		})

		it('returns zero derivative for orthogonal tangent (unit circle trajectory)', () => {
			const theta = 1.2345
			const result = magnitudeDualIterative([
				{ v: Math.cos(theta), d: -Math.sin(theta) },
				{ v: Math.sin(theta), d: Math.cos(theta) },
			])
			assertClose(result.v, 1)
			assertClose(result.d, 0)
		})

		it('computes exact derivative when tangent is parallel to primal vector', () => {
			const scale = 3.5
			const primal = [1.5, -2.5, 4, -0.5, 2]
			const vec = primal.map((v) => ({ v, d: scale * v }))
			const expectedNorm = realMagnitude(primal)
			const result = magnitudeDualIterative(vec)
			assertClose(result.v, expectedNorm)
			assertClose(result.d, scale * expectedNorm)
		})

		it('handles higher-dimensional vectors iteratively', () => {
			// 100 components all equal to { v: 1, d: 0.25 }
			// ||v|| = sqrt(100) = 10, d = (100 * 1 * 0.25) / 10 = 2.5
			const vec = Array.from({ length: 100 }, () => ({ v: 1, d: 0.25 }))
			const result = magnitudeDualIterative(vec)
			assertClose(result.v, 10)
			assertClose(result.d, 2.5)
		})
	})

	describe('edge cases', () => {
		it('returns { v: 0, d: 0 } for a zero vector with all-zero tangents', () => {
			const result = magnitudeDualIterative([
				{ v: 0, d: 0 },
				{ v: -0, d: -0 },
				{ v: 0, d: 0 },
			])
			assert.deepStrictEqual(result, { v: 0, d: 0 })
			assert.ok(Object.is(result.v, 0))
			assert.ok(Object.is(result.d, 0))
		})

		it('throws RangeError for a zero vector with non-zero tangent', () => {
			assert.throws(
				() =>
					magnitudeDualIterative([
						{ v: 0, d: 1 },
						{ v: 0, d: 0 },
					]),
				RangeError,
			)
		})

		it('normalizes negative zero derivative to positive zero', () => {
			const result = magnitudeDualIterative([{ v: -3, d: 0 }])
			assert.strictEqual(result.v, 3)
			assert.ok(Object.is(result.d, 0))
		})

		it('avoids spurious overflow for very large primal components', () => {
			const result = magnitudeDualIterative([
				{ v: 3e200, d: 1 },
				{ v: 4e200, d: 2 },
			])
			assertClose(result.v, 5e200, 1e186)
			assertClose(result.d, 2.2)
		})

		it('avoids spurious underflow for very small primal components', () => {
			const result = magnitudeDualIterative([
				{ v: 3e-200, d: 1 },
				{ v: 4e-200, d: 2 },
			])
			assertClose(result.v, 5e-200, 1e-214)
			assertClose(result.d, 2.2)
		})

		it('throws RangeError when true magnitude overflows finite range', () => {
			assert.throws(
				() =>
					magnitudeDualIterative([
						{ v: 1e308, d: 0 },
						{ v: 1e308, d: 0 },
						{ v: 1e308, d: 0 },
						{ v: 1e308, d: 0 },
					]),
				RangeError,
			)
		})

		it('does not mutate the input array or dual number objects', () => {
			const a = Object.freeze({ v: 3, d: -1 })
			const b = Object.freeze({ v: 4, d: 2 })
			const input = Object.freeze([a, b])
			const result = magnitudeDualIterative(input)
			assertClose(result.v, 5)
			assertClose(result.d, 1)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError when input is not an array', () => {
			for (const bad of [null, undefined, 42, 'vector', { v: 1, d: 0 }, new Float64Array([1])]) {
				assert.throws(() => magnitudeDualIterative(bad), TypeError)
			}
		})

		it('throws RangeError when vector is empty', () => {
			assert.throws(() => magnitudeDualIterative([]), RangeError)
		})

		it('throws TypeError for sparse arrays or non-object elements', () => {
			const sparse = new Array(2)
			sparse[0] = { v: 1, d: 0 }
			assert.throws(() => magnitudeDualIterative(sparse), TypeError)

			for (const badElem of [null, undefined, 1, '1', [1, 0], true]) {
				assert.throws(() => magnitudeDualIterative([badElem]), TypeError)
			}
		})

		it('throws TypeError for missing or non-numeric v or d properties', () => {
			for (const badDual of [
				{},
				{ v: 1 },
				{ d: 1 },
				{ v: '3', d: 1 },
				{ v: 3, d: '1' },
				{ v: 3, d: null },
				{ v: undefined, d: 0 },
			]) {
				assert.throws(() => magnitudeDualIterative([badDual]), TypeError)
			}
		})

		it('throws RangeError for non-finite v or d values', () => {
			for (const badDual of [
				{ v: Number.NaN, d: 0 },
				{ v: 1, d: Number.NaN },
				{ v: Number.POSITIVE_INFINITY, d: 0 },
				{ v: Number.NEGATIVE_INFINITY, d: 0 },
				{ v: 1, d: Number.POSITIVE_INFINITY },
				{ v: 1, d: Number.NEGATIVE_INFINITY },
			]) {
				assert.throws(() => magnitudeDualIterative([badDual]), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('matches central finite-difference approximation of derivative', () => {
			const testVectors = [
				[
					{ v: 1.2, d: -0.7 },
					{ v: -2.5, d: 3.1 },
					{ v: 0.8, d: 1.4 },
				],
				[
					{ v: -4.25, d: 0.5 },
					{ v: 0.1, d: -2.3 },
					{ v: 7.75, d: 0.9 },
					{ v: -1.6, d: -1.1 },
				],
				[
					{ v: 0, d: 5 },
					{ v: 2, d: -1 },
					{ v: -3, d: 0.25 },
				],
			]

			const h = 1e-6
			for (const vec of testVectors) {
				const dualResult = magnitudeDualIterative(vec)
				const plus = realMagnitude(vec.map(({ v, d }) => v + h * d))
				const minus = realMagnitude(vec.map(({ v, d }) => v - h * d))
				const finiteDiff = (plus - minus) / (2 * h)

				assertClose(dualResult.v, realMagnitude(vec.map(({ v }) => v)), 1e-12)
				assertClose(dualResult.d, finiteDiff, 1e-8)
			}
		})

		it('satisfies the squared-norm chain-rule identity and analytic curve derivative', () => {
			// Curve r(t) = [t^2 + 1, sin(t), exp(0.5 * t)]
			// r'(t) = [2t, cos(t), 0.5 * exp(0.5 * t)]
			for (const t of [-1.5, 0, 0.75, 2.25]) {
				const vec = [
					{ v: t * t + 1, d: 2 * t },
					{ v: Math.sin(t), d: Math.cos(t) },
					{ v: Math.exp(0.5 * t), d: 0.5 * Math.exp(0.5 * t) },
				]

				const { v, d } = magnitudeDualIterative(vec)

				// Identity: ||r|| * d/dt(||r||) === r · r'
				const dotProduct = vec.reduce((acc, item) => acc + item.v * item.d, 0)
				assertClose(v * d, dotProduct, 1e-11)

				// Positive scaling homogeneity: ||alpha * x|| = alpha * ||x|| in both v and d
				const alpha = 2.75
				const scaled = magnitudeDualIterative(
					vec.map((item) => ({ v: alpha * item.v, d: alpha * item.d })),
				)
				assertClose(scaled.v, alpha * v, 1e-11)
				assertClose(scaled.d, alpha * d, 1e-11)
			}
		})
	})
})
