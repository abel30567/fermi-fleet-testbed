import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { moduloFloatRecursive } from './moduloFloatRecursive.js'

/**
 * Decomposes a non-zero finite IEEE-754 float64 into exact `{ sign, mantissa, exponent }`
 * such that `x === sign * Number(mantissa) * 2 ** exponent`.
 */
function decodeFloat64(x) {
	const buf = new ArrayBuffer(8)
	const view = new DataView(buf)
	view.setFloat64(0, x, false)
	const bits = view.getBigUint64(0, false)
	const sign = (bits >> 63n) === 1n ? -1 : 1
	const biasedExp = Number((bits >> 52n) & 0x7ffn)
	const frac = bits & ((1n << 52n) - 1n)

	if (biasedExp === 0) {
		return { sign, mantissa: frac, exponent: -1074 }
	}
	return { sign, mantissa: (1n << 52n) | frac, exponent: biasedExp - 1023 - 52 }
}

/**
 * Independent arbitrary-precision reference using IEEE-754 bit extraction + BigInt `%`.
 */
function exactBigIntFloatMod(a, b) {
	if (a === 0) {
		return a
	}
	const da = decodeFloat64(a)
	const db = decodeFloat64(b)
	const minExp = Math.min(da.exponent, db.exponent)
	const scaledA = da.mantissa << BigInt(da.exponent - minExp)
	const scaledB = db.mantissa << BigInt(db.exponent - minExp)
	const scaledR = scaledA % scaledB
	if (scaledR === 0n) {
		return da.sign < 0 ? -0 : 0
	}
	// Convert exact BigInt scaledR * 2^minExp back to float64 via exact scaling
	// (scaledR fits in <= 53 bits for normal results or exact float64 representable value)
	let r = Number(scaledR)
	let exp = minExp
	while (exp < -1022) {
		r *= 2 ** -512
		exp += 512
	}
	while (exp > 1023) {
		r *= 2 ** 512
		exp -= 512
	}
	r *= 2 ** exp
	return da.sign < 0 ? -r : r
}

describe('moduloFloatRecursive', () => {
	test('handles normal integer and fractional cases', () => {
		assert.equal(moduloFloatRecursive(10, 3), 1)
		assert.equal(moduloFloatRecursive(12, 4), 0)
		assert.equal(moduloFloatRecursive(2, 5), 2)
		assert.equal(moduloFloatRecursive(7.5, 2.25), 0.75)
		assert.equal(moduloFloatRecursive(10.75, 3.5), 0.25)
		assert.equal(moduloFloatRecursive(0.3, 0.1), 0.3 % 0.1)
		assert.equal(moduloFloatRecursive(Math.PI, 1), Math.PI % 1)
		assert.equal(moduloFloatRecursive(100.125, 0.5), 0.125)
	})

	test('preserves IEEE-754 dividend sign semantics across all sign combinations', () => {
		assert.equal(moduloFloatRecursive(7, 3), 1)
		assert.equal(moduloFloatRecursive(-7, 3), -1)
		assert.equal(moduloFloatRecursive(7, -3), 1)
		assert.equal(moduloFloatRecursive(-7, -3), -1)

		assert.equal(moduloFloatRecursive(-7.5, 2.25), -0.75)
		assert.equal(moduloFloatRecursive(7.5, -2.25), 0.75)
		assert.equal(moduloFloatRecursive(-7.5, -2.25), -0.75)

		// Exact multiples preserve signed zero of dividend
		assert.ok(Object.is(moduloFloatRecursive(6, 3), 0))
		assert.ok(Object.is(moduloFloatRecursive(6, -3), 0))
		assert.ok(Object.is(moduloFloatRecursive(-6, 3), -0))
		assert.ok(Object.is(moduloFloatRecursive(-6, -3), -0))
	})

	test('handles positive and negative zero dividends', () => {
		assert.ok(Object.is(moduloFloatRecursive(0, 5), 0))
		assert.ok(Object.is(moduloFloatRecursive(0, -5), 0))
		assert.ok(Object.is(moduloFloatRecursive(-0, 5), -0))
		assert.ok(Object.is(moduloFloatRecursive(-0, -5), -0))
		assert.ok(Object.is(moduloFloatRecursive(-0, Number.MIN_VALUE), -0))
	})

	test('handles subnormal numbers accurately', () => {
		const min = Number.MIN_VALUE // 2^-1074
		assert.ok(Object.is(moduloFloatRecursive(min, min), 0))
		assert.equal(moduloFloatRecursive(3 * min, 2 * min), min)
		assert.equal(moduloFloatRecursive(7 * min, 3 * min), min)
		assert.equal(moduloFloatRecursive(-7 * min, 3 * min), -min)
		assert.equal(moduloFloatRecursive(2 ** -1022, 3 * min), (2 ** -1022) % (3 * min))
		assert.equal(moduloFloatRecursive(1e-320, 3e-322), 1e-320 % 3e-322)
	})

	test('handles extreme float64 magnitudes without overflow or stack exhaustion', () => {
		assert.ok(Object.is(moduloFloatRecursive(Number.MAX_VALUE, Number.MAX_VALUE), 0))
		assert.ok(Object.is(moduloFloatRecursive(Number.MAX_VALUE, Number.MAX_VALUE / 2), 0))
		assert.equal(
			moduloFloatRecursive(Number.MAX_VALUE, Number.MAX_VALUE * 0.75),
			Number.MAX_VALUE % (Number.MAX_VALUE * 0.75)
		)
		assert.ok(Object.is(moduloFloatRecursive(Number.MAX_VALUE, 1), Number.MAX_VALUE % 1))
		assert.ok(Object.is(moduloFloatRecursive(Number.MAX_VALUE, 3), Number.MAX_VALUE % 3))
		assert.ok(
			Object.is(
				moduloFloatRecursive(Number.MAX_VALUE, Number.MIN_VALUE),
				Number.MAX_VALUE % Number.MIN_VALUE
			)
		)
		assert.ok(
			Object.is(
				moduloFloatRecursive(-Number.MAX_VALUE, Number.MIN_VALUE),
				(-Number.MAX_VALUE) % Number.MIN_VALUE
			)
		)
		assert.ok(
			Object.is(
				moduloFloatRecursive(Number.MAX_VALUE, 1e-308),
				Number.MAX_VALUE % 1e-308
			)
		)
		assert.equal(
			moduloFloatRecursive(Number.MAX_SAFE_INTEGER, 97),
			Number.MAX_SAFE_INTEGER % 97
		)
	})

	test('handles values near machine epsilon and exact boundary multiples', () => {
		const eps = Number.EPSILON
		assert.equal(moduloFloatRecursive(1 + eps, 1), eps)
		assert.equal(moduloFloatRecursive(1 - eps / 2, 1), 1 - eps / 2)
		assert.equal(moduloFloatRecursive(2 + 3 * eps, 1 + eps), (2 + 3 * eps) % (1 + eps))
		assert.ok(Object.is(moduloFloatRecursive(2 ** 53, 2), 0))
		assert.equal(moduloFloatRecursive(2 ** 53 - 1, 2), 1)
	})

	test('rejects invalid inputs with TypeError and RangeError', () => {
		// Non-number inputs -> TypeError
		const nonNumbers = ['10', null, undefined, 10n, {}, [], true, Symbol('x')]
		for (const bad of nonNumbers) {
			assert.throws(() => moduloFloatRecursive(bad, 3), TypeError)
			assert.throws(() => moduloFloatRecursive(10, bad), TypeError)
		}

		// Non-finite inputs -> RangeError
		const nonFinite = [NaN, Infinity, -Infinity]
		for (const bad of nonFinite) {
			assert.throws(() => moduloFloatRecursive(bad, 3), RangeError)
			assert.throws(() => moduloFloatRecursive(10, bad), RangeError)
		}

		// Zero divisor -> RangeError
		assert.throws(() => moduloFloatRecursive(10, 0), RangeError)
		assert.throws(() => moduloFloatRecursive(10, -0), RangeError)
		assert.throws(() => moduloFloatRecursive(0, 0), RangeError)
	})

	test('cross-checks bit-for-bit against native JS % across diverse pseudo-random float64 pairs', () => {
		// Deterministic xorshift32 PRNG
		let state = 0x12345678
		const nextUint32 = () => {
			state ^= state << 13
			state ^= state >>> 17
			state ^= state << 5
			return state >>> 0
		}
		const randomFloat = () => {
			const sign = (nextUint32() & 1) === 0 ? 1 : -1
			const mantissa = 1 + (nextUint32() / 0x100000000)
			const exp = (nextUint32() % 600) - 300 // [-300, 299]
			return sign * mantissa * (2 ** exp)
		}

		for (let i = 0; i < 500; i++) {
			const a = randomFloat()
			const b = randomFloat()
			const actual = moduloFloatRecursive(a, b)
			const expected = a % b
			assert.ok(
				Object.is(actual, expected),
				`Mismatch for a=${a}, b=${b}: got ${actual}, expected ${expected}`
			)
			assert.ok(Math.abs(actual) < Math.abs(b))
			// Idempotence: mod(mod(a, b), b) === mod(a, b)
			assert.ok(Object.is(moduloFloatRecursive(actual, b), actual))
		}
	})

	test('cross-checks against independent IEEE-754 BigInt exact remainder', () => {
		const pairs = [
			[10, 3],
			[-10, 3],
			[10, -3],
			[-10, -3],
			[0.3, 0.1],
			[1.234567890123456, 0.00073],
			[-9876543.21, 13.7],
			[Math.PI, Math.E],
			[1e20, 0.3],
			[-1e-100, 3e-115],
			[Number.MAX_SAFE_INTEGER, 1.5],
			[7 * Number.MIN_VALUE, 3 * Number.MIN_VALUE],
			[2 ** -1020, 5 * Number.MIN_VALUE],
			[1e300, 7e280],
			[-42.5, 42.5]
		]

		for (const [a, b] of pairs) {
			const actual = moduloFloatRecursive(a, b)
			const expectedBigInt = exactBigIntFloatMod(a, b)
			assert.ok(
				Object.is(actual, expectedBigInt),
				`BigInt mismatch for a=${a}, b=${b}: got ${actual}, expected ${expectedBigInt}`
			)
		}
	})
})
