import { describe, test } from 'node:test'
import assert from 'node:assert'
import { moduloFloatRecursive } from './moduloFloatRecursive.js'

/**
 * Independent direct formula for Euclidean non-negative modulo over float64.
 *
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function directEuclideanMod(a, b) {
	const d = Math.abs(b)
	let r = a % d
	if (r < 0) {
		r += d
	}
	return r === 0 || r === d ? 0 : r
}

describe('moduloFloatRecursive', () => {
	test('handles normal positive integer cases', () => {
		assert.strictEqual(moduloFloatRecursive(7, 3), 1)
		assert.strictEqual(moduloFloatRecursive(10, 5), 0)
		assert.strictEqual(moduloFloatRecursive(3, 7), 3)
		assert.strictEqual(moduloFloatRecursive(100, 7), 2)
		assert.strictEqual(moduloFloatRecursive(1, 1), 0)
	})

	test('handles zero and negative zero dividends cleanly', () => {
		for (const dividend of [0, -0]) {
			for (const divisor of [1, -1, 5, -5, 0.25, -0.25]) {
				const result = moduloFloatRecursive(dividend, divisor)
				assert.strictEqual(Object.is(result, 0), true, `expected +0 for (${dividend}, ${divisor})`)
			}
		}
	})

	test('computes Euclidean non-negative modulo for negative dividend and/or divisor', () => {
		assert.strictEqual(moduloFloatRecursive(-7, 3), 2)
		assert.strictEqual(moduloFloatRecursive(7, -3), 1)
		assert.strictEqual(moduloFloatRecursive(-7, -3), 2)

		assert.strictEqual(Object.is(moduloFloatRecursive(-6, 3), 0), true)
		assert.strictEqual(Object.is(moduloFloatRecursive(-6, -3), 0), true)
		assert.strictEqual(Object.is(moduloFloatRecursive(6, -3), 0), true)

		assert.strictEqual(moduloFloatRecursive(-1, 5), 4)
		assert.strictEqual(moduloFloatRecursive(-1, -5), 4)
		assert.strictEqual(moduloFloatRecursive(1, -5), 1)
	})

	test('handles floating-point values and float64 boundary rounding', () => {
		assert.strictEqual(moduloFloatRecursive(5.5, 2), 1.5)
		assert.strictEqual(moduloFloatRecursive(5.5, 1.5), 1)
		assert.strictEqual(moduloFloatRecursive(-5.5, 2), 0.5)
		assert.strictEqual(moduloFloatRecursive(-5.5, -2), 0.5)
		assert.strictEqual(moduloFloatRecursive(5.5, -2), 1.5)
		assert.strictEqual(moduloFloatRecursive(0.75, 0.25), 0)
		assert.strictEqual(moduloFloatRecursive(0.8, 0.3), 0.8 % 0.3)

		// Tiny positive dividend preserves precision
		assert.strictEqual(moduloFloatRecursive(1e-20, 1), 1e-20)

		// Tiny negative dividend where |b| - r rounds to |b| wraps to +0 to preserve [0, |b|)
		const tinyNegResult = moduloFloatRecursive(-1e-20, 1)
		assert.strictEqual(Object.is(tinyNegResult, 0), true)
	})

	test('handles large ratios and extreme IEEE-754 values without stack overflow', () => {
		const extremePairs = [
			[1e30, 3],
			[1e100, 7],
			[1e308, 1],
			[1e308, 0.3],
			[-1e308, 0.3],
			[Number.MAX_VALUE, 1e-10],
			[Number.MAX_VALUE, Number.MIN_VALUE],
			[-Number.MAX_VALUE, 7.5],
			[Number.MAX_VALUE, Number.MAX_VALUE],
			[-Number.MAX_VALUE, -Number.MAX_VALUE],
			[3 * Number.MIN_VALUE, Number.MIN_VALUE],
			[5 * Number.MIN_VALUE, 2 * Number.MIN_VALUE],
			[-Number.MIN_VALUE, 3 * Number.MIN_VALUE],
		]

		for (const [a, b] of extremePairs) {
			const actual = moduloFloatRecursive(a, b)
			const expected = directEuclideanMod(a, b)
			assert.strictEqual(
				Object.is(actual, expected),
				true,
				`mismatch for (${a}, ${b}): got ${actual}, expected ${expected}`,
			)
			assert.ok(actual >= 0 && actual < Math.abs(b), `out of range [0, |b|) for (${a}, ${b})`)
		}
	})

	test('cross-checks against independent direct formula across diverse grid', () => {
		const dividends = [
			0,
			-0,
			1,
			-1,
			2,
			-2,
			7,
			-7,
			42,
			-42,
			0.1,
			-0.1,
			0.3,
			-0.3,
			Math.PI,
			-Math.PI,
			1e-12,
			-1e-12,
			1e15 + 0.5,
			-(1e15 + 0.5),
			1e200,
			-1e200,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
		]
		const divisors = [
			1,
			-1,
			2,
			-2,
			3,
			-3,
			0.25,
			-0.25,
			0.3,
			-0.3,
			Math.E,
			-Math.E,
			1e-9,
			-1e-9,
			1e50,
			-1e50,
			Number.MIN_VALUE,
			-Number.MIN_VALUE,
		]

		for (const a of dividends) {
			for (const b of divisors) {
				const actual = moduloFloatRecursive(a, b)
				const expected = directEuclideanMod(a, b)
				assert.strictEqual(
					Object.is(actual, expected),
					true,
					`cross-check failed for (${a}, ${b}): got ${actual}, expected ${expected}`,
				)
				assert.ok(actual >= 0 && actual < Math.abs(b), `invariant failed for (${a}, ${b})`)
				assert.strictEqual(Object.is(actual, -0), false, `returned -0 for (${a}, ${b})`)
			}
		}
	})

	test('throws RangeError on zero divisor, NaN, and Infinity', () => {
		assert.throws(() => moduloFloatRecursive(5, 0), RangeError)
		assert.throws(() => moduloFloatRecursive(5, -0), RangeError)
		assert.throws(() => moduloFloatRecursive(0, 0), RangeError)

		assert.throws(() => moduloFloatRecursive(Number.NaN, 3), RangeError)
		assert.throws(() => moduloFloatRecursive(3, Number.NaN), RangeError)
		assert.throws(() => moduloFloatRecursive(Number.NaN, Number.NaN), RangeError)

		assert.throws(() => moduloFloatRecursive(Number.POSITIVE_INFINITY, 3), RangeError)
		assert.throws(() => moduloFloatRecursive(Number.NEGATIVE_INFINITY, 3), RangeError)
		assert.throws(() => moduloFloatRecursive(3, Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => moduloFloatRecursive(3, Number.NEGATIVE_INFINITY), RangeError)
	})

	test('throws TypeError on non-number inputs', () => {
		const invalidValues = ['5', '', null, undefined, true, false, 5n, {}, [], Symbol('x'), new Number(5)]
		for (const bad of invalidValues) {
			assert.throws(() => moduloFloatRecursive(bad, 3), TypeError, `expected TypeError for a=${String(bad)}`)
			assert.throws(() => moduloFloatRecursive(5, bad), TypeError, `expected TypeError for b=${String(bad)}`)
		}
	})
})
