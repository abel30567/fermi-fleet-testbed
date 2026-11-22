import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { magnitudeFloatRecursive } from './magnitudeFloatRecursive.js'

function assertApproxEqual(actual, expected, relTol = 1e-12, absTol = 0) {
	const diff = Math.abs(actual - expected)
	const limit = Math.max(absTol, relTol * Math.max(Math.abs(actual), Math.abs(expected)))
	assert.ok(
		diff <= limit,
		`Expected ${actual} to be within ${limit} of ${expected} (diff=${diff})`
	)
}

describe('magnitudeFloatRecursive', () => {
	test('computes classic Pythagorean triples and exact integer norms', () => {
		assert.equal(magnitudeFloatRecursive([3, 4]), 5)
		assert.equal(magnitudeFloatRecursive([-3, -4]), 5)
		assert.equal(magnitudeFloatRecursive([5, 12]), 13)
		assert.equal(magnitudeFloatRecursive([2, 3, 6]), 7)
		assert.equal(magnitudeFloatRecursive([1, 2, 2]), 3)
	})

	test('computes norms for single-element, floating-point, and multi-dimensional vectors', () => {
		assert.equal(magnitudeFloatRecursive([42.5]), 42.5)
		assert.equal(magnitudeFloatRecursive([-7.25]), 7.25)
		assertApproxEqual(magnitudeFloatRecursive([1, 1]), Math.SQRT2, 1e-15)
		assertApproxEqual(magnitudeFloatRecursive([1.5, -2.25, 3.75, -0.5]), Math.hypot(1.5, -2.25, 3.75, -0.5), 1e-15)
		assert.equal(magnitudeFloatRecursive(new Float64Array([3, 4, 12])), 13)
	})

	test('handles empty vector and zero vectors (including -0)', () => {
		assert.equal(magnitudeFloatRecursive([]), 0)
		assert.equal(magnitudeFloatRecursive(new Float64Array(0)), 0)
		assert.equal(magnitudeFloatRecursive([0]), 0)
		assert.equal(magnitudeFloatRecursive([0, 0, 0, 0]), 0)
		const negZeroResult = magnitudeFloatRecursive([-0, -0])
		assert.equal(negZeroResult, 0)
		assert.equal(Object.is(negZeroResult, 0), true)
	})

	test('avoids overflow on very large float64 components', () => {
		const large = [3e200, 4e200]
		assertApproxEqual(magnitudeFloatRecursive(large), 5e200, 1e-15)

		const nearMax = [1e308, 1e308]
		assertApproxEqual(magnitudeFloatRecursive(nearMax), Math.SQRT2 * 1e308, 1e-15)
		assert.ok(Number.isFinite(magnitudeFloatRecursive(nearMax)))

		const singleMax = [Number.MAX_VALUE]
		assert.equal(magnitudeFloatRecursive(singleMax), Number.MAX_VALUE)
	})

	test('avoids underflow on very small and subnormal float64 components', () => {
		const tiny = [3e-200, 4e-200]
		assertApproxEqual(magnitudeFloatRecursive(tiny), 5e-200, 1e-15)

		const nearMin = [3e-308, 4e-308]
		assertApproxEqual(magnitudeFloatRecursive(nearMin), 5e-308, 1e-15)

		const subnormal = [Number.MIN_VALUE, Number.MIN_VALUE]
		assert.equal(magnitudeFloatRecursive(subnormal), Math.hypot(...subnormal))
	})

	test('handles large vector lengths cleanly with O(log n) recursion depth', () => {
		const n = 10000
		const ones = new Array(n).fill(1)
		assertApproxEqual(magnitudeFloatRecursive(ones), 100, 1e-14)
	})

	test('cross-checks against Math.hypot across diverse vectors', () => {
		const vectors = [
			[0.1, -0.2, 0.3, -0.4, 0.5],
			[1e-150, 2e-150, 3e-150, 4e-150],
			[1e150, -2e150, 3e150, -4e150],
			[1e-10, 1e10, -1e-10, 1e10],
			Array.from({ length: 64 }, (_, i) => Math.sin(i + 1) * (i + 1))
		]

		for (const v of vectors) {
			const expected = Math.hypot(...v)
			const actual = magnitudeFloatRecursive(v)
			assertApproxEqual(actual, expected, 1e-14)
		}
	})

	test('satisfies positive homogeneity ||k * v|| === |k| * ||v|| and sign/permutation invariance', () => {
		const v = [1.25, -3.5, 4.75, -0.125, 2.5]
		const baseNorm = magnitudeFloatRecursive(v)

		for (const k of [-7.5, -1, -1e-100, 0, 1e-100, 2.5, 1e100]) {
			const scaled = v.map((x) => k * x)
			assertApproxEqual(magnitudeFloatRecursive(scaled), Math.abs(k) * baseNorm, 1e-14)
		}

		const reversed = [...v].reverse()
		const negated = v.map((x) => -x)
		assertApproxEqual(magnitudeFloatRecursive(reversed), baseNorm, 1e-15)
		assertApproxEqual(magnitudeFloatRecursive(negated), baseNorm, 1e-15)
	})

	test('throws TypeError on invalid container or non-number elements', () => {
		for (const badInput of [null, undefined, 42, '123', {}, { length: 2, 0: 1, 1: 2 }, new Int32Array([3, 4])]) {
			assert.throws(() => magnitudeFloatRecursive(badInput), TypeError)
		}

		assert.throws(() => magnitudeFloatRecursive([1, '2', 3]), TypeError)
		assert.throws(() => magnitudeFloatRecursive([1, null]), TypeError)
		assert.throws(() => magnitudeFloatRecursive([1, undefined]), TypeError)
		assert.throws(() => magnitudeFloatRecursive([1, true]), TypeError)
		assert.throws(() => magnitudeFloatRecursive([1, 2n]), TypeError)

		// Sparse array hole
		const sparse = new Array(3)
		sparse[0] = 3
		sparse[2] = 4
		assert.throws(() => magnitudeFloatRecursive(sparse), TypeError)
	})

	test('throws RangeError on non-finite number elements', () => {
		assert.throws(() => magnitudeFloatRecursive([NaN]), RangeError)
		assert.throws(() => magnitudeFloatRecursive([1, 2, NaN]), RangeError)
		assert.throws(() => magnitudeFloatRecursive([Infinity, 1]), RangeError)
		assert.throws(() => magnitudeFloatRecursive([1, -Infinity]), RangeError)
		assert.throws(() => magnitudeFloatRecursive(new Float64Array([1, NaN])), RangeError)
	})
})
