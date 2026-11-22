import { describe, test } from 'node:test'
import assert from 'node:assert'
import { productTypedRecursive } from './productTypedRecursive.js'

/**
 * Independent iterative product reference implementation.
 *
 * @param {Float64Array} arr
 * @returns {number}
 */
function iterativeProduct(arr) {
	let acc = 1
	for (let i = 0; i < arr.length; i++) {
		acc *= arr[i]
	}
	return acc === 0 ? 0 : acc
}

/**
 * Independent log-sum product reference implementation for non-zero finite values:
 * prod(x_i) = sign * exp(sum(ln(|x_i|))).
 *
 * @param {Float64Array} arr
 * @returns {number}
 */
function logSumProduct(arr) {
	let sign = 1
	let logSum = 0
	for (let i = 0; i < arr.length; i++) {
		const v = arr[i]
		if (v === 0) {
			return 0
		}
		if (v < 0) {
			sign = -sign
		}
		logSum += Math.log(Math.abs(v))
	}
	return sign * Math.exp(logSum)
}

/**
 * Assert two finite numbers are close within a relative tolerance.
 *
 * @param {number} actual
 * @param {number} expected
 * @param {number} [relTol=1e-12]
 */
function assertApproxEqual(actual, expected, relTol = 1e-12) {
	const scale = Math.max(1, Math.abs(expected))
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= relTol * scale,
		`Expected ${actual} to be within ${relTol * scale} of ${expected} (diff=${diff})`
	)
}

describe('productTypedRecursive', () => {
	describe('normal cases', () => {
		test('computes product of positive integers (odd and even lengths)', () => {
			assert.strictEqual(productTypedRecursive(new Float64Array([2, 3])), 6)
			assert.strictEqual(productTypedRecursive(new Float64Array([2, 3, 4])), 24)
			assert.strictEqual(productTypedRecursive(new Float64Array([1, 2, 3, 4, 5])), 120)
			assert.strictEqual(
				productTypedRecursive(new Float64Array([1, 2, 3, 4, 5, 6, 7])),
				5040
			)
		})

		test('computes product of floating-point values', () => {
			assert.strictEqual(
				productTypedRecursive(new Float64Array([0.5, 2, 1.5, 4])),
				6
			)
			assertApproxEqual(
				productTypedRecursive(new Float64Array([1.1, 2.2, 3.3, 0.5])),
				3.993
			)
		})

		test('handles Float64Array subarray views with non-zero byteOffset', () => {
			const base = new Float64Array([10, 2, 3, 4, 99])
			const slice = base.subarray(1, 4)
			assert.strictEqual(productTypedRecursive(slice), 24)
		})

		test('handles large Float64Array without stack overflow (O(log n) depth)', () => {
			const n = 16384
			const arr = new Float64Array(n)
			arr.fill(1)
			arr[0] = 3
			arr[n - 1] = 7
			assert.strictEqual(productTypedRecursive(arr), 21)
		})
	})

	describe('edge cases', () => {
		test('empty Float64Array returns multiplicative identity 1', () => {
			assert.strictEqual(productTypedRecursive(new Float64Array(0)), 1)
		})

		test('single element Float64Array', () => {
			assert.strictEqual(productTypedRecursive(new Float64Array([42])), 42)
			assert.strictEqual(productTypedRecursive(new Float64Array([-7.25])), -7.25)
			assert.strictEqual(productTypedRecursive(new Float64Array([0])), 0)
			assert.strictEqual(productTypedRecursive(new Float64Array([-0])), 0)
		})

		test('arrays containing zeros return 0 (no -0)', () => {
			assert.strictEqual(productTypedRecursive(new Float64Array([0, 5, 6])), 0)
			assert.strictEqual(productTypedRecursive(new Float64Array([5, 0, 6])), 0)
			assert.strictEqual(productTypedRecursive(new Float64Array([5, 6, 0])), 0)
			assert.strictEqual(productTypedRecursive(new Float64Array([-2, 0, 5])), 0)
			assert.strictEqual(productTypedRecursive(new Float64Array([0, 0, 0])), 0)
		})

		test('negative values preserve correct parity of sign', () => {
			assert.strictEqual(productTypedRecursive(new Float64Array([-2, -3])), 6)
			assert.strictEqual(productTypedRecursive(new Float64Array([-2, -3, -4])), -24)
			assert.strictEqual(productTypedRecursive(new Float64Array([-1, 2, -3, 4])), 24)
			assert.strictEqual(
				productTypedRecursive(new Float64Array([-1, -1, -1, -1, -1])),
				-1
			)
		})
	})

	describe('input validation', () => {
		test('throws TypeError for non-Float64Array inputs', () => {
			const invalidInputs = [
				undefined,
				null,
				42,
				'123',
				{},
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				new Uint8Array([1, 2, 3]),
			]
			for (const input of invalidInputs) {
				assert.throws(
					() => productTypedRecursive(input),
					{ name: 'TypeError' },
					`Expected TypeError for input ${String(input)}`
				)
			}
		})

		test('throws RangeError for non-finite elements (NaN, Infinity, -Infinity)', () => {
			assert.throws(
				() => productTypedRecursive(new Float64Array([1, NaN, 3])),
				{ name: 'RangeError' }
			)
			assert.throws(
				() => productTypedRecursive(new Float64Array([Infinity, 2])),
				{ name: 'RangeError' }
			)
			assert.throws(
				() => productTypedRecursive(new Float64Array([2, -Infinity, 4])),
				{ name: 'RangeError' }
			)
		})
	})

	describe('cross-checks against independent implementations', () => {
		test('matches independent iterative and log-sum products on deterministic datasets', () => {
			// Deterministic LCG generator producing values in [-1.5, -0.5] U [0.5, 1.5]
			let seed = 0x12345678
			const nextRand = () => {
				seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
				return seed / 0x100000000
			}

			for (const len of [1, 2, 3, 5, 8, 13, 32, 65, 128]) {
				const arr = new Float64Array(len)
				for (let i = 0; i < len; i++) {
					const mag = 0.75 + nextRand() * 0.5 // [0.75, 1.25] avoids overflow/underflow
					const sign = nextRand() < 0.5 ? -1 : 1
					arr[i] = sign * mag
				}

				const actual = productTypedRecursive(arr)
				const expectedIter = iterativeProduct(arr)
				const expectedLogSum = logSumProduct(arr)

				assertApproxEqual(actual, expectedIter, 1e-12)
				assertApproxEqual(actual, expectedLogSum, 1e-12)
			}
		})
	})
})
