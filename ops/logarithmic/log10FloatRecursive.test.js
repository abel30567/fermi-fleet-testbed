import { describe, test } from 'node:test'
import assert from 'node:assert'
import { log10FloatRecursive } from './log10FloatRecursive.js'

/**
 * Asserts that `actual` is within `relTol` relative (or `absTol` absolute) tolerance of `expected`.
 */
function assertClose(actual, expected, tol = 1e-14, label = '') {
	assert.strictEqual(typeof actual, 'number', `${label}: expected number`)
	assert.ok(!Number.isNaN(actual), `${label}: got unexpected NaN`)
	const diff = Math.abs(actual - expected)
	const scale = Math.max(1, Math.abs(expected))
	assert.ok(
		diff <= tol * scale,
		`${label}: actual=${actual}, expected=${expected}, diff=${diff}, limit=${tol * scale}`
	)
}

describe('log10FloatRecursive', () => {
	test('input validation throws TypeError on non-number inputs', () => {
		const invalidInputs = [
			undefined,
			null,
			'10',
			'100',
			'',
			true,
			false,
			10n,
			{},
			[10],
			Symbol('x'),
			() => 10,
		]
		for (const input of invalidInputs) {
			assert.throws(
				() => log10FloatRecursive(input),
				{ name: 'TypeError' },
				`Expected TypeError for ${String(input)}`
			)
		}
	})

	test('IEEE-754 special values', () => {
		assert.ok(Number.isNaN(log10FloatRecursive(Number.NaN)))
		assert.ok(Number.isNaN(log10FloatRecursive(-1)))
		assert.ok(Number.isNaN(log10FloatRecursive(-0.0001)))
		assert.ok(Number.isNaN(log10FloatRecursive(-1e300)))
		assert.ok(Number.isNaN(log10FloatRecursive(Number.NEGATIVE_INFINITY)))

		assert.strictEqual(log10FloatRecursive(0), Number.NEGATIVE_INFINITY)
		assert.strictEqual(log10FloatRecursive(-0), Number.NEGATIVE_INFINITY)
		assert.strictEqual(log10FloatRecursive(Number.POSITIVE_INFINITY), Number.POSITIVE_INFINITY)

		const log1 = log10FloatRecursive(1)
		assert.strictEqual(log1, 0)
		assert.ok(Object.is(log1, 0), 'log10(1) should be +0, not -0')
	})

	test('exact integer powers of 10', () => {
		for (let exp = -22; exp <= 22; exp++) {
			const val = Number(`1e${exp}`)
			const result = log10FloatRecursive(val)
			assertClose(result, exp, 1e-15, `1e${exp}`)
		}
		// Exact values for representable positive powers of 10
		assert.strictEqual(log10FloatRecursive(1), 0)
		assert.strictEqual(log10FloatRecursive(10), 1)
		assert.strictEqual(log10FloatRecursive(100), 2)
		assert.strictEqual(log10FloatRecursive(1000), 3)
		assert.strictEqual(log10FloatRecursive(1e6), 6)
		assert.strictEqual(log10FloatRecursive(1e16), 16)
		assert.strictEqual(log10FloatRecursive(1e22), 22)
		assert.strictEqual(log10FloatRecursive(0.1), -1)
		assert.strictEqual(log10FloatRecursive(0.01), -2)
		assert.strictEqual(log10FloatRecursive(0.001), -3)
	})

	test('common positive floats and boundary values around sqrt(10) and 1', () => {
		const values = [
			0.123456789,
			0.3162277660168379, // just below 1/sqrt(10)
			1 / Math.sqrt(10),
			0.316227766016838, // just above 1/sqrt(10)
			0.5,
			1 - Number.EPSILON,
			1 - Number.EPSILON / 2,
			1 + Number.EPSILON,
			1 + 1e-12,
			1 + 1e-8,
			Math.SQRT2,
			Math.E,
			Math.PI,
			3.162277660168379, // just below sqrt(10)
			Math.sqrt(10),
			3.16227766016838, // just above sqrt(10)
			7,
			42,
			12345.6789,
			999999.999999,
		]
		for (const x of values) {
			assertClose(log10FloatRecursive(x), Math.log10(x), 1e-14, `x=${x}`)
		}
	})

	test('extreme float64 magnitudes: subnormals, min normal, and max finite', () => {
		const extremes = [
			Number.MIN_VALUE, // 5e-324 (smallest positive subnormal)
			Number.MIN_VALUE * 2,
			Number.MIN_VALUE * 1024,
			1e-320,
			1e-315,
			2.225073858507201e-308, // largest subnormal
			2.2250738585072014e-308, // smallest positive normal
			1e-300,
			1e-256,
			1e-255,
			1e-128,
			1e-64,
			1e64,
			1e128,
			1e255,
			1e256,
			1e300,
			1e308,
			Number.MAX_VALUE / 10,
			Number.MAX_VALUE, // ~1.7976931348623157e+308
		]
		for (const x of extremes) {
			assertClose(log10FloatRecursive(x), Math.log10(x), 1e-14, `extreme x=${x}`)
		}
	})

	test('cross-check against Math.log10 and inverse identity 10**y == x', () => {
		const samples = [
			1e-200,
			3.7e-100,
			1.23456789e-30,
			0.000789,
			0.25,
			0.75,
			1.5,
			2,
			5,
			9.999999999999998,
			10.000000000000002,
			250.5,
			65536,
			9.87654321e45,
			4.2e150,
			1.5e290,
		]
		for (const x of samples) {
			const y = log10FloatRecursive(x)
			// Cross-check 1: against independent Math.log10
			assertClose(y, Math.log10(x), 1e-14, `Math.log10 cross-check x=${x}`)
			// Cross-check 2: inverse identity 10 ** y ≈ x
			const reconstructed = 10 ** y
			const relErr = Math.abs(reconstructed - x) / x
			assert.ok(
				relErr < 1e-12,
				`Inverse check failed for x=${x}: y=${y}, 10**y=${reconstructed}, relErr=${relErr}`
			)
		}
	})

	test('logarithmic algebraic identities: product, quotient, and power', () => {
		const pairs = [
			[2, 5],
			[3.5, 7.25],
			[1e-50, 1e80],
			[1.234e120, 5.678e-90],
			[Math.PI, Math.E],
		]
		for (const [a, b] of pairs) {
			// log10(a * b) == log10(a) + log10(b)
			assertClose(
				log10FloatRecursive(a * b),
				log10FloatRecursive(a) + log10FloatRecursive(b),
				1e-13,
				`product (${a}, ${b})`
			)
			// log10(a / b) == log10(a) - log10(b)
			assertClose(
				log10FloatRecursive(a / b),
				log10FloatRecursive(a) - log10FloatRecursive(b),
				1e-13,
				`quotient (${a}, ${b})`
			)
		}
		// log10(x^k) == k * log10(x)
		for (const x of [0.3, 2.7, 13.5, 1e15]) {
			for (const k of [-3, -1, 2, 5, 10]) {
				assertClose(
					log10FloatRecursive(x ** k),
					k * log10FloatRecursive(x),
					1e-13,
					`power (${x}^${k})`
				)
			}
		}
	})
})
