import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { summationTypedSeries } from './summationTypedSeries.js'

/**
 * Independent reference implementation via direct BigInt loop summation:
 * sum_{k=1}^{n} k^p
 */
function naiveDiscretePowerSum(n, p) {
	const bp = BigInt(p)
	let total = 0n
	for (let k = 1; k <= n; k++) {
		total += BigInt(k) ** bp
	}
	return Number(total)
}

describe('summationTypedSeries', () => {
	test('default power = 1 computes triangular numbers element-wise', () => {
		const limits = new Float64Array([0, 1, 2, 3, 4, 5, 10, 100])
		const result = summationTypedSeries(limits)

		assert.ok(result instanceof Float64Array)
		assert.notEqual(result, limits)
		assert.deepEqual(
			Array.from(result),
			[0, 1, 3, 6, 10, 15, 55, 5050]
		)
	})

	test('closed-form powers p = 0, 1, 2, 3, 4', () => {
		const limits = new Float64Array([0, 1, 2, 3, 4, 5])

		assert.deepEqual(
			Array.from(summationTypedSeries(limits, 0)),
			[0, 1, 2, 3, 4, 5]
		)
		assert.deepEqual(
			Array.from(summationTypedSeries(limits, 1)),
			[0, 1, 3, 6, 10, 15]
		)
		assert.deepEqual(
			Array.from(summationTypedSeries(limits, 2)),
			[0, 1, 5, 14, 30, 55]
		)
		assert.deepEqual(
			Array.from(summationTypedSeries(limits, 3)),
			[0, 1, 9, 36, 100, 225]
		)
		assert.deepEqual(
			Array.from(summationTypedSeries(limits, 4)),
			[0, 1, 17, 98, 354, 979]
		)
	})

	test('element-wise Float64Array power input', () => {
		const limits = new Float64Array([0, 5, 5, 5, 4, 3])
		const powers = new Float64Array([3, 0, 1, 2, 3, 4])
		const result = summationTypedSeries(limits, powers)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(Array.from(result), [0, 5, 15, 55, 100, 98])
	})

	test('cross-check against independent direct BigInt summation across powers 0..10', () => {
		const sampleLimits = [0, 1, 2, 3, 7, 12, 25, 50]
		const limits = new Float64Array(sampleLimits)

		for (let p = 0; p <= 10; p++) {
			const actual = summationTypedSeries(limits, p)
			const expected = sampleLimits.map((n) => naiveDiscretePowerSum(n, p))

			for (let i = 0; i < sampleLimits.length; i++) {
				const exp = expected[i]
				const act = actual[i]
				if (exp <= Number.MAX_SAFE_INTEGER) {
					assert.equal(
						act,
						exp,
						`exact mismatch at n=${sampleLimits[i]}, p=${p}`
					)
				} else {
					const relErr = Math.abs(act - exp) / exp
					assert.ok(
						relErr <= 1e-15,
						`relative error ${relErr} too large at n=${sampleLimits[i]}, p=${p}`
					)
				}
			}
		}
	})

	test('verifies mathematical identities: finite difference and Nicomachus theorem', () => {
		const ns = new Float64Array([1, 2, 5, 10, 19, 31])
		const nMinus1 = new Float64Array(ns.map((n) => n - 1))

		// S_p(n) - S_p(n - 1) === n^p for p in 0..8
		for (let p = 0; p <= 8; p++) {
			const sN = summationTypedSeries(ns, p)
			const sPrev = summationTypedSeries(nMinus1, p)
			for (let i = 0; i < ns.length; i++) {
				assert.equal(sN[i] - sPrev[i], ns[i] ** p)
			}
		}

		// Nicomachus's theorem: S_3(n) === (S_1(n))^2
		const s1 = summationTypedSeries(ns, 1)
		const s3 = summationTypedSeries(ns, 3)
		for (let i = 0; i < ns.length; i++) {
			assert.equal(s3[i], s1[i] * s1[i])
		}
	})

	test('edge cases: empty arrays, -0, high powers up to 20, and large limits beyond float64 fast paths', () => {
		const empty = summationTypedSeries(new Float64Array(0))
		assert.ok(empty instanceof Float64Array)
		assert.equal(empty.length, 0)

		const emptyPaired = summationTypedSeries(new Float64Array(0), new Float64Array(0))
		assert.equal(emptyPaired.length, 0)

		// Negative zero treated as 0 and yields +0
		const negZero = summationTypedSeries(new Float64Array([-0]), 2)
		assert.equal(Object.is(negZero[0], 0), true)

		// Power = 20 cross-checked against direct BigInt loop
		const highP = summationTypedSeries(new Float64Array([0, 1, 2, 3, 5]), 20)
		for (const [i, n] of [0, 1, 2, 3, 5].entries()) {
			assert.equal(highP[i], naiveDiscretePowerSum(n, 20))
		}

		// Limits crossing exact-float64 fast-path boundaries for p = 1, 2, 3
		const largeP1 = summationTypedSeries(new Float64Array([134217727, 134217728, 1e9]), 1)
		assert.equal(largeP1[0], Number((134217727n * 134217728n) / 2n))
		assert.equal(largeP1[1], Number((134217728n * 134217729n) / 2n))
		assert.equal(largeP1[2], Number((1000000000n * 1000000001n) / 2n))

		const largeP2 = summationTypedSeries(new Float64Array([300000, 300001]), 2)
		assert.equal(largeP2[0], Number((300000n * 300001n * 600001n) / 6n))
		assert.equal(largeP2[1], Number((300001n * 300002n * 600003n) / 6n))

		const largeP3 = summationTypedSeries(new Float64Array([13774, 13775]), 3)
		const t0 = (13774n * 13775n) / 2n
		const t1 = (13775n * 13776n) / 2n
		assert.equal(largeP3[0], Number(t0 * t0))
		assert.equal(largeP3[1], Number(t1 * t1))
	})

	test('does not mutate input Float64Arrays', () => {
		const limits = new Float64Array([1, 2, 3, 4])
		const powers = new Float64Array([0, 1, 2, 3])
		summationTypedSeries(limits, powers)
		assert.deepEqual(Array.from(limits), [1, 2, 3, 4])
		assert.deepEqual(Array.from(powers), [0, 1, 2, 3])
	})

	test('throws TypeError for non-Float64Array limits or invalid power type', () => {
		assert.throws(() => summationTypedSeries([1, 2, 3]), TypeError)
		assert.throws(() => summationTypedSeries(new Float32Array([1, 2])), TypeError)
		assert.throws(() => summationTypedSeries(new Int32Array([1, 2])), TypeError)
		assert.throws(() => summationTypedSeries(null), TypeError)
		assert.throws(() => summationTypedSeries(undefined), TypeError)
		assert.throws(() => summationTypedSeries(new Float64Array([1, 2]), '2'), TypeError)
		assert.throws(() => summationTypedSeries(new Float64Array([1, 2]), [1, 2]), TypeError)
		assert.throws(() => summationTypedSeries(new Float64Array([1, 2]), null), TypeError)
	})

	test('throws RangeError for invalid limits, invalid powers, or mismatched lengths', () => {
		// Invalid limits
		assert.throws(() => summationTypedSeries(new Float64Array([-1])), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([1.5])), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([NaN])), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([Infinity])), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([-Infinity])), RangeError)
		assert.throws(
			() => summationTypedSeries(new Float64Array([Number.MAX_SAFE_INTEGER + 2])),
			RangeError
		)

		// Invalid scalar powers
		assert.throws(() => summationTypedSeries(new Float64Array([3]), -1), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([3]), 1.5), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([3]), NaN), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([3]), Infinity), RangeError)
		assert.throws(() => summationTypedSeries(new Float64Array([3]), 21), RangeError)

		// Mismatched Float64Array power length
		assert.throws(
			() => summationTypedSeries(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError
		)

		// Invalid element in Float64Array power
		assert.throws(
			() => summationTypedSeries(new Float64Array([1, 2]), new Float64Array([1, -1])),
			RangeError
		)
		assert.throws(
			() => summationTypedSeries(new Float64Array([1, 2]), new Float64Array([1, 21])),
			RangeError
		)
		assert.throws(
			() => summationTypedSeries(new Float64Array([1, 2]), new Float64Array([1, NaN])),
			RangeError
		)
	})
})
