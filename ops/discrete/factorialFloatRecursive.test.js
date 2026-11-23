import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { factorialFloatRecursive } from './factorialFloatRecursive.js'

/**
 * Independent BigInt iterative factorial reference for cross-checking.
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
	describe('normal cases', () => {
		it('computes base and small factorials accurately', () => {
			assert.equal(factorialFloatRecursive(0), 1)
			assert.equal(factorialFloatRecursive(1), 1)
			assert.equal(factorialFloatRecursive(2), 2)
			assert.equal(factorialFloatRecursive(3), 6)
			assert.equal(factorialFloatRecursive(4), 24)
			assert.equal(factorialFloatRecursive(5), 120)
			assert.equal(factorialFloatRecursive(10), 3628800)
			assert.equal(factorialFloatRecursive(12), 479001600)
		})

		it('matches exact IEEE-754 integer factorials up to 22!', () => {
			assert.equal(factorialFloatRecursive(18), 6402373705728000)
			assert.equal(factorialFloatRecursive(20), 2432902008176640000)
			assert.equal(factorialFloatRecursive(22), Number(bigIntFactorial(22)))
		})
	})

	describe('edge cases', () => {
		it('treats -0 as 0 and returns +1', () => {
			const res = factorialFloatRecursive(-0)
			assert.ok(Object.is(res, 1))
		})

		it('handles the IEEE-754 float64 overflow boundary (170 vs 171)', () => {
			const f170 = factorialFloatRecursive(170)
			assert.ok(Number.isFinite(f170))
			assert.ok(f170 > 7.25e306 && f170 < 7.26e306)
			assert.equal(factorialFloatRecursive(171), Infinity)
		})

		it('returns Infinity for very large finite integers without stack overflow', () => {
			assert.equal(factorialFloatRecursive(1000), Infinity)
			assert.equal(factorialFloatRecursive(1000000), Infinity)
			assert.equal(factorialFloatRecursive(Number.MAX_SAFE_INTEGER), Infinity)
		})
	})

	describe('invalid inputs', () => {
		it('throws TypeError for non-number inputs', () => {
			for (const bad of ['5', null, undefined, 5n, true, false, {}, []]) {
				assert.throws(() => factorialFloatRecursive(bad), TypeError)
			}
		})

		it('throws RangeError for negative integers', () => {
			for (const neg of [-1, -2, -10, -171, Number.MIN_SAFE_INTEGER]) {
				assert.throws(() => factorialFloatRecursive(neg), RangeError)
			}
		})

		it('throws RangeError for non-integer finite numbers', () => {
			for (const frac of [0.5, 1.1, 3.14, -0.5, -2.7]) {
				assert.throws(() => factorialFloatRecursive(frac), RangeError)
			}
		})

		it('throws RangeError for non-finite numbers', () => {
			for (const nonFinite of [NaN, Infinity, -Infinity]) {
				assert.throws(() => factorialFloatRecursive(nonFinite), RangeError)
			}
		})
	})

	describe('independent cross-checks', () => {
		it('cross-checks all n in [0, 170] against exact BigInt factorial', () => {
			for (let n = 0; n <= 170; n++) {
				const actual = factorialFloatRecursive(n)
				const expected = Number(bigIntFactorial(n))
				if (n <= 22) {
					assert.equal(actual, expected, `exact mismatch at n=${n}`)
				} else {
					const relErr = Math.abs(actual - expected) / expected
					assert.ok(
						relErr < 1e-14,
						`relative error too large at n=${n}: ${relErr}`,
					)
				}
			}
		})

		it('satisfies recurrence n! / (n - 1)! ≈ n for all n in [1, 170]', () => {
			for (let n = 1; n <= 170; n++) {
				const ratio =
					factorialFloatRecursive(n) / factorialFloatRecursive(n - 1)
				const relErr = Math.abs(ratio - n) / n
				assert.ok(
					relErr < 1e-14,
					`recurrence ratio error too large at n=${n}: ${relErr}`,
				)
			}
		})

		it('cross-checks log(n!) against direct log-sum for n in [1, 170]', () => {
			let logSum = 0
			for (let n = 1; n <= 170; n++) {
				logSum += Math.log(n)
				const actualLog = Math.log(factorialFloatRecursive(n))
				assert.ok(
					Math.abs(actualLog - logSum) < 1e-11,
					`log mismatch at n=${n}: ${actualLog} vs ${logSum}`,
				)
			}
		})
	})
})
