import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductFloatRecursive } from './crossProductFloatRecursive.js'

const EPSILON = 1e-12

function dot(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

function normSq(v) {
	return dot(v, v)
}

function assertVecClose(actual, expected, tol = EPSILON) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= tol,
			`component ${i}: expected ${actual[i]} to be within ${tol} of ${expected[i]}`
		)
	}
}

describe('crossProductFloatRecursive', () => {
	test('right-handed orthonormal basis vectors', () => {
		const i = [1, 0, 0]
		const j = [0, 1, 0]
		const k = [0, 0, 1]

		assert.deepStrictEqual(crossProductFloatRecursive(i, j), [0, 0, 1])
		assert.deepStrictEqual(crossProductFloatRecursive(j, k), [1, 0, 0])
		assert.deepStrictEqual(crossProductFloatRecursive(k, i), [0, 1, 0])

		assert.deepStrictEqual(crossProductFloatRecursive(j, i), [0, 0, -1])
		assert.deepStrictEqual(crossProductFloatRecursive(k, j), [-1, 0, 0])
		assert.deepStrictEqual(crossProductFloatRecursive(i, k), [0, -1, 0])
	})

	test('arbitrary integer and floating-point vectors', () => {
		assert.deepStrictEqual(
			crossProductFloatRecursive([2, 3, 4], [5, 6, 7]),
			[-3, 6, -3]
		)
		assert.deepStrictEqual(
			crossProductFloatRecursive([3, -3, 1], [4, 9, 2]),
			[-15, -2, 39]
		)
		assertVecClose(
			crossProductFloatRecursive([1.5, -2.25, 3.75], [-0.5, 4.125, -1.25]),
			[
				-2.25 * -1.25 - 3.75 * 4.125,
				3.75 * -0.5 - 1.5 * -1.25,
				1.5 * 4.125 - -2.25 * -0.5,
			]
		)
	})

	test('zero vector edge cases and no negative zero', () => {
		const zero = [0, 0, 0]
		const v = [1.25, -3.5, 7.75]

		assert.deepStrictEqual(crossProductFloatRecursive(zero, v), [0, 0, 0])
		assert.deepStrictEqual(crossProductFloatRecursive(v, zero), [0, 0, 0])
		assert.deepStrictEqual(crossProductFloatRecursive(zero, zero), [0, 0, 0])
		assert.deepStrictEqual(
			crossProductFloatRecursive([1, 0, 0], [-1, 0, 0]),
			[0, 0, 0]
		)
	})

	test('parallel and anti-parallel vectors produce zero vector', () => {
		const v = [1.5, -2.5, 4.0]
		assertVecClose(crossProductFloatRecursive(v, v), [0, 0, 0])
		assertVecClose(
			crossProductFloatRecursive(v, [v[0] * 3.5, v[1] * 3.5, v[2] * 3.5]),
			[0, 0, 0]
		)
		assertVecClose(
			crossProductFloatRecursive(v, [-v[0], -v[1], -v[2]]),
			[0, 0, 0]
		)
	})

	test('anti-commutativity: a × b = -(b × a)', () => {
		const pairs = [
			[
				[1.2, -3.4, 5.6],
				[-7.8, 9.1, -2.3],
			],
			[
				[0.1, 0.2, 0.3],
				[0.4, -0.5, 0.6],
			],
			[
				[1e6, -2e6, 3e6],
				[-4e-3, 5e-3, -6e-3],
			],
		]

		for (const [a, b] of pairs) {
			const ab = crossProductFloatRecursive(a, b)
			const ba = crossProductFloatRecursive(b, a)
			assertVecClose(ab, [-ba[0], -ba[1], -ba[2]], 1e-9)
		}
	})

	test('independent cross-checks: orthogonality, Lagrange identity, and Jacobi identity', () => {
		const triplets = [
			[
				[1.25, -2.5, 3.75],
				[-4.2, 1.8, 0.9],
				[2.1, 3.3, -1.7],
			],
			[
				[Math.PI, -Math.E, Math.SQRT2],
				[0.5772156649, 1.6180339887, -2.7182818284],
				[-1.4142135623, 0.6931471805, 2.3025850929],
			],
			[
				[12.345, -67.89, 0.00123],
				[-0.456, 78.912, -34.567],
				[9.876, -5.432, 1.098],
			],
		]

		for (const [a, b, c] of triplets) {
			const ab = crossProductFloatRecursive(a, b)
			const scale = Math.max(1, normSq(a) * normSq(b))

			// Orthogonality: (a × b) · a == 0 and (a × b) · b == 0
			assert.ok(
				Math.abs(dot(ab, a)) <= 1e-11 * Math.sqrt(scale),
				`expected (a×b)·a ≈ 0, got ${dot(ab, a)}`
			)
			assert.ok(
				Math.abs(dot(ab, b)) <= 1e-11 * Math.sqrt(scale),
				`expected (a×b)·b ≈ 0, got ${dot(ab, b)}`
			)

			// Lagrange's identity: ||a × b||^2 == ||a||^2 ||b||^2 - (a · b)^2
			const lhs = normSq(ab)
			const rhs = normSq(a) * normSq(b) - dot(a, b) ** 2
			assert.ok(
				Math.abs(lhs - rhs) <= 1e-11 * scale,
				`Lagrange identity mismatch: lhs=${lhs}, rhs=${rhs}`
			)

			// Jacobi identity: a × (b × c) + b × (c × a) + c × (a × b) == [0, 0, 0]
			const t1 = crossProductFloatRecursive(a, crossProductFloatRecursive(b, c))
			const t2 = crossProductFloatRecursive(b, crossProductFloatRecursive(c, a))
			const t3 = crossProductFloatRecursive(c, crossProductFloatRecursive(a, b))
			const jacobiSum = [
				t1[0] + t2[0] + t3[0],
				t1[1] + t2[1] + t3[1],
				t1[2] + t2[2] + t3[2],
			]
			const jacobiTol =
				1e-10 * Math.sqrt(normSq(a) * normSq(b) * normSq(c))
			assertVecClose(jacobiSum, [0, 0, 0], Math.max(EPSILON, jacobiTol))
		}
	})

	test('does not mutate inputs and returns a new array', () => {
		const a = [1.5, 2.5, 3.5]
		const b = [4.5, 5.5, 6.5]
		const aCopy = [...a]
		const bCopy = [...b]

		const result = crossProductFloatRecursive(a, b)
		assert.deepStrictEqual(a, aCopy)
		assert.deepStrictEqual(b, bCopy)
		assert.notEqual(result, a)
		assert.notEqual(result, b)
	})

	test('validation errors for malformed inputs', () => {
		// Non-arrays
		for (const bad of [
			null,
			undefined,
			42,
			'123',
			{ 0: 1, 1: 2, 2: 3, length: 3 },
			new Float64Array([1, 2, 3]),
		]) {
			assert.throws(
				() => crossProductFloatRecursive(bad, [1, 2, 3]),
				TypeError
			)
			assert.throws(
				() => crossProductFloatRecursive([1, 2, 3], bad),
				TypeError
			)
		}

		// Wrong array lengths
		for (const badLen of [[], [1], [1, 2], [1, 2, 3, 4]]) {
			assert.throws(
				() => crossProductFloatRecursive(badLen, [1, 2, 3]),
				RangeError
			)
			assert.throws(
				() => crossProductFloatRecursive([1, 2, 3], badLen),
				RangeError
			)
		}

		// Non-number elements, NaN, and sparse arrays
		const sparse = [1, , 3]
		for (const badElem of [
			['1', 2, 3],
			[1, null, 3],
			[1, 2, undefined],
			[1, true, 3],
			[1, 2n, 3],
			[NaN, 2, 3],
			[1, 2, NaN],
			sparse,
		]) {
			assert.throws(
				() => crossProductFloatRecursive(badElem, [1, 2, 3]),
				TypeError
			)
			assert.throws(
				() => crossProductFloatRecursive([1, 2, 3], badElem),
				TypeError
			)
		}

		// Non-finite numbers
		for (const badFinite of [
			[Infinity, 0, 0],
			[0, -Infinity, 0],
			[0, 0, Infinity],
		]) {
			assert.throws(
				() => crossProductFloatRecursive(badFinite, [1, 2, 3]),
				RangeError
			)
			assert.throws(
				() => crossProductFloatRecursive([1, 2, 3], badFinite),
				RangeError
			)
		}
	})
})
