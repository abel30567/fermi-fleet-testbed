import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialFloatRecursive } from './factorialFloatRecursive.js'

/**
 * Independent iterative BigInt reference implementation for cross-checking.
 *
 * @param {number} n
 * @returns {bigint}
 */
function bigIntFactorial(n) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(n); i++) {
		acc *= i
	}
	return acc
}

describe('factorialFloatRecursive', () => {
	test('handles base and edge cases 0, -0, and 1', () => {
		assert.equal(factorialFloatRecursive(0), 1)
		assert.equal(factorialFloatRecursive(-0), 1)
		assert.equal(factorialFloatRecursive(1), 1)
	})

	test('computes small and medium factorials accurately', () => {
		const expected = [
			[2, 2],
			[3, 6],
			[4, 24],
			[5, 120],
			[6, 720],
			[7, 5040],
			[10, 3628800],
			[12, 479001600],
			[15, 1307674368000],
			[20, 2432902008176640000],
			[22, 1124000727777607680000],
		]
		for (const [n, val] of expected) {
			assert.equal(factorialFloatRecursive(n), val)
		}
	})

	test('handles float64 boundary at 170 and overflow at 171+', () => {
		const f170 = factorialFloatRecursive(170)
		assert.equal(Number.isFinite(f170), true)
		const expected170 = Number(bigIntFactorial(170))
		const relErr170 = Math.abs(f170 - expected170) / expected170
		assert.ok(relErr170 < 1e-14, `Relative error at 170! too high: ${relErr170}`)

		assert.equal(factorialFloatRecursive(171), Infinity)
		assert.equal(factorialFloatRecursive(200), Infinity)
		assert.equal(factorialFloatRecursive(1_000_000), Infinity)
	})

	test('cross-checks against independent iterative BigInt computation for 0..170', () => {
		for (let n = 0; n <= 170; n++) {
			const actual = factorialFloatRecursive(n)
			const exactAsFloat = Number(bigIntFactorial(n))
			assert.equal(Number.isFinite(actual), true, `Expected finite result for ${n}!`)

			if (n <= 22) {
				assert.equal(actual, exactAsFloat, `Expected exact match for ${n}!`)
			} else {
				const relErr = Math.abs(actual - exactAsFloat) / exactAsFloat
				assert.ok(
					relErr < 1e-14,
					`Relative error for ${n}! exceeded tolerance: ${relErr}`
				)
			}
		}
	})

	test('throws TypeError for non-number inputs', () => {
		const invalidTypes = [
			undefined,
			null,
			'5',
			'0',
			5n,
			true,
			false,
			{},
			[5],
			Symbol('5'),
			() => 5,
		]
		for (const input of invalidTypes) {
			assert.throws(
				() => factorialFloatRecursive(input),
				{ name: 'TypeError' },
				`Expected TypeError for ${String(input)}`
			)
		}
	})

	test('throws RangeError for NaN, non-finite, negative, and non-integer numbers', () => {
		const invalidValues = [
			NaN,
			Infinity,
			-Infinity,
			-1,
			-5,
			-170,
			0.5,
			1.1,
			-0.5,
			Math.PI,
		]
		for (const input of invalidValues) {
			assert.throws(
				() => factorialFloatRecursive(input),
				{ name: 'RangeError' },
				`Expected RangeError for ${input}`
			)
		}
	})
})
