import { describe, test } from 'node:test'
import assert from 'node:assert'
import { summationTypedRecursive } from './summationTypedRecursive.js'

/**
 * Independent iterative summation reference.
 *
 * @param {Float64Array} values
 * @returns {number}
 */
function iterativeSum(values) {
	let total = 0
	for (let i = 0; i < values.length; i += 1) {
		total += values[i]
	}
	return total
}

/**
 * Independent Kahan compensated summation reference.
 *
 * @param {Float64Array} values
 * @returns {number}
 */
function kahanSum(values) {
	let sum = 0
	let compensation = 0
	for (let i = 0; i < values.length; i += 1) {
		const y = values[i] - compensation
		const t = sum + y
		compensation = t - sum - y
		sum = t
	}
	return sum
}

describe('summationTypedRecursive', () => {
	describe('normal cases', () => {
		test('sums positive integers of odd and even lengths', () => {
			assert.strictEqual(
				summationTypedRecursive(new Float64Array([1, 2])),
				3
			)
			assert.strictEqual(
				summationTypedRecursive(new Float64Array([1, 2, 3])),
				6
			)
			assert.strictEqual(
				summationTypedRecursive(new Float64Array([1, 2, 3, 4])),
				10
			)
			assert.strictEqual(
				summationTypedRecursive(new Float64Array([1, 2, 3, 4, 5, 6, 7])),
				28
			)
		})

		test('sums exact binary floating-point values', () => {
			const input = new Float64Array([0.5, 1.25, 2.75, 3.5, 0.125, 0.875])
			assert.strictEqual(summationTypedRecursive(input), 9)
		})

		test('handles Float64Array subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([100, 200, 1.5, 2.5, 3.5, 4.5, 999])
			const slice = backing.subarray(2, 6)
			assert.strictEqual(summationTypedRecursive(slice), 12)
		})
	})

	describe('edge cases', () => {
		test('returns 0 for an empty Float64Array', () => {
			const result = summationTypedRecursive(new Float64Array(0))
			assert.strictEqual(Object.is(result, 0), true)
		})

		test('returns the sole element for a single-element Float64Array', () => {
			assert.strictEqual(summationTypedRecursive(new Float64Array([42.5])), 42.5)
			assert.strictEqual(summationTypedRecursive(new Float64Array([-7.25])), -7.25)
			assert.strictEqual(summationTypedRecursive(new Float64Array([0])), 0)
		})

		test('handles negative values and cancelling terms', () => {
			assert.strictEqual(
				summationTypedRecursive(new Float64Array([-1, -2, -3, -4, -5])),
				-15
			)
			assert.strictEqual(
				summationTypedRecursive(new Float64Array([10, -3, -7, 5, -5])),
				0
			)
		})

		test('handles large arrays without exceeding call stack depth', () => {
			const n = 100_000
			const data = new Float64Array(n)
			for (let i = 0; i < n; i += 1) {
				data[i] = i + 1
			}
			const expected = (n * (n + 1)) / 2
			assert.strictEqual(summationTypedRecursive(data), expected)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				new Uint8Array([1, 2, 3]),
				null,
				undefined,
				42,
				'123',
				{ length: 2, 0: 1, 1: 2 }
			]

			for (const bad of invalidInputs) {
				assert.throws(
					() => summationTypedRecursive(bad),
					{
						name: 'TypeError',
						message: /Float64Array/
					}
				)
			}
		})

		test('throws RangeError for non-finite elements (NaN, Infinity, -Infinity)', () => {
			assert.throws(
				() => summationTypedRecursive(new Float64Array([1, NaN, 3])),
				{
					name: 'RangeError',
					message: /index 1/
				}
			)
			assert.throws(
				() => summationTypedRecursive(new Float64Array([Infinity, 2])),
				{
					name: 'RangeError',
					message: /index 0/
				}
			)
			assert.throws(
				() => summationTypedRecursive(new Float64Array([1, 2, -Infinity])),
				{
					name: 'RangeError',
					message: /index 2/
				}
			)
		})
	})

	describe('cross-checks against independent implementations', () => {
		test('matches independent iterative summation on integer sequences', () => {
			const data = new Float64Array(1023)
			for (let i = 0; i < data.length; i += 1) {
				data[i] = (i % 2 === 0 ? 1 : -1) * (i * 3 - 500)
			}
			assert.strictEqual(
				summationTypedRecursive(data),
				iterativeSum(data)
			)
		})

		test('closely matches independent Kahan summation on repeated fractional values', () => {
			const n = 10_000
			const data = new Float64Array(n)
			data.fill(0.1)

			const recursiveResult = summationTypedRecursive(data)
			const kahanResult = kahanSum(data)
			const exact = 1000

			assert.ok(
				Math.abs(recursiveResult - kahanResult) < 1e-11,
				`Expected pairwise (${recursiveResult}) to closely match Kahan (${kahanResult})`
			)
			assert.ok(
				Math.abs(recursiveResult - exact) < 1e-11,
				`Expected pairwise (${recursiveResult}) to be within 1e-11 of exact (${exact})`
			)
		})

		test('matches Kahan summation on deterministic mixed-magnitude pseudo-random data', () => {
			const n = 4096
			const data = new Float64Array(n)
			let seed = 0x12345678
			for (let i = 0; i < n; i += 1) {
				seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
				const u = seed / 0x100000000
				data[i] = (u - 0.5) * 1e4 + Math.sin(i) * 1e-3
			}

			const recursiveResult = summationTypedRecursive(data)
			const kahanResult = kahanSum(data)
			const naiveResult = iterativeSum(data)

			assert.ok(
				Math.abs(recursiveResult - kahanResult) < 1e-9,
				`Expected pairwise (${recursiveResult}) within 1e-9 of Kahan (${kahanResult})`
			)
			assert.ok(
				Math.abs(recursiveResult - naiveResult) < 1e-7,
				`Expected pairwise (${recursiveResult}) within 1e-7 of naive (${naiveResult})`
			)
		})
	})
})
