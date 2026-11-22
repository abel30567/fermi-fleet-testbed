import { describe, test } from 'node:test'
import assert from 'node:assert'
import { addTypedRecursive } from './addTypedRecursive.js'

describe('addTypedRecursive', () => {
	test('handles empty Float64Array inputs', () => {
		const a = new Float64Array(0)
		const b = new Float64Array(0)
		const result = addTypedRecursive(a, b)

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
	})

	test('handles single-element Float64Array inputs', () => {
		const a = new Float64Array([42.5])
		const b = new Float64Array([-12.5])
		const result = addTypedRecursive(a, b)

		assert.ok(result instanceof Float64Array)
		assert.deepStrictEqual(result, new Float64Array([30]))
	})

	test('handles odd and even length Float64Array inputs', () => {
		const evenA = new Float64Array([1, 2, 3, 4])
		const evenB = new Float64Array([10, 20, 30, 40])
		assert.deepStrictEqual(
			addTypedRecursive(evenA, evenB),
			new Float64Array([11, 22, 33, 44])
		)

		const oddA = new Float64Array([1, 2, 3, 4, 5])
		const oddB = new Float64Array([5, 4, 3, 2, 1])
		assert.deepStrictEqual(
			addTypedRecursive(oddA, oddB),
			new Float64Array([6, 6, 6, 6, 6])
		)

		const len7A = new Float64Array([0, 1, 2, 3, 4, 5, 6])
		const len7B = new Float64Array([6, 5, 4, 3, 2, 1, 0])
		assert.deepStrictEqual(
			addTypedRecursive(len7A, len7B),
			new Float64Array([6, 6, 6, 6, 6, 6, 6])
		)
	})

	test('handles negatives, zeros, decimals, and special IEEE 754 values', () => {
		const a = new Float64Array([
			-10.25,
			0,
			-0,
			0.1,
			Infinity,
			-Infinity,
			NaN,
			Number.MAX_VALUE
		])
		const b = new Float64Array([
			-5.75,
			0,
			-0,
			0.2,
			1,
			-1,
			5,
			-Number.MAX_VALUE
		])
		const result = addTypedRecursive(a, b)

		assert.strictEqual(result[0], -16)
		assert.strictEqual(result[1], 0)
		assert.ok(Object.is(result[2], -0))
		assert.strictEqual(result[3], 0.1 + 0.2)
		assert.strictEqual(result[4], Infinity)
		assert.strictEqual(result[5], -Infinity)
		assert.ok(Number.isNaN(result[6]))
		assert.strictEqual(result[7], 0)
	})

	test('preserves input immutability and returns a new Float64Array', () => {
		const a = new Float64Array([1.5, -2.5, 3.5, 4.5, 5.5])
		const b = new Float64Array([10.5, 20.5, -30.5, 40.5, 50.5])
		const aSnapshot = new Float64Array(a)
		const bSnapshot = new Float64Array(b)

		const result = addTypedRecursive(a, b)

		assert.notStrictEqual(result, a)
		assert.notStrictEqual(result, b)
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)

		result[0] = 999999
		assert.deepStrictEqual(a, aSnapshot)
		assert.deepStrictEqual(b, bSnapshot)
	})

	test('rejects non-Float64Array inputs with TypeError', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidValues = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			new Uint8Array([1, 2, 3]),
			null,
			undefined,
			123,
			'123',
			{ length: 3, 0: 1, 1: 2, 2: 3 }
		]

		for (const invalid of invalidValues) {
			assert.throws(() => addTypedRecursive(invalid, valid), TypeError)
			assert.throws(() => addTypedRecursive(valid, invalid), TypeError)
		}
		assert.throws(() => addTypedRecursive([1], [2]), TypeError)
	})

	test('rejects mismatched Float64Array lengths with RangeError', () => {
		assert.throws(
			() => addTypedRecursive(new Float64Array(0), new Float64Array(1)),
			RangeError
		)
		assert.throws(
			() => addTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError
		)
		assert.throws(
			() => addTypedRecursive(new Float64Array([1, 2]), new Float64Array([1, 2, 3, 4])),
			RangeError
		)
	})

	test('matches independent iterative computation across larger and varied lengths', () => {
		const lengths = [2, 3, 15, 16, 17, 127, 256, 1000, 4099]

		for (const n of lengths) {
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			const expected = new Float64Array(n)

			for (let i = 0; i < n; i++) {
				a[i] = Math.sin(i * 1.17) * 1e4 - (i % 7) * 0.125
				b[i] = Math.cos(i * 0.73) * 1e4 + (i % 5) * 0.25
				expected[i] = a[i] + b[i]
			}

			const actual = addTypedRecursive(a, b)
			assert.ok(actual instanceof Float64Array)
			assert.strictEqual(actual.length, n)
			assert.deepStrictEqual(actual, expected)
		}
	})
})
