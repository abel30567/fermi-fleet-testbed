import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { derivativeTypedIterative } from './derivativeTypedIterative.js'

function assertClose(actual, expected, tol = 1e-12, message) {
	assert.ok(
		Math.abs(actual - expected) <= tol,
		message ?? `Expected ${actual} to be within ${tol} of ${expected} (diff=${Math.abs(actual - expected)})`
	)
}

describe('derivativeTypedIterative', () => {
	describe('normal cases', () => {
		it('computes zero derivative for a constant function with default spacing h = 1', () => {
			const y = new Float64Array([7, 7, 7, 7, 7])
			const dy = derivativeTypedIterative(y)
			assert.ok(dy instanceof Float64Array)
			assert.equal(dy.length, y.length)
			for (let i = 0; i < dy.length; i++) {
				assert.equal(dy[i], 0)
			}
		})

		it('computes exact derivative for a linear function with default spacing h = 1', () => {
			// f(x) = 3x + 7 => f'(x) = 3
			const y = new Float64Array([7, 10, 13, 16, 19])
			const dy = derivativeTypedIterative(y)
			for (let i = 0; i < dy.length; i++) {
				assertClose(dy[i], 3, 1e-14)
			}
		})

		it('supports custom uniform spacing h', () => {
			// f(x) = -4x + 2 sampled at h = 0.25 => f'(x) = -4
			const h = 0.25
			const y = new Float64Array(6)
			for (let i = 0; i < y.length; i++) {
				const x = i * h
				y[i] = -4 * x + 2
			}
			const dy = derivativeTypedIterative(y, h)
			for (let i = 0; i < dy.length; i++) {
				assertClose(dy[i], -4, 1e-13)
			}
		})

		it('matches uniform spacing when given an equivalent uniform x coordinate array', () => {
			const h = 0.5
			const n = 8
			const x = new Float64Array(n)
			const y = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				x[i] = -2 + i * h
				y[i] = Math.pow(x[i], 3) - 2 * x[i] + 1
			}
			const dyUniform = derivativeTypedIterative(y, h)
			const dyCoords = derivativeTypedIterative(y, x)
			for (let i = 0; i < n; i++) {
				assertClose(dyCoords[i], dyUniform[i], 1e-12)
			}
		})

		it('computes exact derivative for linear functions on non-uniform x grids', () => {
			// f(x) = -2.5x + 4 => f'(x) = -2.5
			const x = new Float64Array([-3.5, -1.2, 0, 0.1, 2.7, 10.0])
			const y = new Float64Array(x.length)
			for (let i = 0; i < x.length; i++) {
				y[i] = -2.5 * x[i] + 4
			}
			const dy = derivativeTypedIterative(y, x)
			for (let i = 0; i < dy.length; i++) {
				assertClose(dy[i], -2.5, 1e-12)
			}
		})

		it('does not mutate input y or x arrays', () => {
			const x = new Float64Array([0, 0.5, 1.5, 3.0])
			const y = new Float64Array([1, 2, 5, 10])
			const xCopy = new Float64Array(x)
			const yCopy = new Float64Array(y)
			const dy = derivativeTypedIterative(y, x)
			assert.notEqual(dy, y)
			assert.notEqual(dy, x)
			assert.deepEqual(x, xCopy)
			assert.deepEqual(y, yCopy)
		})
	})

	describe('edge cases', () => {
		it('returns an empty Float64Array when given an empty Float64Array', () => {
			const empty = new Float64Array(0)
			const r1 = derivativeTypedIterative(empty)
			const r2 = derivativeTypedIterative(empty, 0.5)
			const r3 = derivativeTypedIterative(empty, new Float64Array(0))
			assert.ok(r1 instanceof Float64Array && r1.length === 0)
			assert.ok(r2 instanceof Float64Array && r2.length === 0)
			assert.ok(r3 instanceof Float64Array && r3.length === 0)
		})

		it('handles minimum valid length n = 2 for uniform h and non-uniform x', () => {
			const y = new Float64Array([2, 8])
			const dyUniform = derivativeTypedIterative(y, 3)
			assert.deepEqual(Array.from(dyUniform), [2, 2])

			const x = new Float64Array([-1.5, 0.5])
			const dyCoords = derivativeTypedIterative(y, x)
			assert.deepEqual(Array.from(dyCoords), [3, 3])
		})

		it('handles all-zero arrays and negative coordinates/values', () => {
			const zeros = new Float64Array([0, 0, 0, 0])
			assert.deepEqual(Array.from(derivativeTypedIterative(zeros)), [0, 0, 0, 0])

			const x = new Float64Array([-10, -7, -2, -1])
			const y = new Float64Array([-20, -14, -4, -2]) // f(x) = 2x
			const dy = derivativeTypedIterative(y, x)
			for (let i = 0; i < dy.length; i++) {
				assertClose(dy[i], 2, 1e-13)
			}
		})

		it('avoids intermediate 2*h overflow for very large spacing h', () => {
			const h = 1e308
			const y = new Float64Array([0, 1e307, 2e307])
			const dy = derivativeTypedIterative(y, h)
			assertClose(dy[0], 0.1, 1e-12)
			assertClose(dy[1], 0.1, 1e-12)
			assertClose(dy[2], 0.1, 1e-12)
		})

		it('throws TypeError on invalid input types', () => {
			assert.throws(() => derivativeTypedIterative([1, 2, 3]), TypeError)
			assert.throws(() => derivativeTypedIterative(new Float32Array([1, 2, 3])), TypeError)
			assert.throws(() => derivativeTypedIterative(null), TypeError)
			assert.throws(() => derivativeTypedIterative(undefined), TypeError)
			assert.throws(() => derivativeTypedIterative('123'), TypeError)

			const validY = new Float64Array([1, 2, 3])
			assert.throws(() => derivativeTypedIterative(validY, null), TypeError)
			assert.throws(() => derivativeTypedIterative(validY, [0, 1, 2]), TypeError)
			assert.throws(() => derivativeTypedIterative(validY, new Float32Array([0, 1, 2])), TypeError)
			assert.throws(() => derivativeTypedIterative(validY, '1'), TypeError)
			assert.throws(() => derivativeTypedIterative(validY, {}), TypeError)
		})

		it('throws RangeError on invalid lengths, non-finite values, or bad spacing/x', () => {
			// Single sample cannot form a difference
			assert.throws(() => derivativeTypedIterative(new Float64Array([42])), RangeError)
			assert.throws(
				() => derivativeTypedIterative(new Float64Array([42]), new Float64Array([0])),
				RangeError
			)

			// Non-finite y values
			assert.throws(() => derivativeTypedIterative(new Float64Array([1, NaN, 3])), RangeError)
			assert.throws(() => derivativeTypedIterative(new Float64Array([1, Infinity, 3])), RangeError)
			assert.throws(() => derivativeTypedIterative(new Float64Array([-Infinity, 2, 3])), RangeError)

			// Invalid uniform spacing h
			const validY = new Float64Array([1, 2, 3])
			assert.throws(() => derivativeTypedIterative(validY, 0), RangeError)
			assert.throws(() => derivativeTypedIterative(validY, -0.5), RangeError)
			assert.throws(() => derivativeTypedIterative(validY, NaN), RangeError)
			assert.throws(() => derivativeTypedIterative(validY, Infinity), RangeError)
			assert.throws(() => derivativeTypedIterative(validY, -Infinity), RangeError)
			assert.throws(() => derivativeTypedIterative(new Float64Array(0), -1), RangeError)

			// Mismatched x length
			assert.throws(
				() => derivativeTypedIterative(validY, new Float64Array([0, 1])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedIterative(new Float64Array(0), new Float64Array([0])),
				RangeError
			)

			// Non-finite x values
			assert.throws(
				() => derivativeTypedIterative(validY, new Float64Array([0, NaN, 2])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedIterative(validY, new Float64Array([0, 1, Infinity])),
				RangeError
			)

			// Non-strictly-increasing x values (duplicates or reversals)
			assert.throws(
				() => derivativeTypedIterative(validY, new Float64Array([0, 1, 1])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedIterative(validY, new Float64Array([0, 2, 1])),
				RangeError
			)
			assert.throws(
				() => derivativeTypedIterative(validY, new Float64Array([3, 2, 1])),
				RangeError
			)
		})
	})

	describe('analytical cross-checks and mathematical identities', () => {
		it("matches exact analytical derivative f'(x) = 6x - 2 for polynomial f(x) = 3x^2 - 2x + 5 on uniform grid", () => {
			const h = 0.25
			const n = 21
			const x = new Float64Array(n)
			const y = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				x[i] = -2.5 + i * h
				y[i] = 3 * x[i] * x[i] - 2 * x[i] + 5
			}

			const dy = derivativeTypedIterative(y, h)

			// Central differences are exact for degree-2 polynomials at all interior points
			for (let i = 1; i < n - 1; i++) {
				const exact = 6 * x[i] - 2
				assertClose(dy[i], exact, 1e-12, `interior i=${i}`)
			}

			// One-sided boundary differences for a*x^2 + b*x + c have exact known values:
			// forward: f'(x0) + a*h, backward: f'(x_{n-1}) - a*h
			assertClose(dy[0], 6 * x[0] - 2 + 3 * h, 1e-12, 'left boundary forward difference')
			assertClose(dy[n - 1], 6 * x[n - 1] - 2 - 3 * h, 1e-12, 'right boundary backward difference')
		})

		it("matches exact analytical derivative f'(x) = 6x - 2 for quadratic on non-uniform x grid", () => {
			const x = new Float64Array([-3.0, -2.1, -0.7, 0.0, 0.15, 1.4, 3.8, 5.0])
			const y = new Float64Array(x.length)
			for (let i = 0; i < x.length; i++) {
				y[i] = 3 * x[i] * x[i] - 2 * x[i] + 5
			}

			const dy = derivativeTypedIterative(y, x)

			// 3-point Lagrange interior formula is exact for quadratics even on non-uniform grids
			for (let i = 1; i < x.length - 1; i++) {
				const exact = 6 * x[i] - 2
				assertClose(dy[i], exact, 1e-11, `non-uniform interior i=${i}`)
			}

			// Exact forward/backward secant slopes at boundaries: 3*(x1 + x0) - 2
			assertClose(dy[0], 3 * (x[1] + x[0]) - 2, 1e-12)
			const last = x.length - 1
			assertClose(dy[last], 3 * (x[last] + x[last - 1]) - 2, 1e-12)
		})

		it("cross-checks d/dx sin(x) = cos(x) and verifies O(h^2) interior convergence", () => {
			function maxInteriorError(h) {
				const n = Math.floor((2 * Math.PI) / h) + 1
				const y = new Float64Array(n)
				for (let i = 0; i < n; i++) {
					y[i] = Math.sin(i * h)
				}
				const dy = derivativeTypedIterative(y, h)
				let maxErr = 0
				for (let i = 1; i < n - 1; i++) {
					const err = Math.abs(dy[i] - Math.cos(i * h))
					if (err > maxErr) maxErr = err
				}
				// Boundaries are O(h) accurate
				assertClose(dy[0], Math.cos(0), h)
				assertClose(dy[n - 1], Math.cos((n - 1) * h), h)
				return maxErr
			}

			const errCoarse = maxInteriorError(0.02)
			const errFine = maxInteriorError(0.01)
			const errFinest = maxInteriorError(0.001)

			// For sin(x), leading central difference error is (h^2 / 6) * |cos(x)|
			assert.ok(errFinest < 1e-6, `Expected fine error < 1e-6, got ${errFinest}`)

			// Halving h should reduce O(h^2) error by a factor of ~4
			const ratio = errCoarse / errFine
			assert.ok(ratio > 3.9 && ratio < 4.1, `Expected ~4x O(h^2) error reduction, got ${ratio}`)
		})

		it("cross-checks d/dx exp(x) = exp(x) on a non-uniform grid", () => {
			const n = 200
			const x = new Float64Array(n)
			const y = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				// Non-uniform quadratically stretched grid in [0, 1]
				const t = i / (n - 1)
				x[i] = 0.5 * t + 0.5 * t * t
				y[i] = Math.exp(x[i])
			}
			const dy = derivativeTypedIterative(y, x)
			for (let i = 1; i < n - 1; i++) {
				assertClose(dy[i], Math.exp(x[i]), 1e-4, `exp interior i=${i}`)
			}
		})

		it('satisfies linearity identity D(a*f + b*g) = a*D(f) + b*D(g)', () => {
			const x = new Float64Array([0, 0.3, 0.9, 1.1, 2.0, 3.5])
			const f = new Float64Array(x.length)
			const g = new Float64Array(x.length)
			const combined = new Float64Array(x.length)
			const a = 2.7
			const b = -1.4
			for (let i = 0; i < x.length; i++) {
				f[i] = Math.sin(x[i])
				g[i] = Math.exp(-0.5 * x[i])
				combined[i] = a * f[i] + b * g[i]
			}

			const df = derivativeTypedIterative(f, x)
			const dg = derivativeTypedIterative(g, x)
			const dCombined = derivativeTypedIterative(combined, x)

			for (let i = 0; i < x.length; i++) {
				assertClose(dCombined[i], a * df[i] + b * dg[i], 1e-13)
			}
		})
	})
})
