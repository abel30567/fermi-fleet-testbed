import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeTypedIterative } from './magnitudeTypedIterative.js'

/**
 * Helper to assert two numbers are within a relative/absolute tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 * @param {number} [absTol=1e-15]
 */
function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, limit=${limit})`
	)
}

describe('magnitudeTypedIterative', () => {
	describe('normal cases', () => {
		it('computes exact magnitudes for Pythagorean triples and integer norms', () => {
			assert.equal(magnitudeTypedIterative(new Float64Array([3, 4])), 5)
			assert.equal(magnitudeTypedIterative(new Float64Array([5, 12])), 13)
			assert.equal(magnitudeTypedIterative(new Float64Array([1, 2, 2])), 3)
			assert.equal(magnitudeTypedIterative(new Float64Array([2, 3, 6])), 7)
		})

		it('handles unit basis vectors and negative components', () => {
			assert.equal(magnitudeTypedIterative(new Float64Array([1, 0, 0])), 1)
			assert.equal(magnitudeTypedIterative(new Float64Array([0, -1, 0])), 1)
			assert.equal(magnitudeTypedIterative(new Float64Array([-3, -4])), 5)
			assert.equal(magnitudeTypedIterative(new Float64Array([-2, 3, -6])), 7)
		})

		it('computes magnitudes for floating-point vectors', () => {
			assertClose(magnitudeTypedIterative(new Float64Array([1, 1])), Math.SQRT2)
			assertClose(magnitudeTypedIterative(new Float64Array([0.6, 0.8])), 1)
			assertClose(
				magnitudeTypedIterative(new Float64Array([1.5, -2.5, 3.5])),
				Math.sqrt(1.5 * 1.5 + 2.5 * 2.5 + 3.5 * 3.5)
			)
		})

		it('handles larger vectors and does not mutate the input array', () => {
			const n = 1000
			const v = new Float64Array(n).fill(2.5)
			const copy = new Float64Array(v)
			const mag = magnitudeTypedIterative(v)
			assertClose(mag, 2.5 * Math.sqrt(n))
			assert.deepEqual(v, copy)
		})

		it('works correctly on Float64Array subarrays with non-zero byteOffset', () => {
			const backing = new Float64Array([100, 3, 4, 200])
			const slice = backing.subarray(1, 3)
			assert.equal(magnitudeTypedIterative(slice), 5)
		})
	})

	describe('edge cases', () => {
		it('returns +0 for an empty Float64Array', () => {
			const result = magnitudeTypedIterative(new Float64Array(0))
			assert.ok(Object.is(result, 0))
		})

		it('returns +0 for all-zero vectors including negative zeros', () => {
			assert.ok(Object.is(magnitudeTypedIterative(new Float64Array([0, 0, 0])), 0))
			assert.ok(Object.is(magnitudeTypedIterative(new Float64Array([-0, -0])), 0))
		})

		it('returns absolute value for single-element vectors', () => {
			assert.ok(Object.is(magnitudeTypedIterative(new Float64Array([-0])), 0))
			assert.equal(magnitudeTypedIterative(new Float64Array([42.25])), 42.25)
			assert.equal(magnitudeTypedIterative(new Float64Array([-42.25])), 42.25)
		})

		it('avoids intermediate overflow for very large finite components', () => {
			assertClose(
				magnitudeTypedIterative(new Float64Array([1e200, 1e200])),
				1e200 * Math.SQRT2
			)
			assertClose(
				magnitudeTypedIterative(new Float64Array([3e300, 4e300])),
				5e300
			)
		})

		it('avoids intermediate underflow for very small finite components', () => {
			assertClose(
				magnitudeTypedIterative(new Float64Array([1e-200, 1e-200])),
				1e-200 * Math.SQRT2,
				1e-12,
				0
			)
			assertClose(
				magnitudeTypedIterative(new Float64Array([3e-300, 4e-300])),
				5e-300,
				1e-12,
				0
			)
		})

		it('handles mixed extreme magnitudes regardless of element order', () => {
			assertClose(magnitudeTypedIterative(new Float64Array([1e-150, 1e150])), 1e150)
			assertClose(magnitudeTypedIterative(new Float64Array([1e150, 1e-150])), 1e150)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when input is not a Float64Array', () => {
			const invalidInputs = [
				null,
				undefined,
				[3, 4],
				new Float32Array([3, 4]),
				new Int32Array([3, 4]),
				42,
				'3,4',
				{ length: 2, 0: 3, 1: 4 }
			]
			for (const bad of invalidInputs) {
				assert.throws(() => magnitudeTypedIterative(bad), TypeError)
			}
		})

		it('throws RangeError when any element is NaN or infinite', () => {
			assert.throws(
				() => magnitudeTypedIterative(new Float64Array([NaN])),
				RangeError
			)
			assert.throws(
				() => magnitudeTypedIterative(new Float64Array([3, NaN, 4])),
				RangeError
			)
			assert.throws(
				() => magnitudeTypedIterative(new Float64Array([Infinity, 1])),
				RangeError
			)
			assert.throws(
				() => magnitudeTypedIterative(new Float64Array([1, 2, -Infinity])),
				RangeError
			)
		})
	})

	describe('independent cross-checks and mathematical identities', () => {
		it('matches Math.hypot(...v) across diverse deterministic vectors', () => {
			// Linear congruential generator for reproducible test vectors
			let seed = 123456789
			const nextRand = () => {
				seed = (1664525 * seed + 1013904223) >>> 0
				return (seed / 0xffffffff) * 200 - 100
			}

			for (const len of [1, 2, 5, 17, 64, 250]) {
				const v = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					v[i] = nextRand()
				}
				const actual = magnitudeTypedIterative(v)
				const expected = Math.hypot(...v)
				assertClose(actual, expected, 1e-14, 1e-15)
			}
		})

		it('satisfies homogeneity (scaling invariance): ||k * v|| = |k| * ||v||', () => {
			const v = new Float64Array([1.25, -3.5, 7.125, -0.5, 4.75])
			const baseNorm = magnitudeTypedIterative(v)
			const scalars = [0, 1, -1, 3.7, -12.5, 1e-100, -1e100]

			for (const k of scalars) {
				const scaled = new Float64Array(v.length)
				for (let i = 0; i < v.length; i++) {
					scaled[i] = k * v[i]
				}
				const expected = Math.abs(k) * baseNorm
				assertClose(magnitudeTypedIterative(scaled), expected, 1e-13, 0)
			}
		})

		it('matches closed-form sum of squares for [1, 2, ..., n]', () => {
			const n = 500
			const v = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				v[i] = i + 1
			}
			const closedForm = Math.sqrt((n * (n + 1) * (2 * n + 1)) / 6)
			assertClose(magnitudeTypedIterative(v), closedForm, 1e-14)
		})

		it('satisfies the triangle inequality and dot-product identity ||v||^2 = v·v', () => {
			const u = new Float64Array([1.5, -2.25, 3.75, 0.5, -4.0])
			const v = new Float64Array([-0.75, 4.5, -1.25, 2.0, 3.25])
			const sum = new Float64Array(u.length)
			let dotU = 0
			for (let i = 0; i < u.length; i++) {
				sum[i] = u[i] + v[i]
				dotU += u[i] * u[i]
			}

			const normU = magnitudeTypedIterative(u)
			const normV = magnitudeTypedIterative(v)
			const normSum = magnitudeTypedIterative(sum)

			assert.ok(normSum <= normU + normV + 1e-12)
			assertClose(normU * normU, dotU, 1e-14)
		})

		it('is invariant under element reversal (permutation invariance)', () => {
			const v = new Float64Array([1e-3, 1e2, -5.5, 42.1, -0.007, 99.9])
			const reversed = new Float64Array(v).reverse()
			assertClose(
				magnitudeTypedIterative(v),
				magnitudeTypedIterative(reversed),
				1e-14
			)
		})
	})
})
