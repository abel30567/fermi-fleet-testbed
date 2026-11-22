import { describe, test } from 'node:test'
import assert from 'node:assert'
import { subtractFloatIterative } from './subtractFloatIterative.js'

describe('subtractFloatIterative', () => {
	test('normal two-operand and multi-operand subtraction', () => {
		assert.strictEqual(subtractFloatIterative(10, 3), 7)
		assert.strictEqual(subtractFloatIterative(3, 10), -7)
		assert.strictEqual(subtractFloatIterative(100, 20, 30, 5), 45)
		assert.strictEqual(subtractFloatIterative(1.5, 0.25, 0.125), 1.125)
		assert.strictEqual(subtractFloatIterative(0.3, 0.1), 0.3 - 0.1)
	})

	test('negative numbers', () => {
		assert.strictEqual(subtractFloatIterative(-5, -3), -2)
		assert.strictEqual(subtractFloatIterative(5, -3), 8)
		assert.strictEqual(subtractFloatIterative(-5, 3), -8)
		assert.strictEqual(subtractFloatIterative(-10, -2, -3, 5), -10)
	})

	test('signed zeros follow IEEE-754 semantics', () => {
		assert.ok(Object.is(subtractFloatIterative(0, 0), 0))
		assert.ok(Object.is(subtractFloatIterative(-0, 0), -0))
		assert.ok(Object.is(subtractFloatIterative(0, -0), 0))
		assert.ok(Object.is(subtractFloatIterative(-0, -0), 0))
		assert.ok(Object.is(subtractFloatIterative(-0, 0, 0), -0))
	})

	test('extreme magnitudes, subnormals, and overflow', () => {
		assert.strictEqual(
			subtractFloatIterative(Number.MIN_VALUE, Number.MIN_VALUE),
			0,
		)
		assert.strictEqual(
			subtractFloatIterative(0, Number.MIN_VALUE),
			-Number.MIN_VALUE,
		)
		assert.strictEqual(
			subtractFloatIterative(Number.MAX_VALUE, -Number.MAX_VALUE),
			Infinity,
		)
		assert.strictEqual(
			subtractFloatIterative(-Number.MAX_VALUE, Number.MAX_VALUE),
			-Infinity,
		)
	})

	test('Infinity and -Infinity handling', () => {
		assert.strictEqual(subtractFloatIterative(Infinity, 1, 2, 3), Infinity)
		assert.strictEqual(subtractFloatIterative(-Infinity, 1, 2, 3), -Infinity)
		assert.strictEqual(subtractFloatIterative(1, Infinity), -Infinity)
		assert.strictEqual(subtractFloatIterative(1, -Infinity), Infinity)
		assert.strictEqual(subtractFloatIterative(-Infinity, Infinity), -Infinity)
		assert.strictEqual(subtractFloatIterative(Infinity, -Infinity), Infinity)
		assert.ok(Number.isNaN(subtractFloatIterative(Infinity, Infinity)))
		assert.ok(Number.isNaN(subtractFloatIterative(-Infinity, -Infinity)))
	})

	test('NaN propagation in any position', () => {
		assert.ok(Number.isNaN(subtractFloatIterative(NaN, 1)))
		assert.ok(Number.isNaN(subtractFloatIterative(1, NaN)))
		assert.ok(Number.isNaN(subtractFloatIterative(10, 2, NaN, 4)))
		assert.ok(Number.isNaN(subtractFloatIterative(10, 2, 4, NaN)))
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidValues = [
			'1',
			'',
			null,
			undefined,
			true,
			false,
			1n,
			Symbol('num'),
			{},
			[1],
			new Number(1),
			() => 1,
		]

		for (const bad of invalidValues) {
			assert.throws(() => subtractFloatIterative(bad, 1), TypeError)
			assert.throws(() => subtractFloatIterative(1, bad), TypeError)
			assert.throws(() => subtractFloatIterative(10, 2, bad), TypeError)
		}

		// Validates all arguments even when an earlier value is NaN or Infinity
		assert.throws(() => subtractFloatIterative(NaN, '2'), TypeError)
		assert.throws(() => subtractFloatIterative(Infinity, null), TypeError)
	})

	test('throws RangeError when fewer than two arguments are provided', () => {
		assert.throws(() => subtractFloatIterative(), RangeError)
		assert.throws(() => subtractFloatIterative(42), RangeError)
	})

	test('cross-check against Array.prototype.reduce and exact dyadic/BigInt computation', () => {
		// 1. Deterministic pseudo-random float sequence compared with Array.prototype.reduce
		const floats = []
		let seed = 0x12345678
		for (let i = 0; i < 64; i++) {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			floats.push((seed / 0xffffffff - 0.5) * 1e6)
		}
		const expectedFromReduce = floats.reduce((acc, v) => acc - v)
		assert.strictEqual(subtractFloatIterative(...floats), expectedFromReduce)

		// 2. Exact integer cross-check via BigInt (no rounding error in IEEE-754 safe range)
		const ints = [1_000_000, 123, -456, 7890, -12, 34567, 89]
		const expectedBigInt = ints
			.map(BigInt)
			.reduce((acc, v) => acc - v)
		assert.strictEqual(
			subtractFloatIterative(...ints),
			Number(expectedBigInt),
		)

		// 3. Exact dyadic fractions (powers of 2 denominators) checked against first - sum(rest)
		const dyadics = [100, 0.5, 0.25, -0.125, 0.0625, 1.5, -2.75]
		const sumRest = dyadics.slice(1).reduce((s, x) => s + x, 0)
		assert.strictEqual(
			subtractFloatIterative(...dyadics),
			dyadics[0] - sumRest,
		)
	})
})
