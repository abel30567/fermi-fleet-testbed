import { describe, test } from 'node:test'
import assert from 'node:assert'
import { magnitudeTypedRecursive } from './magnitudeTypedRecursive.js'

function assertClose(actual, expected, relTol = 1e-12, absTol = 1e-15) {
	const diff = Math.abs(actual - expected)
	const tol = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= tol,
		`Expected ${actual} to be close to ${expected} (diff=${diff}, tol=${tol})`
	)
}

describe('magnitudeTypedRecursive', () => {
	test('computes classic 3-4-5 and integer-norm vectors', () => {
		assert.strictEqual(magnitudeTypedRecursive(new Float64Array([3, 4])), 5)
		assertClose(magnitudeTypedRecursive(new Float64Array([1, 2, 2])), 3)
		assertClose(magnitudeTypedRecursive(new Float64Array([2, 3, 6])), 7)
	})

	test('handles empty vector', () => {
		const result = magnitudeTypedRecursive(new Float64Array(0))
		assert.strictEqual(result, 0)
		assert.ok(Object.is(result, 0))
	})

	test('handles single-element vectors', () => {
		assert.strictEqual(magnitudeTypedRecursive(new Float64Array([7.5])), 7.5)
		assert.strictEqual(magnitudeTypedRecursive(new Float64Array([-7.5])), 7.5)
		const negZero = magnitudeTypedRecursive(new Float64Array([-0]))
		assert.ok(Object.is(negZero, 0))
	})

	test('handles odd and even vector lengths', () => {
		// Even lengths: 2, 4, 6, 8
		assert.strictEqual(magnitudeTypedRecursive(new Float64Array([5, 12])), 13)
		assertClose(magnitudeTypedRecursive(new Float64Array([1, 1, 1, 1])), 2)
		assertClose(
			magnitudeTypedRecursive(new Float64Array([1, 2, 3, 4, 5, 6])),
			Math.sqrt(91)
		)
		assertClose(
			magnitudeTypedRecursive(new Float64Array([1, 1, 1, 1, 1, 1, 1, 1])),
			Math.sqrt(8)
		)

		// Odd lengths: 3, 5, 7
		assert.strictEqual(magnitudeTypedRecursive(new Float64Array([0, 3, 4])), 5)
		assertClose(
			magnitudeTypedRecursive(new Float64Array([1, 2, 3, 4, 5])),
			Math.sqrt(55)
		)
		assertClose(
			magnitudeTypedRecursive(new Float64Array([1, -2, 3, -4, 5, -6, 7])),
			Math.sqrt(140)
		)
	})

	test('handles larger vectors (power-of-two and non-power-of-two lengths)', () => {
		const n1 = 1024
		const v1 = new Float64Array(n1).fill(1)
		assertClose(magnitudeTypedRecursive(v1), 32)

		const n2 = 1025
		const v2 = new Float64Array(n2)
		for (let i = 0; i < n2; i++) {
			v2[i] = ((i % 7) - 3) * 0.5
		}
		let sumSq = 0
		for (let i = 0; i < n2; i++) {
			sumSq += v2[i] * v2[i]
		}
		assertClose(magnitudeTypedRecursive(v2), Math.sqrt(sumSq))
	})

	test('handles zero vectors and negative entries', () => {
		const zeroResult = magnitudeTypedRecursive(new Float64Array([0, -0, 0, -0, 0]))
		assert.ok(Object.is(zeroResult, 0))

		assert.strictEqual(magnitudeTypedRecursive(new Float64Array([-3, -4])), 5)
		assertClose(magnitudeTypedRecursive(new Float64Array([-1, 2, -2])), 3)
	})

	test('avoids overflow on very large magnitudes', () => {
		const large = new Float64Array([3e200, 4e200])
		assertClose(magnitudeTypedRecursive(large), 5e200)

		const nearMax = new Float64Array([1e308, 1e308])
		assertClose(magnitudeTypedRecursive(nearMax), Math.SQRT2 * 1e308)

		const largeMany = new Float64Array([3e250, 0, -4e250, 0, 0])
		assertClose(magnitudeTypedRecursive(largeMany), 5e250)
	})

	test('avoids underflow on very small magnitudes', () => {
		const small = new Float64Array([3e-200, 4e-200])
		assertClose(magnitudeTypedRecursive(small), 5e-200, 1e-12, 0)

		const tiny = new Float64Array([3e-300, 4e-300])
		assertClose(magnitudeTypedRecursive(tiny), 5e-300, 1e-12, 0)

		const tinyOdd = new Float64Array([0, -3e-250, 4e-250])
		assertClose(magnitudeTypedRecursive(tinyOdd), 5e-250, 1e-12, 0)
	})

	test('handles Float64Array subarray views', () => {
		const full = new Float64Array([99, 3, 4, 88])
		const sub = full.subarray(1, 3)
		assert.strictEqual(magnitudeTypedRecursive(sub), 5)
	})

	test('rejects non-Float64Array inputs with TypeError', () => {
		const invalidInputs = [
			null,
			undefined,
			[3, 4],
			new Float32Array([3, 4]),
			new Int32Array([3, 4]),
			new Uint8Array([3, 4]),
			42,
			'3,4',
			{ 0: 3, 1: 4, length: 2 },
		]
		for (const input of invalidInputs) {
			assert.throws(() => magnitudeTypedRecursive(input), TypeError)
		}
	})

	test('rejects NaN and non-finite elements with RangeError', () => {
		const invalidVectors = [
			new Float64Array([NaN]),
			new Float64Array([Infinity]),
			new Float64Array([-Infinity]),
			new Float64Array([NaN, 1, 2, 3]),
			new Float64Array([1, 2, Infinity, 4]),
			new Float64Array([1, 2, 3, -Infinity]),
			new Float64Array([1e308, 1e308, NaN]),
		]
		for (const vec of invalidVectors) {
			assert.throws(() => magnitudeTypedRecursive(vec), RangeError)
		}
	})

	test('does not mutate input Float64Array', () => {
		const original = [3, -4, 5.25, -0.5, 12]
		const vec = new Float64Array(original)
		magnitudeTypedRecursive(vec)
		assert.deepStrictEqual(Array.from(vec), original)
	})

	test('cross-checks against Math.sqrt(sum(v[i]^2)) and Math.hypot(...v)', () => {
		const vectors = [
			new Float64Array([]),
			new Float64Array([-42.125]),
			new Float64Array([0.1, -0.2, 0.3, -0.4, 0.5]),
			new Float64Array([1.5, -2.75, 3.125, -4.5, 5.25, -6.75, 7.125, -8.5]),
			new Float64Array(
				Array.from({ length: 137 }, (_, i) => Math.sin(i + 1) * (i - 68))
			),
		]

		for (const v of vectors) {
			const actual = magnitudeTypedRecursive(v)

			let sumSq = 0
			for (let i = 0; i < v.length; i++) {
				sumSq += v[i] * v[i]
			}
			const expectedSqrt = Math.sqrt(sumSq)
			const expectedHypot = Math.hypot(...v)

			assertClose(actual, expectedSqrt)
			assertClose(actual, expectedHypot)
		}

		// Extreme scale cross-check against Math.hypot(...v)
		const scaledVectors = [
			new Float64Array([1.2e250, -3.4e250, 5.6e250, -7.8e250, 9.1e250]),
			new Float64Array([1.2e-250, -3.4e-250, 5.6e-250, -7.8e-250, 9.1e-250]),
		]
		for (const v of scaledVectors) {
			assertClose(magnitudeTypedRecursive(v), Math.hypot(...v), 1e-12, 0)
		}
	})
})
