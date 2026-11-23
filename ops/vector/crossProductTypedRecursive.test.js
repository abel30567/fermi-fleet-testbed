import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductTypedRecursive } from './crossProductTypedRecursive.js'

/**
 * Helper to compute the 3D dot product at a packed vector offset.
 *
 * @param {Float64Array} u
 * @param {Float64Array} v
 * @param {number} [offset=0]
 * @returns {number}
 */
function dot3(u, v, offset = 0) {
	return (
		u[offset] * v[offset] +
		u[offset + 1] * v[offset + 1] +
		u[offset + 2] * v[offset + 2]
	)
}

/**
 * Helper to assert two Float64Arrays are equal within floating-point tolerance.
 *
 * @param {Float64Array} actual
 * @param {Float64Array} expected
 * @param {number} [eps=1e-12]
 */
function assertCloseArray(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < actual.length; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]}`,
		)
	}
}

describe('crossProductTypedRecursive', () => {
	test('computes standard right-handed basis vector cross products', () => {
		const i = new Float64Array([1, 0, 0])
		const j = new Float64Array([0, 1, 0])
		const k = new Float64Array([0, 0, 1])

		assert.deepEqual(crossProductTypedRecursive(i, j), k)
		assert.deepEqual(crossProductTypedRecursive(j, k), i)
		assert.deepEqual(crossProductTypedRecursive(k, i), j)

		assert.deepEqual(
			crossProductTypedRecursive(j, i),
			new Float64Array([0, 0, -1]),
		)
		assert.deepEqual(
			crossProductTypedRecursive(k, j),
			new Float64Array([-1, 0, 0]),
		)
		assert.deepEqual(
			crossProductTypedRecursive(i, k),
			new Float64Array([0, -1, 0]),
		)
	})

	test('computes cross product for arbitrary 3D vectors', () => {
		const a = new Float64Array([2, 3, 4])
		const b = new Float64Array([5, 6, 7])
		const result = crossProductTypedRecursive(a, b)

		assert.ok(result instanceof Float64Array)
		assert.deepEqual(result, new Float64Array([-3, 6, -3]))

		const c = new Float64Array([-1.5, 2.25, -3.5])
		const d = new Float64Array([4.0, -0.5, 2.0])
		// x = 2.25*2.0 - (-3.5)*(-0.5) = 4.5 - 1.75 = 2.75
		// y = (-3.5)*4.0 - (-1.5)*2.0 = -14.0 + 3.0 = -11.0
		// z = (-1.5)*(-0.5) - 2.25*4.0 = 0.75 - 9.0 = -8.25
		assert.deepEqual(
			crossProductTypedRecursive(c, d),
			new Float64Array([2.75, -11.0, -8.25]),
		)
	})

	test('handles packed arrays of multiple 3D vectors (even, odd, and large counts)', () => {
		// 5 packed vectors (length 15, odd count exercises uneven divide-and-conquer splits)
		const a = new Float64Array([
			1, 0, 0,
			0, 1, 0,
			0, 0, 1,
			2, 3, 4,
			-1, 2, -3,
		])
		const b = new Float64Array([
			0, 1, 0,
			0, 0, 1,
			1, 0, 0,
			5, 6, 7,
			4, -5, 6,
		])
		const expected = new Float64Array([
			0, 0, 1,
			1, 0, 0,
			0, 1, 0,
			-3, 6, -3,
			// (-1,2,-3) x (4,-5,6) = (12-15, -12+6, 5-8) = (-3, -6, -3)
			-3, -6, -3,
		])

		const result = crossProductTypedRecursive(a, b)
		assert.deepEqual(result, expected)

		// Large batch (10,000 vectors = 30,000 floats) to verify O(log N) recursion depth
		const count = 10_000
		const largeA = new Float64Array(count * 3)
		const largeB = new Float64Array(count * 3)
		for (let idx = 0; idx < count; idx++) {
			const off = idx * 3
			largeA[off] = (idx % 7) - 3
			largeA[off + 1] = ((idx * 3) % 11) - 5
			largeA[off + 2] = ((idx * 5) % 13) - 6
			largeB[off] = ((idx * 2) % 9) - 4
			largeB[off + 1] = ((idx * 4) % 7) - 3
			largeB[off + 2] = ((idx * 6) % 5) - 2
		}

		const largeOut = crossProductTypedRecursive(largeA, largeB)
		assert.equal(largeOut.length, count * 3)
		for (let idx = 0; idx < count; idx++) {
			const off = idx * 3
			const ax = largeA[off]
			const ay = largeA[off + 1]
			const az = largeA[off + 2]
			const bx = largeB[off]
			const by = largeB[off + 1]
			const bz = largeB[off + 2]
			assert.equal(largeOut[off], ay * bz - az * by || 0)
			assert.equal(largeOut[off + 1], az * bx - ax * bz || 0)
			assert.equal(largeOut[off + 2], ax * by - ay * bx || 0)
		}
	})

	test('does not mutate inputs and supports Float64Array subarray views', () => {
		const bufA = new Float64Array([99, 1, 2, 3, 4, 5, 6, -99])
		const bufB = new Float64Array([88, 4, 5, 6, 7, 8, 9, -88])
		const subA = bufA.subarray(1, 7)
		const subB = bufB.subarray(1, 7)
		const snapA = new Float64Array(subA)
		const snapB = new Float64Array(subB)

		const out = crossProductTypedRecursive(subA, subB)
		assert.deepEqual(out, new Float64Array([-3, 6, -3, -3, 6, -3]))
		assert.deepEqual(subA, snapA)
		assert.deepEqual(subB, snapB)
		assert.notEqual(out, subA)
		assert.notEqual(out, subB)
	})

	test('handles zero, parallel, and anti-parallel vectors without negative zero', () => {
		const zero = new Float64Array([0, 0, 0])
		const negZero = new Float64Array([-0, -0, -0])
		const v = new Float64Array([-3.5, 7.25, -1.5])
		const scaled = new Float64Array([-7.0, 14.5, -3.0])
		const negated = new Float64Array([3.5, -7.25, 1.5])

		for (const res of [
			crossProductTypedRecursive(zero, v),
			crossProductTypedRecursive(v, zero),
			crossProductTypedRecursive(negZero, v),
			crossProductTypedRecursive(v, v),
			crossProductTypedRecursive(v, scaled),
			crossProductTypedRecursive(v, negated),
		]) {
			assert.deepEqual(res, new Float64Array([0, 0, 0]))
			for (let idx = 0; idx < 3; idx++) {
				assert.ok(Object.is(res[idx], 0), `expected +0 at index ${idx}`)
			}
		}
	})

	test('rejects non-Float64Array inputs with TypeError', () => {
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
			assert.throws(() => crossProductTypedRecursive(bad, valid), TypeError)
			assert.throws(() => crossProductTypedRecursive(valid, bad), TypeError)
		}
	})

	test('rejects invalid and mismatched lengths with RangeError', () => {
		for (const len of [0, 1, 2, 4, 5, 7, 8]) {
			const a = new Float64Array(len)
			const b = new Float64Array(len)
			assert.throws(() => crossProductTypedRecursive(a, b), RangeError)
		}

		assert.throws(
			() =>
				crossProductTypedRecursive(
					new Float64Array([1, 2, 3]),
					new Float64Array([1, 2, 3, 4, 5, 6]),
				),
			RangeError,
		)
	})

	test('rejects non-finite elements (NaN, Infinity, -Infinity) with RangeError', () => {
		const valid = new Float64Array([1, 2, 3])
		for (const badVal of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			for (let pos = 0; pos < 3; pos++) {
				const bad = new Float64Array([1, 2, 3])
				bad[pos] = badVal
				assert.throws(() => crossProductTypedRecursive(bad, valid), RangeError)
				assert.throws(() => crossProductTypedRecursive(valid, bad), RangeError)
			}
		}

		// Non-finite element buried in a packed multi-vector batch
		const batchA = new Float64Array([1, 2, 3, 4, 5, 6, 7, Number.NaN, 9])
		const batchB = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1])
		assert.throws(() => crossProductTypedRecursive(batchA, batchB), RangeError)
	})

	test('satisfies orthogonality, anti-commutativity, Lagrange, Jacobi, and bilinearity identities', () => {
		const a = new Float64Array([
			1.25, -3.5, 2.75,
			-4.2, 0.8, 5.1,
			7.3, 2.1, -6.4,
			0.15, -0.85, 0.45,
		])
		const b = new Float64Array([
			-2.1, 4.3, -1.7,
			3.3, -2.9, 1.4,
			-1.8, 5.5, 2.2,
			-0.65, 0.35, 0.95,
		])
		const c = new Float64Array([
			3.1, 1.4, -2.6,
			-0.9, 4.7, -3.2,
			2.4, -3.8, 1.1,
			0.75, 0.25, -0.55,
		])

		const axb = crossProductTypedRecursive(a, b)
		const bxa = crossProductTypedRecursive(b, a)

		for (let vec = 0; vec < a.length / 3; vec++) {
			const off = vec * 3

			// 1. Orthogonality: (a × b) · a === 0 and (a × b) · b === 0
			assert.ok(Math.abs(dot3(axb, a, off)) < 1e-11)
			assert.ok(Math.abs(dot3(axb, b, off)) < 1e-11)

			// 2. Anti-commutativity: a × b === -(b × a)
			for (let axis = 0; axis < 3; axis++) {
				assert.ok(
					Math.abs(axb[off + axis] + bxa[off + axis]) < 1e-12,
				)
			}

			// 3. Lagrange's identity: |a × b|^2 === |a|^2 |b|^2 - (a · b)^2
			const lhs = dot3(axb, axb, off)
			const aSq = dot3(a, a, off)
			const bSq = dot3(b, b, off)
			const ab = dot3(a, b, off)
			const rhs = aSq * bSq - ab * ab
			assert.ok(
				Math.abs(lhs - rhs) <= 1e-10 * Math.max(1, Math.abs(rhs)),
				`Lagrange failed at vector ${vec}: lhs=${lhs}, rhs=${rhs}`,
			)
		}

		// 4. Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) === 0
		const t1 = crossProductTypedRecursive(a, crossProductTypedRecursive(b, c))
		const t2 = crossProductTypedRecursive(b, crossProductTypedRecursive(c, a))
		const t3 = crossProductTypedRecursive(c, crossProductTypedRecursive(a, b))
		const jacobiSum = new Float64Array(a.length)
		for (let idx = 0; idx < a.length; idx++) {
			jacobiSum[idx] = t1[idx] + t2[idx] + t3[idx]
		}
		assertCloseArray(jacobiSum, new Float64Array(a.length), 1e-10)

		// 5. Bilinearity: a × (b + c) === (a × b) + (a × c)
		const bPlusC = new Float64Array(b.length)
		for (let idx = 0; idx < b.length; idx++) {
			bPlusC[idx] = b[idx] + c[idx]
		}
		const lhsDist = crossProductTypedRecursive(a, bPlusC)
		const axc = crossProductTypedRecursive(a, c)
		const rhsDist = new Float64Array(a.length)
		for (let idx = 0; idx < a.length; idx++) {
			rhsDist[idx] = axb[idx] + axc[idx]
		}
		assertCloseArray(lhsDist, rhsDist, 1e-11)
	})
})
