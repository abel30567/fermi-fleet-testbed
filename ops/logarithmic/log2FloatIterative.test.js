import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { log2FloatIterative } from './log2FloatIterative.js'

const f64Buf = new Float64Array(1)
const u64View = new BigUint64Array(f64Buf.buffer)

/**
 * Computes the distance in ULPs (units in the last place) between two finite float64 numbers.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) return 0n
	if (a === 0 && b === 0) return 0n
	f64Buf[0] = a
	const ua = u64View[0]
	f64Buf[0] = b
	const ub = u64View[0]
	const sa = (ua >> 63n) !== 0n ? ~(ua & 0x7fffffffffffffffn) : ua
	const sb = (ub >> 63n) !== 0n ? ~(ub & 0x7fffffffffffffffn) : ub
	return sa > sb ? sa - sb : sb - sa
}

/**
 * Independent reference implementation of log2(x) using the hyperbolic artanh
 * series ln(m) = 2 * sum_{j=0..inf} u^(2j+1)/(2j+1) with u = (m - 1)/(m + 1),
 * divided by ln(2) computed via the same series.
 */
function independentArtanhLn(m) {
	const u = (m - 1) / (m + 1)
	const u2 = u * u
	let term = u
	let sum = 0
	for (let denom = 1; denom < 200; denom += 2) {
		const delta = term / denom
		const next = sum + delta
		if (next === sum) break
		sum = next
		term *= u2
	}
	return 2 * sum
}

const INDEPENDENT_LN2 = independentArtanhLn(2)

function independentLog2(x) {
	let k = 0
	let m = x
	while (m >= Math.SQRT2) {
		m *= 0.5
		k += 1
	}
	while (m < Math.SQRT1_2) {
		m *= 2
		k -= 1
	}
	return k + independentArtanhLn(m) / INDEPENDENT_LN2
}

describe('log2FloatIterative', () => {
	describe('input validation', () => {
		it('throws TypeError for non-number inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				'8',
				'',
				true,
				false,
				8n,
				{},
				[8],
				Symbol('8'),
				() => 8,
				new Number(8),
			]

			for (const value of invalidInputs) {
				assert.throws(
					() => log2FloatIterative(value),
					{ name: 'TypeError' },
					`Expected TypeError for input ${String(value)}`
				)
			}
		})

		it('throws TypeError when called with no arguments', () => {
			assert.throws(() => log2FloatIterative(), { name: 'TypeError' })
		})
	})

	describe('IEEE-754 special values', () => {
		it('returns NaN for NaN and negative numbers', () => {
			const nanInputs = [
				Number.NaN,
				-Infinity,
				-Number.MAX_VALUE,
				-1024,
				-1,
				-0.5,
				-Number.MIN_VALUE,
			]
			for (const x of nanInputs) {
				assert.ok(Number.isNaN(log2FloatIterative(x)), `Expected NaN for x=${x}`)
			}
		})

		it('returns -Infinity for +0 and -0', () => {
			assert.strictEqual(log2FloatIterative(0), -Infinity)
			assert.strictEqual(log2FloatIterative(-0), -Infinity)
		})

		it('returns +Infinity for +Infinity', () => {
			assert.strictEqual(log2FloatIterative(Infinity), Infinity)
		})

		it('returns +0 for 1', () => {
			assert.ok(Object.is(log2FloatIterative(1), 0))
		})
	})

	describe('exact powers of two', () => {
		it('is exact for every representable power of two from 2^-1074 to 2^1023', () => {
			let p = 1
			for (let e = 0; e <= 1023; e += 1) {
				assert.strictEqual(log2FloatIterative(p), e, `Failed at 2^${e}`)
				p *= 2
			}

			let q = 0.5
			for (let e = -1; e >= -1074; e -= 1) {
				assert.strictEqual(log2FloatIterative(q), e, `Failed at 2^${e}`)
				q *= 0.5
			}
		})
	})

	describe('normal cases', () => {
		it('computes accurate log2 for common positive numbers', () => {
			const cases = [
				[Math.SQRT2, 0.5],
				[Math.SQRT1_2, -0.5],
				[3, Math.log2(3)],
				[5, Math.log2(5)],
				[10, Math.log2(10)],
				[0.1, Math.log2(0.1)],
				[Math.E, Math.LOG2E],
				[Math.PI, Math.log2(Math.PI)],
				[Math.cbrt(2), 1 / 3],
				[1000, Math.log2(1000)],
				[1e100, Math.log2(1e100)],
				[1e-100, Math.log2(1e-100)],
			]

			for (const [x, expected] of cases) {
				const got = log2FloatIterative(x)
				const ulps = ulpDistance(got, expected)
				assert.ok(
					ulps <= 4n,
					`x=${x}: got=${got}, expected=${expected}, ulps=${ulps}`
				)
			}
		})
	})

	describe('edge cases', () => {
		it('preserves high relative precision very close to 1 from both sides', () => {
			const nearOne = [
				1 + Number.EPSILON,
				1 - Number.EPSILON / 2,
				1 + 2 * Number.EPSILON,
				1 - Number.EPSILON,
				1 + 1e-15,
				1 - 1e-15,
				1 + 1e-12,
				1 - 1e-12,
				1 + 1e-8,
				1 - 1e-8,
				1 + 1e-4,
				1 - 1e-4,
			]

			for (const x of nearOne) {
				const got = log2FloatIterative(x)
				const expected = Math.log2(x)
				const ulps = ulpDistance(got, expected)
				assert.ok(
					ulps <= 4n,
					`near 1 x=${x}: got=${got}, expected=${expected}, ulps=${ulps}`
				)
			}
		})

		it('handles range-reduction boundary values around SQRT1_2 and SQRT2', () => {
			const boundaries = [
				Math.SQRT1_2 * (1 - Number.EPSILON),
				Math.SQRT1_2,
				Math.SQRT1_2 * (1 + Number.EPSILON),
				Math.SQRT2 * (1 - Number.EPSILON),
				Math.SQRT2,
				Math.SQRT2 * (1 + Number.EPSILON),
			]

			for (const x of boundaries) {
				const got = log2FloatIterative(x)
				const expected = Math.log2(x)
				const ulps = ulpDistance(got, expected)
				assert.ok(
					ulps <= 4n,
					`boundary x=${x}: got=${got}, expected=${expected}, ulps=${ulps}`
				)
			}
		})

		it('handles subnormal numbers and extreme magnitudes accurately', () => {
			const extremes = [
				Number.MIN_VALUE,
				Number.MIN_VALUE * 3,
				Number.MIN_VALUE * 1023,
				2 ** -1022 - Number.MIN_VALUE, // largest subnormal
				2 ** -1022, // smallest normal
				2 ** -1022 * 1.5,
				Number.MAX_VALUE / 3,
				Number.MAX_VALUE / 2,
				Number.MAX_VALUE,
			]

			for (const x of extremes) {
				const got = log2FloatIterative(x)
				const expected = Math.log2(x)
				const ulps = ulpDistance(got, expected)
				assert.ok(
					ulps <= 4n,
					`extreme x=${x}: got=${got}, expected=${expected}, ulps=${ulps}`
				)
			}
		})
	})

	describe('algebraic properties and independent cross-checks', () => {
		it('satisfies logarithm identities (inverse, product, quotient, reciprocal, power)', () => {
			const values = [0.0037, 0.3, 0.75, 1.25, 3.14159, 42, 12345.6789]

			for (const x of values) {
				// Inverse of 2^y
				const reconstructed = 2 ** log2FloatIterative(x)
				assert.ok(
					Math.abs(reconstructed - x) <= 4 * Number.EPSILON * x,
					`2^log2(${x}) = ${reconstructed}`
				)

				// Reciprocal identity: log2(1/x) === -log2(x)
				const inv = log2FloatIterative(1 / x)
				const neg = -log2FloatIterative(x)
				assert.ok(
					Math.abs(inv - neg) <= 4 * Number.EPSILON * Math.max(1, Math.abs(neg)),
					`log2(1/${x})=${inv} vs -log2(${x})=${neg}`
				)

				// Power identity: log2(x^3) === 3 * log2(x)
				const cubed = log2FloatIterative(x ** 3)
				const triple = 3 * log2FloatIterative(x)
				assert.ok(
					Math.abs(cubed - triple) <= 8 * Number.EPSILON * Math.max(1, Math.abs(triple)),
					`log2(${x}^3)=${cubed} vs 3*log2(${x})=${triple}`
				)
			}

			// Product and quotient identities
			for (let i = 0; i < values.length - 1; i += 1) {
				const a = values[i]
				const b = values[i + 1]
				const sum = log2FloatIterative(a) + log2FloatIterative(b)
				const prod = log2FloatIterative(a * b)
				assert.ok(
					Math.abs(prod - sum) <= 8 * Number.EPSILON * Math.max(1, Math.abs(sum)),
					`log2(${a}*${b})=${prod} vs sum=${sum}`
				)

				const diff = log2FloatIterative(a) - log2FloatIterative(b)
				const quot = log2FloatIterative(a / b)
				assert.ok(
					Math.abs(quot - diff) <= 8 * Number.EPSILON * Math.max(1, Math.abs(diff)),
					`log2(${a}/${b})=${quot} vs diff=${diff}`
				)
			}
		})

		it('is strictly increasing across ordered positive inputs', () => {
			const samples = [
				Number.MIN_VALUE,
				Number.MIN_VALUE * 2,
				1e-300,
				1e-50,
				1e-5,
				0.5,
				0.999999999,
				1,
				1.000000001,
				1.5,
				2,
				10,
				1e50,
				1e300,
				Number.MAX_VALUE,
			]

			for (let i = 1; i < samples.length; i += 1) {
				assert.ok(
					log2FloatIterative(samples[i - 1]) < log2FloatIterative(samples[i]),
					`Expected monotonic increase between ${samples[i - 1]} and ${samples[i]}`
				)
			}
		})

		it('matches independent artanh series and Math.log2 across deterministic float64 sweep', () => {
			// Deterministic xorshift32 PRNG for reproducible coverage across the entire float64 range
			let state = 0x12345678
			const nextRand = () => {
				state ^= state << 13
				state ^= state >>> 17
				state ^= state << 5
				return (state >>> 0) / 0x100000000
			}

			for (let i = 0; i < 2000; i += 1) {
				const exp = Math.floor(nextRand() * 2096) - 1074 // includes subnormals through ~2^1022
				const mantissa = 1 + nextRand()
				const x = 2 ** exp * mantissa
				if (!Number.isFinite(x) || x <= 0) continue

				const got = log2FloatIterative(x)
				const refSeries = independentLog2(x)
				const refBuiltin = Math.log2(x)

				assert.ok(
					ulpDistance(got, refSeries) <= 4n,
					`artanh cross-check failed at x=${x}: got=${got}, ref=${refSeries}`
				)
				assert.ok(
					ulpDistance(got, refBuiltin) <= 4n,
					`Math.log2 cross-check failed at x=${x}: got=${got}, ref=${refBuiltin}`
				)
			}
		})
	})
})
