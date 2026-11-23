import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { integralTypedIterative } from './integralTypedIterative.js'

/**
 * Independent composite Simpson's 1/3 rule reference for an even number of
 * uniform intervals on [a, b].
 */
function simpsonReference(fn, a, b, intervals) {
	const h = (b - a) / intervals
	let acc = fn(a) + fn(b)
	for (let i = 1; i < intervals; i++) {
		acc += (i % 2 === 0 ? 2 : 4) * fn(a + i * h)
	}
	return (acc * h) / 3
}

function sampleUniform(fn, a, b, intervals) {
	const x = new Float64Array(intervals + 1)
	const y = new Float64Array(intervals + 1)
	const dx = (b - a) / intervals
	for (let i = 0; i <= intervals; i++) {
		x[i] = a + i * dx
		y[i] = fn(x[i])
	}
	return { x, y, dx }
}

describe('integralTypedIterative', () => {
	describe('normal cases', () => {
		test('integrates a constant function with default unit spacing', () => {
			const y = new Float64Array([5, 5, 5, 5, 5])
			assert.equal(integralTypedIterative(y), 20)
		})

		test('integrates a linear function exactly with custom uniform dx', () => {
			// f(x) = 3x + 2 on [0, 4] => [1.5 x^2 + 2x]_0^4 = 24 + 8 = 32
			const { y, dx } = sampleUniform((x) => 3 * x + 2, 0, 4, 8)
			const result = integralTypedIterative(y, dx)
			assert.ok(Math.abs(result - 32) < 1e-12, `expected 32, got ${result}`)
		})

		test('integrates over non-uniform Float64Array x coordinates', () => {
			// f(x) = 2x + 1 on [0, 5] => [x^2 + x]_0^5 = 30 (exact for piecewise linear)
			const x = new Float64Array([0, 0.25, 1.0, 2.75, 4.5, 5.0])
			const y = Float64Array.from(x, (v) => 2 * v + 1)
			const result = integralTypedIterative(y, x)
			assert.ok(Math.abs(result - 30) < 1e-12, `expected 30, got ${result}`)
		})

		test('handles signed areas and cancellation for odd functions', () => {
			const { y, dx } = sampleUniform(Math.sin, -Math.PI, Math.PI, 1000)
			const result = integralTypedIterative(y, dx)
			assert.ok(Math.abs(result) < 1e-12, `expected ~0, got ${result}`)
		})

		test('handles negative step size and decreasing x coordinates', () => {
			const xAsc = new Float64Array([0, 1, 3, 6])
			const yAsc = new Float64Array([1, 2, 4, 7])
			const xDesc = new Float64Array([6, 3, 1, 0])
			const yDesc = new Float64Array([7, 4, 2, 1])

			const forward = integralTypedIterative(yAsc, xAsc)
			const backward = integralTypedIterative(yDesc, xDesc)
			assert.ok(Math.abs(forward + backward) < 1e-12)

			const uniformPos = integralTypedIterative(new Float64Array([1, 2, 3, 4]), 0.5)
			const uniformNeg = integralTypedIterative(new Float64Array([1, 2, 3, 4]), -0.5)
			assert.equal(uniformNeg, -uniformPos)
		})
	})

	describe('edge cases', () => {
		test('returns 0 for empty and single-element Float64Arrays', () => {
			assert.equal(integralTypedIterative(new Float64Array(0)), 0)
			assert.equal(integralTypedIterative(new Float64Array(0), 0.5), 0)
			assert.equal(integralTypedIterative(new Float64Array(0), new Float64Array(0)), 0)

			assert.equal(integralTypedIterative(new Float64Array([42])), 0)
			assert.equal(integralTypedIterative(new Float64Array([42]), 0.5), 0)
			assert.equal(integralTypedIterative(new Float64Array([42]), new Float64Array([1])), 0)
		})

		test('computes a single trapezoid for length-2 arrays', () => {
			const y = new Float64Array([2, 6])
			assert.equal(integralTypedIterative(y, 3), 12)
			assert.equal(integralTypedIterative(y, new Float64Array([1, 4])), 12)
		})

		test('returns 0 when dx is 0 or all x coordinates are identical', () => {
			const y = new Float64Array([1, 2, 3, 4])
			assert.equal(integralTypedIterative(y, 0), 0)
			assert.equal(integralTypedIterative(y, new Float64Array([2, 2, 2, 2])), 0)
		})

		test('validates input types and throws TypeError on invalid arguments', () => {
			assert.throws(() => integralTypedIterative([1, 2, 3]), TypeError)
			assert.throws(() => integralTypedIterative(new Float32Array([1, 2, 3])), TypeError)
			assert.throws(() => integralTypedIterative(null), TypeError)
			assert.throws(() => integralTypedIterative(undefined), TypeError)

			const y = new Float64Array([1, 2, 3])
			assert.throws(() => integralTypedIterative(y, [0, 1, 2]), TypeError)
			assert.throws(() => integralTypedIterative(y, '1'), TypeError)
			assert.throws(() => integralTypedIterative(y, null), TypeError)
		})

		test('validates finiteness and matching lengths with RangeError', () => {
			const y = new Float64Array([1, 2, 3])
			assert.throws(() => integralTypedIterative(y, NaN), RangeError)
			assert.throws(() => integralTypedIterative(y, Infinity), RangeError)
			assert.throws(() => integralTypedIterative(y, -Infinity), RangeError)
			assert.throws(() => integralTypedIterative(y, new Float64Array([0, 1])), RangeError)

			assert.throws(() => integralTypedIterative(new Float64Array([NaN])), RangeError)
			assert.throws(() => integralTypedIterative(new Float64Array([1, Infinity, 3])), RangeError)
			assert.throws(() => integralTypedIterative(new Float64Array([1, -Infinity, 3])), RangeError)
			assert.throws(
				() => integralTypedIterative(y, new Float64Array([0, NaN, 2])),
				RangeError,
			)
			assert.throws(
				() => integralTypedIterative(y, new Float64Array([0, 1, Infinity])),
				RangeError,
			)
		})
	})

	describe('independent cross-checks', () => {
		test('matches analytical integrals for smooth nonlinear functions', () => {
			// Integral of sin(x) from 0 to pi is 2
			const sinSample = sampleUniform(Math.sin, 0, Math.PI, 2000)
			const sinInt = integralTypedIterative(sinSample.y, sinSample.dx)
			assert.ok(Math.abs(sinInt - 2) < 1e-6, `sin integral error too large: ${sinInt}`)

			// Integral of e^x from 0 to 1 is e - 1
			const expSample = sampleUniform(Math.exp, 0, 1, 2000)
			const expInt = integralTypedIterative(expSample.y, expSample.dx)
			assert.ok(
				Math.abs(expInt - (Math.E - 1)) < 1e-6,
				`exp integral error too large: ${expInt}`,
			)
		})

		test('agrees with independent Simpson 1/3 rule and matches uniform vs explicit x', () => {
			const fn = (x) => Math.cos(x) + 0.5 * x * x * x
			const a = 0
			const b = 2
			const intervals = 2000
			const { x, y, dx } = sampleUniform(fn, a, b, intervals)

			const trapUniform = integralTypedIterative(y, dx)
			const trapExplicit = integralTypedIterative(y, x)
			const simpson = simpsonReference(fn, a, b, intervals)

			assert.ok(Math.abs(trapUniform - trapExplicit) < 1e-12)
			assert.ok(
				Math.abs(trapUniform - simpson) < 1e-5,
				`trapezoidal (${trapUniform}) diverged from Simpson (${simpson})`,
			)
		})

		test('exhibits O(h^2) convergence order on x^2 over [0, 1]', () => {
			const exact = 1 / 3
			const s1 = sampleUniform((x) => x * x, 0, 1, 100)
			const s2 = sampleUniform((x) => x * x, 0, 1, 200)
			const err1 = Math.abs(integralTypedIterative(s1.y, s1.dx) - exact)
			const err2 = Math.abs(integralTypedIterative(s2.y, s2.dx) - exact)
			const ratio = err1 / err2
			assert.ok(Math.abs(ratio - 4) < 1e-3, `expected ~4x error reduction, got ${ratio}`)
		})

		test('satisfies interval additivity: integral(a..c) == integral(a..b) + integral(b..c)', () => {
			const fn = (x) => Math.exp(-x * x)
			const left = sampleUniform(fn, 0, 1, 500)
			const right = sampleUniform(fn, 1, 2.5, 750)
			const full = sampleUniform(fn, 0, 2.5, 1250)

			const sumParts =
				integralTypedIterative(left.y, left.dx) + integralTypedIterative(right.y, right.dx)
			const whole = integralTypedIterative(full.y, full.dx)
			assert.ok(Math.abs(sumParts - whole) < 1e-12)
		})
	})
})
