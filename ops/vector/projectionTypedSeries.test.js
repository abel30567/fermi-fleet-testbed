import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { projectionTypedSeries } from './projectionTypedSeries.js'

function assertArrayClose(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${Math.abs(actual[i] - expected[i])})`,
		)
	}
}

function dotSlice(a, b, offset, dim) {
	let sum = 0
	for (let i = 0; i < dim; i++) {
		sum += a[offset + i] * b[offset + i]
	}
	return sum
}

describe('projectionTypedSeries', () => {
	test('projects a single 2D vector with default dim', () => {
		const u = new Float64Array([1, 2])
		const v = new Float64Array([3, 4])
		// (u · v) / (v · v) = 11 / 25 = 0.44 => [1.32, 1.76]
		const result = projectionTypedSeries(u, v)
		assertArrayClose(result, [1.32, 1.76])
		// Does not mutate inputs
		assert.deepEqual(Array.from(u), [1, 2])
		assert.deepEqual(Array.from(v), [3, 4])
	})

	test('projects a single 3D vector onto an arbitrary vector', () => {
		const u = new Float64Array([2, -1, 3])
		const v = new Float64Array([1, 2, 2])
		// u · v = 2 - 2 + 6 = 6, v · v = 9, scale = 2/3 => [2/3, 4/3, 4/3]
		const result = projectionTypedSeries(u, v)
		assertArrayClose(result, [2 / 3, 4 / 3, 4 / 3])
	})

	test('handles 1D vectors', () => {
		const u = new Float64Array([5, -3, 0])
		const v = new Float64Array([2, 7, -4])
		const result = projectionTypedSeries(u, v, 1)
		assertArrayClose(result, [5, -3, 0])
	})

	test('returns empty Float64Array for empty inputs', () => {
		const empty = new Float64Array(0)
		const r1 = projectionTypedSeries(empty, empty)
		assert.ok(r1 instanceof Float64Array)
		assert.equal(r1.length, 0)

		const r2 = projectionTypedSeries(empty, empty, 3)
		assert.ok(r2 instanceof Float64Array)
		assert.equal(r2.length, 0)
	})

	test('orthogonal vectors project to the zero vector (without -0)', () => {
		const u = new Float64Array([1, 0, -2])
		const v = new Float64Array([2, 5, 1])
		const result = projectionTypedSeries(u, v)
		assertArrayClose(result, [0, 0, 0])
		for (let i = 0; i < result.length; i++) {
			assert.ok(Object.is(result[i], 0), `expected +0 at index ${i}`)
		}
	})

	test('parallel and anti-parallel vectors project back to u', () => {
		const u = new Float64Array([3, -6, 9])
		const vParallel = new Float64Array([1, -2, 3])
		const vAntiParallel = new Float64Array([-2, 4, -6])

		assertArrayClose(projectionTypedSeries(u, vParallel), [3, -6, 9])
		assertArrayClose(projectionTypedSeries(u, vAntiParallel), [3, -6, 9])
	})

	test('zero source vector projects to zero vector', () => {
		const u = new Float64Array([0, 0, 0])
		const v = new Float64Array([-3, 4, -5])
		const result = projectionTypedSeries(u, v)
		assertArrayClose(result, [0, 0, 0])
		for (let i = 0; i < result.length; i++) {
			assert.ok(Object.is(result[i], 0))
		}
	})

	test('projects a packed series of multiple vectors with explicit dim', () => {
		// 3 vectors of dim 3:
		// 0: [1, 2, 3] onto [1, 0, 0] => [1, 0, 0]
		// 1: [4, 5, 6] onto [0, 2, 0] => [0, 5, 0]
		// 2: [2, -1, 3] onto [1, 2, 2] => [2/3, 4/3, 4/3]
		const u = new Float64Array([1, 2, 3, 4, 5, 6, 2, -1, 3])
		const v = new Float64Array([1, 0, 0, 0, 2, 0, 1, 2, 2])
		const result = projectionTypedSeries(u, v, 3)
		assertArrayClose(result, [1, 0, 0, 0, 5, 0, 2 / 3, 4 / 3, 4 / 3])
	})

	test('handles extreme target magnitudes without overflow or underflow', () => {
		const u = new Float64Array([3, 4])
		const vLarge = new Float64Array([1e200, 0])
		const vSmall = new Float64Array([1e-200, 0])

		assertArrayClose(projectionTypedSeries(u, vLarge), [3, 0])
		assertArrayClose(projectionTypedSeries(u, vSmall), [3, 0])
	})

	test('cross-checks geometric invariants across a packed series', () => {
		const dim = 4
		const u = new Float64Array([
			1.5, -2.25, 3.75, 0.5,
			-4.0, 1.0, 2.0, -3.5,
			0.25, 7.5, -1.25, 4.0,
		])
		const v = new Float64Array([
			2.0, 1.0, -1.5, 3.0,
			-0.5, 4.0, 1.5, 2.0,
			3.0, -2.0, 5.0, -1.0,
		])

		const proj = projectionTypedSeries(u, v, dim)
		const projTwice = projectionTypedSeries(proj, v, dim)

		// 1. Idempotency: proj_v(proj_v(u)) === proj_v(u)
		assertArrayClose(projTwice, proj, 1e-11)

		for (let offset = 0; offset < u.length; offset += dim) {
			const rej = new Float64Array(dim)
			for (let j = 0; j < dim; j++) {
				rej[j] = u[offset + j] - proj[offset + j]
			}

			// 2. Orthogonality of rejection: (u - proj_v(u)) · v === 0
			const rejDotV = dotSlice(rej, v.subarray(offset, offset + dim), 0, dim)
			assert.ok(
				Math.abs(rejDotV) <= 1e-11,
				`rejection not orthogonal to v at offset ${offset}: dot = ${rejDotV}`,
			)

			// 3. Pythagorean theorem: ||u||^2 === ||proj||^2 + ||u - proj||^2
			const normU2 = dotSlice(u, u, offset, dim)
			const normProj2 = dotSlice(proj, proj, offset, dim)
			const normRej2 = dotSlice(rej, rej, 0, dim)
			assert.ok(
				Math.abs(normU2 - (normProj2 + normRej2)) <= 1e-11,
				`Pythagorean check failed at offset ${offset}: ${normU2} vs ${normProj2 + normRej2}`,
			)
		}
	})

	test('rejects zero target vector with RangeError', () => {
		assert.throws(
			() => projectionTypedSeries(new Float64Array([1, 2, 3]), new Float64Array([0, 0, 0])),
			RangeError,
		)

		// Zero vector in second slot of a batched series
		assert.throws(
			() =>
				projectionTypedSeries(
					new Float64Array([1, 2, 3, 4]),
					new Float64Array([1, 0, 0, 0]),
					2,
				),
			RangeError,
		)
	})

	test('validates input types, lengths, and dim', () => {
		const valid = new Float64Array([1, 2])

		// Non-Float64Array inputs
		assert.throws(() => projectionTypedSeries([1, 2], valid), TypeError)
		assert.throws(() => projectionTypedSeries(valid, [1, 2]), TypeError)
		assert.throws(() => projectionTypedSeries(new Float32Array([1, 2]), valid), TypeError)
		assert.throws(() => projectionTypedSeries(valid, new Int32Array([1, 2])), TypeError)
		assert.throws(() => projectionTypedSeries(null, valid), TypeError)
		assert.throws(() => projectionTypedSeries(valid, undefined), TypeError)

		// Mismatched lengths
		assert.throws(
			() => projectionTypedSeries(new Float64Array([1, 2, 3]), new Float64Array([1, 2])),
			RangeError,
		)

		// Invalid dim
		assert.throws(() => projectionTypedSeries(valid, valid, '2'), TypeError)
		assert.throws(() => projectionTypedSeries(valid, valid, null), TypeError)
		assert.throws(() => projectionTypedSeries(valid, valid, 0), RangeError)
		assert.throws(() => projectionTypedSeries(valid, valid, -2), RangeError)
		assert.throws(() => projectionTypedSeries(valid, valid, 1.5), RangeError)
		assert.throws(() => projectionTypedSeries(valid, valid, Number.NaN), RangeError)
		assert.throws(() => projectionTypedSeries(valid, valid, Number.POSITIVE_INFINITY), RangeError)
		assert.throws(() => projectionTypedSeries(new Float64Array(0), new Float64Array(0), 0), RangeError)

		// Length not divisible by dim
		assert.throws(
			() =>
				projectionTypedSeries(
					new Float64Array([1, 2, 3, 4, 5]),
					new Float64Array([1, 1, 1, 1, 1]),
					2,
				),
			RangeError,
		)
	})
})
