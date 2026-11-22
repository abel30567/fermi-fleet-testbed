import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseTypedIterative } from './inverseTypedIterative.js'

/**
 * Helper: multiply two row-major n×n Float64Array matrices.
 */
function matMul(a, b, n) {
	const out = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		for (let j = 0; j < n; j++) {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += a[i * n + k] * b[k * n + j]
			}
			out[i * n + j] = sum
		}
	}
	return out
}

/**
 * Helper: create n×n identity Float64Array.
 */
function identity(n) {
	const id = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		id[i * n + i] = 1
	}
	return id
}

/**
 * Helper: assert two Float64Arrays are element-wise close within eps.
 */
function assertMatrixClose(actual, expected, eps = 1e-10) {
	assert.ok(actual instanceof Float64Array, 'result must be a Float64Array')
	assert.equal(actual.length, expected.length)
	for (let i = 0; i < expected.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= eps,
			`index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${diff} > ${eps})`,
		)
	}
}

/**
 * Independent closed-form 2×2 matrix inverse via adjugate / determinant.
 */
function inverse2x2ClosedForm(m) {
	const [a, b, c, d] = m
	const det = a * d - b * c
	return new Float64Array([d / det, -b / det, -c / det, a / det])
}

/**
 * Independent closed-form 3×3 matrix inverse via cofactors / determinant.
 */
function inverse3x3ClosedForm(m) {
	const [a, b, c, d, e, f, g, h, i] = m
	const c00 = e * i - f * h
	const c01 = -(d * i - f * g)
	const c02 = d * h - e * g
	const c10 = -(b * i - c * h)
	const c11 = a * i - c * g
	const c12 = -(a * h - b * g)
	const c20 = b * f - c * e
	const c21 = -(a * f - c * d)
	const c22 = a * e - b * d
	const det = a * c00 + b * c01 + c * c02
	return new Float64Array([
		c00 / det,
		c10 / det,
		c20 / det,
		c01 / det,
		c11 / det,
		c21 / det,
		c02 / det,
		c12 / det,
		c22 / det,
	])
}

describe('inverseTypedIterative', () => {
	describe('normal cases', () => {
		it('inverts 1x1 matrices', () => {
			assertMatrixClose(
				inverseTypedIterative(new Float64Array([4])),
				new Float64Array([0.25]),
				1e-15,
			)
			assertMatrixClose(
				inverseTypedIterative(new Float64Array([-0.5]), 1),
				new Float64Array([-2]),
				1e-15,
			)
		})

		it('inverts 2x2 matrices with inferred and explicit n', () => {
			const a = new Float64Array([4, 7, 2, 6])
			const expected = new Float64Array([0.6, -0.7, -0.2, 0.4])
			assertMatrixClose(inverseTypedIterative(a), expected, 1e-12)
			assertMatrixClose(inverseTypedIterative(a, 2), expected, 1e-12)
		})

		it('inverts a 3x3 matrix', () => {
			const a = new Float64Array([
				3, 0, 2,
				2, 0, -2,
				0, 1, 1,
			])
			const expected = new Float64Array([
				0.2, 0.2, 0,
				-0.2, 0.3, 1,
				0.2, -0.3, 0,
			])
			const inv = inverseTypedIterative(a)
			assertMatrixClose(inv, expected, 1e-12)
		})

		it('inverts a 4x4 matrix', () => {
			const a = new Float64Array([
				4, 0, 0, 1,
				0, 3, 2, 0,
				1, 2, 5, 0,
				0, 1, 0, 2,
			])
			const inv = inverseTypedIterative(a, 4)
			const id = identity(4)
			assertMatrixClose(matMul(a, inv, 4), id, 1e-12)
			assertMatrixClose(matMul(inv, a, 4), id, 1e-12)
		})

		it('leaves identity matrices unchanged', () => {
			for (const n of [1, 2, 3, 5]) {
				const id = identity(n)
				const inv = inverseTypedIterative(id)
				assert.deepStrictEqual(inv, id)
			}
		})

		it('inverts orthogonal rotation matrix to its transpose', () => {
			const theta = Math.PI / 5
			const c = Math.cos(theta)
			const s = Math.sin(theta)
			const rot = new Float64Array([c, -s, s, c])
			const transpose = new Float64Array([c, s, -s, c])
			assertMatrixClose(inverseTypedIterative(rot), transpose, 1e-15)
		})

		it('does not mutate input Float64Array and normalizes -0 to 0', () => {
			const input = new Float64Array([
				-1, 0,
				0, -2,
			])
			const snapshot = new Float64Array(input)
			const inv = inverseTypedIterative(input)
			assert.deepStrictEqual(input, snapshot)
			assert.notEqual(inv, input)
			for (let i = 0; i < inv.length; i++) {
				assert.ok(!Object.is(inv[i], -0), `index ${i} should not be -0`)
			}
			assert.deepStrictEqual(inv, new Float64Array([-1, 0, 0, -0.5]))
		})
	})

	describe('edge cases: pivoting, scaling, and tolerance', () => {
		it('handles zero on diagonal via partial pivoting (row swaps)', () => {
			const a2 = new Float64Array([
				0, 2,
				4, 6,
			])
			const inv2 = inverseTypedIterative(a2)
			assertMatrixClose(inv2, new Float64Array([-0.75, 0.25, 0.5, 0]), 1e-15)

			// 3x3 cyclic permutation matrix (all diagonal entries are 0)
			const perm = new Float64Array([
				0, 0, 1,
				1, 0, 0,
				0, 1, 0,
			])
			const invPerm = inverseTypedIterative(perm)
			assertMatrixClose(
				invPerm,
				new Float64Array([
					0, 1, 0,
					0, 0, 1,
					1, 0, 0,
				]),
				1e-15,
			)
		})

		it('avoids numerical instability with tiny diagonal pivot via partial pivoting', () => {
			const eps = 1e-16
			const a = new Float64Array([
				eps, 1,
				1, 1,
			])
			const inv = inverseTypedIterative(a)
			const id = identity(2)
			assertMatrixClose(matMul(a, inv, 2), id, 1e-12)
			assertMatrixClose(matMul(inv, a, 2), id, 1e-12)
		})

		it('preserves invertibility across very small and very large uniform scales', () => {
			const base = new Float64Array([2, 1, 5, 3])
			const baseInv = new Float64Array([3, -1, -5, 2])

			const small = base.map((v) => v * 1e-20)
			const smallInv = inverseTypedIterative(small)
			assertMatrixClose(
				smallInv.map((v) => v * 1e-20),
				baseInv,
				1e-12,
			)

			const large = base.map((v) => v * 1e20)
			const largeInv = inverseTypedIterative(large)
			assertMatrixClose(
				largeInv.map((v) => v * 1e20),
				baseInv,
				1e-12,
			)
		})

		it('respects custom tolerance parameter', () => {
			const illConditioned = new Float64Array([
				1, 0,
				0, 1e-14,
			])
			assert.throws(
				() => inverseTypedIterative(illConditioned),
				RangeError,
			)
			const inv = inverseTypedIterative(illConditioned, 2, 0)
			assertMatrixClose(inv, new Float64Array([1, 0, 0, 1e14]), 1e2)

			const moderatelyConditioned = new Float64Array([
				1, 0,
				0, 1e-4,
			])
			assert.throws(
				() => inverseTypedIterative(moderatelyConditioned, 2, 1e-3),
				RangeError,
			)
		})
	})

	describe('singular and invalid inputs', () => {
		it('throws RangeError for singular matrices', () => {
			// 1x1 zero
			assert.throws(() => inverseTypedIterative(new Float64Array([0])), RangeError)
			// 2x2 zero
			assert.throws(
				() => inverseTypedIterative(new Float64Array([0, 0, 0, 0])),
				RangeError,
			)
			// 2x2 linearly dependent rows
			assert.throws(
				() => inverseTypedIterative(new Float64Array([1, 2, 2, 4])),
				RangeError,
			)
			// 3x3 rank-deficient (row 3 = row 1 + row 2)
			assert.throws(
				() =>
					inverseTypedIterative(
						new Float64Array([
							1, 2, 3,
							4, 5, 6,
							5, 7, 9,
						]),
					),
				RangeError,
			)
			// 4x4 singular (duplicate columns)
			assert.throws(
				() =>
					inverseTypedIterative(
						new Float64Array([
							1, 2, 1, 4,
							0, 1, 0, 3,
							2, 5, 2, 1,
							3, 1, 3, 2,
						]),
					),
				RangeError,
			)
			// Nearly singular matrix within default tolerance
			assert.throws(
				() => inverseTypedIterative(new Float64Array([1, 1, 1, 1 + 1e-15])),
				RangeError,
			)
			// Underflow/overflow to Infinity on inversion
			assert.throws(
				() => inverseTypedIterative(new Float64Array([1e-310])),
				RangeError,
			)
		})

		it('throws TypeError for non-Float64Array inputs', () => {
			for (const bad of [
				null,
				undefined,
				[1, 0, 0, 1],
				new Float32Array([1, 0, 0, 1]),
				new Int32Array([1, 0, 0, 1]),
				42,
				'matrix',
				{},
			]) {
				assert.throws(() => inverseTypedIterative(bad), TypeError)
			}
		})

		it('throws RangeError for empty, non-square, or shape-mismatched matrices', () => {
			assert.throws(() => inverseTypedIterative(new Float64Array(0)), RangeError)
			assert.throws(() => inverseTypedIterative(new Float64Array(2)), RangeError)
			assert.throws(() => inverseTypedIterative(new Float64Array(3)), RangeError)
			assert.throws(() => inverseTypedIterative(new Float64Array(6)), RangeError)
			assert.throws(
				() => inverseTypedIterative(new Float64Array(9), 2),
				RangeError,
			)
		})

		it('throws on invalid n or tolerance arguments', () => {
			const eye2 = identity(2)
			assert.throws(() => inverseTypedIterative(eye2, '2'), TypeError)
			assert.throws(() => inverseTypedIterative(eye2, null), TypeError)
			assert.throws(() => inverseTypedIterative(eye2, 0), RangeError)
			assert.throws(() => inverseTypedIterative(eye2, -2), RangeError)
			assert.throws(() => inverseTypedIterative(eye2, 1.5), RangeError)
			assert.throws(() => inverseTypedIterative(eye2, Number.NaN), RangeError)
			assert.throws(
				() => inverseTypedIterative(eye2, Number.POSITIVE_INFINITY),
				RangeError,
			)

			assert.throws(() => inverseTypedIterative(eye2, 2, '1e-12'), TypeError)
			assert.throws(() => inverseTypedIterative(eye2, 2, -1e-12), RangeError)
			assert.throws(() => inverseTypedIterative(eye2, 2, Number.NaN), RangeError)
			assert.throws(
				() => inverseTypedIterative(eye2, 2, Number.POSITIVE_INFINITY),
				RangeError,
			)
		})

		it('throws RangeError when matrix contains NaN or Infinity', () => {
			assert.throws(
				() => inverseTypedIterative(new Float64Array([1, Number.NaN, 0, 1])),
				RangeError,
			)
			assert.throws(
				() =>
					inverseTypedIterative(
						new Float64Array([1, 0, Number.POSITIVE_INFINITY, 1]),
					),
				RangeError,
			)
			assert.throws(
				() =>
					inverseTypedIterative(
						new Float64Array([Number.NEGATIVE_INFINITY, 0, 0, 1]),
					),
				RangeError,
			)
		})
	})

	describe('independent mathematical cross-checks', () => {
		it('matches closed-form 2x2 adjugate/determinant formula', () => {
			const cases = [
				new Float64Array([4, 7, 2, 6]),
				new Float64Array([-3, 5, 2, -7]),
				new Float64Array([0, 3, -2, 5]),
				new Float64Array([1.5, -2.25, 4.75, 3.125]),
			]
			for (const a of cases) {
				const inv = inverseTypedIterative(a)
				const expected = inverse2x2ClosedForm(a)
				assertMatrixClose(inv, expected, 1e-14)
				assertMatrixClose(matMul(a, inv, 2), identity(2), 1e-14)
				assertMatrixClose(matMul(inv, a, 2), identity(2), 1e-14)
			}
		})

		it('matches closed-form 3x3 cofactor/determinant formula', () => {
			const a = new Float64Array([
				2, -1, 0,
				-1, 2, -1,
				0, -1, 3,
			])
			const inv = inverseTypedIterative(a)
			const expected = inverse3x3ClosedForm(a)
			assertMatrixClose(inv, expected, 1e-14)
			assertMatrixClose(matMul(a, inv, 3), identity(3), 1e-14)
			assertMatrixClose(matMul(inv, a, 3), identity(3), 1e-14)
		})

		it('satisfies A * A^-1 = I, A^-1 * A = I, and (A^-1)^-1 = A for a 5x5 dense matrix', () => {
			const a = new Float64Array([
				2, -1, 0, 3, 1,
				4, 5, -2, 1, 0,
				-3, 1, 6, -1, 2,
				1, 2, -1, 4, -3,
				0, -2, 3, 1, 5,
			])
			const inv = inverseTypedIterative(a, 5)
			const id = identity(5)
			assertMatrixClose(matMul(a, inv, 5), id, 1e-12)
			assertMatrixClose(matMul(inv, a, 5), id, 1e-12)
			assertMatrixClose(inverseTypedIterative(inv, 5), a, 1e-11)
		})

		it('satisfies product reversal identity (A * B)^-1 = B^-1 * A^-1', () => {
			const a = new Float64Array([
				1, 2, 0,
				0, 1, 3,
				2, -1, 1,
			])
			const b = new Float64Array([
				2, 0, 1,
				1, 3, -1,
				0, 2, 4,
			])
			const ab = matMul(a, b, 3)
			const abInv = inverseTypedIterative(ab)
			const bInvAInv = matMul(
				inverseTypedIterative(b),
				inverseTypedIterative(a),
				3,
			)
			assertMatrixClose(abInv, bInvAInv, 1e-12)
		})
	})
})
