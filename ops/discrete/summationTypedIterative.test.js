import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { summationTypedIterative } from './summationTypedIterative.js'

describe('summationTypedIterative', () => {
	describe('normal cases', () => {
		it('sums positive integer elements', () => {
			const values = new Float64Array([1, 2, 3, 4, 5])
			assert.equal(summationTypedIterative(values), 15)
		})

		it('sums floating-point decimal elements accurately', () => {
			const values = new Float64Array([0.5, 1.25, 2.75, 3.5])
			assert.equal(summationTypedIterative(values), 8)
		})

		it('sums mixed positive and negative elements', () => {
			const values = new Float64Array([-10, 4.5, 6.25, -0.75])
			assert.equal(summationTypedIterative(values), 0)
		})

		it('handles Float64Array subarray views', () => {
			const base = new Float64Array([100, 10, 20, 30, 200])
			const slice = base.subarray(1, 4)
			assert.equal(summationTypedIterative(slice), 60)
		})

		it('does not mutate the input Float64Array', () => {
			const values = new Float64Array([3, -1, 4, -1, 5])
			const snapshot = Array.from(values)
			assert.equal(summationTypedIterative(values), 10)
			assert.deepEqual(Array.from(values), snapshot)
		})
	})

	describe('edge cases', () => {
		it('returns 0 for an empty Float64Array (empty sum identity)', () => {
			const result = summationTypedIterative(new Float64Array(0))
			assert.equal(result, 0)
			assert.ok(Object.is(result, 0))
		})

		it('returns the sole element for a single-element Float64Array', () => {
			assert.equal(summationTypedIterative(new Float64Array([42.5])), 42.5)
			assert.equal(summationTypedIterative(new Float64Array([-7])), -7)
			assert.equal(summationTypedIterative(new Float64Array([0])), 0)
		})

		it('sums all-negative values', () => {
			const values = new Float64Array([-1, -2.5, -3.5, -10])
			assert.equal(summationTypedIterative(values), -17)
		})

		it('returns +0 when summing zeros including negative zero', () => {
			const result = summationTypedIterative(new Float64Array([0, -0, 0, -0]))
			assert.ok(Object.is(result, 0))
		})

		it('handles very small magnitudes', () => {
			const values = new Float64Array(1000).fill(1e-12)
			const result = summationTypedIterative(values)
			assert.ok(Math.abs(result - 1e-9) < 1e-20)
		})
	})

	describe('input validation', () => {
		it('throws TypeError when input is not a Float64Array', () => {
			const invalidInputs = [
				null,
				undefined,
				123,
				'123',
				{},
				[1, 2, 3],
				new Float32Array([1, 2, 3]),
				new Int32Array([1, 2, 3]),
			]

			for (const invalid of invalidInputs) {
				assert.throws(
					() => summationTypedIterative(invalid),
					{ name: 'TypeError' }
				)
			}
		})

		it('throws RangeError when any element is NaN or infinite', () => {
			assert.throws(
				() => summationTypedIterative(new Float64Array([1, NaN, 3])),
				{ name: 'RangeError' }
			)
			assert.throws(
				() => summationTypedIterative(new Float64Array([1, Infinity, 3])),
				{ name: 'RangeError' }
			)
			assert.throws(
				() => summationTypedIterative(new Float64Array([-Infinity, 2])),
				{ name: 'RangeError' }
			)
		})
	})

	describe('mathematical cross-checks', () => {
		it('matches Gauss arithmetic series formula n(n + 1) / 2', () => {
			for (const n of [1, 10, 100, 1000]) {
				const terms = new Float64Array(n)
				for (let k = 1; k <= n; k += 1) {
					terms[k - 1] = k
				}
				const expected = (n * (n + 1)) / 2
				assert.equal(summationTypedIterative(terms), expected)
			}
		})

		it('matches sum of squares formula n(n + 1)(2n + 1) / 6', () => {
			for (const n of [1, 10, 100, 500]) {
				const terms = new Float64Array(n)
				for (let k = 1; k <= n; k += 1) {
					terms[k - 1] = k * k
				}
				const expected = (n * (n + 1) * (2 * n + 1)) / 6
				assert.equal(summationTypedIterative(terms), expected)
			}
		})

		it("matches Nicomachus's theorem for sum of cubes [n(n + 1) / 2]^2", () => {
			const n = 50
			const terms = new Float64Array(n)
			for (let k = 1; k <= n; k += 1) {
				terms[k - 1] = k * k * k
			}
			const triangular = (n * (n + 1)) / 2
			assert.equal(summationTypedIterative(terms), triangular * triangular)
		})

		it('matches finite geometric series (1 - r^n) / (1 - r) for r = 0.5', () => {
			const n = 20
			const r = 0.5
			const terms = new Float64Array(n)
			for (let k = 0; k < n; k += 1) {
				terms[k] = r ** k
			}
			const expected = (1 - r ** n) / (1 - r)
			assert.equal(summationTypedIterative(terms), expected)
		})

		it('satisfies linearity: sum(a*x + b*y) = a*sum(x) + b*sum(y)', () => {
			const x = new Float64Array([1.5, -2.25, 4.75, 8.0, -3.5])
			const y = new Float64Array([-0.5, 3.25, -1.75, 2.5, 6.0])
			const a = 3
			const b = -2
			const combined = new Float64Array(x.length)
			for (let i = 0; i < x.length; i += 1) {
				combined[i] = a * x[i] + b * y[i]
			}
			const lhs = summationTypedIterative(combined)
			const rhs =
				a * summationTypedIterative(x) + b * summationTypedIterative(y)
			assert.equal(lhs, rhs)
		})
	})
})
