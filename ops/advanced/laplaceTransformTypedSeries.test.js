import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { laplaceTransformTypedSeries } from './laplaceTransformTypedSeries.js'

function assertClose(actual, expected, tol = 1e-12, msg = '') {
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		Math.abs(actual - expected) <= tol * scale,
		`${msg ? msg + ': ' : ''}expected ${actual} to be within ${tol * scale} of ${expected} (diff=${Math.abs(actual - expected)})`,
	)
}

/**
 * Independent numerical computation of L{f}(s) = integral_{lowerLimit}^{upperLimit} f(t) * exp(-s * t) dt
 * via composite Simpson's rule over the smooth support [lowerLimit, upperLimit].
 */
function numericalLaplaceSimpson(
	fn,
	s,
	lowerLimit = 0,
	upperLimit = 60,
	intervals = 20000,
) {
	const h = (upperLimit - lowerLimit) / intervals
	let sum =
		fn(lowerLimit) * Math.exp(-s * lowerLimit) +
		fn(upperLimit) * Math.exp(-s * upperLimit)
	for (let k = 1; k < intervals; k++) {
		const t = lowerLimit + k * h
		const weight = k % 2 === 0 ? 2 : 4
		sum += weight * fn(t) * Math.exp(-s * t)
	}
	return (h / 3) * sum
}

describe('laplaceTransformTypedSeries', () => {
	test('evaluates polynomial series element-wise over Float64Array', () => {
		// f(t) = 3 + 2t - 5t^2 + t^3
		// F(s) = 3/s + 2/s^2 - 10/s^3 + 6/s^4
		const coeffs = new Float64Array([3, 2, -5, 1])
		const sValues = new Float64Array([1, 2, 4, 10])
		const result = laplaceTransformTypedSeries(sValues, coeffs)

		assert.ok(result instanceof Float64Array)
		assert.equal(result.length, sValues.length)

		for (let i = 0; i < sValues.length; i++) {
			const s = sValues[i]
			const expected = 3 / s + 2 / s ** 2 - 10 / s ** 3 + 6 / s ** 4
			assertClose(result[i], expected, 1e-13, `s=${s}`)
		}
	})

	test('supports exponential frequency shift and Heaviside time delay identities', () => {
		// f(t) = u(t - 1.5) * exp(2 * (t - 1.5)) * (4 + 3*(t - 1.5)^2)
		// F(s) = exp(-1.5 * s) * (4 / (s - 2) + 6 / (s - 2)^3)
		const coeffs = new Float64Array([4, 0, 3])
		const sValues = new Float64Array([2.5, 3, 5, 10])
		const result = laplaceTransformTypedSeries(sValues, coeffs, {
			shift: 2,
			delay: 1.5,
		})

		for (let i = 0; i < sValues.length; i++) {
			const s = sValues[i]
			const u = s - 2
			const expected = Math.exp(-1.5 * s) * (4 / u + 6 / u ** 3)
			assertClose(result[i], expected, 1e-13, `s=${s}`)
		}
	})

	test('supports negative frequency shift allowing negative s > shift', () => {
		// f(t) = exp(-5t) * (1 + t) => F(s) = 1/(s+5) + 1/(s+5)^2 for s > -5
		const coeffs = new Float64Array([1, 1])
		const sValues = new Float64Array([-4, -2.5, 0, 3])
		const result = laplaceTransformTypedSeries(sValues, coeffs, { shift: -5 })

		for (let i = 0; i < sValues.length; i++) {
			const u = sValues[i] + 5
			const expected = 1 / u + 1 / u ** 2
			assertClose(result[i], expected, 1e-13, `s=${sValues[i]}`)
		}
	})

	test('cross-checks truncated Taylor series against closed-form analytical transforms', () => {
		// 1) sin(w * t) -> w / (s^2 + w^2) for s > |w|
		const w = 1.5
		const terms = 60
		const sinCoeffs = new Float64Array(terms)
		let fact = 1
		for (let n = 0; n < terms; n++) {
			if (n > 0) fact *= n
			if (n % 2 === 1) {
				const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1
				sinCoeffs[n] = (sign * w ** n) / fact
			}
		}

		const sValues = new Float64Array([3, 4.5, 8, 20])
		const sinRes = laplaceTransformTypedSeries(sValues, sinCoeffs)
		for (let i = 0; i < sValues.length; i++) {
			const s = sValues[i]
			assertClose(sinRes[i], w / (s * s + w * w), 1e-12, `sin at s=${s}`)
		}

		// 2) cos(w * t) -> s / (s^2 + w^2) for s > |w|
		const cosCoeffs = new Float64Array(terms)
		fact = 1
		for (let n = 0; n < terms; n++) {
			if (n > 0) fact *= n
			if (n % 2 === 0) {
				const sign = (n / 2) % 2 === 0 ? 1 : -1
				cosCoeffs[n] = (sign * w ** n) / fact
			}
		}
		const cosRes = laplaceTransformTypedSeries(sValues, cosCoeffs)
		for (let i = 0; i < sValues.length; i++) {
			const s = sValues[i]
			assertClose(cosRes[i], s / (s * s + w * w), 1e-12, `cos at s=${s}`)
		}

		// 3) exp(k * t) -> 1 / (s - k) for s > |k|
		const k = 1.2
		const expCoeffs = new Float64Array(terms)
		fact = 1
		for (let n = 0; n < terms; n++) {
			if (n > 0) fact *= n
			expCoeffs[n] = k ** n / fact
		}
		const expRes = laplaceTransformTypedSeries(sValues, expCoeffs)
		for (let i = 0; i < sValues.length; i++) {
			const s = sValues[i]
			assertClose(expRes[i], 1 / (s - k), 1e-12, `exp at s=${s}`)
		}
	})

	test('cross-checks against independent numerical integration (Simpson quadrature)', () => {
		const coeffs = new Float64Array([1.5, -0.75, 0.25, -0.05, 0.01])
		const shift = -0.4
		const delay = 0.8
		const sValues = new Float64Array([1.2, 2.5, 4.0, 7.5])

		const actual = laplaceTransformTypedSeries(sValues, coeffs, {
			shift,
			delay,
		})

		const f = (t) => {
			if (t < delay) return 0
			const dt = t - delay
			let poly = 0
			for (let n = coeffs.length - 1; n >= 0; n--) {
				poly = poly * dt + coeffs[n]
			}
			return Math.exp(shift * dt) * poly
		}

		for (let i = 0; i < sValues.length; i++) {
			const s = sValues[i]
			const approx = numericalLaplaceSimpson(f, s, delay, 50, 20000)
			assertClose(actual[i], approx, 1e-11, `quadrature cross-check s=${s}`)
		}
	})

	test('handles edge cases: empty inputs, all-zero coeffs, trailing zeros, high degree, subarrays, immutability', () => {
		// Empty sValues
		const emptyOut = laplaceTransformTypedSeries(
			new Float64Array(0),
			new Float64Array([1, 2]),
		)
		assert.ok(emptyOut instanceof Float64Array)
		assert.equal(emptyOut.length, 0)

		// Empty coeffs -> identically zero transform
		const zeroFromEmpty = laplaceTransformTypedSeries(
			new Float64Array([1, 2, 3]),
			new Float64Array(0),
		)
		assert.deepEqual([...zeroFromEmpty], [0, 0, 0])

		// All-zero coeffs with delay and negative zero check
		const zeroFromZeros = laplaceTransformTypedSeries(
			new Float64Array([1, 5]),
			new Float64Array([0, -0, 0]),
			{ delay: 2 },
		)
		assert.equal(Object.is(zeroFromZeros[0], 0), true)
		assert.equal(Object.is(zeroFromZeros[1], 0), true)

		// Trailing zeros match trimmed coefficients exactly
		const sVals = new Float64Array([2, 3, 4])
		const withTrailing = laplaceTransformTypedSeries(
			sVals,
			new Float64Array([5, -2, 0, 0, 0]),
		)
		const trimmed = laplaceTransformTypedSeries(
			sVals,
			new Float64Array([5, -2]),
		)
		assert.deepEqual([...withTrailing], [...trimmed])

		// High-degree series (N = 200 > 170 where n! overflows Float64) stays finite when s is large enough
		const highDeg = new Float64Array(200)
		highDeg.fill(1)
		const highS = new Float64Array([1000])
		const highRes = laplaceTransformTypedSeries(highS, highDeg)
		assert.ok(Number.isFinite(highRes[0]))
		// sum_{n=0}^{199} n! / 1000^{n+1} = 1e-3 + 1e-6 + 2e-9 + 6e-12 + ...
		assertClose(highRes[0], 1e-3 + 1e-6 + 2e-9 + 6e-12, 1e-11, 'high-degree')

		// Subarray views & immutability
		const backingS = new Float64Array([99, 2, 4, 99])
		const backingC = new Float64Array([99, 3, 1, 99])
		const subS = backingS.subarray(1, 3)
		const subC = backingC.subarray(1, 3)
		const subRes = laplaceTransformTypedSeries(subS, subC)
		assertClose(subRes[0], 3 / 2 + 1 / 4, 1e-14)
		assertClose(subRes[1], 3 / 4 + 1 / 16, 1e-14)
		assert.deepEqual([...backingS], [99, 2, 4, 99])
		assert.deepEqual([...backingC], [99, 3, 1, 99])
	})

	test('validates invalid input types and out-of-domain values', () => {
		const validS = new Float64Array([1, 2])
		const validC = new Float64Array([1, 2])

		// Non-Float64Array inputs
		assert.throws(
			() => laplaceTransformTypedSeries([1, 2], validC),
			TypeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(new Float32Array([1, 2]), validC),
			TypeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, [1, 2]),
			TypeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, new Float32Array([1, 2])),
			TypeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, validC, null),
			TypeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, validC, []),
			TypeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, validC, { shift: '0' }),
			TypeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, validC, { delay: '1' }),
			TypeError,
		)

		// Non-finite or out-of-domain values
		assert.throws(
			() => laplaceTransformTypedSeries(new Float64Array([NaN]), validC),
			RangeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(new Float64Array([Infinity]), validC),
			RangeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, new Float64Array([1, NaN])),
			RangeError,
		)
		assert.throws(
			() =>
				laplaceTransformTypedSeries(validS, new Float64Array([1, -Infinity])),
			RangeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(new Float64Array([0]), validC),
			RangeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(new Float64Array([-1]), validC),
			RangeError,
		)
		assert.throws(
			() =>
				laplaceTransformTypedSeries(new Float64Array([2]), validC, {
					shift: 2,
				}),
			RangeError,
		)
		assert.throws(
			() =>
				laplaceTransformTypedSeries(new Float64Array([1.5]), validC, {
					shift: 2,
				}),
			RangeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, validC, { shift: Infinity }),
			RangeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, validC, { delay: -0.1 }),
			RangeError,
		)
		assert.throws(
			() => laplaceTransformTypedSeries(validS, validC, { delay: NaN }),
			RangeError,
		)
		// Invalid s still caught even when coeffs is empty
		assert.throws(
			() =>
				laplaceTransformTypedSeries(
					new Float64Array([0]),
					new Float64Array(0),
				),
			RangeError,
		)
	})
})
