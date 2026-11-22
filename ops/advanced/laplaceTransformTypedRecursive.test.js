import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformTypedRecursive } from './laplaceTransformTypedRecursive.js'

/**
 * Builds a uniform time grid on [tStart, tEnd] with `steps` intervals (steps + 1 points).
 */
function makeUniformGrid(tStart, tEnd, steps) {
	const times = new Float64Array(steps + 1)
	const dt = (tEnd - tStart) / steps
	for (let i = 0; i <= steps; i++) {
		times[i] = tStart + i * dt
	}
	return times
}

/**
 * Samples a scalar function f(t) onto a Float64Array matching `times`.
 */
function sampleFn(times, fn) {
	const values = new Float64Array(times.length)
	for (let i = 0; i < times.length; i++) {
		values[i] = fn(times[i])
	}
	return values
}

/**
 * Independent iterative composite trapezoidal quadrature reference implementation.
 */
function laplaceIterativeReference(values, times, sValues) {
	const out = new Float64Array(sValues.length)
	if (values.length < 2) {
		return out
	}
	for (let j = 0; j < sValues.length; j++) {
		const s = sValues[j]
		let sum = 0
		for (let i = 0; i < values.length - 1; i++) {
			const dt = times[i + 1] - times[i]
			const y0 = values[i] === 0 ? 0 : values[i] * Math.exp(-s * times[i])
			const y1 = values[i + 1] === 0 ? 0 : values[i + 1] * Math.exp(-s * times[i + 1])
			sum += 0.5 * (y0 + y1) * dt
		}
		out[j] = sum
	}
	return out
}

function assertClose(actual, expected, tolerance, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tolerance,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tolerance} of ${expected} (diff=${diff})`,
	)
}

describe('laplaceTransformTypedRecursive', () => {
	describe('normal cases', () => {
		test('unit step f(t) = 1 yields F(s) = 1 / s', () => {
			const times = makeUniformGrid(0, 40, 8000)
			const values = sampleFn(times, () => 1)
			const sValues = new Float64Array([0.5, 1, 2, 4, 10])

			const result = laplaceTransformTypedRecursive(values, times, sValues)

			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, sValues.length)
			for (let j = 0; j < sValues.length; j++) {
				const expected = 1 / sValues[j]
				assertClose(result[j], expected, 1e-4, `s=${sValues[j]}`)
			}
		})

		test('exponential decay f(t) = exp(-a*t) yields F(s) = 1 / (s + a)', () => {
			const a = 2.5
			const times = makeUniformGrid(0, 30, 6000)
			const values = sampleFn(times, (t) => Math.exp(-a * t))
			// Include negative s within region of convergence (s > -a)
			const sValues = new Float64Array([-1.5, -0.5, 0, 1, 3.5, 8])

			const result = laplaceTransformTypedRecursive(values, times, sValues)

			for (let j = 0; j < sValues.length; j++) {
				const expected = 1 / (sValues[j] + a)
				assertClose(result[j], expected, 1e-4, `s=${sValues[j]}`)
			}
		})

		test('linearity: L{alpha * f + beta * g}(s) = alpha * L{f}(s) + beta * L{g}(s)', () => {
			const times = makeUniformGrid(0, 25, 5000)
			const f = sampleFn(times, (t) => Math.exp(-t))
			const g = sampleFn(times, (t) => Math.sin(2 * t))
			const alpha = 3.25
			const beta = -1.75

			const combined = new Float64Array(times.length)
			for (let i = 0; i < times.length; i++) {
				combined[i] = alpha * f[i] + beta * g[i]
			}

			const sValues = new Float64Array([0.8, 1.5, 3, 6])
			const Lf = laplaceTransformTypedRecursive(f, times, sValues)
			const Lg = laplaceTransformTypedRecursive(g, times, sValues)
			const Lcomb = laplaceTransformTypedRecursive(combined, times, sValues)

			for (let j = 0; j < sValues.length; j++) {
				const linearCombination = alpha * Lf[j] + beta * Lg[j]
				assertClose(Lcomb[j], linearCombination, 1e-12, `linearity at s=${sValues[j]}`)
			}
		})

		test('delayed unit step on [t0, T] yields exp(-s * t0) / s', () => {
			const t0 = 1.5
			const times = makeUniformGrid(t0, 35, 6000)
			const values = sampleFn(times, () => 1)
			const sValues = new Float64Array([0.5, 1, 2.5, 5])

			const result = laplaceTransformTypedRecursive(values, times, sValues)

			for (let j = 0; j < sValues.length; j++) {
				const s = sValues[j]
				const expected = Math.exp(-s * t0) / s
				assertClose(result[j], expected, 1e-4, `delayed step s=${s}`)
			}
		})
	})

	describe('cross-checks against analytical transforms and iterative quadrature', () => {
		test('matches analytical Laplace transforms for ramp, sine, cosine, and damped sine', () => {
			const times = makeUniformGrid(0, 35, 7000)
			const omega = 3
			const decay = 1.2
			const sValues = new Float64Array([0.75, 1.5, 3, 6])

			const cases = [
				{
					name: 'ramp t -> 1/s^2',
					fn: (t) => t,
					analytical: (s) => 1 / (s * s),
				},
				{
					name: 'sin(w*t) -> w/(s^2 + w^2)',
					fn: (t) => Math.sin(omega * t),
					analytical: (s) => omega / (s * s + omega * omega),
				},
				{
					name: 'cos(w*t) -> s/(s^2 + w^2)',
					fn: (t) => Math.cos(omega * t),
					analytical: (s) => s / (s * s + omega * omega),
				},
				{
					name: 'exp(-a*t)*sin(w*t) -> w/((s+a)^2 + w^2)',
					fn: (t) => Math.exp(-decay * t) * Math.sin(omega * t),
					analytical: (s) => omega / ((s + decay) * (s + decay) + omega * omega),
				},
			]

			for (const { name, fn, analytical } of cases) {
				const values = sampleFn(times, fn)
				const result = laplaceTransformTypedRecursive(values, times, sValues)
				const ref = laplaceIterativeReference(values, times, sValues)

				for (let j = 0; j < sValues.length; j++) {
					assertClose(result[j], analytical(sValues[j]), 2e-4, `${name} analytical s=${sValues[j]}`)
					assertClose(result[j], ref[j], 1e-12, `${name} vs iterative s=${sValues[j]}`)
				}
			}
		})

		test('matches iterative quadrature and analytical values on a non-uniform stretched grid', () => {
			// Quadratic spacing: denser near t = 0 where exp(-s*t) varies fastest
			const n = 4001
			const times = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const u = i / (n - 1)
				times[i] = 40 * u * u
			}
			const values = sampleFn(times, (t) => Math.exp(-0.5 * t) * Math.cos(2 * t))
			const sValues = new Float64Array([0.5, 1, 2, 4, 8])

			const actual = laplaceTransformTypedRecursive(values, times, sValues)
			const iterative = laplaceIterativeReference(values, times, sValues)

			for (let j = 0; j < sValues.length; j++) {
				const s = sValues[j]
				const analytical = (s + 0.5) / ((s + 0.5) * (s + 0.5) + 4)
				assertClose(actual[j], iterative[j], 1e-13, `non-uniform vs iterative s=${s}`)
				assertClose(actual[j], analytical, 2e-4, `non-uniform vs analytical s=${s}`)
			}
		})

		test('handles large input arrays (65536 samples) without stack overflow and matches iterative quadrature', () => {
			const times = makeUniformGrid(0, 30, 65535)
			const values = sampleFn(times, (t) => Math.exp(-t))
			const sValues = new Float64Array([1, 2, 5])

			const actual = laplaceTransformTypedRecursive(values, times, sValues)
			const iterative = laplaceIterativeReference(values, times, sValues)

			for (let j = 0; j < sValues.length; j++) {
				const analytical = 1 / (sValues[j] + 1)
				assertClose(actual[j], analytical, 1e-6, `large grid analytical s=${sValues[j]}`)
				assertClose(actual[j], iterative[j], 1e-12, `large grid vs iterative s=${sValues[j]}`)
			}
		})
	})

	describe('edge cases', () => {
		test('empty sValues returns empty Float64Array', () => {
			const times = new Float64Array([0, 1, 2])
			const values = new Float64Array([1, 1, 1])
			const result = laplaceTransformTypedRecursive(values, times, new Float64Array(0))

			assert.ok(result instanceof Float64Array)
			assert.equal(result.length, 0)
		})

		test('empty values and times returns zero-filled Float64Array', () => {
			const sValues = new Float64Array([1, 2, 3])
			const result = laplaceTransformTypedRecursive(
				new Float64Array(0),
				new Float64Array(0),
				sValues,
			)

			assert.ok(result instanceof Float64Array)
			assert.deepEqual(Array.from(result), [0, 0, 0])
		})

		test('single sample point returns zero-filled Float64Array', () => {
			const result = laplaceTransformTypedRecursive(
				new Float64Array([42]),
				new Float64Array([0]),
				new Float64Array([0.5, 2]),
			)

			assert.deepEqual(Array.from(result), [0, 0])
		})

		test('two samples matches single trapezoid formula exactly', () => {
			const values = new Float64Array([2, 5])
			const times = new Float64Array([0.25, 1.75])
			const sValues = new Float64Array([0, 1.5])

			const result = laplaceTransformTypedRecursive(values, times, sValues)
			const dt = 1.5
			const expected0 = 0.5 * (2 + 5) * dt
			const expected1 = 0.5 * (2 * Math.exp(-1.5 * 0.25) + 5 * Math.exp(-1.5 * 1.75)) * dt

			assertClose(result[0], expected0, 1e-15)
			assertClose(result[1], expected1, 1e-15)
		})

		test('s = 0 computes definite integral of f(t)', () => {
			// ∫_0^10 (3*t^2) dt = 1000
			const times = makeUniformGrid(0, 10, 10000)
			const values = sampleFn(times, (t) => 3 * t * t)
			const result = laplaceTransformTypedRecursive(values, times, new Float64Array([0]))

			assertClose(result[0], 1000, 1e-3)
		})

		test('zero signal avoids 0 * Infinity NaN even when -s * t overflows', () => {
			const values = new Float64Array([0, -0, 0])
			const times = new Float64Array([0, 1000, 2000])
			const sValues = new Float64Array([-10, 0, 10])

			const result = laplaceTransformTypedRecursive(values, times, sValues)
			assert.deepEqual(Array.from(result), [0, 0, 0])
			for (const v of result) {
				assert.ok(Object.is(v, 0), 'expected positive zero')
			}
		})

		test('does not mutate input Float64Arrays', () => {
			const values = new Float64Array([1, 2, 3, 4])
			const times = new Float64Array([0, 1, 2, 3])
			const sValues = new Float64Array([0.5, 1.5])

			const valuesSnap = Array.from(values)
			const timesSnap = Array.from(times)
			const sSnap = Array.from(sValues)

			laplaceTransformTypedRecursive(values, times, sValues)

			assert.deepEqual(Array.from(values), valuesSnap)
			assert.deepEqual(Array.from(times), timesSnap)
			assert.deepEqual(Array.from(sValues), sSnap)
		})
	})

	describe('input validation errors', () => {
		const validValues = new Float64Array([1, 1])
		const validTimes = new Float64Array([0, 1])
		const validS = new Float64Array([1])

		test('throws TypeError for non-Float64Array arguments', () => {
			const badInputs = [[1, 1], new Float32Array([1, 1]), new Int32Array([1, 1]), null, undefined, 42, {}]
			for (const bad of badInputs) {
				assert.throws(() => laplaceTransformTypedRecursive(bad, validTimes, validS), TypeError)
				assert.throws(() => laplaceTransformTypedRecursive(validValues, bad, validS), TypeError)
				assert.throws(() => laplaceTransformTypedRecursive(validValues, validTimes, bad), TypeError)
			}
		})

		test('throws RangeError when values and times lengths differ', () => {
			assert.throws(
				() =>
					laplaceTransformTypedRecursive(
						new Float64Array([1, 2, 3]),
						new Float64Array([0, 1]),
						validS,
					),
				RangeError,
			)
		})

		test('throws RangeError for non-finite values in values, times, or sValues', () => {
			for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(
					() => laplaceTransformTypedRecursive(new Float64Array([1, bad]), validTimes, validS),
					RangeError,
				)
				assert.throws(
					() => laplaceTransformTypedRecursive(validValues, new Float64Array([0, bad]), validS),
					RangeError,
				)
				assert.throws(
					() => laplaceTransformTypedRecursive(validValues, validTimes, new Float64Array([bad])),
					RangeError,
				)
			}
		})

		test('throws RangeError for negative time points', () => {
			assert.throws(
				() =>
					laplaceTransformTypedRecursive(
						new Float64Array([1, 1]),
						new Float64Array([-0.1, 1]),
						validS,
					),
				RangeError,
			)
		})

		test('throws RangeError for non-strictly-increasing times (duplicates or decreasing)', () => {
			assert.throws(
				() =>
					laplaceTransformTypedRecursive(
						new Float64Array([1, 1, 1]),
						new Float64Array([0, 1, 1]),
						validS,
					),
				RangeError,
			)
			assert.throws(
				() =>
					laplaceTransformTypedRecursive(
						new Float64Array([1, 1, 1]),
						new Float64Array([0, 2, 1]),
						validS,
					),
				RangeError,
			)
		})
	})
})
