import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { inverseTypedSeries } from './inverseTypedSeries.js'

/**
 * Multiply two n x n row-major matrices stored at given offsets.
 */
function matMul(a, aOff, b, bOff, n) {
	const res = new Float64Array(n * n)
	for (let r = 0; r < n; r++) {
		for (let c = 0; c < n; c++) {
			let sum = 0
			for (let k = 0; k < n; k++) {
				sum += a[aOff + r * n + k] * b[bOff + k * n + c]
			}
			res[r * n + c] = sum
		}
	}
	return res
}

function makeIdentity(n) {
	const id = new Float64Array(n * n)
	for (let i = 0; i < n; i++) {
		id[i * n + i] = 1
	}
	return id
}

function assertCloseArray(actual, expected, tol = 1e-12, label = '') {
	assert.equal(actual.length, expected.length, `${label} length mismatch`)
	for (let i = 0; i < actual.length; i++) {
		const diff = Math.abs(actual[i] - expected[i])
		assert.ok(
			diff <= tol,
			`${label} index ${i}: expected ${expected[i]}, got ${actual[i]} (diff ${diff} > ${tol})`
		)
	}
}

describe('inverseTypedSeries', () => {
	describe('normal cases', () => {
		it('inverts 1x1 matrices', () => {
			const data = new Float64Array([2, -4, 0.25, 1])
			const inv = inverseTypedSeries(data, 1)
			assert.ok(inv instanceof Float64Array)
			assert.deepEqual(inv, new Float64Array([0.5, -0.25, 4, 1]))
		})

		it('inverts 2x2 matrices using closed-form formula', () => {
			// [[4, 7], [2, 6]] -> det = 10 -> [[0.6, -0.7], [-0.2, 0.4]]
			const data = new Float64Array([4, 7, 2, 6])
			const inv = inverseTypedSeries(data, 2)
			assert.ok(inv instanceof Float64Array)
			assertCloseArray(inv, new Float64Array([0.6, -0.7, -0.2, 0.4]), 1e-15)
		})

		it('inverts 3x3 matrices', () => {
			// Known integer-inverse 3x3 matrix:
			// [[1, 2, 3], [0, 1, 4], [5, 6, 0]]
			// det = 1*(0-24) - 2*(0-20) + 3*(0-5) = -24 + 40 - 15 = 1
			// inverse = [[-24, 18, 5], [20, -15, -4], [-5, 4, 1]]
			const data = new Float64Array([
				1, 2, 3,
				0, 1, 4,
				5, 6, 0,
			])
			const expected = new Float64Array([
				-24, 18, 5,
				20, -15, -4,
				-5, 4, 1,
			])
			const inv = inverseTypedSeries(data, 3)
			assertCloseArray(inv, expected, 1e-12)
		})

		it('inverts 4x4 matrices', () => {
			const data = new Float64Array([
				4, 0, 0, 0,
				0, 0, 2, 0,
				0, 1, 2, 0,
				1, 0, 0, 1,
			])
			const expected = new Float64Array([
				0.25, 0, 0, 0,
				0, -1, 1, 0,
				0, 0.5, 0, 0,
				-0.25, 0, 0, 1,
			])
			const inv = inverseTypedSeries(data, 4)
			assertCloseArray(inv, expected, 1e-13)
		})

		it('inverts batched series of matrices', () => {
			// Batch of three 2x2 matrices
			const batch2 = new Float64Array([
				1, 2, 3, 4,
				2, 0, 0, 5,
				0, 1, -1, 0,
			])
			const expected2 = new Float64Array([
				-2, 1, 1.5, -0.5,
				0.5, 0, 0, 0.2,
				0, -1, 1, 0,
			])
			assertCloseArray(inverseTypedSeries(batch2, 2), expected2, 1e-14)

			// Batch of three 3x3 matrices
			const batch3 = new Float64Array([
				// Matrix 0
				1, 2, 3,
				0, 1, 4,
				5, 6, 0,
				// Matrix 1 (diagonal)
				2, 0, 0,
				0, 4, 0,
				0, 0, 8,
				// Matrix 2 (upper triangular)
				1, 2, 3,
				0, 1, 2,
				0, 0, 1,
			])
			const expected3 = new Float64Array([
				-24, 18, 5,
				20, -15, -4,
				-5, 4, 1,

				0.5, 0, 0,
				0, 0.25, 0,
				0, 0, 0.125,

				1, -2, 1,
				0, 1, -2,
				0, 0, 1,
			])
			assertCloseArray(inverseTypedSeries(batch3, 3), expected3, 1e-12)
		})
	})

	describe('edge cases', () => {
		it('handles empty Float64Array for any valid n', () => {
			for (const n of [1, 2, 3, 4]) {
				const out = inverseTypedSeries(new Float64Array(0), n)
				assert.ok(out instanceof Float64Array)
				assert.equal(out.length, 0)
			}
		})

		it('preserves identity matrices without -0 artifacts', () => {
			for (const n of [1, 2, 3, 4]) {
				const id = makeIdentity(n)
				const inv = inverseTypedSeries(id, n)
				assert.deepEqual(inv, id)
			}
		})

		it('handles permutation and zero-diagonal pivot-requiring matrices', () => {
			// 3x3 cyclic permutation matrix (zeros on entire diagonal)
			const perm3 = new Float64Array([
				0, 1, 0,
				0, 0, 1,
				1, 0, 0,
			])
			const invPerm3 = inverseTypedSeries(perm3, 3)
			assertCloseArray(
				invPerm3,
				new Float64Array([
					0, 0, 1,
					1, 0, 0,
					0, 1, 0,
				]),
				1e-15
			)

			// 4x4 matrix requiring multiple row swaps during pivoting
			const perm4 = new Float64Array([
				0, 0, 0, 2,
				0, 0, 4, 0,
				0, 5, 0, 0,
				8, 0, 0, 0,
			])
			const invPerm4 = inverseTypedSeries(perm4, 4)
			assertCloseArray(
				invPerm4,
				new Float64Array([
					0, 0, 0, 0.125,
					0, 0, 0.2, 0,
					0, 0.25, 0, 0,
					0.5, 0, 0, 0,
				]),
				1e-15
			)
		})

		it('handles widely scaled diagonal matrices without false singularity', () => {
			const scaled = new Float64Array([
				1e10, 0, 0,
				0, 1e-10, 0,
				0, 0, 1,
			])
			const inv = inverseTypedSeries(scaled, 3)
			assertCloseArray(
				inv,
				new Float64Array([
					1e-10, 0, 0,
					0, 1e10, 0,
					0, 0, 1,
				]),
				1e-5
			)
		})

		it('throws RangeError for singular matrices across dimensions', () => {
			// 1x1 zero
			assert.throws(() => inverseTypedSeries(new Float64Array([0]), 1), RangeError)

			// 2x2 exact singular
			assert.throws(
				() => inverseTypedSeries(new Float64Array([1, 2, 2, 4]), 2),
				RangeError
			)

			// 2x2 floating-point singular (0.1*0.6 - 0.2*0.3 != 0 in IEEE 754)
			assert.throws(
				() => inverseTypedSeries(new Float64Array([0.1, 0.2, 0.3, 0.6]), 2),
				RangeError
			)

			// 3x3 rank-deficient (rows linearly dependent)
			assert.throws(
				() =>
					inverseTypedSeries(
						new Float64Array([
							1, 2, 3,
							4, 5, 6,
							7, 8, 9,
						]),
						3
					),
				RangeError
			)

			// 3x3 zero row
			assert.throws(
				() =>
					inverseTypedSeries(
						new Float64Array([
							1, 0, 0,
							0, 0, 0,
							0, 0, 1,
						]),
						3
					),
				RangeError
			)

			// 4x4 singular (row 3 = row 0 + row 1)
			assert.throws(
				() =>
					inverseTypedSeries(
						new Float64Array([
							1, 2, 3, 4,
							5, 6, 7, 8,
							2, 0, 1, 3,
							6, 8, 10, 12,
						]),
						4
					),
				RangeError
			)

			// Singular matrix in the middle of a batch
			assert.throws(
				() =>
					inverseTypedSeries(
						new Float64Array([
							1, 0, 0, 1,
							2, 4, 1, 2,
							3, 1, 2, 1,
						]),
						2
					),
				RangeError
			)

			// Non-finite values
			assert.throws(
				() => inverseTypedSeries(new Float64Array([NaN]), 1),
				RangeError
			)
			assert.throws(
				() => inverseTypedSeries(new Float64Array([1, Infinity, 0, 1]), 2),
				RangeError
			)
			assert.throws(
				() =>
					inverseTypedSeries(
						new Float64Array([
							1, 0, 0,
							0, NaN, 0,
							0, 0, 1,
						]),
						3
					),
				RangeError
			)
		})

		it('does not mutate the input Float64Array', () => {
			const original = new Float64Array([
				2, 1, 1,
				1, 3, 2,
				1, 0, 0,
			])
			const snapshot = new Float64Array(original)
			const inv = inverseTypedSeries(original, 3)
			assert.notEqual(inv, original)
			assert.deepEqual(original, snapshot)
		})

		it('validates input types, dimension, and alignment', () => {
			// Invalid data type
			assert.throws(() => inverseTypedSeries([1, 0, 0, 1], 2), TypeError)
			assert.throws(
				() => inverseTypedSeries(new Float32Array([1, 0, 0, 1]), 2),
				TypeError
			)
			assert.throws(() => inverseTypedSeries(null, 2), TypeError)
			assert.throws(() => inverseTypedSeries(undefined, 2), TypeError)

			// Invalid n type / value
			const valid = new Float64Array([1, 0, 0, 1])
			assert.throws(() => inverseTypedSeries(valid, '2'), TypeError)
			assert.throws(() => inverseTypedSeries(valid, null), TypeError)
			assert.throws(() => inverseTypedSeries(valid, 0), RangeError)
			assert.throws(() => inverseTypedSeries(valid, -2), RangeError)
			assert.throws(() => inverseTypedSeries(valid, 1.5), RangeError)
			assert.throws(() => inverseTypedSeries(valid, NaN), RangeError)
			assert.throws(() => inverseTypedSeries(valid, Infinity), RangeError)

			// Misaligned length
			assert.throws(
				() => inverseTypedSeries(new Float64Array([1, 2, 3]), 2),
				RangeError
			)
			assert.throws(
				() => inverseTypedSeries(new Float64Array(10), 3),
				RangeError
			)
		})
	})

	describe('independent cross-checks', () => {
		it('satisfies A * A^-1 = I, A^-1 * A = I, and (A^-1)^-1 = A across dimensions and batches', () => {
			const cases = [
				{
					n: 1,
					data: new Float64Array([7.25, -0.125, 3.141592653589793]),
					tol: 1e-14,
				},
				{
					n: 2,
					data: new Float64Array([
						3.5, -1.2, 4.7, 2.8,
						-0.5, 6.25, 1.75, -3.1,
					]),
					tol: 1e-13,
				},
				{
					n: 3,
					data: new Float64Array([
						2.1, -0.5, 1.3,
						0.7, 3.2, -1.1,
						-1.4, 0.9, 2.6,

						0, 2, -1,
						3, -2, 1,
						1, 1, -2,
					]),
					tol: 1e-12,
				},
				{
					n: 4,
					data: new Float64Array([
						// 4x4 Hilbert matrix (notoriously ill-conditioned test case)
						1, 1 / 2, 1 / 3, 1 / 4,
						1 / 2, 1 / 3, 1 / 4, 1 / 5,
						1 / 3, 1 / 4, 1 / 5, 1 / 6,
						1 / 4, 1 / 5, 1 / 6, 1 / 7,

						// General dense 4x4 matrix with zero diagonal entries
						0, 3, -1, 2,
						4, 0, 2, -3,
						-2, 5, 0, 1,
						1, -4, 3, 0,
					]),
					tol: 1e-10,
				},
				{
					n: 5,
					data: new Float64Array([
						5, 1, 0, -2, 3,
						-1, 4, 2, 1, -1,
						2, -3, 6, 0, 2,
						0, 2, -1, 7, -4,
						3, 1, -2, 2, 8,
					]),
					tol: 1e-12,
				},
			]

			for (const { n, data, tol } of cases) {
				const size = n * n
				const count = data.length / size
				const identity = makeIdentity(n)

				const inv = inverseTypedSeries(data, n)
				const invInv = inverseTypedSeries(inv, n)

				// (A^-1)^-1 == A
				assertCloseArray(invInv, data, tol, `double-inverse n=${n}`)

				for (let m = 0; m < count; m++) {
					const off = m * size
					const leftProd = matMul(data, off, inv, off, n)
					const rightProd = matMul(inv, off, data, off, n)

					assertCloseArray(leftProd, identity, tol, `A * A^-1 n=${n} m=${m}`)
					assertCloseArray(rightProd, identity, tol, `A^-1 * A n=${n} m=${m}`)
				}
			}
		})
	})
})
