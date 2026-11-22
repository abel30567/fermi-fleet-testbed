import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { integralTypedIterative } from './integralTypedIterative.js'

function assertClose(actual, expected, tolerance = 1e-12) {
	assert.ok(
		Math.abs(actual - expected) <= tolerance,
		`Expected ${actual} to be within ${tolerance} of ${expected} (diff: ${Math.abs(actual - expected)})`
	)
}

describe('integralTypedIterative', () => {
	describe('normal cases', () => {
		it('integrates with default uniform step dx = 1', () => {
			const y = new Float64Array([1, 2, 3, 4])
			// 0.5*(1+2) + 0.5*(2+3) + 0.5*(3+4) = 1.5 + 2.5 + 3.5 = 7.5
			assert.equal(integralTypedIterative(y), 7.5)
		})

		it('integrates a constant function with explicit uniform dx', () => {
			const y = new Float64Array([5, 5, 5, 5, 5])
			// 4 intervals of width 0.25 => width 1.0, height 5 => 5
			assert.equal(integralTypedIterative(y, 0.25), 5)
		})

		it('integrates with non-uniform Float64Array x coordinates', () => {
			const x = new Float64Array([0, 1, 3, 6])
			const y = new Float64Array([2, 4, 4, 10])
			// [0,1]: 0.5*(2+4)*1 = 3
			// [1,3]: 0.5*(4+4)*2 = 8
			// [3,6]: 0.5*(4+10)*3 = 21
			assert.equal(integralTypedIterative(y, x), 32)
		})

		it('matches between uniform dx and equivalent uniform x array', () => {
			const n = 21
			const dx = 0.2
			const x = new Float64Array(n)
			const y = new Float64Array(n)
			for (let i = 0; i < n; i += 1) {
				x[i] = i * dx
				y[i] = Math.cos(x[i]) + 0.5 * x[i]
			}
			const byDx = integralTypedIterative(y, dx)
			const byX = integralTypedIterative(y, x)
			assertClose(byDx, byX, 1e-13)
		})

		it('computes signed area for negative values and symmetric cancellation', () => {
			const allNeg = new Float64Array([-3, -3, -3])
			assert.equal(integralTypedIterative(allNeg, 2), -12)

			const oddSym = new Float64Array([-2, -1, 0, 1, 2])
			assert.equal(integralTypedIterative(oddSym, 0.5), 0)
		})

		it('does not mutate input Float64Arrays', () => {
			const y = new Float64Array([1, 3, 2, 5])
			const x = new Float64Array([0, 0.5, 2, 4])
			const yCopy = new Float64Array(y)
			const xCopy = new Float64Array(x)

			integralTypedIterative(y, x)
			assert.deepEqual(y, yCopy)
			assert.deepEqual(x, xCopy)
		})
	})

	describe('edge cases', () => {
		it('returns 0 for empty Float64Array', () => {
			const empty = new Float64Array(0)
			assert.equal(integralTypedIterative(empty), 0)
			assert.equal(integralTypedIterative(empty, 0.5), 0)
			assert.equal(integralTypedIterative(empty, new Float64Array(0)), 0)
		})

		it('returns 0 for single-element Float64Array', () => {
			const single = new Float64Array([42])
			assert.equal(integralTypedIterative(single), 0)
			assert.equal(integralTypedIterative(single, 3), 0)
			assert.equal(integralTypedIterative(single, new Float64Array([10])), 0)
		})

		it('handles two-element Float64Array (single trapezoid)', () => {
			const y = new Float64Array([1, 5])
			assert.equal(integralTypedIterative(y), 3)
			assert.equal(integralTypedIterative(y, 2), 6)
			assert.equal(integralTypedIterative(y, new Float64Array([2, 6])), 12)
		})

		it('returns positive 0 for dx = 0, dx = -0, and identical x values', () => {
			const y = new Float64Array([-4, -2, -6])
			const resZero = integralTypedIterative(y, 0)
			assert.ok(Object.is(resZero, 0))

			const resNegZero = integralTypedIterative(y, -0)
			assert.ok(Object.is(resNegZero, 0))

			const resConstX = integralTypedIterative(y, new Float64Array([3, 3, 3]))
			assert.ok(Object.is(resConstX, 0))
		})

		it('handles negative dx and decreasing x (reversed integration bounds)', () => {
			const y = new Float64Array([1, 2, 5])
			assert.equal(
				integralTypedIterative(y, -0.5),
				-integralTypedIterative(y, 0.5)
			)

			const xAsc = new Float64Array([0, 1, 4])
			const xDesc = new Float64Array([4, 1, 0])
			const yRev = new Float64Array([5, 2, 1])
			assert.equal(
				integralTypedIterative(yRev, xDesc),
				-integralTypedIterative(y, xAsc)
			)
		})

		it('handles duplicate consecutive x coordinates (zero-width subintervals)', () => {
			const x = new Float64Array([0, 2, 2, 5])
			const y = new Float64Array([1, 3, 7, 7])
			// [0,2]: 0.5*(1+3)*2 = 4; [2,2]: 0; [2,5]: 0.5*(7+7)*3 = 21
			assert.equal(integralTypedIterative(y, x), 25)
		})

		it('throws TypeError when y is not a Float64Array', () => {
			assert.throws(() => integralTypedIterative([1, 2, 3]), TypeError)
			assert.throws(
				() => integralTypedIterative(new Float32Array([1, 2, 3])),
				TypeError
			)
			assert.throws(() => integralTypedIterative(null), TypeError)
			assert.throws(() => integralTypedIterative(undefined), TypeError)
			assert.throws(() => integralTypedIterative(42), TypeError)
		})

		it('throws TypeError when second argument is neither number nor Float64Array', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(() => integralTypedIterative(y, [0, 1, 2]), TypeError)
			assert.throws(
				() => integralTypedIterative(y, new Float32Array([0, 1, 2])),
				TypeError
			)
			assert.throws(() => integralTypedIterative(y, null), TypeError)
			assert.throws(() => integralTypedIterative(y, '1'), TypeError)
			assert.throws(() => integralTypedIterative(y, {}), TypeError)
		})

		it('throws RangeError on non-finite dx, y, or x values', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(() => integralTypedIterative(y, NaN), RangeError)
			assert.throws(() => integralTypedIterative(y, Infinity), RangeError)
			assert.throws(() => integralTypedIterative(y, -Infinity), RangeError)

			assert.throws(
				() => integralTypedIterative(new Float64Array([1, NaN, 3])),
				RangeError
			)
			assert.throws(
				() => integralTypedIterative(new Float64Array([Infinity, 2])),
				RangeError
			)
			assert.throws(
				() => integralTypedIterative(new Float64Array([NaN])),
				RangeError
			)

			assert.throws(
				() => integralTypedIterative(y, new Float64Array([0, NaN, 2])),
				RangeError
			)
			assert.throws(
				() => integralTypedIterative(y, new Float64Array([0, 1, -Infinity])),
				RangeError
			)
			assert.throws(
				() =>
					integralTypedIterative(
						new Float64Array([1]),
						new Float64Array([Infinity])
					),
				RangeError
			)
		})

		it('throws RangeError when y and x lengths do not match', () => {
			assert.throws(
				() =>
					integralTypedIterative(
						new Float64Array([1, 2, 3]),
						new Float64Array([0, 1])
					),
				RangeError
			)
			assert.throws(
				() =>
					integralTypedIterative(
						new Float64Array(0),
						new Float64Array([0])
					),
				RangeError
			)
		})
	})

	describe('analytical integral cross-checks', () => {
		it('is exact for linear functions on both uniform and non-uniform grids', () => {
			// f(x) = 3x - 2 on [0, 4]: integral = [1.5*x^2 - 2*x]_0^4 = 24 - 8 = 16
			const expected = 16

			const n = 9
			const dx = 4 / (n - 1)
			const yUniform = new Float64Array(n)
			for (let i = 0; i < n; i += 1) {
				const x = i * dx
				yUniform[i] = 3 * x - 2
			}
			assertClose(integralTypedIterative(yUniform, dx), expected, 1e-14)

			const xNonUniform = new Float64Array([0, 0.1, 0.7, 1.5, 2.9, 4.0])
			const yNonUniform = new Float64Array(xNonUniform.length)
			for (let i = 0; i < xNonUniform.length; i += 1) {
				yNonUniform[i] = 3 * xNonUniform[i] - 2
			}
			assertClose(
				integralTypedIterative(yNonUniform, xNonUniform),
				expected,
				1e-13
			)
		})

		it('approximates integral of x^2 on [0, 1] to 1/3 with O(h^2) convergence', () => {
			const exact = 1 / 3

			const integrateX2 = (intervals) => {
				const dx = 1 / intervals
				const y = new Float64Array(intervals + 1)
				for (let i = 0; i <= intervals; i += 1) {
					const x = i * dx
					y[i] = x * x
				}
				return integralTypedIterative(y, dx)
			}

			const est100 = integrateX2(100)
			const est200 = integrateX2(200)
			const est1000 = integrateX2(1000)

			// Analytical trapezoidal formula for x^2 on [0,1] is 1/3 + 1/(6*N^2)
			assertClose(est100, exact + 1 / (6 * 100 * 100), 1e-14)
			assertClose(est200, exact + 1 / (6 * 200 * 200), 1e-14)
			assertClose(est1000, exact, 1e-6)

			// Doubling intervals reduces error by factor of 4 (second-order accuracy)
			const errRatio = (est100 - exact) / (est200 - exact)
			assertClose(errRatio, 4, 1e-9)
		})

		it('approximates integral of sin(x) on [0, pi] to 2', () => {
			const intervals = 1000
			const dx = Math.PI / intervals
			const y = new Float64Array(intervals + 1)
			for (let i = 0; i <= intervals; i += 1) {
				y[i] = Math.sin(i * dx)
			}
			const result = integralTypedIterative(y, dx)
			assertClose(result, 2, 1e-5)
		})

		it('approximates integral of exp(x) on [0, 1] to e - 1 on a non-uniform grid', () => {
			const intervals = 500
			const x = new Float64Array(intervals + 1)
			const y = new Float64Array(intervals + 1)
			for (let i = 0; i <= intervals; i += 1) {
				const t = i / intervals
				x[i] = t * t // non-uniform quadratic node spacing in [0, 1]
				y[i] = Math.exp(x[i])
			}
			const result = integralTypedIterative(y, x)
			assertClose(result, Math.E - 1, 1e-5)
		})

		it('satisfies linearity and interval additivity identities', () => {
			const x = new Float64Array([0, 0.3, 0.8, 1.5, 2.0, 2.7, 3.5])
			const n = x.length
			const f = new Float64Array(n)
			const g = new Float64Array(n)
			const combined = new Float64Array(n)
			const alpha = 2.5
			const beta = -1.75

			for (let i = 0; i < n; i += 1) {
				f[i] = Math.sin(x[i])
				g[i] = x[i] * x[i] + 1
				combined[i] = alpha * f[i] + beta * g[i]
			}

			// Linearity: int(alpha*f + beta*g) = alpha*int(f) + beta*int(g)
			const lhsLinear = integralTypedIterative(combined, x)
			const rhsLinear =
				alpha * integralTypedIterative(f, x) +
				beta * integralTypedIterative(g, x)
			assertClose(lhsLinear, rhsLinear, 1e-13)

			// Additivity: int_a^c g = int_a^b g + int_b^c g (split at index 3, x = 1.5)
			const split = 3
			const left = integralTypedIterative(
				g.subarray(0, split + 1),
				x.subarray(0, split + 1)
			)
			const right = integralTypedIterative(
				g.subarray(split),
				x.subarray(split)
			)
			const whole = integralTypedIterative(g, x)
			assertClose(left + right, whole, 1e-13)
		})
	})
})
