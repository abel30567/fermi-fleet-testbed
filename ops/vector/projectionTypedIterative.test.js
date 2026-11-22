import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectionTypedIterative } from './projectionTypedIterative.js'

/**
 * Helper to assert two Float64Arrays are element-wise close within tolerance.
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [tol=1e-12]
 */
function assertVectorClose(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'Expected Float64Array result')
	assert.equal(actual.length, expected.length, 'Vector lengths must match')
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const scale = Math.max(1, Math.abs(expected[i]))
		assert.ok(
			diff <= tol * scale,
			`Mismatch at index ${i}: actual=${actual[i]}, expected=${expected[i]}, diff=${diff}`
		)
	}
}

/**
 * Helper dot product for independent verification.
 * @param {Float64Array} u
 * @param {Float64Array} v
 * @returns {number}
 */
function dot(u, v) {
	let sum = 0
	for (let i = 0; i < u.length; i++) {
		sum += u[i] * v[i]
	}
	return sum
}

/**
 * Helper vector subtraction u - v for independent verification.
 * @param {Float64Array} u
 * @param {Float64Array} v
 * @returns {Float64Array}
 */
function subtract(u, v) {
	const out = new Float64Array(u.length)
	for (let i = 0; i < u.length; i++) {
		out[i] = u[i] - v[i]
	}
	return out
}

describe('projectionTypedIterative', () => {
	describe('normal cases', () => {
		it('projects 2D vectors onto coordinate axes', () => {
			const a = new Float64Array([3, 4])
			const xAxis = new Float64Array([1, 0])
			const yAxis = new Float64Array([0, 5])

			assertVectorClose(projectionTypedIterative(a, xAxis), new Float64Array([3, 0]))
			assertVectorClose(projectionTypedIterative(a, yAxis), new Float64Array([0, 4]))
		})

		it('projects 2D vector onto diagonal vector', () => {
			const a = new Float64Array([3, 4])
			const b = new Float64Array([1, 1])

			assertVectorClose(projectionTypedIterative(a, b), new Float64Array([3.5, 3.5]))
		})

		it('projects general 3D vector accurately', () => {
			const a = new Float64Array([1, 2, 3])
			const b = new Float64Array([4, 5, 6])
			// a·b = 4 + 10 + 18 = 32, b·b = 16 + 25 + 36 = 77
			const expected = new Float64Array([
				(32 / 77) * 4,
				(32 / 77) * 5,
				(32 / 77) * 6,
			])

			assertVectorClose(projectionTypedIterative(a, b), expected)
		})

		it('handles negative components and obtuse angles', () => {
			const a = new Float64Array([-3, 2, -1])
			const b = new Float64Array([2, -1, 4])
			// a·b = -6 - 2 - 4 = -12, b·b = 4 + 1 + 16 = 21 => scalar = -4/7
			const expected = new Float64Array([-8 / 7, 4 / 7, -16 / 7])

			assertVectorClose(projectionTypedIterative(a, b), expected)
		})

		it('returns a new Float64Array and does not mutate input arrays', () => {
			const a = new Float64Array([1.5, -2.5, 3.5])
			const b = new Float64Array([2, 0, -1])
			const aCopy = new Float64Array(a)
			const bCopy = new Float64Array(b)

			const res = projectionTypedIterative(a, b)

			assert.ok(res instanceof Float64Array)
			assert.notEqual(res, a)
			assert.notEqual(res, b)
			assert.deepEqual(a, aCopy)
			assert.deepEqual(b, bCopy)
		})

		it('projects high-dimensional vectors (n = 128)', () => {
			const n = 128
			const a = new Float64Array(n)
			const b = new Float64Array(n)
			for (let i = 0; i < n; i++) {
				a[i] = Math.sin(i * 0.37) * 10
				b[i] = Math.cos(i * 0.23) * 5
			}
			const proj = projectionTypedIterative(a, b)
			assert.equal(proj.length, n)
			const residual = subtract(a, proj)
			assert.ok(Math.abs(dot(residual, b)) < 1e-10)
		})
	})

	describe('edge cases', () => {
		it('projects 1D vectors (returns a itself for any non-zero b)', () => {
			assertVectorClose(
				projectionTypedIterative(new Float64Array([7.25]), new Float64Array([-3.5])),
				new Float64Array([7.25])
			)
		})

		it('returns zero vector with no negative zeros when a is zero', () => {
			const a = new Float64Array([0, 0, 0])
			const b = new Float64Array([-1, 2, -3])
			const proj = projectionTypedIterative(a, b)

			assert.deepEqual(proj, new Float64Array([0, 0, 0]))
			for (let i = 0; i < proj.length; i++) {
				assert.ok(Object.is(proj[i], 0), `Expected +0 at index ${i}`)
			}
		})

		it('returns zero vector when a is orthogonal to b', () => {
			const a = new Float64Array([2, -3, 0])
			const b = new Float64Array([3, 2, 5])
			const proj = projectionTypedIterative(a, b)

			assert.deepEqual(proj, new Float64Array([0, 0, 0]))
		})

		it('returns a itself when a is parallel or anti-parallel to b', () => {
			const a = new Float64Array([6, -9, 12])
			const bParallel = new Float64Array([2, -3, 4])
			const bAntiParallel = new Float64Array([-4, 6, -8])

			assertVectorClose(projectionTypedIterative(a, bParallel), a)
			assertVectorClose(projectionTypedIterative(a, bAntiParallel), a)
		})

		it('is invariant to non-zero scaling of target vector b', () => {
			const a = new Float64Array([2.5, -1.25, 4.75, 0.5])
			const b = new Float64Array([1, 2, -3, 4])
			const bPos = new Float64Array(b.map((v) => v * 7.5))
			const bNeg = new Float64Array(b.map((v) => v * -0.25))

			const p1 = projectionTypedIterative(a, b)
			const p2 = projectionTypedIterative(a, bPos)
			const p3 = projectionTypedIterative(a, bNeg)

			assertVectorClose(p2, p1)
			assertVectorClose(p3, p1)
		})

		it('handles extreme vector magnitudes without underflow or overflow', () => {
			const aSmall = new Float64Array([3e-200, 4e-200])
			const bSmall = new Float64Array([1e-200, 1e-200])
			assertVectorClose(
				projectionTypedIterative(aSmall, bSmall),
				new Float64Array([3.5e-200, 3.5e-200])
			)

			const aLarge = new Float64Array([3e200, 4e200])
			const bLarge = new Float64Array([1e200, 1e200])
			assertVectorClose(
				projectionTypedIterative(aLarge, bLarge),
				new Float64Array([3.5e200, 3.5e200])
			)

			const aMixedLarge = new Float64Array([3e200, 4e200])
			const bMixedSmall = new Float64Array([1e-120, 0])
			assertVectorClose(
				projectionTypedIterative(aMixedLarge, bMixedSmall),
				new Float64Array([3e200, 0])
			)

			const aMixedSmall = new Float64Array([3e-200, 4e-200])
			const bMixedLarge = new Float64Array([1e140, 0])
			assertVectorClose(
				projectionTypedIterative(aMixedSmall, bMixedLarge),
				new Float64Array([3e-200, 0])
			)
		})
	})

	describe('input validation', () => {
		it('throws TypeError if a or b is not a Float64Array', () => {
			const valid = new Float64Array([1, 2])
			const invalidInputs = [
				[1, 2],
				new Float32Array([1, 2]),
				new Int32Array([1, 2]),
				null,
				undefined,
				42,
				'vector',
				{ 0: 1, 1: 2, length: 2 },
			]

			for (const bad of invalidInputs) {
				assert.throws(() => projectionTypedIterative(bad, valid), TypeError)
				assert.throws(() => projectionTypedIterative(valid, bad), TypeError)
			}
		})

		it('throws RangeError on length mismatch', () => {
			assert.throws(
				() => projectionTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
				RangeError
			)
		})

		it('throws RangeError on empty Float64Arrays', () => {
			assert.throws(
				() => projectionTypedIterative(new Float64Array(0), new Float64Array(0)),
				RangeError
			)
		})

		it('throws RangeError when target vector b is the zero vector', () => {
			assert.throws(
				() => projectionTypedIterative(new Float64Array([1, 2, 3]), new Float64Array([0, 0, 0])),
				RangeError
			)
			assert.throws(
				() => projectionTypedIterative(new Float64Array([1, 2]), new Float64Array([-0, 0])),
				RangeError
			)
		})

		it('throws RangeError on NaN or Infinity elements in a or b', () => {
			const valid = new Float64Array([1, 2])
			const nonFiniteValues = [NaN, Infinity, -Infinity]

			for (const val of nonFiniteValues) {
				assert.throws(
					() => projectionTypedIterative(new Float64Array([val, 1]), valid),
					RangeError
				)
				assert.throws(
					() => projectionTypedIterative(valid, new Float64Array([1, val])),
					RangeError
				)
			}
		})
	})

	describe('mathematical cross-checks', () => {
		const testPairs = [
			[new Float64Array([3, 4]), new Float64Array([5, -2])],
			[new Float64Array([1, -2, 3.5]), new Float64Array([-4, 0.5, 2])],
			[new Float64Array([7, -3, 2, 9, -1]), new Float64Array([1, 4, -2, 3, 5])],
			[new Float64Array([-0.5, 1.25, -3.75, 2.5]), new Float64Array([0.1, -0.2, 0.3, -0.4])],
		]

		it('residual (a - proj) is orthogonal to b', () => {
			for (const [a, b] of testPairs) {
				const proj = projectionTypedIterative(a, b)
				const residual = subtract(a, proj)
				const orthoDot = dot(residual, b)
				assert.ok(
					Math.abs(orthoDot) < 1e-12,
					`Expected residual · b ≈ 0, got ${orthoDot}`
				)
			}
		})

		it('is idempotent: proj(proj(a, b), b) == proj(a, b)', () => {
			for (const [a, b] of testPairs) {
				const proj1 = projectionTypedIterative(a, b)
				const proj2 = projectionTypedIterative(proj1, b)
				assertVectorClose(proj2, proj1)
			}
		})

		it('satisfies Pythagorean theorem: ||a||^2 == ||proj||^2 + ||a - proj||^2', () => {
			for (const [a, b] of testPairs) {
				const proj = projectionTypedIterative(a, b)
				const residual = subtract(a, proj)

				const normSqA = dot(a, a)
				const normSqProj = dot(proj, proj)
				const normSqRes = dot(residual, residual)

				assert.ok(
					Math.abs(normSqA - (normSqProj + normSqRes)) <= 1e-12 * Math.max(1, normSqA),
					`Pythagorean mismatch: ${normSqA} vs ${normSqProj + normSqRes}`
				)
			}
		})

		it('matches independent unit-vector computation (a · u) * u and outer-product matrix P * a', () => {
			for (const [a, b] of testPairs) {
				const n = a.length
				const proj = projectionTypedIterative(a, b)

				// Independent method 1: unit vector u = b / ||b||, proj = (a · u) * u
				const normB = Math.hypot(...b)
				const u = new Float64Array(n)
				for (let i = 0; i < n; i++) {
					u[i] = b[i] / normB
				}
				const coeff = dot(a, u)
				const viaUnit = new Float64Array(n)
				for (let i = 0; i < n; i++) {
					viaUnit[i] = coeff * u[i]
				}
				assertVectorClose(proj, viaUnit)

				// Independent method 2: rank-1 projection matrix P = (b b^T) / (b^T b), proj = P * a
				const denom = dot(b, b)
				const viaMatrix = new Float64Array(n)
				for (let i = 0; i < n; i++) {
					let rowSum = 0
					for (let j = 0; j < n; j++) {
						rowSum += ((b[i] * b[j]) / denom) * a[j]
					}
					viaMatrix[i] = rowSum
				}
				assertVectorClose(proj, viaMatrix)
			}
		})

		it('is linear in the first argument: proj(αa1 + βa2, b) == α proj(a1, b) + β proj(a2, b)', () => {
			const a1 = new Float64Array([2, -1, 4, 3])
			const a2 = new Float64Array([-5, 3, 1, -2])
			const b = new Float64Array([1, 2, -1, 3])
			const alpha = 2.5
			const beta = -1.75

			const combined = new Float64Array(a1.length)
			for (let i = 0; i < a1.length; i++) {
				combined[i] = alpha * a1[i] + beta * a2[i]
			}

			const lhs = projectionTypedIterative(combined, b)
			const p1 = projectionTypedIterative(a1, b)
			const p2 = projectionTypedIterative(a2, b)
			const rhs = new Float64Array(a1.length)
			for (let i = 0; i < a1.length; i++) {
				rhs[i] = alpha * p1[i] + beta * p2[i]
			}

			assertVectorClose(lhs, rhs)
		})
	})
})
