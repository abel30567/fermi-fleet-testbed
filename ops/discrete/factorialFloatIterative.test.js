import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { factorialFloatIterative } from './factorialFloatIterative.js'

/**
 * Independent BigInt reference implementation for cross-checking.
 * @param {number} n
 * @returns {bigint}
 */
function factorialBigIntRef(n) {
	let acc = 1n
	for (let i = 2n; i <= BigInt(n); i++) {
		acc *= i
	}
	return acc
}

describe('factorialFloatIterative', () => {
	test('computes small and normal integer factorials accurately', () => {
		const expected = [
			[0, 1],
			[1, 1],
			[2, 2],
			[3, 6],
			[4, 24],
			[5, 120],
			[6, 720],
			[10, 3628800],
			[12, 479001600],
			[18, 6402373705728000],
		]
		for (const [n, want] of expected) {
			assert.equal(factorialFloatIterative(n), want, `failed for n=${n}`)
		}
	})

	test('handles edge cases: -0, exact float64 boundary, overflow boundary, and huge integers', () => {
		assert.equal(factorialFloatIterative(-0), 1)
		assert.equal(factorialFloatIterative(22), 1124000727777607680000)

		const f170 = factorialFloatIterative(170)
		assert.equal(Number.isFinite(f170), true)
		assert.ok(f170 > 7.25e306 && f170 < 7.26e306)

		assert.equal(factorialFloatIterative(171), Infinity)
		assert.equal(factorialFloatIterative(1000), Infinity)
		assert.equal(factorialFloatIterative(Number.MAX_SAFE_INTEGER), Infinity)
	})

	test('throws TypeError for non-number inputs', () => {
		const nonNumbers = [undefined, null, '5', true, false, 5n, {}, [], Symbol('5')]
		for (const value of nonNumbers) {
			assert.throws(() => factorialFloatIterative(value), TypeError)
		}
	})

	test('throws RangeError for negative, non-integer, NaN, and non-finite numbers', () => {
		const invalidNumbers = [-1, -100, 0.5, 3.14, -0.1, NaN, Infinity, -Infinity]
		for (const value of invalidNumbers) {
			assert.throws(() => factorialFloatIterative(value), RangeError)
		}
	})

	test('cross-check against exact BigInt factorial for n = 0..170', () => {
		for (let n = 0; n <= 170; n++) {
			const actual = factorialFloatIterative(n)
			const ref = Number(factorialBigIntRef(n))
			if (n <= 22) {
				assert.equal(actual, ref, `exact mismatch at n=${n}`)
			} else {
				const relErr = Math.abs(actual - ref) / ref
				assert.ok(relErr < 1e-13, `relative error too large at n=${n}: ${relErr}`)
			}
		}
	})

	test('cross-check against Stirling series approximation and recurrence relation', () => {
		for (let n = 10; n <= 170; n += 10) {
			const actual = factorialFloatIterative(n)
			const prev = factorialFloatIterative(n - 1)
			const ratioErr = Math.abs(actual / prev - n) / n
			assert.ok(ratioErr < 1e-14, `recurrence mismatch at n=${n}: ${ratioErr}`)

			// Stirling's series: sqrt(2*pi*n) * (n/e)^n * (1 + 1/(12n) + 1/(288n^2))
			const logStirling =
				0.5 * Math.log(2 * Math.PI * n) +
				n * (Math.log(n) - 1) +
				Math.log(1 + 1 / (12 * n) + 1 / (288 * n * n))
			const stirling = Math.exp(logStirling)
			const relErr = Math.abs(actual - stirling) / actual
			assert.ok(relErr < 1e-5, `Stirling mismatch at n=${n}: ${relErr}`)
		}
	})
})
