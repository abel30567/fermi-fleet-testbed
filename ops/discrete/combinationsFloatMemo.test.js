import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { combinationsFloatMemo } from './combinationsFloatMemo.js'

/**
 * Independent BigInt reference implementation of C(n, k) for cross-checking.
 *
 * @param {number} n
 * @param {number} k
 * @returns {bigint}
 */
function combinationsBigIntRef(n, k) {
	if (k > n) return 0n
	const r = Math.min(k, n - k)
	let res = 1n
	for (let i = 1; i <= r; i++) {
		res = (res * BigInt(n - r + i)) / BigInt(i)
	}
	return res
}

describe('combinationsFloatMemo', () => {
	it('computes standard small and medium binomial coefficients accurately', () => {
		assert.equal(combinationsFloatMemo(0, 0), 1)
		assert.equal(combinationsFloatMemo(1, 0), 1)
		assert.equal(combinationsFloatMemo(1, 1), 1)
		assert.equal(combinationsFloatMemo(5, 2), 10)
		assert.equal(combinationsFloatMemo(5, 3), 10)
		assert.equal(combinationsFloatMemo(10, 3), 120)
		assert.equal(combinationsFloatMemo(10, 5), 252)
		assert.equal(combinationsFloatMemo(20, 10), 184756)
		assert.equal(combinationsFloatMemo(52, 5), 2598960)
		assert.equal(combinationsFloatMemo(56, 28), 7648690600760440)
	})

	it('handles edge cases: k = 0, k = n, k = 1, k = n - 1, k > n, and -0', () => {
		assert.equal(combinationsFloatMemo(0, 1), 0)
		assert.equal(combinationsFloatMemo(5, 6), 0)
		assert.equal(combinationsFloatMemo(100, 101), 0)
		assert.equal(combinationsFloatMemo(1000, 0), 1)
		assert.equal(combinationsFloatMemo(1000, 1000), 1)
		assert.equal(combinationsFloatMemo(1000, 1), 1000)
		assert.equal(combinationsFloatMemo(1000, 999), 1000)
		assert.equal(combinationsFloatMemo(Number.MAX_SAFE_INTEGER, 0), 1)
		assert.equal(combinationsFloatMemo(Number.MAX_SAFE_INTEGER, 1), Number.MAX_SAFE_INTEGER)
		assert.equal(
			combinationsFloatMemo(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER),
			1,
		)
		assert.equal(Object.is(combinationsFloatMemo(-0, -0), 1), true)
		assert.equal(Object.is(combinationsFloatMemo(-0, 1), 0), true)
		assert.equal(Object.is(combinationsFloatMemo(5, -0), 1), true)
	})

	it('computes values beyond the precomputed table accurately and returns consistent memoized results', () => {
		// Exact safe integer above PRECOMPUTED_MAX_N (64)
		assert.equal(combinationsFloatMemo(100, 10), 17310309456440)
		// Second call exercises memoization hit path
		assert.equal(combinationsFloatMemo(100, 10), 17310309456440)
		// Symmetry hits the same canonical (n, r) memo entry
		assert.equal(combinationsFloatMemo(100, 90), 17310309456440)

		// Largest finite central binomial coefficient in IEEE-754 float64: C(1029, 514)
		const maxFiniteCentral = combinationsFloatMemo(1029, 514)
		assert.equal(Number.isFinite(maxFiniteCentral), true)
		const ref1029 = Number(combinationsBigIntRef(1029, 514))
		const relErr1029 = Math.abs(maxFiniteCentral - ref1029) / ref1029
		assert.ok(relErr1029 < 1e-12, `relative error too high: ${relErr1029}`)

		// Overflow cases
		assert.equal(combinationsFloatMemo(1030, 515), Infinity)
		assert.equal(combinationsFloatMemo(2000, 1000), Infinity)
		assert.equal(combinationsFloatMemo(100000, 600), Infinity)
	})

	it('cross-checks against an independent BigInt implementation across table and memoized ranges', () => {
		// Exhaustively verify every entry in the precomputed table (n = 0..64)
		for (let n = 0; n <= 64; n++) {
			for (let k = 0; k <= n; k++) {
				const expected = Number(combinationsBigIntRef(n, k))
				assert.equal(
					combinationsFloatMemo(n, k),
					expected,
					`mismatch at C(${n}, ${k})`,
				)
			}
		}

		// Verify Pascal's identity C(n, k) = C(n-1, k-1) + C(n-1, k) and row sum = 2^n
		for (let n = 0; n <= 50; n++) {
			let rowSum = 0
			for (let k = 0; k <= n; k++) {
				const val = combinationsFloatMemo(n, k)
				rowSum += val
				if (k > 0 && k < n) {
					assert.equal(
						val,
						combinationsFloatMemo(n - 1, k - 1) + combinationsFloatMemo(n - 1, k),
					)
				}
			}
			assert.equal(rowSum, 2 ** n)
		}

		// Cross-check larger non-table inputs against BigInt reference
		const pairs = [
			[65, 32],
			[70, 20],
			[80, 12],
			[100, 50],
			[200, 100],
			[500, 250],
			[1000, 10],
			[1000, 500],
			[1028, 514],
			[1029, 514],
			[10000, 5],
		]
		for (const [n, k] of pairs) {
			const actual = combinationsFloatMemo(n, k)
			const refBig = combinationsBigIntRef(n, k)
			const expected = Number(refBig)
			if (refBig <= BigInt(Number.MAX_SAFE_INTEGER)) {
				assert.equal(actual, expected, `exact mismatch at C(${n}, ${k})`)
			} else {
				const relErr = Math.abs(actual - expected) / expected
				assert.ok(
					relErr < 1e-12,
					`relative error ${relErr} too high at C(${n}, ${k})`,
				)
			}
		}
	})

	it('evicts old memo cache entries cleanly without corrupting results when cache exceeds capacity', () => {
		for (let n = 65; n < 4200; n++) {
			assert.equal(combinationsFloatMemo(n, 2), (n * (n - 1)) / 2)
		}
		assert.equal(combinationsFloatMemo(65, 2), (65 * 64) / 2)
		assert.equal(combinationsFloatMemo(4199, 2), (4199 * 4198) / 2)
	})

	it('validates inputs and throws TypeError / RangeError on invalid arguments', () => {
		assert.throws(() => combinationsFloatMemo('5', 2), TypeError)
		assert.throws(() => combinationsFloatMemo(5, '2'), TypeError)
		assert.throws(() => combinationsFloatMemo(null, 2), TypeError)
		assert.throws(() => combinationsFloatMemo(5, undefined), TypeError)
		assert.throws(() => combinationsFloatMemo(5n, 2), TypeError)
		assert.throws(() => combinationsFloatMemo(5, 2n), TypeError)

		assert.throws(() => combinationsFloatMemo(NaN, 2), RangeError)
		assert.throws(() => combinationsFloatMemo(5, NaN), RangeError)
		assert.throws(() => combinationsFloatMemo(Infinity, 2), RangeError)
		assert.throws(() => combinationsFloatMemo(5, Infinity), RangeError)
		assert.throws(() => combinationsFloatMemo(-Infinity, 2), RangeError)

		assert.throws(() => combinationsFloatMemo(5.5, 2), RangeError)
		assert.throws(() => combinationsFloatMemo(5, 2.5), RangeError)
		assert.throws(() => combinationsFloatMemo(-1, 2), RangeError)
		assert.throws(() => combinationsFloatMemo(5, -1), RangeError)
		assert.throws(() => combinationsFloatMemo(Number.MAX_SAFE_INTEGER + 1, 2), RangeError)
		assert.throws(() => combinationsFloatMemo(10, Number.MAX_SAFE_INTEGER + 1), RangeError)
	})
})
