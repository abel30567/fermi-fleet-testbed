import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformTypedIterative } from './laplaceTransformTypedIterative.js'

function assertClose(actual, expected, tol, label = '') {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= tol,
		`${label ? `${label}: ` : ''}expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('laplaceTransformTypedIterative', () => {
	describe('analytical cross-checks (uniform dt)', () => {
		test('L{1}(s) = 1 / s', () => {
			const dt = 0.005
			const n = 8001 // T = 40
			const values = new Float64Array(n).fill(1)
			const sValues = new Float64Array([0.5, 1, 2, 5, 10])

			const out = laplaceTransformTypedIterative(values, dt, sValues)
			assert.ok(out instanceof Float64Array)
			assert.equal(out.length, sValues.length)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				const expected = 1 / s
				assertClose(out[k], expected, 1e-4, `L{1}(${s})`)
			}
		})

		test('L{exp(-a * t)}(s) = 1 / (s + a)', () => {
			const a = 1.5
			const dt = 0.005
			const n = 8001 // T = 40
			const values = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				values[i] = Math.exp(-a * (i * dt))
			}

			const sValues = new Float64Array([-0.5, 0, 0.5, 1, 3, 7])
			const out = laplaceTransformTypedIterative(values, dt, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				const expected = 1 / (s + a)
				assertClose(out[k], expected, 2e-4, `L{exp(-${a}t)}(${s})`)
			}
		})

		test('L{sin(w * t)}(s) = w / (s^2 + w^2) and L{cos(w * t)}(s) = s / (s^2 + w^2)', () => {
			const w = 2.0
			const dt = 0.005
			const n = 8001 // T = 40
			const sinValues = new Float64Array(n)
			const cosValues = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const t = i * dt
				sinValues[i] = Math.sin(w * t)
				cosValues[i] = Math.cos(w * t)
			}

			const sValues = new Float64Array([0.5, 1, 2, 4])
			const sinOut = laplaceTransformTypedIterative(sinValues, dt, sValues)
			const cosOut = laplaceTransformTypedIterative(cosValues, dt, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				const denom = s * s + w * w
				assertClose(sinOut[k], w / denom, 2e-4, `L{sin(${w}t)}(${s})`)
				assertClose(cosOut[k], s / denom, 2e-4, `L{cos(${w}t)}(${s})`)
			}
		})

		test('L{t}(s) = 1 / s^2', () => {
			const dt = 0.005
			const n = 8001 // T = 40
			const values = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				values[i] = i * dt
			}

			const sValues = new Float64Array([0.8, 1.5, 3, 5])
			const out = laplaceTransformTypedIterative(values, dt, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				assertClose(out[k], 1 / (s * s), 2e-4, `L{t}(${s})`)
			}
		})
	})

	describe('explicit time grid and mathematical properties', () => {
		test('uniform Float64Array times matches uniform dt mode', () => {
			const dt = 0.02
			const n = 501
			const times = new Float64Array(n)
			const values = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const t = i * dt
				times[i] = t
				values[i] = Math.exp(-0.5 * t) * Math.cos(t)
			}
			const sValues = new Float64Array([0.5, 1, 2.5])

			const outDt = laplaceTransformTypedIterative(values, dt, sValues)
			const outTimes = laplaceTransformTypedIterative(values, times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				assertClose(outTimes[k], outDt[k], 1e-12, `uniform equivalence k=${k}`)
			}
		})

		test('non-uniform stretched grid matches L{exp(-a * t)}(s) = 1 / (s + a)', () => {
			const a = 2.0
			const n = 2001
			const times = new Float64Array(n)
			const values = new Float64Array(n)
			// Quadratic stretching: dense near t = 0, spans [0, 40]
			for (let i = 0; i < n; i++) {
				const u = i / (n - 1)
				const t = 40 * u * u
				times[i] = t
				values[i] = Math.exp(-a * t)
			}

			const sValues = new Float64Array([0.5, 1, 3, 5])
			const out = laplaceTransformTypedIterative(values, times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				assertClose(out[k], 1 / (s + a), 2e-4, `non-uniform L{exp(-${a}t)}(${s})`)
			}
		})

		test('linearity: L{alpha * f + beta * g} = alpha * L{f} + beta * L{g}', () => {
			const dt = 0.01
			const n = 2001
			const alpha = 2.5
			const beta = -1.25
			const f = new Float64Array(n)
			const g = new Float64Array(n)
			const combined = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				const t = i * dt
				f[i] = Math.exp(-t)
				g[i] = Math.sin(3 * t)
				combined[i] = alpha * f[i] + beta * g[i]
			}
			const sValues = new Float64Array([0.5, 1, 2, 4])

			const lf = laplaceTransformTypedIterative(f, dt, sValues)
			const lg = laplaceTransformTypedIterative(g, dt, sValues)
			const lComb = laplaceTransformTypedIterative(combined, dt, sValues)

			for (let k = 0; k < sValues.length; k++) {
				assertClose(lComb[k], alpha * lf[k] + beta * lg[k], 1e-12, `linearity k=${k}`)
			}
		})

		test('non-zero starting time integrates over [t_0, t_{n-1}]', () => {
			const n = 2001
			const t0 = 1.0
			const t1 = 21.0
			const times = new Float64Array(n)
			const values = new Float64Array(n).fill(1)
			for (let i = 0; i < n; i++) {
				times[i] = t0 + ((t1 - t0) * i) / (n - 1)
			}
			const sValues = new Float64Array([1, 2])
			const out = laplaceTransformTypedIterative(values, times, sValues)

			for (let k = 0; k < sValues.length; k++) {
				const s = sValues[k]
				const expected = (Math.exp(-s * t0) - Math.exp(-s * t1)) / s
				assertClose(out[k], expected, 1e-4, `shifted start s=${s}`)
			}
		})

		test('does not mutate input Float64Arrays', () => {
			const values = new Float64Array([1, 2, 3])
			const times = new Float64Array([0, 0.5, 1.0])
			const sValues = new Float64Array([1, 2])

			const out = laplaceTransformTypedIterative(values, times, sValues)
			assert.notEqual(out, sValues)
			assert.deepEqual(Array.from(values), [1, 2, 3])
			assert.deepEqual(Array.from(times), [0, 0.5, 1.0])
			assert.deepEqual(Array.from(sValues), [1, 2])
		})
	})

	describe('edge cases (empty and small arrays)', () => {
		test('empty values returns zeros for each s', () => {
			const empty = new Float64Array(0)
			const sValues = new Float64Array([1, 2, 3])

			const outDt = laplaceTransformTypedIterative(empty, 0.1, sValues)
			assert.deepEqual(Array.from(outDt), [0, 0, 0])

			const outTimes = laplaceTransformTypedIterative(empty, new Float64Array(0), sValues)
			assert.deepEqual(Array.from(outTimes), [0, 0, 0])
		})

		test('single-point values returns zeros for each s', () => {
			const values = new Float64Array([42])
			const times = new Float64Array([0])
			const sValues = new Float64Array([0.5, 2])

			const outDt = laplaceTransformTypedIterative(values, 0.1, sValues)
			assert.deepEqual(Array.from(outDt), [0, 0])

			const outTimes = laplaceTransformTypedIterative(values, times, sValues)
			assert.deepEqual(Array.from(outTimes), [0, 0])
		})

		test('empty sValues returns empty Float64Array', () => {
			const values = new Float64Array([1, 2, 3])
			const out = laplaceTransformTypedIterative(values, 0.5, new Float64Array(0))
			assert.ok(out instanceof Float64Array)
			assert.equal(out.length, 0)
		})

		test('two-point trapezoid matches exact analytical formula for a single segment', () => {
			const values = new Float64Array([2, 4])
			const dt = 0.5
			const sValues = new Float64Array([0, 1])

			const out = laplaceTransformTypedIterative(values, dt, sValues)
			assertClose(out[0], 0.5 * (2 + 4) * 0.5, 1e-15, 'two-point s=0')
			assertClose(out[1], 0.5 * (2 + 4 * Math.exp(-0.5)) * 0.5, 1e-15, 'two-point s=1')
		})

		test('zero-valued samples do not produce NaN even with large negative s', () => {
			const values = new Float64Array([0, 0, 0])
			const times = new Float64Array([0, 1000, 2000])
			const sValues = new Float64Array([-1])

			const out = laplaceTransformTypedIterative(values, times, sValues)
			assert.equal(out[0], 0)
		})
	})

	describe('input validation', () => {
		test('rejects invalid input types with TypeError', () => {
			const valid = new Float64Array([1, 2])
			const s = new Float64Array([1])

			assert.throws(() => laplaceTransformTypedIterative([1, 2], 0.1, s), TypeError)
			assert.throws(
				() => laplaceTransformTypedIterative(new Float32Array([1, 2]), 0.1, s),
				TypeError
			)
			assert.throws(() => laplaceTransformTypedIterative(null, 0.1, s), TypeError)
			assert.throws(() => laplaceTransformTypedIterative(valid, [0, 1], s), TypeError)
			assert.throws(
				() => laplaceTransformTypedIterative(valid, new Float32Array([0, 1]), s),
				TypeError
			)
			assert.throws(() => laplaceTransformTypedIterative(valid, '0.1', s), TypeError)
			assert.throws(() => laplaceTransformTypedIterative(valid, 0.1, [1]), TypeError)
			assert.throws(
				() => laplaceTransformTypedIterative(valid, 0.1, new Float32Array([1])),
				TypeError
			)
		})

		test('rejects invalid dt with RangeError', () => {
			const valid = new Float64Array([1, 2])
			const s = new Float64Array([1])

			assert.throws(() => laplaceTransformTypedIterative(valid, 0, s), RangeError)
			assert.throws(() => laplaceTransformTypedIterative(valid, -0.5, s), RangeError)
			assert.throws(() => laplaceTransformTypedIterative(valid, NaN, s), RangeError)
			assert.throws(() => laplaceTransformTypedIterative(valid, Infinity, s), RangeError)
			assert.throws(() => laplaceTransformTypedIterative(valid, -Infinity, s), RangeError)
		})

		test('rejects mismatched values and times lengths with RangeError', () => {
			const values = new Float64Array([1, 2, 3])
			const times = new Float64Array([0, 1])
			const s = new Float64Array([1])

			assert.throws(() => laplaceTransformTypedIterative(values, times, s), RangeError)
		})

		test('rejects non-finite values in values, times, or sValues with RangeError', () => {
			const valid = new Float64Array([1, 2])
			const times = new Float64Array([0, 1])
			const s = new Float64Array([1])

			assert.throws(
				() => laplaceTransformTypedIterative(new Float64Array([1, NaN]), 0.1, s),
				RangeError
			)
			assert.throws(
				() => laplaceTransformTypedIterative(new Float64Array([Infinity, 2]), 0.1, s),
				RangeError
			)
			assert.throws(
				() => laplaceTransformTypedIterative(valid, new Float64Array([0, NaN]), s),
				RangeError
			)
			assert.throws(
				() => laplaceTransformTypedIterative(valid, new Float64Array([0, Infinity]), s),
				RangeError
			)
			assert.throws(
				() => laplaceTransformTypedIterative(valid, times, new Float64Array([NaN])),
				RangeError
			)
			assert.throws(
				() => laplaceTransformTypedIterative(valid, times, new Float64Array([-Infinity])),
				RangeError
			)
		})

		test('rejects negative or non-strictly-increasing times with RangeError', () => {
			const values = new Float64Array([1, 2, 3])
			const s = new Float64Array([1])

			assert.throws(
				() => laplaceTransformTypedIterative(values, new Float64Array([-1, 0, 1]), s),
				RangeError
			)
			assert.throws(
				() => laplaceTransformTypedIterative(values, new Float64Array([0, 1, 1]), s),
				RangeError
			)
			assert.throws(
				() => laplaceTransformTypedIterative(values, new Float64Array([0, 2, 1]), s),
				RangeError
			)
		})
	})
})
