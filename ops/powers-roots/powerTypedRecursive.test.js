import { describe, test } from 'node:test'
import assert from 'node:assert'
import { powerTypedRecursive } from './powerTypedRecursive.js'

describe('powerTypedRecursive', () => {
	test('handles empty Float64Array inputs', () => {
		const bases = new Float64Array(0)
		const exponents = new Float64Array(0)
		const result = powerTypedRecursive(bases, exponents)

		assert.ok(result instanceof Float64Array)
		assert.strictEqual(result.length, 0)
		assert.notStrictEqual(result, bases)
		assert.notStrictEqual(result, exponents)
	})

	test('handles single-element Float64Array inputs', () => {
		const bases = new Float64Array([3])
		const exponents = new Float64Array([4])
		const result = powerTypedRecursive(bases, exponents)

		assert.ok(result instanceof Float64Array)
		assert.deepStrictEqual(result, new Float64Array([81]))
	})

	test('handles even-length and odd-length Float64Array inputs', () => {
		const evenBases = new Float64Array([2, 3, 4, 5])
		const evenExps = new Float64Array([3, 2, 1, 0])
		assert.deepStrictEqual(
			powerTypedRecursive(evenBases, evenExps),
			new Float64Array([8, 9, 4, 1])
		)

		const oddBases = new Float64Array([2, 3, 5, 7, 10])
		const oddExps = new Float64Array([0, 1, 2, 3, 4])
		assert.deepStrictEqual(
			powerTypedRecursive(oddBases, oddExps),
			new Float64Array([1, 3, 25, 343, 10000])
		)
	})

	test('handles larger arrays (even and odd lengths)', () => {
		for (const length of [1024, 1025]) {
			const bases = new Float64Array(length)
			const exponents = new Float64Array(length)
			for (let i = 0; i < length; i++) {
				bases[i] = 2
				exponents[i] = i % 10
			}
			const result = powerTypedRecursive(bases, exponents)
			assert.strictEqual(result.length, length)
			for (let i = 0; i < length; i++) {
				assert.strictEqual(result[i], 2 ** (i % 10))
			}
		}
	})

	test('handles zero exponents including special bases', () => {
		const bases = new Float64Array([0, -0, 5, -5, Infinity, -Infinity, NaN])
		const exponents = new Float64Array([0, 0, 0, 0, 0, 0, 0])
		const result = powerTypedRecursive(bases, exponents)

		assert.deepStrictEqual(result, new Float64Array([1, 1, 1, 1, 1, 1, 1]))
	})

	test('handles negative exponents', () => {
		const bases = new Float64Array([2, 4, -2, 0, -0])
		const exponents = new Float64Array([-3, -1, -3, -1, -1])
		const result = powerTypedRecursive(bases, exponents)

		assert.strictEqual(result[0], 0.125)
		assert.strictEqual(result[1], 0.25)
		assert.strictEqual(result[2], -0.125)
		assert.strictEqual(result[3], Infinity)
		assert.strictEqual(result[4], -Infinity)
	})

	test('handles fractional exponents and IEEE-754 edge cases', () => {
		const bases = new Float64Array([9, 16, 8, -4, NaN, 10])
		const exponents = new Float64Array([0.5, 0.25, 1 / 3, 0.5, 2, 1000])
		const result = powerTypedRecursive(bases, exponents)

		assert.strictEqual(result[0], 3)
		assert.strictEqual(result[1], 2)
		assert.ok(Math.abs(result[2] - 2) < 1e-12)
		assert.ok(Number.isNaN(result[3]))
		assert.ok(Number.isNaN(result[4]))
		assert.strictEqual(result[5], Infinity)
	})

	test('throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidValues = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			null,
			undefined,
			42,
			'123',
			{ length: 3 }
		]

		for (const bad of invalidValues) {
			assert.throws(() => powerTypedRecursive(bad, valid), TypeError)
			assert.throws(() => powerTypedRecursive(valid, bad), TypeError)
		}
	})

	test('throws RangeError for mismatched lengths', () => {
		assert.throws(
			() => powerTypedRecursive(new Float64Array([1, 2]), new Float64Array([1])),
			RangeError
		)
		assert.throws(
			() => powerTypedRecursive(new Float64Array([]), new Float64Array([1])),
			RangeError
		)
		assert.throws(
			() => powerTypedRecursive(new Float64Array([1, 2, 3]), new Float64Array([1, 2, 3, 4])),
			RangeError
		)
	})

	test('does not mutate inputs and returns a distinct Float64Array', () => {
		const bases = new Float64Array([2, 3, 4, 5])
		const exponents = new Float64Array([3, 2, 1, 0])
		const basesSnapshot = new Float64Array(bases)
		const exponentsSnapshot = new Float64Array(exponents)

		const result = powerTypedRecursive(bases, exponents)

		assert.notStrictEqual(result, bases)
		assert.notStrictEqual(result, exponents)
		assert.deepStrictEqual(bases, basesSnapshot)
		assert.deepStrictEqual(exponents, exponentsSnapshot)

		result[0] = 999
		assert.strictEqual(bases[0], basesSnapshot[0])
		assert.strictEqual(exponents[0], exponentsSnapshot[0])
	})

	test('matches independent iterative computation across varied values', () => {
		const length = 257
		const bases = new Float64Array(length)
		const exponents = new Float64Array(length)

		let seed = 1337
		const nextRand = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return seed / 0x100000000
		}

		for (let i = 0; i < length; i++) {
			bases[i] = (nextRand() - 0.3) * 10
			exponents[i] = Math.round((nextRand() - 0.5) * 12) / 2
		}

		// Independent iterative reference computation
		const expected = new Float64Array(length)
		for (let i = 0; i < length; i++) {
			expected[i] = bases[i] ** exponents[i]
		}

		const actual = powerTypedRecursive(bases, exponents)

		assert.strictEqual(actual.length, expected.length)
		for (let i = 0; i < length; i++) {
			assert.ok(
				Object.is(actual[i], expected[i]),
				`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}`
			)
		}
	})
})
