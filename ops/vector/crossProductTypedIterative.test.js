import { describe, test } from 'node:test'
import assert from 'node:assert'
import { crossProductTypedIterative } from './crossProductTypedIterative.js'

function assertVecClose(actual, expected, eps = 1e-12) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.strictEqual(actual.length, 3, 'result must have length 3')
	for (let i = 0; i < 3; i++) {
		assert.ok(
			Math.abs(actual[i] - expected[i]) <= eps,
			`index ${i}: expected ${expected[i]} (±${eps}), got ${actual[i]}`
		)
	}
}

function dot(u, v) {
	return u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
}

/**
 * Independent reference implementation via Levi-Civita permutation tensor:
 * (a × b)_i = sum_{j,k} ε_{ijk} a_j b_k
 */
function leviCivitaCross(a, b) {
	const eps = (i, j, k) => {
		if (i === j || j === k || i === k) return 0
		if ((i === 0 && j === 1 && k === 2) ||
			(i === 1 && j === 2 && k === 0) ||
			(i === 2 && j === 0 && k === 1)) {
			return 1
		}
		return -1
	}
	const out = [0, 0, 0]
	for (let i = 0; i < 3; i++) {
		let sum = 0
		for (let j = 0; j < 3; j++) {
			for (let k = 0; k < 3; k++) {
				const s = eps(i, j, k)
				if (s !== 0) {
					sum += s * a[j] * b[k]
				}
			}
		}
		out[i] = sum
	}
	return out
}

describe('crossProductTypedIterative', () => {
	test('standard right-handed basis vectors', () => {
		const i = new Float64Array([1, 0, 0])
		const j = new Float64Array([0, 1, 0])
		const k = new Float64Array([0, 0, 1])

		assertVecClose(crossProductTypedIterative(i, j), [0, 0, 1], 0)
		assertVecClose(crossProductTypedIterative(j, k), [1, 0, 0], 0)
		assertVecClose(crossProductTypedIterative(k, i), [0, 1, 0], 0)

		assertVecClose(crossProductTypedIterative(j, i), [0, 0, -1], 0)
		assertVecClose(crossProductTypedIterative(k, j), [-1, 0, 0], 0)
		assertVecClose(crossProductTypedIterative(i, k), [0, -1, 0], 0)
	})

	test('general 3D vectors with signed and fractional values', () => {
		const a = new Float64Array([1, 2, 3])
		const b = new Float64Array([4, 5, 6])
		assertVecClose(crossProductTypedIterative(a, b), [-3, 6, -3], 0)

		const c = new Float64Array([2, -3, 4])
		const d = new Float64Array([-1, 5, -2])
		assertVecClose(crossProductTypedIterative(c, d), [-14, 0, 7], 0)

		const e = new Float64Array([1.5, -2.25, 0.5])
		const f = new Float64Array([-0.75, 4.0, 2.5])
		assertVecClose(crossProductTypedIterative(e, f), [-7.625, -4.125, 4.3125], 1e-12)
	})

	test('does not mutate inputs and returns a fresh Float64Array', () => {
		const a = new Float64Array([3, -4, 5])
		const b = new Float64Array([6, 7, -8])
		const out = crossProductTypedIterative(a, b)

		assert.ok(out instanceof Float64Array)
		assert.notStrictEqual(out, a)
		assert.notStrictEqual(out, b)
		assert.deepStrictEqual(Array.from(a), [3, -4, 5])
		assert.deepStrictEqual(Array.from(b), [6, 7, -8])
	})

	test('works with Float64Array subarray views', () => {
		const backing = new Float64Array([99, 1, 2, 3, -5, 4, 5, 6, 42])
		const a = backing.subarray(1, 4)
		const b = backing.subarray(5, 8)
		assertVecClose(crossProductTypedIterative(a, b), [-3, 6, -3], 0)
	})

	test('edge cases: zero, parallel, and anti-parallel vectors', () => {
		const zero = new Float64Array([0, 0, 0])
		const v = new Float64Array([3.5, -7.2, 11.1])

		assertVecClose(crossProductTypedIterative(zero, v), [0, 0, 0], 0)
		assertVecClose(crossProductTypedIterative(v, zero), [0, 0, 0], 0)
		assertVecClose(crossProductTypedIterative(zero, zero), [0, 0, 0], 0)
		assertVecClose(crossProductTypedIterative(v, v), [0, 0, 0], 0)

		const scaled = new Float64Array([-2.5 * v[0], -2.5 * v[1], -2.5 * v[2]])
		assertVecClose(crossProductTypedIterative(v, scaled), [0, 0, 0], 1e-12)
	})

	test('edge cases: extreme magnitudes and non-finite IEEE-754 values', () => {
		const bigA = new Float64Array([1e150, 0, 0])
		const bigB = new Float64Array([0, 1e150, 0])
		assertVecClose(crossProductTypedIterative(bigA, bigB), [0, 0, 1e150 * 1e150], 0)

		const tinyA = new Float64Array([1e-150, 0, 0])
		const tinyB = new Float64Array([0, 1e-150, 0])
		assertVecClose(crossProductTypedIterative(tinyA, tinyB), [0, 0, 1e-150 * 1e-150], 0)

		const withNaN = new Float64Array([NaN, 1, 2])
		const normal = new Float64Array([3, 4, 5])
		const resNaN = crossProductTypedIterative(withNaN, normal)
		assert.strictEqual(resNaN[0], -3)
		assert.ok(Number.isNaN(resNaN[1]))
		assert.ok(Number.isNaN(resNaN[2]))
	})

	test('input validation: throws TypeError for non-Float64Array inputs', () => {
		const valid = new Float64Array([1, 2, 3])
		const invalidInputs = [
			[1, 2, 3],
			new Float32Array([1, 2, 3]),
			new Int32Array([1, 2, 3]),
			null,
			undefined,
			'123',
			42,
			{ 0: 1, 1: 2, 2: 3, length: 3 }
		]

		for (const bad of invalidInputs) {
			assert.throws(() => crossProductTypedIterative(bad, valid), TypeError)
			assert.throws(() => crossProductTypedIterative(valid, bad), TypeError)
		}
	})

	test('input validation: throws RangeError for lengths other than 3', () => {
		const valid = new Float64Array([1, 2, 3])
		for (const len of [0, 1, 2, 4, 6]) {
			const badLen = new Float64Array(len)
			assert.throws(() => crossProductTypedIterative(badLen, valid), RangeError)
			assert.throws(() => crossProductTypedIterative(valid, badLen), RangeError)
		}
	})

	test('independent cross-check: Levi-Civita reference and vector algebra identities', () => {
		// Deterministic LCG generator for reproducible pseudo-random vectors
		let seed = 123456789
		const nextVal = () => {
			seed = (Math.imul(1664525, seed) + 1013904223) >>> 0
			return (seed / 0xffffffff) * 20 - 10
		}
		const makeVec = () => new Float64Array([nextVal(), nextVal(), nextVal()])

		for (let trial = 0; trial < 50; trial++) {
			const a = makeVec()
			const b = makeVec()
			const c = makeVec()

			const ab = crossProductTypedIterative(a, b)
			const ba = crossProductTypedIterative(b, a)

			// 1. Exact agreement with independent Levi-Civita tensor reference
			assertVecClose(ab, leviCivitaCross(a, b), 1e-11)

			// 2. Orthogonality: (a × b) · a = 0 and (a × b) · b = 0
			assert.ok(Math.abs(dot(ab, a)) < 1e-9, `not orthogonal to a: ${dot(ab, a)}`)
			assert.ok(Math.abs(dot(ab, b)) < 1e-9, `not orthogonal to b: ${dot(ab, b)}`)

			// 3. Anti-commutativity: a × b = -(b × a)
			assertVecClose(ab, [-ba[0], -ba[1], -ba[2]], 1e-12)

			// 4. Lagrange's identity: ||a × b||^2 = ||a||^2 ||b||^2 - (a · b)^2
			const lhs = dot(ab, ab)
			const rhs = dot(a, a) * dot(b, b) - dot(a, b) ** 2
			assert.ok(
				Math.abs(lhs - rhs) <= 1e-9 * Math.max(1, Math.abs(rhs)),
				`Lagrange identity mismatch: lhs=${lhs}, rhs=${rhs}`
			)

			// 5. Jacobi identity: a×(b×c) + b×(c×a) + c×(a×b) = 0
			const t1 = crossProductTypedIterative(a, crossProductTypedIterative(b, c))
			const t2 = crossProductTypedIterative(b, crossProductTypedIterative(c, a))
			const t3 = crossProductTypedIterative(c, crossProductTypedIterative(a, b))
			assertVecClose(
				new Float64Array([t1[0] + t2[0] + t3[0], t1[1] + t2[1] + t3[1], t1[2] + t2[2] + t3[2]]),
				[0, 0, 0],
				1e-8
			)

			// 6. Distributivity: a × (b + c) = (a × b) + (a × c)
			const bPlusC = new Float64Array([b[0] + c[0], b[1] + c[1], b[2] + c[2]])
			const lhsDist = crossProductTypedIterative(a, bPlusC)
			const ac = crossProductTypedIterative(a, c)
			assertVecClose(lhsDist, [ab[0] + ac[0], ab[1] + ac[1], ab[2] + ac[2]], 1e-10)
		}
	})
})
