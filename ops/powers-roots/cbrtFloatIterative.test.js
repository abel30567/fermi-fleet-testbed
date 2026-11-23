import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { cbrtFloatIterative } from './cbrtFloatIterative.js'

/**
 * Computes the ULP (unit in the last place) distance between two finite
 * IEEE-754 float64 numbers.
 */
function ulpDistance(a, b) {
	if (Object.is(a, b)) return 0n
	const buf = new ArrayBuffer(16)
	const f64 = new Float64Array(buf)
	const u64 = new BigUint64Array(buf)
	f64[0] = a
	f64[1] = b
	const SIGN_BIT = 0x8000000000000000n
	const toOrdered = (bits) =>
		(bits & SIGN_BIT) !== 0n ? ~bits : bits ^ SIGN_BIT
	const oa = toOrdered(u64[0])
	const ob = toOrdered(u64[1])
	return oa > ob ? oa - ob : ob - oa
}

describe('cbrtFloatIterative', () => {
	test('computes exact cube roots of perfect integer cubes', () => {
		const cases = [
			[1, 1],
			[8, 2],
			[27, 3],
			[64, 4],
			[125, 5],
			[216, 6],
			[343, 7],
			[512, 8],
			[729, 9],
			[1000, 10],
			[1728, 12],
			[1_000_000, 100],
			[1_000_000_000, 1000],
			[1_000_000_000_000_000, 100_000],
		]

		for (const [input, expected] of cases) {
			assert.equal(cbrtFloatIterative(input), expected, `cbrt(${input})`)
			assert.equal(cbrtFloatIterative(-input), -expected, `cbrt(${-input})`)
		}
	})

	test('computes cube roots of fractional and irrational-root values', () => {
		const cases = [
			[0.125, 0.5],
			[0.001, 0.1],
			[0.027, 0.3],
			[3.375, 1.5],
			[15.625, 2.5],
			[2, Math.cbrt(2)],
			[3, Math.cbrt(3)],
			[10, Math.cbrt(10)],
			[Math.PI, Math.cbrt(Math.PI)],
			[Math.E, Math.cbrt(Math.E)],
		]

		for (const [input, expected] of cases) {
			const actual = cbrtFloatIterative(input)
			assert.ok(
				ulpDistance(actual, expected) <= 2n,
				`cbrt(${input}): expected ${expected}, got ${actual}`,
			)
		}
	})

	test('handles special IEEE-754 values (+0, -0, NaN, +Infinity, -Infinity)', () => {
		assert.ok(Object.is(cbrtFloatIterative(0), 0))
		assert.ok(Object.is(cbrtFloatIterative(-0), -0))
		assert.ok(Number.isNaN(cbrtFloatIterative(NaN)))
		assert.equal(cbrtFloatIterative(Infinity), Infinity)
		assert.equal(cbrtFloatIterative(-Infinity), -Infinity)
	})

	test('handles extreme IEEE-754 magnitudes and subnormal values without overflow or underflow', () => {
		const extremes = [
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
			Number.MIN_VALUE * 8,
			2 ** -1074,
			2 ** -1071,
			2 ** -1023, // largest subnormal region
			2 ** -1022, // smallest positive normal
			2 ** -510,
			2 ** 510,
			2 ** 1020,
			2 ** 1023,
			Number.MAX_VALUE,
			-Number.MAX_VALUE,
		]

		for (const x of extremes) {
			const actual = cbrtFloatIterative(x)
			const expected = Math.cbrt(x)
			assert.ok(Number.isFinite(actual), `cbrt(${x}) must be finite`)
			assert.ok(
				ulpDistance(actual, expected) <= 2n,
				`cbrt(${x}): expected ${expected}, got ${actual} (ulp=${ulpDistance(actual, expected)})`,
			)
		}

		// Exact binary powers of 8 have exact binary cube roots across the entire exponent range
		for (let k = -358; k <= 341; k++) {
			const x = 2 ** (3 * k)
			const expected = 2 ** k
			assert.equal(cbrtFloatIterative(x), expected, `cbrt(2^${3 * k})`)
			assert.equal(cbrtFloatIterative(-x), -expected, `cbrt(-2^${3 * k})`)
		}
	})

	test('preserves odd-function symmetry and monotonic ordering', () => {
		const samples = [
			1e-300,
			1e-100,
			1e-12,
			0.001,
			0.25,
			0.9999999999999999,
			1,
			1.0000000000000002,
			2,
			7.999999999999999,
			8,
			8.000000000000002,
			42.5,
			1e15,
			1e100,
			1e300,
		]

		let prev = -Infinity
		for (const x of samples) {
			const pos = cbrtFloatIterative(x)
			const neg = cbrtFloatIterative(-x)
			assert.equal(neg, -pos, `odd symmetry failed at ${x}`)
			assert.ok(pos >= prev, `monotonicity failed at ${x}`)
			prev = pos
		}
	})

	test('validates inputs and throws TypeError for non-number arguments', () => {
		const invalidInputs = [
			undefined,
			null,
			'8',
			'27',
			'',
			true,
			false,
			8n,
			Symbol('x'),
			{},
			[8],
			() => 8,
			new Number(8),
		]

		assert.throws(() => cbrtFloatIterative(), TypeError)
		for (const bad of invalidInputs) {
			assert.throws(
				() => cbrtFloatIterative(bad),
				TypeError,
				`expected TypeError for ${String(bad)}`,
			)
		}
	})

	test('independent cross-check against Math.cbrt and inverse cubing identity', () => {
		// Deterministic PRNG (Mulberry32) for reproducible coverage across scales
		let seed = 0x5eed1234
		const nextRand = () => {
			seed = (seed + 0x6d2b79f5) | 0
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296
		}

		for (let i = 0; i < 1000; i++) {
			const exp = Math.floor(nextRand() * 2040) - 1020
			const mantissa = 1 + nextRand()
			const sign = nextRand() < 0.5 ? -1 : 1
			const x = sign * mantissa * 2 ** exp

			const actual = cbrtFloatIterative(x)
			const ref = Math.cbrt(x)

			assert.ok(
				ulpDistance(actual, ref) <= 2n,
				`Math.cbrt cross-check failed at x=${x}: actual=${actual}, ref=${ref}, ulp=${ulpDistance(actual, ref)}`,
			)

			// Independent algebraic cross-check: actual^3 ≈ x (within safe non-overflowing range)
			if (Math.abs(exp) <= 900) {
				const cubed = actual * actual * actual
				const relErr = Math.abs(cubed - x) / Math.abs(x)
				assert.ok(
					relErr <= 1e-14,
					`inverse cubing failed at x=${x}: actual^3=${cubed}, relErr=${relErr}`,
				)
			}
		}

		// Independent cross-check via exp(ln(|x|) / 3) on moderate positive inputs
		for (const x of [0.1, 0.5, 1.5, 2, 5, 19, 100, 12345.6789, 1e12, 1e-12]) {
			const actual = cbrtFloatIterative(x)
			const viaExpLog = Math.exp(Math.log(x) / 3)
			const relErr = Math.abs(actual - viaExpLog) / viaExpLog
			assert.ok(
				relErr <= 1e-14,
				`exp(log/3) cross-check failed at x=${x}: actual=${actual}, viaExpLog=${viaExpLog}`,
			)
		}
	})
})
