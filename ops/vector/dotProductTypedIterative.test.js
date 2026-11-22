import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { dotProductTypedIterative } from './dotProductTypedIterative.js'

/**
 * Helper to assert two numbers are within an absolute tolerance.
 * @param {number} actual
 * @param {number} expected
 * @param {number} [eps=1e-12]
 */
function assertClose(actual, expected, eps = 1e-12) {
	const diff = Math.abs(actual - expected)
	assert.ok(
		diff <= eps,
		`Expected ${actual} to be within ${eps} of ${expected} (diff = ${diff})`,
	)
}

describe('dotProductTypedIterative', () => {
	describe('normal cases', () => {
		it('computes dot product of positive integer vectors', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([4, 5, 6])
			assert.equal(dotProductTypedIterative(a, b), 32)
		})

		it('computes dot product of single-element vectors', () => {
			const a = new Float64Array([7.5])
			const b = new Float64Array([-4])
			assert.equal(dotProductTypedIterative(a, b), -30)
		})

		it('computes dot product of fractional floating-point vectors', () => {
			const a = new Float64Array([0.5, -1.25, 2.5, 0.125])
			const b = new Float64Array([4.0, 2.0, -0.5, 8.0])
			// 2.0 - 2.5 - 1.25 + 1.0 = -0.75
			assert.equal(dotProductTypedIterative(a, b), -0.75)
		})

		it('returns 0 for orthogonal vectors', () => {
			const a = new Float64Array([1, 0, -1, 0])
			const b = new Float64Array([0, 5, 0, -3])
			assert.equal(dotProductTypedIterative(a, b), 0)

			const u = new Float64Array([3, 4])
			const v = new Float64Array([-4, 3])
			assert.equal(dotProductTypedIterative(u, v), 0)
		})

		it('supports Float64Array subarray views with non-zero byteOffset', () => {
			const backing = new Float64Array([99, 1, 2, 3, 4, 5, 6, -99])
			const a = backing.subarray(1, 4) // [1, 2, 3]
			const b = backing.subarray(4, 7) // [4, 5, 6]
			assert.equal(dotProductTypedIterative(a, b), 32)
		})

		it('does not mutate input vectors', () => {
			const a = new Float64Array([1.5, -2.5, 3.5])
			const b = new Float64Array([-4.0, 5.0, -6.0])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			dotProductTypedIterative(a, b)

			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases', () => {
		it('returns 0 for empty Float64Array inputs', () => {
			const a = new Float64Array(0)
			const b = new Float64Array(0)
			assert.equal(dotProductTypedIterative(a, b), 0)
		})

		it('returns 0 when one or both vectors are all zeros', () => {
			const zeros = new Float64Array([0, 0, 0, 0])
			const nonZeros = new Float64Array([10, -20, 30, -40])
			assert.equal(dotProductTypedIterative(zeros, nonZeros), 0)
			assert.equal(dotProductTypedIterative(nonZeros, zeros), 0)
			assert.equal(dotProductTypedIterative(zeros, zeros), 0)
		})

		it('handles negative values and anti-parallel vectors', () => {
			const a = new Float64Array([-2, -3, -6])
			const b = new Float64Array([2, 3, 6])
			assert.equal(dotProductTypedIterative(a, b), -49)
		})

		it('returns +0 when multiplying signed zeros', () => {
			const a = new Float64Array([-0, -0])
			const b = new Float64Array([1, 2])
			const res = dotProductTypedIterative(a, b)
			assert.equal(Object.is(res, 0), true)
		})

		it('handles identical vector reference for squared Euclidean norm', () => {
			const v = new Float64Array([3, -4, 12])
			assert.equal(dotProductTypedIterative(v, v), 169)
		})

		it('handles very small and large finite values accurately', () => {
			const tinyA = new Float64Array([1e-100, 2e-100])
			const tinyB = new Float64Array([3e-100, 4e-100])
			assertClose(dotProductTypedIterative(tinyA, tinyB), 1.1e-199, 1e-212)

			const largeA = new Float64Array([1e100, -2e100])
			const largeB = new Float64Array([3e100, -4e100])
			assertClose(dotProductTypedIterative(largeA, largeB), 1.1e201, 1e188)
		})
	})

	describe('input validation', () => {
		it('throws TypeError for non-Float64Array inputs', () => {
			const valid = new Float64Array([1, 2, 3])
			const invalidInputs = [
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
				null,
				undefined,
				42,
				'123',
				{ 0: 1, 1: 2, 2: 3, length: 3 },
			]

			for (const bad of invalidInputs) {
				assert.throws(() => dotProductTypedIterative(bad, valid), TypeError)
				assert.throws(() => dotProductTypedIterative(valid, bad), TypeError)
			}

			assert.throws(() => dotProductTypedIterative(valid), TypeError)
			assert.throws(() => dotProductTypedIterative(), TypeError)
		})

		it('throws RangeError when vector lengths do not match', () => {
			assert.throws(
				() => dotProductTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
				RangeError,
			)
			assert.throws(
				() => dotProductTypedIterative(new Float64Array(0), new Float64Array([0])),
				RangeError,
			)
		})

		it('throws RangeError when any element is NaN or infinite', () => {
			const valid = new Float64Array([1, 2, 3])
			const badValues = [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

			for (const bad of badValues) {
				assert.throws(
					() => dotProductTypedIterative(new Float64Array([1, bad, 3]), valid),
					RangeError,
				)
				assert.throws(
					() => dotProductTypedIterative(valid, new Float64Array([1, 2, bad])),
					RangeError,
				)
			}
		})
	})

	describe('mathematical cross-checks', () => {
		it('satisfies the polarization identity: u·v = (||u+v||^2 - ||u-v||^2) / 4', () => {
			const u = new Float64Array([1.7, -3.2, 0.5, 4.1, -2.8, 6.3, -0.9])
			const v = new Float64Array([-2.1, 1.4, 5.5, -0.3, 3.7, -1.2, 4.8])

			// Independent squared-norm computation without calling dotProductTypedIterative
			const normSqSum = u.reduce((acc, ui, i) => acc + (ui + v[i]) ** 2, 0)
			const normSqDiff = u.reduce((acc, ui, i) => acc + (ui - v[i]) ** 2, 0)
			const viaPolarization = (normSqSum - normSqDiff) / 4

			const direct = dotProductTypedIterative(u, v)
			assertClose(direct, viaPolarization, 1e-11)
		})

		it('satisfies the Cauchy-Schwarz inequality: |u·v| <= ||u|| * ||v||', () => {
			const u = new Float64Array([2.5, -1.3, 4.7, -0.8, 3.2])
			const v = new Float64Array([-1.1, 3.9, 0.4, 2.6, -5.0])

			const dot = dotProductTypedIterative(u, v)
			const normU = Math.hypot(...u)
			const normV = Math.hypot(...v)

			assert.ok(Math.abs(dot) <= normU * normV + 1e-12)

			// Equality for collinear vectors (v = k * u)
			const k = -3.5
			const scaled = new Float64Array(u.map((x) => x * k))
			const collinearDot = dotProductTypedIterative(u, scaled)
			assertClose(Math.abs(collinearDot), normU * Math.hypot(...scaled), 1e-11)
		})

		it('matches geometric formula ||u|| * ||v|| * cos(theta) across angles', () => {
			const r1 = 3.5
			const r2 = 2.25
			const angles = [0, Math.PI / 6, Math.PI / 4, Math.PI / 3, Math.PI / 2, (2 * Math.PI) / 3, Math.PI]

			for (const theta of angles) {
				const u = new Float64Array([r1, 0])
				const v = new Float64Array([r2 * Math.cos(theta), r2 * Math.sin(theta)])
				const expected = r1 * r2 * Math.cos(theta)
				assertClose(dotProductTypedIterative(u, v), expected, 1e-12)
			}
		})

		it('satisfies commutativity and bilinearity', () => {
			const u = new Float64Array([1.2, -3.4, 5.6, -7.8])
			const v = new Float64Array([-2.3, 4.5, -6.7, 8.9])
			const w = new Float64Array([0.5, 1.5, -2.5, 3.5])
			const alpha = 2.75
			const beta = -1.25

			// Commutativity: u·v === v·u
			assert.equal(dotProductTypedIterative(u, v), dotProductTypedIterative(v, u))

			// Bilinearity: (alpha*u + beta*w)·v === alpha*(u·v) + beta*(w·v)
			const combo = new Float64Array(u.length)
			for (let i = 0; i < u.length; i += 1) {
				combo[i] = alpha * u[i] + beta * w[i]
			}
			const lhs = dotProductTypedIterative(combo, v)
			const rhs = alpha * dotProductTypedIterative(u, v) + beta * dotProductTypedIterative(w, v)
			assertClose(lhs, rhs, 1e-11)
		})

		it('matches closed-form analytical sums for large vectors', () => {
			const n = 1000
			const seq = new Float64Array(n)
			const ones = new Float64Array(n)
			for (let i = 0; i < n; i += 1) {
				seq[i] = i + 1
				ones[i] = 1
			}

			// sum_{k=1}^n k = n(n+1)/2
			const expectedTriangular = (n * (n + 1)) / 2
			assert.equal(dotProductTypedIterative(seq, ones), expectedTriangular)

			// sum_{k=1}^n k^2 = n(n+1)(2n+1)/6
			const expectedSumOfSquares = (n * (n + 1) * (2 * n + 1)) / 6
			assert.equal(dotProductTypedIterative(seq, seq), expectedSumOfSquares)
		})
	})
})
