import { describe, test } from 'node:test'
import assert from 'node:assert'
import { subtractTypedIterative } from './subtractTypedIterative.js'

describe('subtractTypedIterative', () => {
	test('subtracts positive, negative, and floating-point values element-wise', () => {
		const a = new Float64Array([10, -5, 3.5, 0, 100.25])
		const b = new Float64Array([4, -8, 1.25, 7, -0.75])
		const result = subtractTypedIterative(a, b)

		assert.ok(result instanceof Float64Array)
		assert.deepStrictEqual(result, new Float64Array([6, 3, 2.25, -7, 101]))
	})

	test('returns a new Float64Array without mutating inputs', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5, 6])
		const result = subtractTypedIterative(a, b)

		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
		assert.deepStrictEqual(a, new Float64Array([1, 2, 3]))
		assert.deepStrictEqual(b, new Float64Array([4, 5, 6]))
		assert.deepStrictEqual(result, new Float64Array([-3, -3, -3]))
	})

	test('handles empty Float64Array inputs', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const result = subtractTypedIterative(a, b)

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
	})

	test('handles single-element arrays and self-subtraction', () => {
		const single = subtractTypedIterative(
			new Float64Array([42.5]),
			new Float64Array([12.5])
		)
		assert.deepStrictEqual(single, new Float64Array([30]))

		const v = new Float64Array([1.5, -2.25, 0, 999999])
		assert.deepStrictEqual(
			subtractTypedIterative(v, v),
			new Float64Array([0, 0, 0, 0])
		)
	})

	test('handles IEEE 754 special values (NaN, Infinity, -Infinity, signed zeros, extremes)', () => {
		const a = new Float64Array([
			NaN,
			1,
			Infinity,
			-Infinity,
			Infinity,
			-0,
			Number.MAX_VALUE,
			Number.MIN_VALUE
		])
		const b = new Float64Array([
			1,
			NaN,
			Infinity,
			Infinity,
			-Infinity,
			0,
			-Number.MAX_VALUE,
			0
		])
		const result = subtractTypedIterative(a, b)

		assert.ok(Number.isNaN(result[0]))
		assert.ok(Number.isNaN(result[1]))
		assert.ok(Number.isNaN(result[2]))
		assert.strictEqual(result[3], -Infinity)
		assert.strictEqual(result[4], Infinity)
		assert.ok(Object.is(result[5], -0))
		assert.strictEqual(result[6], Infinity)
		assert.strictEqual(result[7], Number.MIN_VALUE)
	})

	test('handles Float64Array subarrays with non-zero byteOffset', () => {
		const bufA = new Float64Array([99, 10, 20, 30, 88])
		const bufB = new Float64Array([77, 66, 1, 2, 3])
		const viewA = bufA.subarray(1, 4)
		const viewB = bufB.subarray(2, 5)

		assert.deepStrictEqual(
			subtractTypedIterative(viewA, viewB),
			new Float64Array([9, 18, 27])
		)
	})

	test('throws TypeError when either argument is not a Float64Array', () => {
		const valid = new Float64Array([1, 2])
		const invalidInputs = [
			null,
			undefined,
			[1, 2],
			new Float32Array([1, 2]),
			new Int32Array([1, 2]),
			42,
			'12',
			{ length: 2, 0: 1, 1: 2 }
		]

		for (const bad of invalidInputs) {
			assert.throws(
				() => subtractTypedIterative(bad, valid),
				{ name: 'TypeError' }
			)
			assert.throws(
				() => subtractTypedIterative(valid, bad),
				{ name: 'TypeError' }
			)
		}
	})

	test('throws RangeError when input lengths differ', () => {
		assert.throws(
			() =>
				subtractTypedIterative(
					new Float64Array([1, 2, 3]),
					new Float64Array([1, 2])
				),
			{ name: 'RangeError' }
		)
		assert.throws(
			() =>
				subtractTypedIterative(
					new Float64Array([]),
					new Float64Array([1])
				),
			{ name: 'RangeError' }
		)
	})

	test('cross-checks against independent Float64Array.from reference and algebraic identities', () => {
		// Deterministic linear congruential generator for reproducible test vectors
		let seed = 0x12345678
		const nextInt = () => {
			seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
			return (seed % 2001) - 1000 // exact integer in [-1000, 1000]
		}

		const n = 256
		const a = new Float64Array(n)
		const b = new Float64Array(n)
		for (let i = 0; i < n; i += 1) {
			// Exact dyadic rationals (multiples of 1/8) to guarantee exact IEEE 754 arithmetic
			a[i] = nextInt() / 8
			b[i] = nextInt() / 8
		}

		const actual = subtractTypedIterative(a, b)

		// Independent cross-check 1: functional Float64Array.from via additive inverse
		const reference = Float64Array.from(a, (val, i) => val + -b[i])
		assert.deepStrictEqual(actual, reference)

		// Independent cross-check 2: antisymmetry (a - b === -(b - a))
		const reversed = subtractTypedIterative(b, a)
		for (let i = 0; i < n; i += 1) {
			assert.strictEqual(actual[i], -reversed[i])
		}

		// Independent cross-check 3: inverse property ((a - b) + b === a) for exact dyadic values
		for (let i = 0; i < n; i += 1) {
			assert.strictEqual(actual[i] + b[i], a[i])
		}
	})
})
