import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductTypedSeries } from './dotProductTypedSeries.js'

/**
 * Independent reference using the polarization identity:
 *   dot(a, b) = 0.25 * (||a + b||^2 - ||a - b||^2)
 */
function polarizationDot(a, b) {
	let normSumSq = 0
	let normDiffSq = 0
	for (let i = 0; i < a.length; i++) {
		const s = a[i] + b[i]
		const d = a[i] - b[i]
		normSumSq += s * s
		normDiffSq += d * d
	}
	return 0.25 * (normSumSq - normDiffSq)
}

/**
 * Independent naive dot product over a single pair of slices.
 */
function naiveDot(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

describe('dotProductTypedSeries', () => {
	it('computes dot product for a single vector pair when dim is omitted', () => {
		const a = new Float64Array([1, 2, 3, 4])
		const b = new Float64Array([5, 6, 7, 8])
		const out = dotProductTypedSeries(a, b)

		assert.ok(out instanceof Float64Array)
		assert.equal(out.length, 1)
		assert.equal(out[0], 70)
	})

	it('computes dot products across a batched series with explicit dim', () => {
		const a = new Float64Array([
			1, 2, 3,
			-4, 5, -6,
			0.5, 1.5, 2.5,
		])
		const b = new Float64Array([
			4, 5, 6,
			7, -8, 9,
			2, 4, 6,
		])
		const out = dotProductTypedSeries(a, b, 3)

		assert.ok(out instanceof Float64Array)
		assert.equal(out.length, 3)
		assert.equal(out[0], 32)
		assert.equal(out[1], -122)
		assert.equal(out[2], 22)
	})

	it('handles dim = 1 as element-wise product series', () => {
		const a = new Float64Array([2, -3, 4.5, 0])
		const b = new Float64Array([5, 6, -2, 99])
		const out = dotProductTypedSeries(a, b, 1)

		assert.deepEqual(Array.from(out), [10, -18, -9, 0])
	})

	it('handles empty Float64Array inputs with and without dim', () => {
		const emptyA = new Float64Array(0)
		const emptyB = new Float64Array(0)

		const outDefault = dotProductTypedSeries(emptyA, emptyB)
		assert.ok(outDefault instanceof Float64Array)
		assert.equal(outDefault.length, 0)

		const outWithDim = dotProductTypedSeries(emptyA, emptyB, 4)
		assert.ok(outWithDim instanceof Float64Array)
		assert.equal(outWithDim.length, 0)
	})

	it('returns 0 for orthogonal vectors', () => {
		const a = new Float64Array([1, 0, 0, 0, 3, -4])
		const b = new Float64Array([0, 1, 0, 0, 4, 3])
		const out = dotProductTypedSeries(a, b, 3)

		assert.deepEqual(Array.from(out), [0, 0])
	})

	it('handles parallel and antiparallel vectors accurately', () => {
		const v = new Float64Array([3, 4, 12])
		const parallel = new Float64Array([6, 8, 24])
		const antiparallel = new Float64Array([-9, -12, -36])

		// ||v|| = 13, ||v||^2 = 169
		assert.equal(dotProductTypedSeries(v, parallel)[0], 2 * 169)
		assert.equal(dotProductTypedSeries(v, antiparallel)[0], -3 * 169)
	})

	it('preserves precision under high catastrophic cancellation using Neumaier summation', () => {
		// Naive left-to-right sum yields 0 for both orders, whereas the exact value is 2.
		const a1 = new Float64Array([1e16, 1, 1, -1e16])
		const b1 = new Float64Array([1, 1, 1, 1])
		assert.equal(naiveDot(a1, b1), 0)
		assert.equal(dotProductTypedSeries(a1, b1)[0], 2)

		// Case where small term precedes large term (breaks naive Kahan, handled by Neumaier)
		const a2 = new Float64Array([1, 1e16, 1, -1e16])
		const b2 = new Float64Array([1, 1, 1, 1])
		assert.equal(naiveDot(a2, b2), 0)
		assert.equal(dotProductTypedSeries(a2, b2)[0], 2)

		// Batched cancellation series
		const batchedA = new Float64Array([1e16, 1, 1, -1e16, 1, 1e16, 1, -1e16])
		const batchedB = new Float64Array([1, 1, 1, 1, 2, 1, 3, 1])
		assert.deepEqual(Array.from(dotProductTypedSeries(batchedA, batchedB, 4)), [2, 5])
	})

	it('propagates non-finite IEEE-754 values without spurious NaN corruption', () => {
		const aInf = new Float64Array([Infinity, 1, 2])
		const bInf = new Float64Array([1, 1, 1])
		assert.equal(dotProductTypedSeries(aInf, bInf)[0], Infinity)

		const aNegInf = new Float64Array([1, -Infinity, 2])
		assert.equal(dotProductTypedSeries(aNegInf, bInf)[0], -Infinity)

		const aNaN = new Float64Array([1, NaN, 2])
		assert.ok(Number.isNaN(dotProductTypedSeries(aNaN, bInf)[0]))

		const aIndet = new Float64Array([Infinity, -Infinity])
		const bIndet = new Float64Array([1, 1])
		assert.ok(Number.isNaN(dotProductTypedSeries(aIndet, bIndet)[0]))
	})

	it('cross-checks against polarization identity, naive sum, commutativity, and bilinearity', () => {
		const dim = 5
		const count = 6
		const a = new Float64Array(dim * count)
		const b = new Float64Array(dim * count)
		const c = new Float64Array(dim * count)

		// Deterministic pseudo-random well-conditioned test data
		let seed = 1337
		const nextVal = () => {
			seed = (seed * 1664525 + 1013904223) >>> 0
			return (seed / 0xffffffff) * 20 - 10
		}

		for (let i = 0; i < a.length; i++) {
			a[i] = nextVal()
			b[i] = nextVal()
			c[i] = nextVal()
		}

		const seriesAB = dotProductTypedSeries(a, b, dim)
		const seriesBA = dotProductTypedSeries(b, a, dim)

		const alpha = 2.25
		const beta = -1.75
		const combined = new Float64Array(a.length)
		for (let i = 0; i < a.length; i++) {
			combined[i] = alpha * a[i] + beta * c[i]
		}
		const seriesLinear = dotProductTypedSeries(combined, b, dim)
		const seriesCB = dotProductTypedSeries(c, b, dim)

		for (let i = 0; i < count; i++) {
			const sliceA = a.subarray(i * dim, (i + 1) * dim)
			const sliceB = b.subarray(i * dim, (i + 1) * dim)

			const expectedPolarization = polarizationDot(sliceA, sliceB)
			const expectedNaive = naiveDot(sliceA, sliceB)

			assert.ok(
				Math.abs(seriesAB[i] - expectedPolarization) < 1e-11,
				`polarization mismatch at index ${i}: ${seriesAB[i]} vs ${expectedPolarization}`
			)
			assert.ok(
				Math.abs(seriesAB[i] - expectedNaive) < 1e-12,
				`naive mismatch at index ${i}: ${seriesAB[i]} vs ${expectedNaive}`
			)
			assert.equal(seriesAB[i], seriesBA[i])
			assert.ok(
				Math.abs(seriesLinear[i] - (alpha * seriesAB[i] + beta * seriesCB[i])) < 1e-11,
				`bilinearity mismatch at index ${i}`
			)
		}
	})

	it('throws TypeError and RangeError on invalid inputs', () => {
		const valid = new Float64Array([1, 2, 3, 4])

		// Non-Float64Array inputs
		assert.throws(() => dotProductTypedSeries([1, 2], valid), TypeError)
		assert.throws(() => dotProductTypedSeries(valid, [1, 2, 3, 4]), TypeError)
		assert.throws(() => dotProductTypedSeries(new Float32Array([1, 2]), new Float64Array([1, 2])), TypeError)
		assert.throws(() => dotProductTypedSeries(null, valid), TypeError)
		assert.throws(() => dotProductTypedSeries(valid, undefined), TypeError)

		// Mismatched lengths
		assert.throws(
			() => dotProductTypedSeries(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
			RangeError
		)

		// Invalid dim type
		assert.throws(() => dotProductTypedSeries(valid, valid, '2'), TypeError)
		assert.throws(() => dotProductTypedSeries(valid, valid, null), TypeError)

		// Invalid dim values
		assert.throws(() => dotProductTypedSeries(valid, valid, 0), RangeError)
		assert.throws(() => dotProductTypedSeries(valid, valid, -2), RangeError)
		assert.throws(() => dotProductTypedSeries(valid, valid, 1.5), RangeError)
		assert.throws(() => dotProductTypedSeries(valid, valid, NaN), RangeError)
		assert.throws(() => dotProductTypedSeries(valid, valid, Infinity), RangeError)

		// Length not divisible by dim
		assert.throws(() => dotProductTypedSeries(valid, valid, 3), RangeError)
		assert.throws(() => dotProductTypedSeries(valid, valid, 5), RangeError)
	})
})
