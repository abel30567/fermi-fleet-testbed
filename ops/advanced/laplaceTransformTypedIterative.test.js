import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformTypedIterative } from './laplaceTransformTypedIterative.js'

/**
 * Helper to generate a uniform Float64Array grid on [tStart, tEnd] with `count` points
 * and evaluate `fn(t)` at each grid point.
 */
function sampleUniform(fn, tStart, tEnd, count) {
	const times = new Float64Array(count)
	const values = new Float64Array(count)
	const dt = (tEnd - tStart) / (count - 1)
	for (let i = 0; i < count; i++) {
		const t = tStart + i * dt
		times[i] = t
		values[i] = fn(t)
	}
	return { values, times }
}

describe('laplaceTransformTypedIterative', () => {
	describe('analytical cross-checks', () => {
		it('matches L{c}(s) = c / s for constant signals', () => {
			const c = 3.5
			const { values, times } = sampleUniform(() => c, 0, 30, 6001)
			const sValues = new Float64Array([0.5, 1, 2, 5])
			const out = laplaceTransformTypedIterative(values, times, sValues)

			assert.ok(out instanceof Float64Array)
			assert.equal(out.length, sValues.length)
			for (let k = 0; k < sValues.length; k++) {
				const expected = c / sValues[k]
				assert.ok(
					Math.abs(out[k] - expected) < 1e-4,
					`s=${sValues[k]}: got ${out[k]}, expected ${expected}`,
				)
			}
		})

		it('matches L{exp(a*t)}(s) = 1 / (s - a) including negative s inside ROC', () => {
			const a = -2
			const { values, times } = sampleUniform((t) => Math.exp(a * t), 0, 25, 10001)
			const sValues = new Float64Array([-1, 0, 0.5, 2, 4])
			const out = laplaceTransformTypedIterative(values, times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const expected = 1 / (sValues[k] - a)
				assert.ok(
					Math.abs(out[k] - expected) < 1e-4,
					`s=${sValues[k]}: got ${out[k]}, expected ${expected}`,
				)
			}
		})

		it('matches L{sin(w*t)}(s) = w / (s^2 + w^2)', () => {
			const w = 2.5
			const { values, times } = sampleUniform((t) => Math.sin(w * t), 0, 30, 12001)
			const sValues = new Float64Array([0.5, 1, 2, 4])
			const out = laplaceTransformTypedIterative(values, times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				const expected = w / (s * s + w * w)
				assert.ok(
					Math.abs(out[k] - expected) < 1e-4,
					`s=${s}: got ${out[k]}, expected ${expected}`,
				)
			}
		})

		it('matches L{cos(w*t)}(s) = s / (s^2 + w^2)', () => {
			const w = 1.75
			const { values, times } = sampleUniform((t) => Math.cos(w * t), 0, 30, 12001)
			const sValues = new Float64Array([0.5, 1, 2, 5])
			const out = laplaceTransformTypedIterative(values, times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				const expected = s / (s * s + w * w)
				assert.ok(
					Math.abs(out[k] - expected) < 1e-4,
					`s=${s}: got ${out[k]}, expected ${expected}`,
				)
			}
		})

		it('matches L{t}(s) = 1 / s^2 and L{t^2}(s) = 2 / s^3', () => {
			const lin = sampleUniform((t) => t, 0, 25, 10001)
			const quad = sampleUniform((t) => t * t, 0, 25, 10001)
			const sValues = new Float64Array([1, 2, 3])

			const outLin = laplaceTransformTypedIterative(lin.values, lin.times, sValues)
			const outQuad = laplaceTransformTypedIterative(quad.values, quad.times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				assert.ok(Math.abs(outLin[k] - 1 / (s * s)) < 1e-4)
				assert.ok(Math.abs(outQuad[k] - 2 / (s * s * s)) < 1e-4)
			}
		})
	})

	describe('mathematical properties and non-uniform grids', () => {
		it('satisfies linearity L{alpha*f + beta*g} = alpha*L{f} + beta*L{g}', () => {
			const alpha = 2.25
			const beta = -1.5
			const f = sampleUniform((t) => Math.cos(t), 0, 10, 501)
			const g = sampleUniform((t) => Math.exp(-0.5 * t), 0, 10, 501)
			const combined = new Float64Array(f.values.length)
			for (let i = 0; i < combined.length; i++) {
				combined[i] = alpha * f.values[i] + beta * g.values[i]
			}

			const sValues = new Float64Array([0, 0.5, 1.5, 3])
			const lf = laplaceTransformTypedIterative(f.values, f.times, sValues)
			const lg = laplaceTransformTypedIterative(g.values, g.times, sValues)
			const lComb = laplaceTransformTypedIterative(combined, f.times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const expected = alpha * lf[k] + beta * lg[k]
				assert.ok(
					Math.abs(lComb[k] - expected) < 1e-13,
					`s=${sValues[k]}: got ${lComb[k]}, expected ${expected}`,
				)
			}
		})

		it('satisfies frequency-shift identity L{exp(-a*t)*f(t)}(s) = L{f(t)}(s + a)', () => {
			const a = 1.2
			const { values, times } = sampleUniform((t) => Math.sin(3 * t) + 1, 0, 10, 501)
			const shiftedValues = new Float64Array(values.length)
			for (let i = 0; i < values.length; i++) {
				shiftedValues[i] = Math.exp(-a * times[i]) * values[i]
			}

			const sValues = new Float64Array([0.3, 1.0, 2.5])
			const sPlusA = new Float64Array(sValues.map((s) => s + a))

			const lhs = laplaceTransformTypedIterative(shiftedValues, times, sValues)
			const rhs = laplaceTransformTypedIterative(values, times, sPlusA)

			for (let k = 0; k < sValues.length; k++) {
				assert.ok(
					Math.abs(lhs[k] - rhs[k]) < 1e-13,
					`s=${sValues[k]}: lhs=${lhs[k]}, rhs=${rhs[k]}`,
				)
			}
		})

		it('integrates accurately over non-uniformly spaced times', () => {
			// Quadratic spacing: dense near t=0, sparser toward t=25
			const n = 2001
			const times = new Float64Array(n)
			const values = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const u = i / (n - 1)
				const t = 25 * u * u
				times[i] = t
				values[i] = Math.exp(-t)
			}

			const sValues = new Float64Array([0, 1, 3])
			const out = laplaceTransformTypedIterative(values, times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const expected = 1 / (sValues[k] + 1)
				assert.ok(
					Math.abs(out[k] - expected) < 1e-4,
					`s=${sValues[k]}: got ${out[k]}, expected ${expected}`,
				)
			}
		})

		it('exhibits O(h^2) trapezoidal convergence when halving step size', () => {
			const s = 2
			const sValues = new Float64Array([s])
			const T = 10
			const exact = (1 - Math.exp(-s * T)) / s

			const coarse = sampleUniform(() => 1, 0, T, 201)
			const fine = sampleUniform(() => 1, 0, T, 401)

			const errCoarse = Math.abs(
				laplaceTransformTypedIterative(coarse.values, coarse.times, sValues)[0] - exact,
			)
			const errFine = Math.abs(
				laplaceTransformTypedIterative(fine.values, fine.times, sValues)[0] - exact,
			)
			const ratio = errCoarse / errFine

			assert.ok(ratio > 3.9 && ratio < 4.1, `expected convergence ratio ~4, got ${ratio}`)
		})
	})

	describe('edge cases', () => {
		it('returns an empty Float64Array when sValues is empty', () => {
			const values = new Float64Array([1, 2, 3])
			const times = new Float64Array([0, 1, 2])
			const sValues = new Float64Array(0)

			const out = laplaceTransformTypedIterative(values, times, sValues)
			assert.ok(out instanceof Float64Array)
			assert.equal(out.length, 0)
		})

		it('returns zeros when values and times are empty or have a single point', () => {
			const sValues = new Float64Array([0, 1, 2])

			const outEmpty = laplaceTransformTypedIterative(
				new Float64Array(0),
				new Float64Array(0),
				sValues,
			)
			assert.deepEqual(Array.from(outEmpty), [0, 0, 0])

			const outSingle = laplaceTransformTypedIterative(
				new Float64Array([42]),
				new Float64Array([0.5]),
				sValues,
			)
			assert.deepEqual(Array.from(outSingle), [0, 0, 0])
		})

		it('computes exact single trapezoid for two samples including t0 > 0', () => {
			const values = new Float64Array([2, 6])
			const times = new Float64Array([1, 3])
			const sValues = new Float64Array([0, 0.5])

			const out = laplaceTransformTypedIterative(values, times, sValues)
			const expected0 = 0.5 * (2 + 6) * (3 - 1)
			const expectedHalf = 0.5 * (2 * Math.exp(-0.5) + 6 * Math.exp(-1.5)) * (3 - 1)

			assert.equal(out[0], expected0)
			assert.ok(Math.abs(out[1] - expectedHalf) < 1e-14)
		})

		it('returns positive zero for an all-zero signal and does not mutate inputs', () => {
			const values = new Float64Array([0, -0, 0])
			const times = new Float64Array([0, 1, 2])
			const sValues = new Float64Array([1, 2])

			const out = laplaceTransformTypedIterative(values, times, sValues)
			assert.equal(Object.is(out[0], 0), true)
			assert.equal(Object.is(out[1], 0), true)
			assert.deepEqual(Array.from(times), [0, 1, 2])
			assert.deepEqual(Array.from(sValues), [1, 2])
		})
	})

	describe('input validation', () => {
		const validValues = new Float64Array([1, 1])
		const validTimes = new Float64Array([0, 1])
		const validS = new Float64Array([1])

		it('throws TypeError for non-Float64Array inputs', () => {
			const badInputs = [[1, 1], new Float32Array([1, 1]), new Int32Array([1, 1]), null, undefined, 123, {}]
			for (const bad of badInputs) {
				assert.throws(
					() => laplaceTransformTypedIterative(bad, validTimes, validS),
					TypeError,
				)
				assert.throws(
					() => laplaceTransformTypedIterative(validValues, bad, validS),
					TypeError,
				)
				assert.throws(
					() => laplaceTransformTypedIterative(validValues, validTimes, bad),
					TypeError,
				)
			}
		})

		it('throws RangeError when values and times lengths differ', () => {
			assert.throws(
				() => laplaceTransformTypedIterative(new Float64Array([1, 2, 3]), validTimes, validS),
				RangeError,
			)
		})

		it('throws RangeError for negative or non-strictly-increasing times', () => {
			assert.throws(
				() => laplaceTransformTypedIterative(validValues, new Float64Array([-0.1, 1]), validS),
				RangeError,
			)
			assert.throws(
				() => laplaceTransformTypedIterative(validValues, new Float64Array([1, 1]), validS),
				RangeError,
			)
			assert.throws(
				() => laplaceTransformTypedIterative(validValues, new Float64Array([2, 1]), validS),
				RangeError,
			)
		})

		it('throws RangeError for NaN or Infinity in any input array', () => {
			for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
				assert.throws(
					() => laplaceTransformTypedIterative(new Float64Array([1, badVal]), validTimes, validS),
					RangeError,
				)
				assert.throws(
					() => laplaceTransformTypedIterative(validValues, new Float64Array([0, badVal]), validS),
					RangeError,
				)
				assert.throws(
					() => laplaceTransformTypedIterative(validValues, validTimes, new Float64Array([badVal])),
					RangeError,
				)
			}
		})

		it('throws RangeError when integrand overflows to non-finite value', () => {
			assert.throws(
				() =>
					laplaceTransformTypedIterative(
						new Float64Array([1, 1]),
						new Float64Array([0, 1000]),
						new Float64Array([-1]),
					),
				RangeError,
			)
		})
	})
})
