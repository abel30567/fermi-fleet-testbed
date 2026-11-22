import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectionFloatIterative } from './projectionFloatIterative.js'

/**
 * Helper to assert two numeric vectors are element-wise close within `eps`.
 * @param {number[]} actual
 * @param {number[]} expected
 * @param {number} [eps=1e-12]
 */
function assertVectorClose(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${actual[i]} to be within ${eps} of ${expected[i]}`,
		)
	}
}

describe('projectionFloatIterative', () => {
	describe('normal cases', () => {
		it('projects 2D vectors accurately', () => {
			assertVectorClose(projectionFloatIterative([3, 4], [1, 0]), [3, 0])
			assertVectorClose(projectionFloatIterative([3, 4], [0, 1]), [0, 4])
			assertVectorClose(projectionFloatIterative([2, 3], [1, 1]), [2.5, 2.5])
			assertVectorClose(projectionFloatIterative([3, 4], [2, 1]), [4, 2])
		})

		it('projects 3D vectors accurately', () => {
			// a · b = 0 + 6 + 12 = 18; b · b = 0 + 9 + 16 = 25; scale = 0.72
			assertVectorClose(
				projectionFloatIterative([1, 2, 3], [0, 3, 4]),
				[0, 2.16, 2.88],
			)
			// a · b = -1 + 4 - 9 = -6; b · b = 1 + 4 + 9 = 14; scale = -3/7
			assertVectorClose(
				projectionFloatIterative([-1, 2, -3], [1, 2, 3]),
				[-3 / 7, -6 / 7, -9 / 7],
			)
		})

		it('projects 1D and higher-dimensional (nD) vectors accurately', () => {
			assertVectorClose(projectionFloatIterative([7.5], [-2.5]), [7.5])

			// 6D vector onto basis-like vector
			const a = [1, -2, 3.5, 4, -5.25, 6]
			const b = [1, 1, 1, 1, 1, 1]
			const mean = (1 - 2 + 3.5 + 4 - 5.25 + 6) / 6
			assertVectorClose(
				projectionFloatIterative(a, b),
				[mean, mean, mean, mean, mean, mean],
			)
		})

		it('returns the zero vector for orthogonal vectors', () => {
			assert.deepEqual(projectionFloatIterative([1, 0], [0, 5]), [0, 0])
			assert.deepEqual(projectionFloatIterative([1, 2, -1], [2, -1, 0]), [0, 0, 0])
			assert.deepEqual(
				projectionFloatIterative([1, -1, 1, -1], [1, 1, 1, 1]),
				[0, 0, 0, 0],
			)
		})

		it('returns a copy of a for parallel vectors in the same direction', () => {
			const a = [2, 4, 6]
			const b = [1, 2, 3]
			const result = projectionFloatIterative(a, b)
			assertVectorClose(result, a)
			assert.notEqual(result, a)
			assert.notEqual(result, b)
		})

		it('returns a copy of a for antiparallel (opposite direction) vectors', () => {
			const a = [-3, 6, -9]
			const b = [1, -2, 3]
			assertVectorClose(projectionFloatIterative(a, b), a)
		})

		it('does not mutate input arrays', () => {
			const a = [1.5, -2.5, 3.5]
			const b = [4, 5, -6]
			const aCopy = [...a]
			const bCopy = [...b]
			projectionFloatIterative(a, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})
	})

	describe('edge cases and input validation', () => {
		it('handles zero vector a without negative zeros', () => {
			const res = projectionFloatIterative([0, 0, 0], [-1, 2, -3])
			assert.deepEqual(res, [0, 0, 0])
			for (const v of res) {
				assert.ok(Object.is(v, 0))
			}
		})

		it('throws RangeError when b is the zero vector', () => {
			assert.throws(() => projectionFloatIterative([1, 2], [0, 0]), RangeError)
			assert.throws(() => projectionFloatIterative([0], [-0]), RangeError)
			assert.throws(
				() => projectionFloatIterative([0, 0, 0], [0, 0, 0]),
				RangeError,
			)
		})

		it('throws RangeError for empty vectors', () => {
			assert.throws(() => projectionFloatIterative([], []), RangeError)
			assert.throws(() => projectionFloatIterative([], [1]), RangeError)
			assert.throws(() => projectionFloatIterative([1], []), RangeError)
		})

		it('throws RangeError for mismatched vector lengths', () => {
			assert.throws(
				() => projectionFloatIterative([1, 2], [1, 2, 3]),
				RangeError,
			)
			assert.throws(
				() => projectionFloatIterative([1, 2, 3], [1]),
				RangeError,
			)
		})

		it('throws TypeError when arguments are not arrays', () => {
			for (const bad of [null, undefined, 42, '123', {}, new Float64Array([1, 2])]) {
				assert.throws(() => projectionFloatIterative(bad, [1, 2]), TypeError)
				assert.throws(() => projectionFloatIterative([1, 2], bad), TypeError)
			}
		})

		it('throws TypeError when elements are not numbers', () => {
			assert.throws(() => projectionFloatIterative(['1', 2], [1, 2]), TypeError)
			assert.throws(() => projectionFloatIterative([1, 2], [1, '2']), TypeError)
			assert.throws(() => projectionFloatIterative([1, null], [1, 2]), TypeError)
			assert.throws(
				() => projectionFloatIterative([1, undefined], [1, 2]),
				TypeError,
			)
			assert.throws(() => projectionFloatIterative([1n, 2n], [1, 2]), TypeError)

			// Sparse array hole
			const sparse = new Array(2)
			sparse[0] = 1
			assert.throws(() => projectionFloatIterative(sparse, [1, 2]), TypeError)

			// Type validation takes precedence over zero-vector check
			assert.throws(() => projectionFloatIterative(['bad'], [0]), TypeError)
		})

		it('propagates NaN and Infinity per IEEE-754 float64 semantics', () => {
			const nanInA = projectionFloatIterative([Number.NaN, 2], [1, 1])
			assert.equal(nanInA.length, 2)
			assert.ok(Number.isNaN(nanInA[0]) && Number.isNaN(nanInA[1]))

			const nanInB = projectionFloatIterative([1, 2], [Number.NaN, 1])
			assert.equal(nanInB.length, 2)
			assert.ok(Number.isNaN(nanInB[0]) && Number.isNaN(nanInB[1]))

			const infInA = projectionFloatIterative([Number.POSITIVE_INFINITY, 1], [1, 0])
			assert.equal(infInA[0], Number.POSITIVE_INFINITY)
			assert.ok(Number.isNaN(infInA[1]))

			const infInB = projectionFloatIterative([1, 2], [Number.POSITIVE_INFINITY, 1])
			assert.ok(Number.isNaN(infInB[0]) && Number.isNaN(infInB[1]))
		})
	})

	describe('mathematical cross-checks', () => {
		const pairs = [
			[
				[3.14159, -2.71828],
				[1.41421, 1.73205],
			],
			[
				[10, -5, 2.5],
				[-3, 7, 11],
			],
			[
				[0.1, -0.2, 0.3, -0.4, 0.5, -0.6, 0.7],
				[7, 6, 5, 4, 3, 2, 1],
			],
			[
				[1e6, -2e6, 3e6, -4e6],
				[5e-3, 1e-2, -2e-2, 4e-2],
			],
		]

		it('residual (a - proj(a, b)) is orthogonal to b', () => {
			for (const [a, b] of pairs) {
				const proj = projectionFloatIterative(a, b)
				const residualDotB = a.reduce(
					(acc, ai, i) => acc + (ai - proj[i]) * b[i],
					0,
				)
				const scale = Math.hypot(...a) * Math.hypot(...b)
				assert.ok(
					Math.abs(residualDotB) <= 1e-12 * scale,
					`residual dot b = ${residualDotB} not close to 0`,
				)
			}
		})

		it('projection is idempotent: proj(proj(a, b), b) ≈ proj(a, b)', () => {
			for (const [a, b] of pairs) {
				const p1 = projectionFloatIterative(a, b)
				const p2 = projectionFloatIterative(p1, b)
				const mag = Math.hypot(...p1) || 1
				assertVectorClose(p2, p1, 1e-12 * mag)
			}
		})

		it('matches independent unit-vector computation and satisfies Pythagorean theorem', () => {
			for (const [a, b] of pairs) {
				const proj = projectionFloatIterative(a, b)

				// Independent computation via normalized unit vector u = b / ||b||
				const normB = Math.hypot(...b)
				const u = b.map((bi) => bi / normB)
				const aDotU = a.reduce((acc, ai, i) => acc + ai * u[i], 0)
				const independent = u.map((ui) => aDotU * ui)

				const mag = Math.hypot(...a) || 1
				assertVectorClose(proj, independent, 1e-12 * mag)

				// Pythagorean theorem: ||proj||^2 + ||a - proj||^2 ≈ ||a||^2
				const normASq = a.reduce((acc, ai) => acc + ai * ai, 0)
				const normProjSq = proj.reduce((acc, pi) => acc + pi * pi, 0)
				const normResSq = a.reduce(
					(acc, ai, i) => acc + (ai - proj[i]) ** 2,
					0,
				)
				assert.ok(
					Math.abs(normProjSq + normResSq - normASq) <= 1e-11 * normASq,
					`Pythagorean check failed: ${normProjSq} + ${normResSq} !== ${normASq}`,
				)
			}
		})

		it('is invariant to nonzero scaling of b', () => {
			const a = [2, -3, 5, -7]
			const b = [1, 4, -2, 3]
			const base = projectionFloatIterative(a, b)
			for (const k of [-10, -0.5, 0.25, 42]) {
				const scaledB = b.map((bi) => bi * k)
				assertVectorClose(projectionFloatIterative(a, scaledB), base, 1e-12)
			}
		})
	})
})
