import { describe, it } from 'node:test'
import assert from 'node:assert'
import { projectionFloatRecursive } from './projectionFloatRecursive.js'

function assertVecClose(actual, expected, tol = 1e-12) {
	assert.strictEqual(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const scale = Math.max(1, Math.abs(expected[i]))
		assert.ok(
			diff <= tol * scale,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`
		)
	}
}

function dotIterative(a, b) {
	let sum = 0
	for (let i = 0; i < a.length; i++) {
		sum += a[i] * b[i]
	}
	return sum
}

function projectionIterativeRef(u, v) {
	const scalar = dotIterative(u, v) / dotIterative(v, v)
	return v.map((x) => {
		const val = scalar * x
		return val === 0 ? 0 : val
	})
}

describe('projectionFloatRecursive', () => {
	describe('normal cases', () => {
		it('projects 1D vectors', () => {
			assert.deepStrictEqual(projectionFloatRecursive([5], [2]), [5])
			assert.deepStrictEqual(projectionFloatRecursive([-3.5], [4]), [-3.5])
		})

		it('projects 2D vectors onto axes and diagonals', () => {
			assert.deepStrictEqual(projectionFloatRecursive([3, 4], [1, 0]), [3, 0])
			assert.deepStrictEqual(projectionFloatRecursive([3, 4], [0, 2]), [0, 4])
			assertVecClose(projectionFloatRecursive([2, 3], [1, 1]), [2.5, 2.5])
		})

		it('projects 3D vectors with float64 values', () => {
			// u·v = 0 + 6 + 12 = 18, v·v = 0 + 9 + 16 = 25, scalar = 0.72
			assertVecClose(
				projectionFloatRecursive([1, 2, 3], [0, 3, 4]),
				[0, 2.16, 2.88]
			)
		})

		it('handles odd and even higher-dimensional vectors without mutating inputs', () => {
			const u = [1, -2, 3, -4, 5, -6, 7]
			const v = [2, 1, 0, -1, 2, 1, -2]
			const uCopy = [...u]
			const vCopy = [...v]

			const result = projectionFloatRecursive(u, v)
			const expected = projectionIterativeRef(u, v)
			assertVecClose(result, expected)
			assert.deepStrictEqual(u, uCopy)
			assert.deepStrictEqual(v, vCopy)
		})
	})

	describe('edge cases', () => {
		it('returns zero vector for orthogonal vectors', () => {
			assert.deepStrictEqual(projectionFloatRecursive([1, 0], [0, -1]), [0, 0])
			assert.deepStrictEqual(
				projectionFloatRecursive([1, -1, 0], [1, 1, -5]),
				[0, 0, 0]
			)
		})

		it('returns u for parallel and antiparallel vectors', () => {
			assertVecClose(projectionFloatRecursive([6, 8], [3, 4]), [6, 8])
			assertVecClose(projectionFloatRecursive([-6, -8], [3, 4]), [-6, -8])
			assertVecClose(
				projectionFloatRecursive([1.5, -3, 4.5], [-0.5, 1, -1.5]),
				[1.5, -3, 4.5]
			)
		})

		it('returns zero vector when u is the zero vector', () => {
			assert.deepStrictEqual(
				projectionFloatRecursive([0, 0, 0], [1, -2, 3]),
				[0, 0, 0]
			)
		})

		it('is invariant under non-zero scaling of target vector v', () => {
			const u = [4.2, -1.7, 3.3, 0.8]
			const v = [1.5, 2.5, -0.5, 3.0]
			const base = projectionFloatRecursive(u, v)
			const scaledPos = projectionFloatRecursive(
				u,
				v.map((x) => x * 7.5)
			)
			const scaledNeg = projectionFloatRecursive(
				u,
				v.map((x) => x * -0.25)
			)
			assertVecClose(scaledPos, base)
			assertVecClose(scaledNeg, base)
		})

		it('handles extreme float64 magnitudes without overflow or underflow', () => {
			assertVecClose(
				projectionFloatRecursive([3e200, 4e200], [1e200, 0]),
				[3e200, 0]
			)
			assertVecClose(
				projectionFloatRecursive([3e-200, 4e-200], [1e-200, 0]),
				[3e-200, 0]
			)
		})
	})

	describe('input validation', () => {
		it('throws RangeError on zero target vector v', () => {
			assert.throws(
				() => projectionFloatRecursive([1], [0]),
				RangeError
			)
			assert.throws(
				() => projectionFloatRecursive([1, 2, 3], [0, -0, 0]),
				RangeError
			)
		})

		it('throws RangeError on empty vectors or mismatched lengths', () => {
			assert.throws(() => projectionFloatRecursive([], []), RangeError)
			assert.throws(() => projectionFloatRecursive([1, 2], [1, 2, 3]), RangeError)
			assert.throws(() => projectionFloatRecursive([1, 2, 3], [1]), RangeError)
		})

		it('throws TypeError on non-array inputs', () => {
			assert.throws(() => projectionFloatRecursive(null, [1]), TypeError)
			assert.throws(() => projectionFloatRecursive([1], undefined), TypeError)
			assert.throws(() => projectionFloatRecursive('12', [1, 2]), TypeError)
			assert.throws(
				() => projectionFloatRecursive(new Float64Array([1, 2]), [1, 2]),
				TypeError
			)
		})

		it('throws TypeError on non-number elements or sparse arrays', () => {
			assert.throws(() => projectionFloatRecursive(['1', 2], [1, 2]), TypeError)
			assert.throws(() => projectionFloatRecursive([1, 2], [1, null]), TypeError)
			// eslint-disable-next-line no-sparse-arrays
			const sparse = [1, , 3]
			assert.throws(() => projectionFloatRecursive(sparse, [1, 2, 3]), TypeError)
		})

		it('throws RangeError on NaN or Infinity elements', () => {
			assert.throws(() => projectionFloatRecursive([NaN, 1], [1, 2]), RangeError)
			assert.throws(
				() => projectionFloatRecursive([1, Infinity], [1, 2]),
				RangeError
			)
			assert.throws(
				() => projectionFloatRecursive([1, 2], [1, -Infinity]),
				RangeError
			)
		})
	})

	describe('mathematical cross-checks', () => {
		// Deterministic LCG for reproducible pseudo-random vectors
		function makePrng(seed) {
			let state = seed >>> 0
			return () => {
				state = (Math.imul(1664525, state) + 1013904223) >>> 0
				return (state / 0xffffffff) * 20 - 10
			}
		}

		it('matches independent iterative reference across dimensions', () => {
			const rand = makePrng(42)
			for (const dim of [1, 2, 3, 7, 16, 63, 128]) {
				const u = Array.from({ length: dim }, () => rand())
				const v = Array.from({ length: dim }, () => rand())
				const actual = projectionFloatRecursive(u, v)
				const expected = projectionIterativeRef(u, v)
				assertVecClose(actual, expected, 1e-11)
			}
		})

		it('satisfies residual orthogonality, idempotence, and Pythagorean identity', () => {
			const rand = makePrng(1337)
			for (const dim of [2, 5, 19, 64]) {
				const u = Array.from({ length: dim }, () => rand())
				const v = Array.from({ length: dim }, () => rand())

				const proj = projectionFloatRecursive(u, v)
				const residual = u.map((ui, i) => ui - proj[i])

				// Residual (u - proj_v(u)) must be orthogonal to v
				const residualDotV = dotIterative(residual, v)
				const normScale =
					Math.sqrt(dotIterative(u, u)) * Math.sqrt(dotIterative(v, v))
				assert.ok(
					Math.abs(residualDotV) <= 1e-11 * normScale,
					`residual not orthogonal to v for dim=${dim}: dot=${residualDotV}`
				)

				// Idempotence: proj_v(proj_v(u)) == proj_v(u)
				const projTwice = projectionFloatRecursive(proj, v)
				assertVecClose(projTwice, proj, 1e-11)

				// Pythagorean theorem: ||u||^2 == ||proj||^2 + ||residual||^2
				const normU2 = dotIterative(u, u)
				const normProj2 = dotIterative(proj, proj)
				const normRes2 = dotIterative(residual, residual)
				assert.ok(
					Math.abs(normU2 - (normProj2 + normRes2)) <= 1e-11 * normU2,
					`Pythagorean check failed for dim=${dim}`
				)
			}
		})

		it('satisfies linearity in u: proj_v(a*u1 + b*u2) == a*proj_v(u1) + b*proj_v(u2)', () => {
			const rand = makePrng(999)
			const dim = 15
			const u1 = Array.from({ length: dim }, () => rand())
			const u2 = Array.from({ length: dim }, () => rand())
			const v = Array.from({ length: dim }, () => rand())
			const a = 2.75
			const b = -1.25

			const combined = u1.map((x, i) => a * x + b * u2[i])
			const lhs = projectionFloatRecursive(combined, v)
			const p1 = projectionFloatRecursive(u1, v)
			const p2 = projectionFloatRecursive(u2, v)
			const rhs = p1.map((x, i) => a * x + b * p2[i])

			assertVecClose(lhs, rhs, 1e-11)
		})
	})
})
