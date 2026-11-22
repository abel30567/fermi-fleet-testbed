import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralTypedRecursive } from './integralTypedRecursive.js'

/**
 * Independent iterative trapezoidal reference implementation for cross-checking.
 */
function iterativeTrapezoid(y, xOrDx = 1) {
	if (y.length < 2) return 0
	let sum = 0
	if (typeof xOrDx === 'number') {
		for (let i = 0; i < y.length - 1; i++) {
			sum += 0.5 * (y[i] + y[i + 1]) * xOrDx
		}
	} else {
		for (let i = 0; i < y.length - 1; i++) {
			sum += 0.5 * (y[i] + y[i + 1]) * (xOrDx[i + 1] - xOrDx[i])
		}
	}
	return sum
}

describe('integralTypedRecursive', () => {
	describe('normal cases', () => {
		test('integrates a constant function with default dx = 1', () => {
			const y = new Float64Array([5, 5, 5, 5, 5])
			// 4 unit intervals * height 5 = 20
			assert.equal(integralTypedRecursive(y), 20)
		})

		test('integrates a linear function exactly with uniform dx', () => {
			// f(x) = 2x + 3 on [0, 4] => exact integral = [x^2 + 3x]_0^4 = 28
			const n = 9
			const dx = 0.5
			const y = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const x = i * dx
				y[i] = 2 * x + 3
			}
			assert.ok(Math.abs(integralTypedRecursive(y, dx) - 28) < 1e-12)
		})

		test('integrates a linear function exactly on a non-uniform Float64Array grid', () => {
			// f(x) = 3x - 2 on [0, 10] => exact integral = [1.5x^2 - 2x]_0^10 = 130
			const x = new Float64Array([0, 0.25, 1.5, 2.0, 5.75, 10])
			const y = new Float64Array(x.length)
			for (let i = 0; i < x.length; i++) {
				y[i] = 3 * x[i] - 2
			}
			assert.ok(Math.abs(integralTypedRecursive(y, x) - 130) < 1e-12)
		})

		test('handles negative function values and signed cancellation', () => {
			// Odd function f(x) = x on [-2, 2] integrates to 0
			const x = new Float64Array([-2, -1, 0, 1, 2])
			const y = new Float64Array([-2, -1, 0, 1, 2])
			assert.equal(integralTypedRecursive(y, x), 0)
			assert.equal(integralTypedRecursive(y, 1), 0)
		})

		test('handles negative dx and descending x coordinates (reversed integration limits)', () => {
			const y = new Float64Array([1, 2, 3, 4])
			// Forward with dx = 2: (1.5 + 2.5 + 3.5) * 2 = 15
			assert.equal(integralTypedRecursive(y, 2), 15)
			assert.equal(integralTypedRecursive(y, -2), -15)

			const xDesc = new Float64Array([6, 4, 2, 0])
			assert.equal(integralTypedRecursive(y, xDesc), -15)
		})
	})

	describe('edge cases', () => {
		test('returns 0 for empty and single-element Float64Array inputs', () => {
			assert.equal(integralTypedRecursive(new Float64Array(0)), 0)
			assert.equal(integralTypedRecursive(new Float64Array(0), new Float64Array(0)), 0)
			assert.equal(integralTypedRecursive(new Float64Array([42])), 0)
			assert.equal(integralTypedRecursive(new Float64Array([42]), 0.1), 0)
			assert.equal(integralTypedRecursive(new Float64Array([42]), new Float64Array([1])), 0)
		})

		test('handles two-element Float64Array (single trapezoid base case)', () => {
			const y = new Float64Array([2, 6])
			assert.equal(integralTypedRecursive(y), 4)
			assert.equal(integralTypedRecursive(y, 0.5), 2)
			assert.equal(integralTypedRecursive(y, new Float64Array([1, 4])), 12)
		})

		test('returns +0 (not -0) when dx is 0 or values are zero with negative dx', () => {
			const resZeroDx = integralTypedRecursive(new Float64Array([1, 2, 3]), 0)
			assert.ok(Object.is(resZeroDx, 0))

			const resNegDx = integralTypedRecursive(new Float64Array([0, 0, 0]), -1)
			assert.ok(Object.is(resNegDx, 0))
		})

		test('handles large Float64Array without stack overflow (O(log n) recursion depth)', () => {
			const intervals = 100_000
			const dx = 1 / intervals
			const y = new Float64Array(intervals + 1)
			// f(x) = 3x^2 on [0, 1] => exact integral = 1
			for (let i = 0; i <= intervals; i++) {
				const x = i * dx
				y[i] = 3 * x * x
			}
			const result = integralTypedRecursive(y, dx)
			assert.ok(Math.abs(result - 1) < 1e-9, `Expected ~1, got ${result}`)
		})
	})

	describe('analytical and iterative cross-checks', () => {
		test('matches analytical integral of sin(x) over [0, pi] = 2 and iterative reference', () => {
			const intervals = 2048
			const dx = Math.PI / intervals
			const y = new Float64Array(intervals + 1)
			for (let i = 0; i <= intervals; i++) {
				y[i] = Math.sin(i * dx)
			}

			const recursiveResult = integralTypedRecursive(y, dx)
			const iterativeResult = iterativeTrapezoid(y, dx)

			assert.ok(Math.abs(recursiveResult - 2) < 1e-6, `Analytical error too large: ${recursiveResult}`)
			assert.ok(
				Math.abs(recursiveResult - iterativeResult) < 1e-12,
				`Recursive (${recursiveResult}) diverged from iterative (${iterativeResult})`
			)
		})

		test('matches analytical integral of exp(x) over [0, 1] = e - 1 on a non-uniform grid', () => {
			const intervals = 1000
			const x = new Float64Array(intervals + 1)
			const y = new Float64Array(intervals + 1)
			// Quadratic-stretched non-uniform grid on [0, 1]
			for (let i = 0; i <= intervals; i++) {
				const t = i / intervals
				x[i] = t * t
				y[i] = Math.exp(x[i])
			}

			const exact = Math.E - 1
			const recursiveResult = integralTypedRecursive(y, x)
			const iterativeResult = iterativeTrapezoid(y, x)

			assert.ok(Math.abs(recursiveResult - exact) < 1e-5, `Expected ~${exact}, got ${recursiveResult}`)
			assert.ok(
				Math.abs(recursiveResult - iterativeResult) < 1e-12,
				`Recursive (${recursiveResult}) diverged from iterative (${iterativeResult})`
			)
		})

		test('exhibits O(h^2) trapezoidal convergence for f(x) = x^2 on [0, 1]', () => {
			const exact = 1 / 3
			const computeError = (intervals) => {
				const dx = 1 / intervals
				const y = new Float64Array(intervals + 1)
				for (let i = 0; i <= intervals; i++) {
					const x = i * dx
					y[i] = x * x
				}
				return Math.abs(integralTypedRecursive(y, dx) - exact)
			}

			const errCoarse = computeError(100)
			const errFine = computeError(200)
			const ratio = errCoarse / errFine
			// Halving step size h should reduce trapezoidal error by a factor of ~4
			assert.ok(Math.abs(ratio - 4) < 1e-3, `Expected convergence ratio ~4, got ${ratio}`)
		})
	})

	describe('input validation', () => {
		test('throws TypeError when y is not a Float64Array', () => {
			assert.throws(() => integralTypedRecursive([1, 2, 3]), TypeError)
			assert.throws(() => integralTypedRecursive(new Float32Array([1, 2, 3])), TypeError)
			assert.throws(() => integralTypedRecursive(null), TypeError)
			assert.throws(() => integralTypedRecursive(undefined), TypeError)
			assert.throws(() => integralTypedRecursive(123), TypeError)
		})

		test('throws RangeError when y contains non-finite values', () => {
			assert.throws(() => integralTypedRecursive(new Float64Array([1, Number.NaN, 3])), RangeError)
			assert.throws(() => integralTypedRecursive(new Float64Array([1, Number.POSITIVE_INFINITY])), RangeError)
			assert.throws(() => integralTypedRecursive(new Float64Array([Number.NEGATIVE_INFINITY])), RangeError)
		})

		test('throws TypeError when xOrDx is neither a number nor a Float64Array', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(() => integralTypedRecursive(y, [0, 1, 2]), TypeError)
			assert.throws(() => integralTypedRecursive(y, new Float32Array([0, 1, 2])), TypeError)
			assert.throws(() => integralTypedRecursive(y, '1'), TypeError)
			assert.throws(() => integralTypedRecursive(y, null), TypeError)
		})

		test('throws RangeError when dx is non-finite', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(() => integralTypedRecursive(y, Number.NaN), RangeError)
			assert.throws(() => integralTypedRecursive(y, Number.POSITIVE_INFINITY), RangeError)
			assert.throws(() => integralTypedRecursive(y, Number.NEGATIVE_INFINITY), RangeError)
			// Even when y.length < 2, invalid dx must still be rejected
			assert.throws(() => integralTypedRecursive(new Float64Array(0), Number.NaN), RangeError)
		})

		test('throws RangeError when x length does not match y length or x contains non-finite values', () => {
			assert.throws(
				() => integralTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([0, 1])),
				RangeError
			)
			assert.throws(
				() => integralTypedRecursive(new Float64Array(0), new Float64Array([0])),
				RangeError
			)
			assert.throws(
				() => integralTypedRecursive(new Float64Array([1, 2]), new Float64Array([0, Number.NaN])),
				RangeError
			)
			assert.throws(
				() => integralTypedRecursive(new Float64Array([1, 2]), new Float64Array([0, Number.POSITIVE_INFINITY])),
				RangeError
			)
		})
	})
})
