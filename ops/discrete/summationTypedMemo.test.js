import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summationTypedMemo } from './summationTypedMemo.js'

describe('summationTypedMemo', () => {
	it('computes discrete summation for values within the precomputed table', () => {
		const input = new Float64Array([0, 1, 2, 3, 4, 5, 10, 100, 1024])
		const output = summationTypedMemo(input)

		assert.ok(output instanceof Float64Array)
		assert.deepEqual(
			output,
			new Float64Array([0, 1, 3, 6, 10, 15, 55, 5050, 524800])
		)
	})

	it('computes and memoizes discrete summation for values beyond the precomputed table', () => {
		const input = new Float64Array([1025, 2000, 10000, 1025, 10000, 50000])
		const first = summationTypedMemo(input)
		const second = summationTypedMemo(input)

		const expected = new Float64Array([
			525825,
			2001000,
			50005000,
			525825,
			50005000,
			1250025000,
		])
		assert.deepEqual(first, expected)
		assert.deepEqual(second, expected)
		assert.notEqual(first, second)
	})

	it('does not mutate the input Float64Array', () => {
		const input = new Float64Array([3, 7, 1500])
		const snapshot = new Float64Array(input)
		const output = summationTypedMemo(input)

		assert.deepEqual(input, snapshot)
		assert.notEqual(output, input)
	})

	it('handles empty Float64Array, negative zero, and subarray views', () => {
		const empty = summationTypedMemo(new Float64Array(0))
		assert.ok(empty instanceof Float64Array)
		assert.equal(empty.length, 0)

		const negZero = summationTypedMemo(new Float64Array([-0, 0]))
		assert.deepEqual(negZero, new Float64Array([0, 0]))
		assert.ok(Object.is(negZero[0], 0))

		const backing = new Float64Array([999999, 4, 1024, 1025, -5])
		const view = backing.subarray(1, 4)
		assert.deepEqual(
			summationTypedMemo(view),
			new Float64Array([10, 524800, 525825])
		)
	})

	it('handles boundary values and memo cache eviction without losing accuracy', () => {
		// Exact max n where n*(n+1)/2 <= Number.MAX_SAFE_INTEGER (2^53 - 1)
		const maxExactN = 134217727
		const res = summationTypedMemo(new Float64Array([1023, 1024, 1025, maxExactN]))
		assert.equal(res[0], 523776)
		assert.equal(res[1], 524800)
		assert.equal(res[2], 525825)
		assert.equal(res[3], 9007199187632128)

		// Exceed memo cache capacity (4096) with distinct large keys and re-query earlier keys
		const batch = new Float64Array(5000)
		for (let i = 0; i < batch.length; i++) {
			batch[i] = 2000 + i
		}
		const batchOut = summationTypedMemo(batch)
		assert.equal(batchOut[0], (2000 * 2001) / 2)
		assert.equal(batchOut[4999], (6999 * 7000) / 2)

		// Re-query evicted key to ensure recomputation matches
		const requery = summationTypedMemo(new Float64Array([2000, 2001]))
		assert.deepEqual(requery, new Float64Array([2001000, 2003001]))
	})

	it('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			42,
			'123',
			{},
		]
		for (const bad of invalidInputs) {
			assert.throws(() => summationTypedMemo(bad), TypeError)
		}
	})

	it('throws RangeError for negative, fractional, NaN, or infinite elements', () => {
		const invalidArrays = [
			new Float64Array([-1]),
			new Float64Array([0, 2.5]),
			new Float64Array([1, Number.NaN]),
			new Float64Array([Number.POSITIVE_INFINITY]),
			new Float64Array([Number.NEGATIVE_INFINITY]),
		]
		for (const bad of invalidArrays) {
			assert.throws(() => summationTypedMemo(bad), RangeError)
		}
	})

	it('cross-checks against independent iterative summation across table and memo ranges', () => {
		const limit = 2000
		const input = new Float64Array(limit + 1)
		for (let n = 0; n <= limit; n++) {
			input[n] = n
		}

		const actual = summationTypedMemo(input)

		// Independent iterative accumulation: S(n) = sum_{k=1}^{n} k
		let runningSum = 0
		for (let n = 0; n <= limit; n++) {
			runningSum += n
			assert.equal(actual[n], runningSum, `mismatch at n=${n}`)
		}
	})

	it('cross-checks large inputs against exact BigInt arithmetic and finite-difference identity', () => {
		const testValues = [
			1024,
			1025,
			4095,
			4096,
			65535,
			65536,
			1000000,
			12345678,
			134217727,
		]
		const input = new Float64Array(testValues)
		const prevInput = new Float64Array(testValues.map((n) => n - 1))

		const sums = summationTypedMemo(input)
		const prevSums = summationTypedMemo(prevInput)

		for (let i = 0; i < testValues.length; i++) {
			const n = testValues[i]
			const exactBigInt = (BigInt(n) * (BigInt(n) + 1n)) / 2n
			assert.equal(sums[i], Number(exactBigInt), `BigInt mismatch at n=${n}`)
			// Discrete fundamental theorem: S(n) - S(n - 1) === n
			assert.equal(sums[i] - prevSums[i], n, `difference identity failed at n=${n}`)
		}
	})
})
