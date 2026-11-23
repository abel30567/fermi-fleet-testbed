import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { log10FloatRecursive } from './log10FloatRecursive.js'

/**
 * Asserts that `actual` is close to `expected` within relative/absolute tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-14]
 * @param {number} [absTol=1e-15]
 */
function assertClose(actual, expected, relTol = 1e-14, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const scale = Math.max(Math.abs(expected), 1e-300)
	assert.ok(
		diff <= absTol || diff / scale <= relTol,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, rel=${diff / scale})`,
	)
}

describe('log10FloatRecursive', () => {
	test('throws TypeError for non-number inputs', () => {
		const invalidInputs = [undefined, null, '10', '1', true, false, {}, [], 10n, Symbol('10')]
		for (const input of invalidInputs) {
			assert.throws(
				() => log10FloatRecursive(/** @type {any} */ (input)),
				{ name: 'TypeError' },
				`Expected TypeError for ${String(input)}`,
			)
		}
	})

	test('handles IEEE-754 special values', () => {
		assert.ok(Number.isNaN(log10FloatRecursive(NaN)))
		assert.ok(Number.isNaN(log10FloatRecursive(-1)))
		assert.ok(Number.isNaN(log10FloatRecursive(-0.0001)))
		assert.ok(Number.isNaN(log10FloatRecursive(-Infinity)))
		assert.equal(log10FloatRecursive(0), -Infinity)
		assert.equal(log10FloatRecursive(-0), -Infinity)
		assert.equal(log10FloatRecursive(Infinity), Infinity)
		assert.ok(Object.is(log10FloatRecursive(1), 0))
	})

	test('handles exact integer powers of 10 across the float64 range', () => {
		const exponents = [-308, -305, -200, -100, -22, -10, -3, -2, -1, 0, 1, 2, 3, 6, 10, 22, 23, 100, 200, 308]
		for (const k of exponents) {
			const x = Number(`1e${k}`)
			assertClose(log10FloatRecursive(x), k, 1e-15, 1e-15)
		}
	})

	test('handles normal values, irrational constants, and values near 1', () => {
		const values = [
			0.25,
			0.5,
			0.75,
			1 - 1e-5,
			1 - 1e-10,
			1 - 1e-15,
			1 - Number.EPSILON / 2,
			1 + Number.EPSILON,
			1 + 1e-15,
			1 + 1e-10,
			1 + 1e-5,
			Math.SQRT2,
			2,
			Math.E,
			Math.PI,
			Math.SQRT10 ?? Math.sqrt(10),
			5,
			9.999999999999998,
			42,
			123456.789,
		]
		for (const x of values) {
			assertClose(log10FloatRecursive(x), Math.log10(x), 1e-14, 0)
		}
	})

	test('handles extreme float64 boundaries and subnormals', () => {
		const extremes = [
			Number.MIN_VALUE,
			Number.MIN_VALUE * 2,
			Number.MIN_VALUE * 17,
			1e-320,
			1e-315,
			1e-308,
			2.2250738585072014e-308, // smallest positive normal float64
			Number.MAX_VALUE / 10,
			Number.MAX_VALUE,
		]
		for (const x of extremes) {
			const got = log10FloatRecursive(x)
			const expected = Math.log10(x)
			assert.ok(Number.isFinite(got), `Expected finite result for ${x}, got ${got}`)
			assertClose(got, expected, 1e-14, 1e-14)
		}
	})

	test('independent cross-check: satisfies 10 ** y ≈ x and logarithm product/quotient identities', () => {
		const testPoints = [
			1e-150, 1e-50, 1e-12, 0.0037, 0.499999, 0.500001,
			0.9999, 1.0001, 2.5, 7.3, 19.84, 1e12, 1e50, 1e150,
		]
		for (const x of testPoints) {
			const y = log10FloatRecursive(x)
			// Inverse identity: 10 ** log10(x) ≈ x
			assertClose(10 ** y, x, 1e-13, 0)
			// Cross-check against built-in Math.log10
			assertClose(y, Math.log10(x), 1e-14, 0)
		}

		// Product and quotient laws: log10(a * b) = log10(a) + log10(b), log10(a / b) = log10(a) - log10(b)
		const pairs = [
			[2, 5],
			[3.14159, 2.71828],
			[1e-40, 1e65],
			[0.123456, 789.012],
			[1 + 1e-8, 1 - 1e-8],
		]
		for (const [a, b] of pairs) {
			assertClose(
				log10FloatRecursive(a * b),
				log10FloatRecursive(a) + log10FloatRecursive(b),
				1e-14,
				1e-14,
			)
			assertClose(
				log10FloatRecursive(a / b),
				log10FloatRecursive(a) - log10FloatRecursive(b),
				1e-14,
				1e-14,
			)
		}
	})

	test('deterministic sweep across 1000 pseudo-random positive float64 values matches Math.log10', () => {
		const buf = new ArrayBuffer(8)
		const f64 = new Float64Array(buf)
		const u64 = new BigUint64Array(buf)

		let state = 0x123456789abcdef0n
		for (let i = 0; i < 1000; i++) {
			state = (state * 6364136223846793005n + 1442695040888963407n) & ((1n << 64n) - 1n)
			const bits = state & 0x7fefffffffffffffn
			if (bits === 0n) continue
			u64[0] = bits
			const x = f64[0]
			const got = log10FloatRecursive(x)
			const expected = Math.log10(x)
			assertClose(got, expected, 1e-14, 1e-14)
		}
	})
})
