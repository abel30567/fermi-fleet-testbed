import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { crossProductDualRecursive } from './crossProductDualRecursive.js'

/**
 * Helper to create a dual number `{ v, d }`.
 *
 * @param {number} v
 * @param {number} d
 */
function dual(v, d = 0) {
	return { v, d }
}

/**
 * Independent plain-scalar 3D cross product for cross-checking.
 *
 * @param {number[]} u
 * @param {number[]} w
 * @returns {number[]}
 */
function scalarCross(u, w) {
	return [
		u[1] * w[2] - u[2] * w[1],
		u[2] * w[0] - u[0] * w[2],
		u[0] * w[1] - u[1] * w[0],
	]
}

/**
 * Asserts two 3D dual vectors are component-wise within `eps`.
 *
 * @param {{ v: number, d: number }[]} actual
 * @param {{ v: number, d: number }[]} expected
 * @param {number} [eps=1e-12]
 */
function assertDualVecApprox(actual, expected, eps = 1e-12) {
	assert.equal(actual.length, 3)
	for (let i = 0; i < 3; i += 1) {
		assert.ok(
			Math.abs(actual[i].v - expected[i].v) <= eps,
			`component ${i} value mismatch: actual=${actual[i].v}, expected=${expected[i].v}`,
		)
		assert.ok(
			Math.abs(actual[i].d - expected[i].d) <= eps,
			`component ${i} derivative mismatch: actual=${actual[i].d}, expected=${expected[i].d}`,
		)
	}
}

describe('crossProductDualRecursive', () => {
	test('standard basis vectors with constant (zero) derivatives', () => {
		const i = [dual(1, 0), dual(0, 0), dual(0, 0)]
		const j = [dual(0, 0), dual(1, 0), dual(0, 0)]
		const k = [dual(0, 0), dual(0, 0), dual(1, 0)]

		assert.deepStrictEqual(crossProductDualRecursive(i, j), k)
		assert.deepStrictEqual(crossProductDualRecursive(j, k), i)
		assert.deepStrictEqual(crossProductDualRecursive(k, i), j)
		assert.deepStrictEqual(crossProductDualRecursive(j, i), [
			dual(0, 0),
			dual(0, 0),
			dual(-1, 0),
		])
	})

	test('general dual vectors match exact hand-computed values and derivatives', () => {
		// a(t) = [1 + 2t, 3 - t, -2 + 4t] at t=0 => v=[1, 3, -2], d=[2, -1, 4]
		// b(t) = [4 + t, -1 + 3t, 5 - 2t] at t=0 => v=[4, -1, 5], d=[1, 3, -2]
		const a = [dual(1, 2), dual(3, -1), dual(-2, 4)]
		const b = [dual(4, 1), dual(-1, 3), dual(5, -2)]

		// v = a_v x b_v = [3*5 - (-2)*(-1), (-2)*4 - 1*5, 1*(-1) - 3*4] = [13, -13, -13]
		// a_d x b_v = [(-1)*5 - 4*(-1), 4*4 - 2*5, 2*(-1) - (-1)*4] = [-1, 6, 2]
		// a_v x b_d = [3*(-2) - (-2)*3, (-2)*1 - 1*(-2), 1*3 - 3*1] = [0, 0, 0]
		// d = a_d x b_v + a_v x b_d = [-1, 6, 2]
		const res = crossProductDualRecursive(a, b)
		assert.deepStrictEqual(res, [dual(13, -1), dual(-13, 6), dual(-13, 2)])
	})

	test('edge cases: zero vectors and self / parallel vectors', () => {
		const zero = [dual(0, 0), dual(0, 0), dual(0, 0)]
		const v = [dual(2, -3), dual(-5, 7), dual(11, 13)]

		assert.deepStrictEqual(crossProductDualRecursive(zero, v), zero)
		assert.deepStrictEqual(crossProductDualRecursive(v, zero), zero)
		assert.deepStrictEqual(crossProductDualRecursive(zero, zero), zero)

		// v x v = 0 for both value and derivative
		assert.deepStrictEqual(crossProductDualRecursive(v, v), zero)

		// Parallel primals with non-parallel derivatives:
		// a(t) = [1, 2, 3] + t*[1, 0, 0], b(t) = [2, 4, 6] + t*[0, 1, 0]
		// primal is 0, but derivative = a_d x b_v + a_v x b_d = [0, -6, 4] + [-3, 0, 1] = [-3, -6, 5]
		const a = [dual(1, 1), dual(2, 0), dual(3, 0)]
		const b = [dual(2, 0), dual(4, 1), dual(6, 0)]
		assert.deepStrictEqual(crossProductDualRecursive(a, b), [
			dual(0, -3),
			dual(0, -6),
			dual(0, 5),
		])
	})

	test('anti-commutativity: a x b === -(b x a) for both v and d', () => {
		const a = [dual(1.5, -0.75), dual(-2.25, 4.5), dual(3.125, -1.5)]
		const b = [dual(-4.0, 2.5), dual(0.5, -3.25), dual(6.75, 1.125)]

		const ab = crossProductDualRecursive(a, b)
		const ba = crossProductDualRecursive(b, a)

		for (let i = 0; i < 3; i += 1) {
			assert.equal(ab[i].v, ba[i].v === 0 ? 0 : -ba[i].v)
			assert.equal(ab[i].d, ba[i].d === 0 ? 0 : -ba[i].d)
		}
	})

	test('algebraic identities: dual orthogonality and Jacobi identity', () => {
		const a = [dual(1.2, -0.4), dual(-2.5, 1.7), dual(0.8, 3.1)]
		const b = [dual(-0.9, 2.2), dual(3.3, -1.1), dual(-1.4, 0.6)]
		const c = [dual(2.1, 0.5), dual(0.7, -2.8), dual(-3.0, 1.9)]

		const ab = crossProductDualRecursive(a, b)
		// Dual dot product a . (a x b) must be (0, 0)
		let dotV = 0
		let dotD = 0
		for (let i = 0; i < 3; i += 1) {
			dotV += a[i].v * ab[i].v
			dotD += a[i].v * ab[i].d + a[i].d * ab[i].v
		}
		assert.ok(Math.abs(dotV) < 1e-12)
		assert.ok(Math.abs(dotD) < 1e-12)

		// Jacobi identity: a x (b x c) + b x (c x a) + c x (a x b) = 0
		const t1 = crossProductDualRecursive(a, crossProductDualRecursive(b, c))
		const t2 = crossProductDualRecursive(b, crossProductDualRecursive(c, a))
		const t3 = crossProductDualRecursive(c, crossProductDualRecursive(a, b))
		for (let i = 0; i < 3; i += 1) {
			assert.ok(Math.abs(t1[i].v + t2[i].v + t3[i].v) < 1e-11)
			assert.ok(Math.abs(t1[i].d + t2[i].d + t3[i].d) < 1e-11)
		}
	})

	test('cross-check against direct scalar product-rule formula', () => {
		const cases = [
			[
				[dual(2.3, -1.4), dual(-0.7, 5.2), dual(4.1, 0.9)],
				[dual(-3.5, 2.1), dual(1.8, -0.6), dual(-2.9, 3.7)],
			],
			[
				[dual(1e4, -2e3), dual(-3e4, 4e3), dual(5e4, -6e3)],
				[dual(-7e3, 8e2), dual(9e3, -1e2), dual(-2e3, 3e2)],
			],
		]

		for (const [a, b] of cases) {
			const av = a.map((x) => x.v)
			const ad = a.map((x) => x.d)
			const bv = b.map((x) => x.v)
			const bd = b.map((x) => x.d)

			const expectedV = scalarCross(av, bv)
			const dPart1 = scalarCross(ad, bv)
			const dPart2 = scalarCross(av, bd)
			const expected = [0, 1, 2].map((i) => ({
				v: expectedV[i],
				d: dPart1[i] + dPart2[i],
			}))

			assertDualVecApprox(crossProductDualRecursive(a, b), expected, 1e-9)
		}
	})

	test('cross-check forward-mode derivative against central finite differences on nonlinear curves', () => {
		/** @param {number} t */
		const aFn = (t) => [Math.sin(t), t * t - 1, Math.exp(0.5 * t)]
		/** @param {number} t */
		const aDeriv = (t) => [Math.cos(t), 2 * t, 0.5 * Math.exp(0.5 * t)]

		/** @param {number} t */
		const bFn = (t) => [Math.cos(2 * t), Math.pow(t, 3) + t, Math.log(t + 3)]
		/** @param {number} t */
		const bDeriv = (t) => [-2 * Math.sin(2 * t), 3 * t * t + 1, 1 / (t + 3)]

		const h = 1e-6
		for (const t of [-1.2, 0.0, 0.75, 2.1]) {
			const av = aFn(t)
			const ad = aDeriv(t)
			const bv = bFn(t)
			const bd = bDeriv(t)

			const aDual = [0, 1, 2].map((i) => dual(av[i], ad[i]))
			const bDual = [0, 1, 2].map((i) => dual(bv[i], bd[i]))
			const actual = crossProductDualRecursive(aDual, bDual)

			const directV = scalarCross(av, bv)
			const plus = scalarCross(aFn(t + h), bFn(t + h))
			const minus = scalarCross(aFn(t - h), bFn(t - h))
			const fdDeriv = [0, 1, 2].map((i) => (plus[i] - minus[i]) / (2 * h))

			for (let i = 0; i < 3; i += 1) {
				assert.ok(
					Math.abs(actual[i].v - directV[i]) < 1e-12,
					`t=${t}, idx=${i}: value mismatch`,
				)
				assert.ok(
					Math.abs(actual[i].d - fdDeriv[i]) < 1e-6,
					`t=${t}, idx=${i}: derivative ${actual[i].d} vs FD ${fdDeriv[i]}`,
				)
			}
		}
	})

	test('does not mutate input vectors or dual objects', () => {
		const a = [dual(1, 2), dual(3, 4), dual(5, 6)]
		const b = [dual(7, 8), dual(9, 10), dual(11, 12)]
		const aSnap = structuredClone(a)
		const bSnap = structuredClone(b)

		crossProductDualRecursive(a, b)
		assert.deepStrictEqual(a, aSnap)
		assert.deepStrictEqual(b, bSnap)
	})

	test('input validation throws TypeError and RangeError on invalid inputs', () => {
		const valid = [dual(1, 0), dual(2, 0), dual(3, 0)]

		// Non-array inputs -> TypeError
		assert.throws(() => crossProductDualRecursive(null, valid), TypeError)
		assert.throws(() => crossProductDualRecursive(valid, undefined), TypeError)
		assert.throws(() => crossProductDualRecursive('abc', valid), TypeError)
		assert.throws(() => crossProductDualRecursive({ 0: dual(1), 1: dual(2), 2: dual(3), length: 3 }, valid), TypeError)

		// Wrong array lengths -> RangeError
		assert.throws(() => crossProductDualRecursive([], valid), RangeError)
		assert.throws(() => crossProductDualRecursive([dual(1), dual(2)], valid), RangeError)
		assert.throws(() => crossProductDualRecursive(valid, [dual(1), dual(2), dual(3), dual(4)]), RangeError)

		// Sparse array -> TypeError
		// eslint-disable-next-line no-sparse-arrays
		const sparse = [dual(1), , dual(3)]
		assert.throws(() => crossProductDualRecursive(sparse, valid), TypeError)

		// Invalid element shapes -> TypeError
		assert.throws(() => crossProductDualRecursive([null, dual(2), dual(3)], valid), TypeError)
		assert.throws(() => crossProductDualRecursive([1, 2, 3], valid), TypeError)
		assert.throws(() => crossProductDualRecursive([[1, 0], dual(2), dual(3)], valid), TypeError)
		assert.throws(() => crossProductDualRecursive([{ v: 1 }, dual(2), dual(3)], valid), TypeError)
		assert.throws(() => crossProductDualRecursive([{ d: 1 }, dual(2), dual(3)], valid), TypeError)
		assert.throws(() => crossProductDualRecursive([{ v: '1', d: 0 }, dual(2), dual(3)], valid), TypeError)
		assert.throws(() => crossProductDualRecursive(valid, [dual(1), { v: 2, d: null }, dual(3)]), TypeError)

		// Non-finite numeric components -> RangeError
		assert.throws(() => crossProductDualRecursive([dual(NaN, 0), dual(2), dual(3)], valid), RangeError)
		assert.throws(() => crossProductDualRecursive([dual(1, NaN), dual(2), dual(3)], valid), RangeError)
		assert.throws(() => crossProductDualRecursive(valid, [dual(Infinity, 0), dual(2), dual(3)]), RangeError)
		assert.throws(() => crossProductDualRecursive(valid, [dual(1, -Infinity), dual(2), dual(3)]), RangeError)
	})
})
