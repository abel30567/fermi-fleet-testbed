import { describe, test } from 'node:test'
import assert from 'node:assert'
import { summationTypedIterative } from './summationTypedIterative.js'

describe('summationTypedIterative', () => {
	test('sums positive integers', () => {
		const input = new Float64Array([1, 2, 3, 4, 5])
		assert.strictEqual(summationTypedIterative(input), 15)
	})

	test('sums mixed positive, negative, and fractional values', () => {
		const input = new Float64Array([-10.5, 4.25, 6.25, -3.5, 8.5])
		assert.strictEqual(summationTypedIterative(input), 5)
	})

	test('returns 0 for an empty Float64Array', () => {
		const input = new Float64Array(0)
		assert.strictEqual(summationTypedIterative(input), 0)
	})

	test('handles single-element Float64Array values', () => {
		assert.strictEqual(summationTypedIterative(new Float64Array([42.5])), 42.5)
		assert.strictEqual(summationTypedIterative(new Float64Array([-7.25])), -7.25)
		assert.strictEqual(summationTypedIterative(new Float64Array([0])), 0)
	})

	test('handles Float64Array subarray views with non-zero byteOffset', () => {
		const base = new Float64Array([100, 1, 2, 3, 4, 200])
		const slice = base.subarray(1, 5)
		assert.strictEqual(summationTypedIterative(slice), 10)
	})

	test('does not mutate the input Float64Array', () => {
		const input = new Float64Array([3, -1, 4, -1, 5])
		const snapshot = Array.from(input)
		summationTypedIterative(input)
		assert.deepStrictEqual(Array.from(input), snapshot)
	})

	test('propagates special IEEE-754 values (Infinity, -Infinity, NaN)', () => {
		assert.strictEqual(
			summationTypedIterative(new Float64Array([1, Infinity, 2])),
			Infinity,
		)
		assert.strictEqual(
			summationTypedIterative(new Float64Array([1, -Infinity, 2])),
			-Infinity,
		)
		assert.ok(
			Number.isNaN(
				summationTypedIterative(new Float64Array([Infinity, -Infinity])),
			),
		)
		assert.ok(
			Number.isNaN(summationTypedIterative(new Float64Array([1, NaN, 3]))),
		)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const invalidInputs = [
			null,
			undefined,
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			'123',
			42,
			{ length: 2, 0: 1, 1: 2 },
		]

		for (const invalid of invalidInputs) {
			assert.throws(
				() => summationTypedIterative(invalid),
				{ name: 'TypeError' },
			)
		}
	})

	test('cross-check: matches closed-form arithmetic series formula n(n+1)/2', () => {
		const n = 10000
		const values = new Float64Array(n)
		for (let i = 0; i < n; i += 1) {
			values[i] = i + 1
		}
		const expected = (n * (n + 1)) / 2
		assert.strictEqual(summationTypedIterative(values), expected)
	})

	test('cross-check: matches closed-form sum of squares n(n+1)(2n+1)/6', () => {
		const n = 500
		const values = new Float64Array(n)
		for (let i = 0; i < n; i += 1) {
			const k = i + 1
			values[i] = k * k
		}
		const expected = (n * (n + 1) * (2 * n + 1)) / 6
		assert.strictEqual(summationTypedIterative(values), expected)
	})

	test('cross-check: matches exact dyadic geometric series 2 - 2^-(n-1)', () => {
		const n = 30
		const values = new Float64Array(n)
		for (let k = 0; k < n; k += 1) {
			values[k] = 2 ** -k
		}
		const expected = 2 - 2 ** -(n - 1)
		assert.strictEqual(summationTypedIterative(values), expected)
	})

	test('cross-check: matches Array.prototype.reduce on deterministic pseudo-random data', () => {
		const n = 1024
		const values = new Float64Array(n)
		let state = 0x12345678
		for (let i = 0; i < n; i += 1) {
			state = (Math.imul(state, 1664525) + 1013904223) >>> 0
			values[i] = (state / 0xffffffff - 0.5) * 1000
		}
		const expected = Array.from(values).reduce((acc, x) => acc + x, 0)
		assert.strictEqual(summationTypedIterative(values), expected)
	})
})
