import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { log2FloatIterative } from './log2FloatIterative.js'

function assertApproxEqual(actual, expected, relTol = 1e-14, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.abs(expected))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`,
	)
}

describe('log2FloatIterative', () => {
	test('exact powers of 2 across normal and subnormal exponents', () => {
		const exponents = [-1074, -1073, -1023, -1022, -53, -10, -2, -1, 0, 1, 2, 10, 53, 512, 1023]
		for (const exp of exponents) {
			const x = 2 ** exp
			assert.equal(log2FloatIterative(x), exp)
		}
		assert.equal(Object.is(log2FloatIterative(1), 0), true)
	})

	test('arbitrary positive numbers match Math.log2 and satisfy 2 ** y ≈ x', () => {
		const values = [
			0.1,
			0.3,
			0.7071067811865475,
			0.7071067811865476,
			0.7071067811865477,
			0.9999999999999999,
			1 + Number.EPSILON,
			1.000001,
			1.414213562373095,
			1.4142135623730951,
			1.4142135623730954,
			1.5,
			Math.E,
			Math.PI,
			3,
			5,
			10,
			42.125,
			1000,
			123456789.98765432,
			1e100,
			1e-100,
		]

		for (const x of values) {
			const y = log2FloatIterative(x)
			assertApproxEqual(y, Math.log2(x))
			assertApproxEqual(2 ** y, x, 1e-13, 0)
		}
	})

	test('subnormals, tiny positives, and huge positives', () => {
		const extremePositives = [
			Number.MIN_VALUE,
			Number.MIN_VALUE * 3,
			Number.MIN_VALUE * 17,
			2 ** -1022 * 0.75,
			2 ** -1022,
			1e-308,
			1e308,
			Number.MAX_VALUE / 2,
			Number.MAX_VALUE,
		]

		for (const x of extremePositives) {
			const y = log2FloatIterative(x)
			assertApproxEqual(y, Math.log2(x))
		}
	})

	test('special IEEE-754 values Infinity and NaN', () => {
		assert.equal(log2FloatIterative(Infinity), Infinity)
		assert.ok(Number.isNaN(log2FloatIterative(NaN)))
	})

	test('throws RangeError on zero and negative inputs', () => {
		const nonPositives = [0, -0, -Number.MIN_VALUE, -1e-100, -1, -2, -Number.MAX_VALUE, -Infinity]
		for (const x of nonPositives) {
			assert.throws(() => log2FloatIterative(x), RangeError)
		}
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidInputs = [
			'2',
			'8',
			'',
			null,
			undefined,
			true,
			false,
			{},
			[],
			[2],
			2n,
			Symbol('2'),
			() => 2,
		]
		for (const input of invalidInputs) {
			assert.throws(() => log2FloatIterative(input), TypeError)
		}
	})

	test('systematic cross-check against Math.log2 and inverse 2 ** y ≈ x', () => {
		let seed = 0x12345678
		const nextRand = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return seed / 0x100000000
		}

		for (let i = 0; i < 500; i += 1) {
			// Span exponents from -1000 to +1000
			const exp = Math.floor(nextRand() * 2001) - 1000
			const mantissa = 1 + nextRand()
			const x = mantissa * 2 ** exp
			const y = log2FloatIterative(x)
			const expected = Math.log2(x)

			assertApproxEqual(y, expected, 1e-14, 1e-15)
			assertApproxEqual(2 ** y, x, 1e-12, 0)
		}
	})
})
