import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { divideFloatIterative } from './divideFloatIterative.js'

/**
 * Asserts that actual matches expected within a small relative tolerance (in ULPs).
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [maxRelError=1e-15]
 */
function assertClose(actual, expected, maxRelError = 1e-15) {
	if (Number.isNaN(expected)) {
		assert.ok(Number.isNaN(actual), `Expected NaN, got ${actual}`)
		return
	}
	if (!Number.isFinite(expected)) {
		assert.equal(actual, expected)
		return
	}
	if (expected === 0) {
		assert.ok(Object.is(actual, expected), `Expected ${Object.is(expected, -0) ? '-0' : '0'}, got ${Object.is(actual, -0) ? '-0' : actual}`)
		return
	}
	const diff = Math.abs(actual - expected)
	const tol = Math.max(Math.abs(expected) * maxRelError, Number.MIN_VALUE)
	assert.ok(
		diff <= tol,
		`Expected ${actual} to be within ${tol} of ${expected} (diff=${diff})`
	)
}

describe('divideFloatIterative', () => {
	test('computes normal divisions accurately', () => {
		const cases = [
			[6, 3, 2],
			[10, 4, 2.5],
			[1, 2, 0.5],
			[1, 3, 1 / 3],
			[22, 7, 22 / 7],
			[355, 113, 355 / 113],
			[0.3, 0.1, 0.3 / 0.1],
			[123456.789, 987.654, 123456.789 / 987.654],
			[Math.PI, Math.E, Math.PI / Math.E],
			[Math.SQRT2, Math.LN2, Math.SQRT2 / Math.LN2]
		]

		for (const [a, b, expected] of cases) {
			assertClose(divideFloatIterative(a, b), expected)
		}
	})

	test('handles negative operands and sign combinations', () => {
		assertClose(divideFloatIterative(-10, 4), -2.5)
		assertClose(divideFloatIterative(10, -4), -2.5)
		assertClose(divideFloatIterative(-10, -4), 2.5)
		assertClose(divideFloatIterative(-1, 7), -1 / 7)
		assertClose(divideFloatIterative(1, -7), -1 / 7)
		assertClose(divideFloatIterative(-1, -7), 1 / 7)
	})

	test('handles zero dividend with signed zero preservation', () => {
		assert.ok(Object.is(divideFloatIterative(0, 5), 0))
		assert.ok(Object.is(divideFloatIterative(0, -5), -0))
		assert.ok(Object.is(divideFloatIterative(-0, 5), -0))
		assert.ok(Object.is(divideFloatIterative(-0, -5), 0))
		assert.ok(Object.is(divideFloatIterative(0, Infinity), 0))
		assert.ok(Object.is(divideFloatIterative(0, -Infinity), -0))
		assert.ok(Object.is(divideFloatIterative(-0, Infinity), -0))
		assert.ok(Object.is(divideFloatIterative(-0, -Infinity), 0))
	})

	test('throws RangeError on division by zero (0 and -0)', () => {
		assert.throws(() => divideFloatIterative(1, 0), RangeError)
		assert.throws(() => divideFloatIterative(-1, 0), RangeError)
		assert.throws(() => divideFloatIterative(1, -0), RangeError)
		assert.throws(() => divideFloatIterative(0, 0), RangeError)
		assert.throws(() => divideFloatIterative(0, -0), RangeError)
		assert.throws(() => divideFloatIterative(Infinity, 0), RangeError)
	})

	test('handles NaN and Infinity operands per IEEE-754', () => {
		assert.ok(Number.isNaN(divideFloatIterative(NaN, 1)))
		assert.ok(Number.isNaN(divideFloatIterative(1, NaN)))
		assert.ok(Number.isNaN(divideFloatIterative(NaN, NaN)))
		assert.ok(Number.isNaN(divideFloatIterative(NaN, 0)))

		assert.equal(divideFloatIterative(Infinity, 2), Infinity)
		assert.equal(divideFloatIterative(Infinity, -2), -Infinity)
		assert.equal(divideFloatIterative(-Infinity, 2), -Infinity)
		assert.equal(divideFloatIterative(-Infinity, -2), Infinity)

		assert.ok(Object.is(divideFloatIterative(5, Infinity), 0))
		assert.ok(Object.is(divideFloatIterative(5, -Infinity), -0))
		assert.ok(Object.is(divideFloatIterative(-5, Infinity), -0))
		assert.ok(Object.is(divideFloatIterative(-5, -Infinity), 0))

		assert.ok(Number.isNaN(divideFloatIterative(Infinity, Infinity)))
		assert.ok(Number.isNaN(divideFloatIterative(Infinity, -Infinity)))
		assert.ok(Number.isNaN(divideFloatIterative(-Infinity, Infinity)))
		assert.ok(Number.isNaN(divideFloatIterative(-Infinity, -Infinity)))
	})

	test('handles very large, very small, subnormal, overflow, and underflow values', () => {
		// Extreme magnitudes cancelling out
		assertClose(divideFloatIterative(Number.MAX_VALUE, Number.MAX_VALUE), 1)
		assertClose(divideFloatIterative(Number.MIN_VALUE, Number.MIN_VALUE), 1)
		assertClose(divideFloatIterative(1e308, 1e307), 10)
		assertClose(divideFloatIterative(1e-308, 1e-307), 0.1)

		// Subnormal dividend and divisor
		assertClose(divideFloatIterative(Number.MIN_VALUE, 0.5), Number.MIN_VALUE / 0.5)
		assertClose(divideFloatIterative(1e-320, 1e-319), 1e-320 / 1e-319)
		assertClose(divideFloatIterative(1, Number.MAX_VALUE), 1 / Number.MAX_VALUE)
		assertClose(divideFloatIterative(1e-300, 1e20), 1e-300 / 1e20)

		// Near overflow (result stays finite)
		assertClose(divideFloatIterative(Number.MAX_VALUE, 2), Number.MAX_VALUE / 2)
		assertClose(divideFloatIterative(1.5e308, 0.9), 1.5e308 / 0.9)

		// Overflow to +/-Infinity
		assert.equal(divideFloatIterative(Number.MAX_VALUE, 0.5), Infinity)
		assert.equal(divideFloatIterative(-Number.MAX_VALUE, 0.5), -Infinity)
		assert.equal(divideFloatIterative(1e200, 1e-200), Infinity)

		// Underflow to +/-0
		assert.ok(Object.is(divideFloatIterative(Number.MIN_VALUE, 2), 0))
		assert.ok(Object.is(divideFloatIterative(-Number.MIN_VALUE, 2), -0))
		assert.ok(Object.is(divideFloatIterative(1e-200, 1e200), 0))
		assert.ok(Object.is(divideFloatIterative(-1e-200, 1e200), -0))
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidValues = ['2', null, undefined, {}, [], true, false, 2n, Symbol('x')]

		for (const bad of invalidValues) {
			assert.throws(() => divideFloatIterative(bad, 2), TypeError)
			assert.throws(() => divideFloatIterative(2, bad), TypeError)
		}
		assert.throws(() => divideFloatIterative(), TypeError)
		assert.throws(() => divideFloatIterative(10), TypeError)
	})

	test('cross-checks against native a / b and inverse multiplication quotient * b ≈ a', () => {
		// Deterministic pseudo-random generator (LCG) for reproducible wide-range testing
		let seed = 0x12345678
		function nextRand() {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
			return seed / 0x100000000
		}

		for (let i = 0; i < 500; i += 1) {
			const signA = nextRand() < 0.5 ? -1 : 1
			const signB = nextRand() < 0.5 ? -1 : 1
			const expA = Math.floor((nextRand() - 0.5) * 400)
			const expB = Math.floor((nextRand() - 0.5) * 400)
			const a = signA * (1 + nextRand()) * (2 ** expA)
			const b = signB * (1 + nextRand()) * (2 ** expB)

			const q = divideFloatIterative(a, b)
			const nativeQ = a / b

			assertClose(q, nativeQ, 2 * Number.EPSILON)

			// Independent algebraic identity check: q * b ≈ a (when q * b is normal)
			const reconstructed = q * b
			assertClose(reconstructed, a, 4 * Number.EPSILON)
		}
	})
})
