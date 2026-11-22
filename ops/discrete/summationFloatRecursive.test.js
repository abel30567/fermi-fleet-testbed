import { describe, test } from 'node:test'
import assert from 'node:assert'
import { summationFloatRecursive } from './summationFloatRecursive.js'

/**
 * Independent Kahan compensated summation used as a reference oracle.
 * @param {number[]} values
 * @returns {number}
 */
function kahanSum(values) {
	let sum = 0
	let c = 0
	for (let i = 0; i < values.length; i++) {
		const y = values[i] - c
		const t = sum + y
		c = (t - sum) - y
		sum = t
	}
	return sum
}

describe('summationFloatRecursive', () => {
	test('sums normal arrays of positive integers and exact binary floats', () => {
		assert.strictEqual(summationFloatRecursive([1, 2]), 3)
		assert.strictEqual(summationFloatRecursive([1, 2, 3]), 6)
		assert.strictEqual(summationFloatRecursive([1, 2, 3, 4]), 10)
		assert.strictEqual(summationFloatRecursive([1, 2, 3, 4, 5]), 15)
		assert.strictEqual(summationFloatRecursive([0.5, 1.25, 2.75, 3.5]), 8)
	})

	test('handles negative numbers and mixed signs', () => {
		assert.strictEqual(summationFloatRecursive([-10, -20, -30]), -60)
		assert.strictEqual(summationFloatRecursive([-5, 3, -2, 4]), 0)
		assert.strictEqual(summationFloatRecursive([-1.5, 2.5, -0.5, 0.25]), 0.75)
	})

	test('handles empty array, single element, and zeros', () => {
		const emptyResult = summationFloatRecursive([])
		assert.strictEqual(emptyResult, 0)
		assert.strictEqual(Object.is(emptyResult, 0), true)

		assert.strictEqual(summationFloatRecursive([42]), 42)
		assert.strictEqual(summationFloatRecursive([-3.14]), -3.14)
		assert.strictEqual(summationFloatRecursive([0]), 0)
		assert.strictEqual(summationFloatRecursive([0, 0, 0, 0, 0]), 0)
	})

	test('does not mutate the input array', () => {
		const input = [3, 1, 4, 1, 5, 9]
		const snapshot = [...input]
		assert.strictEqual(summationFloatRecursive(input), 23)
		assert.deepStrictEqual(input, snapshot)
	})

	test('cross-checks arithmetic series against closed-form formula n*(n+1)/2', () => {
		const n = 10_000
		const series = Array.from({ length: n }, (_, i) => i + 1)
		const expected = (n * (n + 1)) / 2
		assert.strictEqual(summationFloatRecursive(series), expected)
	})

	test('cross-checks geometric series against exact closed-form formula', () => {
		// sum_{k=0}^{40} 2^{-k} = 2 - 2^{-40}, exact in IEEE-754 float64 (53-bit significand)
		const terms = Array.from({ length: 41 }, (_, k) => 2 ** -k)
		const expected = 2 - 2 ** -40
		assert.strictEqual(summationFloatRecursive(terms), expected)
	})

	test('handles large arrays and matches Kahan summation with better accuracy than naive summation', () => {
		const count = 100_000
		const tenths = new Array(count).fill(0.1)
		const expected = 10_000

		const recursiveResult = summationFloatRecursive(tenths)
		const kahanResult = kahanSum(tenths)
		let naiveResult = 0
		for (let i = 0; i < count; i++) {
			naiveResult += tenths[i]
		}

		const recursiveError = Math.abs(recursiveResult - expected)
		const naiveError = Math.abs(naiveResult - expected)

		assert.ok(
			Math.abs(recursiveResult - kahanResult) < 1e-10,
			`Expected recursive (${recursiveResult}) to match Kahan (${kahanResult}) within 1e-10`,
		)
		assert.ok(
			recursiveError < naiveError,
			`Expected pairwise error (${recursiveError}) to be smaller than naive error (${naiveError})`,
		)

		// Also cross-check an oscillating non-trivial float64 sequence against Kahan summation
		const oscillating = Array.from({ length: 50_000 }, (_, i) => Math.sin(i + 1) / (i + 1))
		const oscRecursive = summationFloatRecursive(oscillating)
		const oscKahan = kahanSum(oscillating)
		assert.ok(
			Math.abs(oscRecursive - oscKahan) < 1e-12,
			`Expected oscillating sum (${oscRecursive}) to match Kahan (${oscKahan}) within 1e-12`,
		)
	})

	test('throws TypeError for non-array inputs', () => {
		const invalidInputs = [null, undefined, 42, '123', {}, { length: 1, 0: 1 }, new Set([1, 2])]
		for (const input of invalidInputs) {
			assert.throws(() => summationFloatRecursive(input), TypeError)
		}
	})

	test('throws TypeError for non-number elements and sparse arrays', () => {
		assert.throws(() => summationFloatRecursive([1, '2', 3]), TypeError)
		assert.throws(() => summationFloatRecursive([1, null]), TypeError)
		assert.throws(() => summationFloatRecursive([undefined]), TypeError)
		assert.throws(() => summationFloatRecursive([true, false]), TypeError)
		assert.throws(() => summationFloatRecursive([1n]), TypeError)
		assert.throws(() => summationFloatRecursive([{}]), TypeError)
		assert.throws(() => summationFloatRecursive(new Array(3)), TypeError)
		// eslint-disable-next-line no-sparse-arrays
		assert.throws(() => summationFloatRecursive([1, , 3]), TypeError)
	})

	test('throws RangeError for non-finite numbers (NaN, Infinity, -Infinity)', () => {
		assert.throws(() => summationFloatRecursive([NaN]), RangeError)
		assert.throws(() => summationFloatRecursive([1, NaN, 2]), RangeError)
		assert.throws(() => summationFloatRecursive([Infinity]), RangeError)
		assert.throws(() => summationFloatRecursive([1, -Infinity, 2]), RangeError)
	})
})
