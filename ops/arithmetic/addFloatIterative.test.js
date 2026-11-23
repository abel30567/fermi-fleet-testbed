import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { add } from '../../lib.js'
import { addFloatIterative } from './addFloatIterative.js'

/**
 * Deterministic xorshift32 PRNG for reproducible cross-check tests.
 * @param {number} seed
 * @returns {() => number}
 */
function createRng(seed) {
	let state = seed >>> 0
	return () => {
		state ^= state << 13
		state ^= state >>> 17
		state ^= state << 5
		return (state >>> 0) / 0x100000000
	}
}

/**
 * Returns the raw IEEE-754 float64 bit pattern as a 64-bit unsigned BigInt.
 * @param {number} value
 * @returns {bigint}
 */
function float64Bits(value) {
	const buf = new ArrayBuffer(8)
	const view = new DataView(buf)
	view.setFloat64(0, value, false)
	return view.getBigUint64(0, false)
}

describe('addFloatIterative', () => {
	describe('normal cases', () => {
		it('adds two positive integers and floating-point numbers', () => {
			assert.equal(addFloatIterative(2, 3), 5)
			assert.equal(addFloatIterative(1.25, 2.5), 3.75)
			assert.equal(addFloatIterative(0.1, 0.2), 0.1 + 0.2)
		})

		it('adds negative and mixed-sign numbers', () => {
			assert.equal(addFloatIterative(-4.5, -2.5), -7)
			assert.equal(addFloatIterative(-10, 4.25), -5.75)
			assert.equal(addFloatIterative(100.5, -100.5), 0)
		})

		it('adds multiple operands iteratively from left to right', () => {
			assert.equal(addFloatIterative(1, 2, 3, 4, 5), 15)
			assert.equal(addFloatIterative(0.5, 0.25, 0.125, 0.125), 1)
			// Left-to-right float64 non-associativity: (1e16 + 1) - 1e16 === 0, whereas (1e16 - 1e16) + 1 === 1
			assert.equal(addFloatIterative(1e16, 1, -1e16), 0)
			assert.equal(addFloatIterative(1e16, -1e16, 1), 1)
		})

		it('returns the operand unchanged for a single argument', () => {
			assert.equal(addFloatIterative(42.5), 42.5)
			assert.equal(addFloatIterative(-123.75), -123.75)
			assert.ok(Object.is(addFloatIterative(-0), -0))
			assert.ok(Object.is(addFloatIterative(0), 0))
		})
	})

	describe('IEEE-754 edge cases', () => {
		it('preserves IEEE-754 signed zero rules', () => {
			assert.ok(Object.is(addFloatIterative(-0, -0), -0))
			assert.ok(Object.is(addFloatIterative(-0, -0, -0), -0))
			assert.ok(Object.is(addFloatIterative(-0, 0), 0))
			assert.ok(Object.is(addFloatIterative(0, -0), 0))
			assert.ok(Object.is(addFloatIterative(0, 0), 0))
		})

		it('handles infinities and overflow to infinity', () => {
			assert.equal(addFloatIterative(Infinity, 1), Infinity)
			assert.equal(addFloatIterative(-Infinity, -1), -Infinity)
			assert.equal(addFloatIterative(Infinity, Infinity), Infinity)
			assert.equal(addFloatIterative(-Infinity, -Infinity), -Infinity)
			assert.ok(Number.isNaN(addFloatIterative(Infinity, -Infinity)))
			assert.equal(addFloatIterative(Number.MAX_VALUE, Number.MAX_VALUE), Infinity)
			assert.equal(addFloatIterative(-Number.MAX_VALUE, -Number.MAX_VALUE), -Infinity)
		})

		it('propagates NaN', () => {
			assert.ok(Number.isNaN(addFloatIterative(NaN)))
			assert.ok(Number.isNaN(addFloatIterative(NaN, 1)))
			assert.ok(Number.isNaN(addFloatIterative(1, NaN, 2)))
			assert.ok(Number.isNaN(addFloatIterative(1, 2, NaN)))
		})

		it('handles subnormal numbers and machine epsilon boundaries', () => {
			assert.equal(addFloatIterative(Number.MIN_VALUE, Number.MIN_VALUE), 2 * Number.MIN_VALUE)
			assert.equal(addFloatIterative(1, Number.EPSILON), 1 + Number.EPSILON)
			assert.equal(addFloatIterative(1, Number.EPSILON / 2), 1)
			assert.equal(addFloatIterative(Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER), 0)
		})

		it('handles large operand counts iteratively without stack overflow', () => {
			const count = 20000
			const values = new Array(count).fill(0.5)
			assert.equal(addFloatIterative(...values), count * 0.5)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when called with no arguments', () => {
			assert.throws(
				() => addFloatIterative(),
				{ name: 'TypeError', message: /at least one number/ }
			)
		})

		it('throws TypeError for non-number arguments at any position', () => {
			const invalidValues = [
				'1',
				null,
				undefined,
				true,
				false,
				1n,
				{},
				[1, 2],
				Symbol('x'),
				new Number(1),
			]

			for (const bad of invalidValues) {
				assert.throws(() => addFloatIterative(bad), TypeError)
				assert.throws(() => addFloatIterative(1, bad), TypeError)
				assert.throws(() => addFloatIterative(1, 2, bad, 3), TypeError)
			}
		})

		it('still validates later arguments even after NaN or Infinity', () => {
			assert.throws(() => addFloatIterative(NaN, '2'), TypeError)
			assert.throws(() => addFloatIterative(Infinity, null), TypeError)
		})
	})

	describe('independent cross-checks', () => {
		it('matches exact BigInt arithmetic on safe integers and dyadic rationals', () => {
			const rng = createRng(0x5eed1234)
			const scale = 1024 // 2^10, exact in IEEE-754 float64
			const scaleBig = BigInt(scale)

			for (let trial = 0; trial < 100; trial += 1) {
				const len = 1 + Math.floor(rng() * 25)
				const floats = []
				let exactScaled = 0n

				for (let i = 0; i < len; i += 1) {
					const numerator = Math.floor((rng() - 0.5) * 2_000_000)
					floats.push(numerator / scale)
					exactScaled += BigInt(numerator)
				}

				const actual = addFloatIterative(...floats)
				const expected = Number(exactScaled) / Number(scaleBig)
				assert.equal(actual, expected)
				assert.equal(BigInt(Math.round(actual * scale)), exactScaled)
			}
		})

		it('matches lib.js add(a, b) across normal and special IEEE-754 pairs', () => {
			const samples = [
				-Infinity,
				-Number.MAX_VALUE,
				-1e10,
				-1.5,
				-Number.MIN_VALUE,
				-0,
				0,
				Number.MIN_VALUE,
				Number.EPSILON,
				0.1,
				0.2,
				1.5,
				1e10,
				Number.MAX_VALUE,
				Infinity,
				NaN,
			]

			for (const a of samples) {
				for (const b of samples) {
					const actual = addFloatIterative(a, b)
					const expected = add(a, b)
					assert.ok(
						Object.is(actual, expected),
						`Mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`
					)
				}
			}
		})

		it('matches bit-for-bit float64 reduction over random multi-scale sequences', () => {
			const rng = createRng(0xcafebabe)

			for (let trial = 0; trial < 100; trial += 1) {
				const len = 1 + Math.floor(rng() * 40)
				const values = []
				for (let i = 0; i < len; i += 1) {
					const sign = rng() < 0.5 ? -1 : 1
					const exp = Math.floor(rng() * 40) - 20
					const mantissa = rng() * 10
					values.push(sign * mantissa * Math.pow(2, exp))
				}

				const actual = addFloatIterative(...values)
				const expected = values.reduce((acc, x) => acc + x)
				assert.equal(float64Bits(actual), float64Bits(expected))
			}
		})
	})
})
