import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { projectionTypedIterative } from './projectionTypedIterative.js'

function assertVecClose(actual, expected, tol = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length, 'vector lengths must match')
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		const scale = Math.max(1, Math.abs(expected[i]))
		assert.ok(
			diff <= tol * scale,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff=${diff})`,
		)
	}
}

function dot(u, v) {
	let sum = 0
	for (let i = 0; i < u.length; i++) {
		sum += u[i] * v[i]
	}
	return sum
}

/**
 * Independent reference implementation via unit vector normalization:
 *   u = b / ||b||, proj_b(a) = (a · u) * u
 */
function referenceProjectionViaUnitVector(a, b) {
	const normB = Math.hypot(...b)
	const unitB = Array.from(b, (x) => x / normB)
	const scalarProj = Array.from(a).reduce((acc, ai, i) => acc + ai * unitB[i], 0)
	return new Float64Array(unitB.map((ui) => scalarProj * ui))
}

describe('projectionTypedIterative', () => {
	it('projects 2D vector onto coordinate axis', () => {
		const a = new Float64Array([3, 4])
		const b = new Float64Array([1, 0])
		const res = projectionTypedIterative(a, b)
		assertVecClose(res, new Float64Array([3, 0]))
	})

	it('projects 3D vector onto diagonal vector', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([1, 1, 1])
		const res = projectionTypedIterative(a, b)
		assertVecClose(res, new Float64Array([2, 2, 2]))
	})

	it('returns zero vector for orthogonal inputs without negative zero', () => {
		const a = new Float64Array([1, -2, 1])
		const b = new Float64Array([2, 1, 0])
		const res = projectionTypedIterative(a, b)
		assertVecClose(res, new Float64Array([0, 0, 0]))
		for (let i = 0; i < res.length; i++) {
			assert.ok(!Object.is(res[i], -0), `index ${i} should not be -0`)
		}
	})

	it('preserves parallel and antiparallel vectors', () => {
		const a = new Float64Array([4, -6, 2])
		const parallel = new Float64Array([2, -3, 1])
		const antiparallel = new Float64Array([-8, 12, -4])
		assertVecClose(projectionTypedIterative(a, parallel), a)
		assertVecClose(projectionTypedIterative(a, antiparallel), a)
	})

	it('handles 1D vectors and zero source vector', () => {
		assertVecClose(
			projectionTypedIterative(new Float64Array([5]), new Float64Array([-2])),
			new Float64Array([5]),
		)
		const zeroRes = projectionTypedIterative(
			new Float64Array([0, 0, 0]),
			new Float64Array([-3, 4, -5]),
		)
		assertVecClose(zeroRes, new Float64Array([0, 0, 0]))
		for (let i = 0; i < zeroRes.length; i++) {
			assert.ok(!Object.is(zeroRes[i], -0), `index ${i} should not be -0`)
		}
	})

	it('does not mutate input arrays and supports aliased inputs (a === b)', () => {
		const a = new Float64Array([2.5, -1.5, 4.0])
		const b = new Float64Array([0.5, 2.0, -1.0])
		const aCopy = new Float64Array(a)
		const bCopy = new Float64Array(b)

		const res = projectionTypedIterative(a, b)
		assert.deepEqual(a, aCopy)
		assert.deepEqual(b, bCopy)
		assert.notEqual(res, a)
		assert.notEqual(res, b)

		const selfProj = projectionTypedIterative(a, a)
		assert.notEqual(selfProj, a)
		assertVecClose(selfProj, a)
	})

	it('validates argument types strictly', () => {
		const valid = new Float64Array([1, 2])
		for (const bad of [[1, 2], new Float32Array([1, 2]), new Int32Array([1, 2]), null, undefined, 42, '12', {}]) {
			assert.throws(() => projectionTypedIterative(bad, valid), TypeError)
			assert.throws(() => projectionTypedIterative(valid, bad), TypeError)
		}
	})

	it('throws RangeError on length mismatch, empty vectors, zero target, non-finite values, or overflow', () => {
		assert.throws(
			() => projectionTypedIterative(new Float64Array([1, 2]), new Float64Array([1, 2, 3])),
			RangeError,
		)
		assert.throws(
			() => projectionTypedIterative(new Float64Array([]), new Float64Array([])),
			RangeError,
		)
		assert.throws(
			() => projectionTypedIterative(new Float64Array([1, 2]), new Float64Array([0, 0])),
			RangeError,
		)
		assert.throws(
			() => projectionTypedIterative(new Float64Array([NaN, 1]), new Float64Array([1, 2])),
			RangeError,
		)
		assert.throws(
			() => projectionTypedIterative(new Float64Array([1, Infinity]), new Float64Array([1, 2])),
			RangeError,
		)
		assert.throws(
			() => projectionTypedIterative(new Float64Array([1, 2]), new Float64Array([1, -Infinity])),
			RangeError,
		)
		assert.throws(
			() => projectionTypedIterative(new Float64Array([1e200, 1]), new Float64Array([1e200, 1])),
			RangeError,
		)
	})

	it('matches independent unit-vector reference and satisfies geometric invariants', () => {
		// Deterministic PRNG (LCG) for reproducible cross-checking across dimensions
		let state = 123456789
		const nextFloat = () => {
			state = (Math.imul(1664525, state) + 1013904223) >>> 0
			return (state / 0xffffffff) * 20 - 10
		}

		for (const dim of [2, 3, 5, 16, 128]) {
			const a = new Float64Array(dim)
			const a2 = new Float64Array(dim)
			const b = new Float64Array(dim)
			for (let i = 0; i < dim; i++) {
				a[i] = nextFloat()
				a2[i] = nextFloat()
				b[i] = nextFloat()
			}
			// Guarantee b is non-zero
			b[0] += 1.5

			const proj = projectionTypedIterative(a, b)
			const ref = referenceProjectionViaUnitVector(a, b)
			assertVecClose(proj, ref, 1e-11)

			// 1. Residual (a - proj) is orthogonal to b
			const residual = new Float64Array(dim)
			for (let i = 0; i < dim; i++) {
				residual[i] = a[i] - proj[i]
			}
			const residualDotB = dot(residual, b)
			const scale = Math.sqrt(dot(a, a) * dot(b, b))
			assert.ok(Math.abs(residualDotB) <= 1e-11 * scale, `residual not orthogonal: ${residualDotB}`)

			// 2. Pythagorean identity: ||proj||^2 + ||residual||^2 == ||a||^2
			const normASq = dot(a, a)
			const pythag = dot(proj, proj) + dot(residual, residual)
			assert.ok(Math.abs(pythag - normASq) <= 1e-11 * Math.max(1, normASq))

			// 3. Idempotence: proj_b(proj_b(a)) == proj_b(a)
			const projTwice = projectionTypedIterative(proj, b)
			assertVecClose(projTwice, proj, 1e-11)

			// 4. Scale invariance in b: proj_{k*b}(a) == proj_b(a)
			const scaledB = new Float64Array(dim)
			for (let i = 0; i < dim; i++) {
				scaledB[i] = -3.7 * b[i]
			}
			assertVecClose(projectionTypedIterative(a, scaledB), proj, 1e-11)

			// 5. Linearity in a: proj_b(c1*a + c2*a2) == c1*proj_b(a) + c2*proj_b(a2)
			const c1 = 2.25
			const c2 = -1.75
			const combinedA = new Float64Array(dim)
			for (let i = 0; i < dim; i++) {
				combinedA[i] = c1 * a[i] + c2 * a2[i]
			}
			const projA2 = projectionTypedIterative(a2, b)
			const expectedLinear = new Float64Array(dim)
			for (let i = 0; i < dim; i++) {
				expectedLinear[i] = c1 * proj[i] + c2 * projA2[i]
			}
			assertVecClose(projectionTypedIterative(combinedA, b), expectedLinear, 1e-11)
		}
	})
})
